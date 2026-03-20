import { createClient } from "npm:@supabase/supabase-js@2";
import { syncCampaignSheet } from "./sync-campaigns.ts";
import { syncGA4Sheet } from "./sync-ga4.ts";
import type { SheetLink, SyncResult } from "./types.ts";

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
    try {
      const body = await req.json();
      trigger = body.trigger || "cron";
    } catch {
      // No body or invalid JSON — default to cron
    }

    // Timezone check: only sync at 8:00 or 9:00 Belgrade time (for cron triggers)
    if (trigger === "cron") {
      const belgradeHour = new Date().toLocaleString("en-US", {
        timeZone: "Europe/Belgrade",
        hour: "numeric",
        hour12: false,
      });
      if (!["8", "9"].includes(belgradeHour.trim())) {
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
      .insert({ trigger, status: "running" })
      .select("id")
      .single();

    if (logError) {
      console.error("Failed to create sync_log:", logError.message);
    }
    const logId = logEntry?.id;

    // Fetch all sheet links
    const { data: sheetLinks, error: linksError } = await supabase
      .from("sheet_links")
      .select("client_id, platform, sheet_url");

    if (linksError) {
      throw new Error(`Failed to fetch sheet_links: ${linksError.message}`);
    }

    const links = (sheetLinks || []) as SheetLink[];
    const results: SyncResult[] = [];
    let sheetsOk = 0;
    let sheetsFailed = 0;
    let totalRows = 0;

    // Process each sheet sequentially
    for (const link of links) {
      if (!link.sheet_url || !link.sheet_url.includes("/pub")) continue;

      let result: SyncResult;

      if (link.platform === "ga4") {
        result = await syncGA4Sheet(supabase, link.client_id, link.sheet_url);
      } else {
        result = await syncCampaignSheet(
          supabase,
          link.client_id,
          link.platform,
          link.sheet_url
        );
      }

      results.push(result);

      if (result.status === "ok") {
        sheetsOk++;
        totalRows += result.rows || 0;
      } else {
        sheetsFailed++;
      }

      console.log(
        `[sync] ${link.client_id}/${link.platform}: ${result.status}` +
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

    if (logId) {
      await supabase
        .from("sync_log")
        .update({
          finished_at: new Date().toISOString(),
          status: sheetsFailed > 0 ? "completed_with_errors" : "completed",
          sheets_total: sheetsOk + sheetsFailed,
          sheets_ok: sheetsOk,
          sheets_failed: sheetsFailed,
          rows_synced: totalRows,
          errors,
        })
        .eq("id", logId);
    }

    const response = {
      status: sheetsFailed > 0 ? "completed_with_errors" : "completed",
      trigger,
      sheets_total: sheetsOk + sheetsFailed,
      sheets_ok: sheetsOk,
      sheets_failed: sheetsFailed,
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
    console.error("[sync-sheets] Fatal error:", err);
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
