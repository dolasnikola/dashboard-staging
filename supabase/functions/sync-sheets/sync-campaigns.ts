// Port of syncOneSheet() from app.js:350-411 + dbSaveCampaignData() from db.js:230-302
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { parseCSV } from "./csv.ts";
import { detectPlatform, mapRow } from "./platform.ts";
import type { CampaignRow, SyncResult } from "./types.ts";

export async function syncCampaignSheet(
  supabase: SupabaseClient,
  clientId: string,
  platform: string,
  sheetUrl: string
): Promise<SyncResult> {
  try {
    // 1. Fetch CSV
    const response = await fetch(sheetUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const csvText = await response.text();

    // 2. Parse CSV
    const { headers, rows } = parseCSV(csvText);
    if (rows.length === 0) {
      return { clientId, platform, status: "ok", rows: 0, months: [] };
    }

    // 3. Detect platform + map rows
    const detectedPlatform = detectPlatform(headers);
    const mapped = rows
      .map((r) => mapRow(detectedPlatform || platform, r))
      .filter(
        (r) =>
          r.campaign &&
          r.campaign !== "Poslednji update:" &&
          !r.campaign.startsWith("Poslednji")
      );

    // 4. Group by month (port from app.js:371-394)
    const byMonth: Record<string, CampaignRow[]> = {};
    mapped.forEach((r) => {
      let month: string;
      if (r.date) {
        const ds = String(r.date).trim();
        if (ds.includes("/")) {
          const parts = ds.split("/");
          month = parts[2] + "-" + parts[0].padStart(2, "0");
          // Reformat date to YYYY-MM-DD
          r.date =
            parts[2] +
            "-" +
            parts[0].padStart(2, "0") +
            "-" +
            parts[1].padStart(2, "0");
        } else {
          const d = ds.replace(/-/g, "");
          month = d.substring(0, 4) + "-" + d.substring(4, 6);
        }
      } else {
        // Fallback: current month
        const now = new Date();
        month =
          now.getFullYear() +
          "-" +
          String(now.getMonth() + 1).padStart(2, "0");
      }
      if (!byMonth[month]) byMonth[month] = [];
      byMonth[month].push(r);
    });

    // 5. Deduplicate + save each month (port from db.js:230-302)
    let totalRows = 0;
    const monthKeys = Object.keys(byMonth);

    for (const month of monthKeys) {
      const monthRows = byMonth[month];

      // Deduplicate by date|campaign|insertion_order
      const deduped: Record<string, CampaignRow> = {};
      monthRows.forEach((r) => {
        const date = r.date || "";
        const campaign = r.campaign || "Unknown";
        const io = r.insertion_order || "";
        const dedupKey = `${date}|${campaign}|${io}`;
        if (!deduped[dedupKey]) {
          deduped[dedupKey] = {
            date: date || null,
            campaign,
            insertion_order: io,
            impressions: 0,
            clicks: 0,
            spend: 0,
            reach: 0,
            conversions: 0,
            conv_value: 0,
            ctr: 0,
            cpm: 0,
            cpc: 0,
            cpa: 0,
          };
        }
        const d = deduped[dedupKey];
        d.impressions += r.impressions || 0;
        d.clicks += r.clicks || 0;
        d.spend += r.spend || 0;
        d.reach += r.reach || 0;
        d.conversions += r.conversions || 0;
        d.conv_value += r.conv_value || 0;
      });

      // Recalculate computed metrics
      const cleanRows = Object.values(deduped);
      cleanRows.forEach((d) => {
        d.ctr = d.impressions > 0 ? (d.clicks / d.impressions) * 100 : 0;
        d.cpm = d.impressions > 0 ? (d.spend / d.impressions) * 1000 : 0;
        d.cpc = d.clicks > 0 ? d.spend / d.clicks : 0;
        d.cpa = d.conversions > 0 ? d.spend / d.conversions : 0;
      });

      // Atomic upsert via RPC
      const { data, error } = await supabase.rpc("upsert_campaign_data", {
        p_client_id: clientId,
        p_platform: platform,
        p_month: month,
        p_rows: cleanRows,
      });

      if (error) {
        throw new Error(`upsert_campaign_data failed for ${month}: ${error.message}`);
      }

      totalRows += cleanRows.length;
    }

    return {
      clientId,
      platform,
      status: "ok",
      rows: totalRows,
      months: monthKeys,
    };
  } catch (err) {
    return {
      clientId,
      platform,
      status: "error",
      error: (err as Error).message || String(err),
    };
  }
}
