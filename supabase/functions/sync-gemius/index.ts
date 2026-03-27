import { createClient } from "npm:@supabase/supabase-js@2";
import { openSession, closeSession } from "./auth.ts";
import { syncGemiusClient } from "./sync-client.ts";
import type { GemiusConfig, SyncResult } from "./types.ts";

Deno.serve(async (req: Request) => {
  // Handle CORS preflight (for manual triggers from browser)
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }

  try {
    // Parse request body
    let trigger = "cron";
    let forceClientId: string | null = null;
    let dateFrom: string | null = null;
    let dateTo: string | null = null;
    try {
      const body = await req.json();
      trigger = body.trigger || "cron";
      forceClientId = body.client_id || null;
      dateFrom = body.date_from || null;
      dateTo = body.date_to || null;
    } catch {
      // No body or invalid JSON — default to cron
    }

    // Timezone check: only sync at 8:00 or 9:00 Belgrade time (for cron triggers)
    // Reused from sync-sheets/index.ts
    if (trigger === "cron") {
      const now = new Date();
      const utcMonth = now.getUTCMonth();
      const utcDay = now.getUTCDate();
      const marchLastSun = 31 - new Date(now.getUTCFullYear(), 2, 31).getUTCDay();
      const octLastSun = 31 - new Date(now.getUTCFullYear(), 9, 31).getUTCDay();
      const isCEST =
        (utcMonth > 2 && utcMonth < 9) ||
        (utcMonth === 2 && utcDay >= marchLastSun) ||
        (utcMonth === 9 && utcDay < octLastSun);
      const offsetHours = isCEST ? 2 : 1;
      const belgradeHour = (now.getUTCHours() + offsetHours) % 24;
      console.log(
        `[sync-gemius] Belgrade hour: ${belgradeHour}, UTC: ${now.getUTCHours()}, offset: +${offsetHours} (${isCEST ? "CEST" : "CET"})`
      );
      if (belgradeHour !== 8 && belgradeHour !== 9) {
        return new Response(
          JSON.stringify({
            status: "skipped",
            reason: `Belgrade time is ${belgradeHour}:00, sync runs at 8:00 and 9:00 only`,
          }),
          { headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Initialize Supabase client with service_role key (bypasses RLS)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Create sync_log entry
    const { data: logEntry, error: logError } = await supabase
      .from("sync_log")
      .insert({ trigger: `gemius_${trigger}`, status: "running" })
      .select("id")
      .single();

    if (logError) {
      console.error("[sync-gemius] Failed to create sync_log:", logError.message);
    }
    const logId = logEntry?.id;

    // Fetch gemius configs
    let configQuery = supabase.from("gemius_config").select("*").eq("enabled", true);
    if (forceClientId) {
      configQuery = configQuery.eq("client_id", forceClientId);
    }
    const { data: configs, error: configError } = await configQuery;

    if (configError) {
      throw new Error(`Failed to fetch gemius_config: ${configError.message}`);
    }

    const gemiusConfigs = (configs || []) as GemiusConfig[];
    if (gemiusConfigs.length === 0) {
      console.log("[sync-gemius] No enabled gemius configs found");
      if (logId) {
        await supabase.from("sync_log").update({
          finished_at: new Date().toISOString(),
          status: "completed",
          sheets_total: 0,
          sheets_ok: 0,
          rows_synced: 0,
        }).eq("id", logId);
      }
      return new Response(
        JSON.stringify({ status: "completed", message: "No enabled gemius configs" }),
        { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    // Open gDE session once, reuse for all clients
    await openSession();

    const results: SyncResult[] = [];
    let clientsOk = 0;
    let clientsFailed = 0;
    let totalRows = 0;

    // Process clients sequentially (single gDE session)
    for (const config of gemiusConfigs) {
      const result = await syncGemiusClient(supabase, config,
        dateFrom && dateTo ? { dateFrom, dateTo } : undefined);
      results.push(result);

      if (result.status === "ok") {
        clientsOk++;
        totalRows += result.rows || 0;
      } else {
        clientsFailed++;
      }
      console.log(
        `[sync-gemius] ${result.clientId}: ${result.status}` +
          (result.rows ? ` (${result.rows} rows)` : "") +
          (result.error ? ` — ${result.error}` : "")
      );
    }

    // Close gDE session
    await closeSession();

    // Update sync_log
    const errors = results
      .filter((r) => r.status === "error")
      .map((r) => ({
        client_id: r.clientId,
        platform: r.platform,
        error: r.error,
      }));

    if (logId) {
      await supabase.from("sync_log").update({
        finished_at: new Date().toISOString(),
        status: clientsFailed > 0 ? "completed_with_errors" : "completed",
        sheets_total: clientsOk + clientsFailed,
        sheets_ok: clientsOk,
        sheets_failed: clientsFailed,
        rows_synced: totalRows,
        errors,
      }).eq("id", logId);
    }

    const response = {
      status: clientsFailed > 0 ? "completed_with_errors" : "completed",
      trigger,
      clients_total: clientsOk + clientsFailed,
      clients_ok: clientsOk,
      clients_failed: clientsFailed,
      rows_synced: totalRows,
      results,
    };

    return new Response(JSON.stringify(response), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    console.error("[sync-gemius] Fatal error:", err);
    return new Response(
      JSON.stringify({
        status: "failed",
        error: (err as Error).message || String(err),
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
});
