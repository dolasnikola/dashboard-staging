import { createClient } from "npm:@supabase/supabase-js@2";
import { checkTokenExpiry } from "./api.ts";
import { syncMetaClient } from "./sync-client.ts";
import type { MetaConfig, SyncResult } from "./types.ts";

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
      dateFrom = body.date_from || null; // YYYY-MM-DD
      dateTo = body.date_to || null;     // YYYY-MM-DD
    } catch {
      // No body or invalid JSON — default to cron
    }

    // Timezone check: only sync at 8:00 or 9:00 Belgrade time (for cron triggers)
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
        `[sync-meta] Belgrade hour: ${belgradeHour}, UTC: ${now.getUTCHours()}, offset: +${offsetHours} (${isCEST ? "CEST" : "CET"})`
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

    // Get Meta access token from secrets
    const accessToken = Deno.env.get("META_ACCESS_TOKEN");
    if (!accessToken) {
      throw new Error("META_ACCESS_TOKEN secret is not set. Run: supabase secrets set META_ACCESS_TOKEN=...");
    }

    // Check token expiry
    const tokenInfo = await checkTokenExpiry(accessToken);
    if (!tokenInfo.valid) {
      throw new Error(`Meta token is invalid: ${tokenInfo.error}. Generate a new token at https://developers.facebook.com/tools/explorer/`);
    }
    const tokenWarning = tokenInfo.daysLeft !== null && tokenInfo.daysLeft <= 7
      ? `TOKEN EXPIRING in ${tokenInfo.daysLeft} days (${tokenInfo.expiresAt?.toISOString()})! Refresh at https://developers.facebook.com/tools/explorer/`
      : null;
    if (tokenWarning) {
      console.warn(`[sync-meta] ⚠️ ${tokenWarning}`);
    }

    // Initialize Supabase client with service_role key (bypasses RLS)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Create sync_log entry
    const { data: logEntry, error: logError } = await supabase
      .from("sync_log")
      .insert({ trigger: `meta_${trigger}`, status: "running" })
      .select("id")
      .single();

    if (logError) {
      console.error("[sync-meta] Failed to create sync_log:", logError.message);
    }
    const logId = logEntry?.id;

    // Fetch meta configs
    let configQuery = supabase.from("meta_config").select("*").eq("enabled", true);
    if (forceClientId) {
      configQuery = configQuery.eq("client_id", forceClientId);
    }
    const { data: configs, error: configError } = await configQuery;

    if (configError) {
      throw new Error(`Failed to fetch meta_config: ${configError.message}`);
    }

    const metaConfigs = (configs || []) as MetaConfig[];
    if (metaConfigs.length === 0) {
      console.log("[sync-meta] No enabled meta configs found");
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
        JSON.stringify({ status: "completed", message: "No enabled meta configs" }),
        { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    const results: SyncResult[] = [];
    let clientsOk = 0;
    let clientsFailed = 0;
    let totalRows = 0;

    // Process clients sequentially (shared token, avoid rate limits)
    for (const config of metaConfigs) {
      const result = await syncMetaClient(
        supabase,
        config,
        accessToken,
        dateFrom && dateTo ? { dateFrom, dateTo } : undefined,
      );
      results.push(result);

      if (result.status === "ok") {
        clientsOk++;
        totalRows += result.rows || 0;
      } else {
        clientsFailed++;
      }
      console.log(
        `[sync-meta] ${result.clientId}: ${result.status}` +
          (result.rows ? ` (${result.rows} rows)` : "") +
          (result.error ? ` — ${result.error}` : "")
      );
    }

    // Update sync_log
    const errors = results
      .filter((r) => r.status === "error")
      .map((r) => ({
        client_id: r.clientId,
        platform: r.platform,
        error: r.error,
      }));

    // Add token warning to errors if applicable
    if (tokenWarning) {
      errors.push({
        client_id: "system",
        platform: "meta",
        error: tokenWarning,
      });
    }

    if (logId) {
      await supabase.from("sync_log").update({
        finished_at: new Date().toISOString(),
        status: clientsFailed > 0 ? "completed_with_errors" : "completed",
        sheets_total: clientsOk + clientsFailed,
        sheets_ok: clientsOk,
        sheets_failed: clientsFailed,
        rows_synced: totalRows,
        errors: errors.length > 0 ? errors : null,
      }).eq("id", logId);
    }

    const response = {
      status: clientsFailed > 0 ? "completed_with_errors" : "completed",
      trigger,
      token_expires_in_days: tokenInfo.daysLeft,
      token_warning: tokenWarning,
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
    console.error("[sync-meta] Fatal error:", err);
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
