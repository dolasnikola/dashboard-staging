import { createClient } from "npm:@supabase/supabase-js@2";
import { checkBudgetPacing } from "./pacing.ts";
import { checkAnomalies } from "./anomaly.ts";
import type { AlertRow, ClientConfig } from "./types.ts";

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }

  try {
    let trigger = "cron";
    let forceClientId: string | null = null;
    try {
      const body = await req.json();
      trigger = body.trigger || "cron";
      forceClientId = body.client_id || null;
    } catch {
      // No body — default to cron
    }

    // Timezone check: run at 10:00 Belgrade time (after data syncs at 8:00/9:00)
    if (trigger === "cron") {
      const now = new Date();
      const utcMonth = now.getUTCMonth();
      const utcDay = now.getUTCDate();
      const marchLastSun =
        31 - new Date(now.getUTCFullYear(), 2, 31).getUTCDay();
      const octLastSun =
        31 - new Date(now.getUTCFullYear(), 9, 31).getUTCDay();
      const isCEST =
        (utcMonth > 2 && utcMonth < 9) ||
        (utcMonth === 2 && utcDay >= marchLastSun) ||
        (utcMonth === 9 && utcDay < octLastSun);
      const offsetHours = isCEST ? 2 : 1;
      const belgradeHour = (now.getUTCHours() + offsetHours) % 24;

      console.log(
        `[check-alerts] Belgrade hour: ${belgradeHour}, UTC: ${now.getUTCHours()}`
      );

      if (belgradeHour !== 10) {
        return new Response(
          JSON.stringify({
            status: "skipped",
            reason: `Belgrade time is ${belgradeHour}:00, alerts check runs at 10:00 only`,
          }),
          { headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Init Supabase client (service role for DB writes)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get clients to check
    let clients: ClientConfig[];
    if (forceClientId) {
      const { data } = await supabase
        .from("clients")
        .select("id, name, platforms")
        .eq("id", forceClientId)
        .single();
      clients = data ? [data as ClientConfig] : [];
    } else {
      const { data } = await supabase
        .from("clients")
        .select("id, name, platforms");
      clients = (data || []) as ClientConfig[];
    }

    console.log(`[check-alerts] Checking ${clients.length} clients`);

    // Cleanup expired alerts first
    await supabase.rpc("cleanup_expired_alerts");

    const allAlerts: AlertRow[] = [];
    const results: Record<
      string,
      { pacing: number; anomaly: number; errors: string[] }
    > = {};

    for (const client of clients) {
      const clientResult = { pacing: 0, anomaly: 0, errors: [] as string[] };

      try {
        // Check budget pacing
        const pacingAlerts = await checkBudgetPacing(
          supabase,
          client.id,
          client.name,
          client.platforms
        );
        clientResult.pacing = pacingAlerts.length;
        allAlerts.push(...pacingAlerts);
      } catch (err) {
        const msg = `Pacing error: ${(err as Error).message}`;
        console.error(`[check-alerts] ${client.id}: ${msg}`);
        clientResult.errors.push(msg);
      }

      try {
        // Check metric anomalies
        const anomalyAlerts = await checkAnomalies(
          supabase,
          client.id,
          client.name,
          client.platforms
        );
        clientResult.anomaly = anomalyAlerts.length;
        allAlerts.push(...anomalyAlerts);
      } catch (err) {
        const msg = `Anomaly error: ${(err as Error).message}`;
        console.error(`[check-alerts] ${client.id}: ${msg}`);
        clientResult.errors.push(msg);
      }

      results[client.id] = clientResult;
    }

    // Check for sync failures (from sync_log)
    try {
      const oneDayAgo = new Date(
        Date.now() - 24 * 60 * 60 * 1000
      ).toISOString();
      const { data: failedSyncs } = await supabase
        .from("sync_log")
        .select("*")
        .eq("status", "error")
        .gte("started_at", oneDayAgo);

      for (const sync of failedSyncs || []) {
        // Find which client this sync was for
        const syncMsg = sync.message || "";
        allAlerts.push({
          client_id: sync.client_id || "system",
          alert_type: "sync_failure",
          severity: "critical",
          title: `Sync greška: ${sync.source || "unknown"}`,
          message: `Sync failed at ${sync.started_at}: ${syncMsg.slice(0, 200)}`,
        });
      }
    } catch (err) {
      console.error(
        `[check-alerts] sync_log check error:`,
        (err as Error).message
      );
    }

    // Insert alerts (deduplicate — skip if similar alert exists in last 24h)
    let inserted = 0;
    for (const alert of allAlerts) {
      const oneDayAgo = new Date(
        Date.now() - 24 * 60 * 60 * 1000
      ).toISOString();
      const { data: existing } = await supabase
        .from("alerts")
        .select("id")
        .eq("client_id", alert.client_id)
        .eq("alert_type", alert.alert_type)
        .eq("platform", alert.platform || "")
        .eq("metric_name", alert.metric_name || "")
        .gte("created_at", oneDayAgo)
        .limit(1);

      if (existing && existing.length > 0) {
        console.log(
          `[check-alerts] Skipping duplicate: ${alert.title}`
        );
        continue;
      }

      const { error } = await supabase.from("alerts").insert(alert);
      if (error) {
        console.error(`[check-alerts] Insert error:`, error.message);
      } else {
        inserted++;
      }
    }

    // Log result to sync_log
    await supabase.from("sync_log").insert({
      source: "check-alerts",
      status: "success",
      message: `Generated ${allAlerts.length} alerts, inserted ${inserted} new. Clients: ${JSON.stringify(results)}`,
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
    });

    const response = {
      status: "ok",
      alerts_generated: allAlerts.length,
      alerts_inserted: inserted,
      clients_checked: clients.length,
      results,
    };

    console.log(`[check-alerts] Done:`, JSON.stringify(response));

    return new Response(JSON.stringify(response), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = (err as Error).message;
    console.error(`[check-alerts] Fatal error:`, msg);

    return new Response(JSON.stringify({ status: "error", message: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
