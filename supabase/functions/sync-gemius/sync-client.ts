import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { openSession } from "./auth.ts";
import { getCampaignsList, getBasicStats } from "./api.ts";
import type { GemiusConfig, GdeCampaign, LocalDisplayRow, PlacementStats, SyncResult } from "./types.ts";

// Lookback days: gDE API returns empty results for single-day queries.
// Use 3-day window to ensure data is returned + catch late-arriving data.
const LOOKBACK_DAYS = 3;

export async function syncGemiusClient(
  supabase: SupabaseClient,
  config: GemiusConfig,
  options?: { dateFrom?: string; dateTo?: string },
): Promise<SyncResult> {
  const { client_id } = config;
  try {
    const sessionId = await openSession();

    // Determine which campaigns to sync
    let campaignIds = config.gde_campaign_ids || [];

    if (campaignIds.length === 0 && config.gde_client_name) {
      // Auto-discover: fetch current + finished campaigns and filter by client name
      const [currentCampaigns, finishedCampaigns] = await Promise.all([
        getCampaignsList(sessionId, "current"),
        getCampaignsList(sessionId, "finished"),
      ]);
      const allCampaigns = [...currentCampaigns, ...finishedCampaigns];
      console.log(
        `[gemius] ${client_id}: total campaigns on account: ${allCampaigns.length} (${currentCampaigns.length} current, ${finishedCampaigns.length} finished)`
      );
      const matched = allCampaigns.filter(
        (c) => c.clientName.toLowerCase() === config.gde_client_name.toLowerCase()
      );
      campaignIds = matched.map((c) => c.campaignID);
      console.log(
        `[gemius] ${client_id}: auto-discovered ${campaignIds.length} campaigns for "${config.gde_client_name}" — IDs: ${campaignIds.join(", ")}`
      );
    }

    if (campaignIds.length === 0) {
      return {
        clientId: client_id,
        platform: "local_display",
        status: "ok",
        rows: 0,
        error: "No campaigns found",
      };
    }

    // Date range: use overrides or default to lookback window
    // gDE API returns empty results for single-day queries, so we always use a multi-day range.
    let dateFrom: string;
    let dateTo: string;
    if (options?.dateFrom && options?.dateTo) {
      dateFrom = options.dateFrom;
      dateTo = options.dateTo;
    } else {
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      dateTo = formatDateGde(yesterday);
      const lookbackStart = new Date(now);
      lookbackStart.setDate(lookbackStart.getDate() - LOOKBACK_DAYS);
      dateFrom = formatDateGde(lookbackStart);
    }

    console.log(`[gemius] ${client_id}: fetching stats for ${dateFrom}-${dateTo} (${campaignIds.length} campaigns)`);

    // Fetch stats for all campaigns
    const stats = await getBasicStats(sessionId, campaignIds, dateFrom, dateTo);
    console.log(`[gemius] ${client_id}: got ${stats.length} placement records`);

    if (stats.length === 0) {
      return {
        clientId: client_id,
        platform: "local_display",
        status: "ok",
        rows: 0,
      };
    }

    // Map stats to local display rows
    const rows: LocalDisplayRow[] = [];
    for (const stat of stats) {
      const { publisher, format, type } = parsePlacement(stat.placementFullName);
      if (!publisher) continue; // Skip unparseable placements

      const date = periodToDate(stat.period);
      rows.push({
        client_id,
        campaign: stat.campaignName,
        publisher,
        format,
        type,
        date,
        impressions: stat.impressions,
        clicks: stat.clicks,
        ctr: stat.ctr * 100, // gDE returns as decimal (0.003644), we store as percent (0.36)
        actions: stat.actions,
        spend: 0, // gDE doesn't provide spend data
      });
    }

    // Deduplicate: aggregate rows with same placement+date
    const dedupedRaw = deduplicateRows(rows);

    // Filter out rows with negligible impressions (preview traffic, finished placements)
    const MIN_IMPRESSIONS = 10;
    const deduped = dedupedRaw.filter((r) => r.impressions >= MIN_IMPRESSIONS);
    console.log(`[gemius] ${client_id}: ${dedupedRaw.length} rows after dedup, ${deduped.length} after filtering (>=${MIN_IMPRESSIONS} imp)`);

    // Upsert daily data via RPC — compute actual date range from data
    const allDates = deduped.map((r) => r.date).sort();
    const dateFromSql = allDates[0];
    const dateToSql = allDates[allDates.length - 1];

    const { error: upsertError } = await supabase.rpc("upsert_local_display_daily", {
      p_client_id: client_id,
      p_date_from: dateFromSql,
      p_date_to: dateToSql,
      p_rows: deduped,
    });

    if (upsertError) {
      throw new Error(`upsert_local_display_daily failed: ${upsertError.message}`);
    }

    // Rollup monthly data
    const months = [...new Set(deduped.map((r) => r.date.substring(0, 7)))];
    for (const month of months) {
      const { error: rollupError } = await supabase.rpc("rollup_local_display_monthly", {
        p_client_id: client_id,
        p_month: month,
      });
      if (rollupError) {
        console.warn(`[gemius] ${client_id}: monthly rollup failed for ${month}: ${rollupError.message}`);
      }
    }

    // Update last_synced_at
    await supabase
      .from("gemius_config")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("client_id", client_id);

    return {
      clientId: client_id,
      platform: "local_display",
      status: "ok",
      rows: deduped.length,
      months,
    };
  } catch (err) {
    return {
      clientId: client_id,
      platform: "local_display",
      status: "error",
      error: (err as Error).message || String(err),
    };
  }
}

/**
 * Parse Gemius placement string into publisher, format, type.
 */
function parsePlacement(placement: string): { publisher: string; format: string; type: string } {
  const result = { publisher: "", format: "", type: "" };

  const parts = placement.split(/\s*\/\s*/);

  if (parts.length >= 2) {
    if (parts[0].toUpperCase() === "LD" && parts.length >= 4) {
      result.publisher = parts[1].trim();
      result.format = parts[2].trim();
      result.type = parts[3].trim();
    } else if (parts[0].toUpperCase().startsWith("LD")) {
      const firstPart = parts[0];
      const slashIdx = firstPart.indexOf("/");
      if (slashIdx >= 0) {
        result.publisher = firstPart.substring(slashIdx + 1).trim();
      } else {
        result.publisher = firstPart.replace(/^LD\s*/i, "").trim();
      }
      if (parts.length >= 3) result.format = parts[1].trim();
      if (parts.length >= 4) result.type = parts[2].trim();
      if (parts.length === 3) result.type = parts[2].trim();
      if (parts.length === 2) result.format = parts[1].trim();
    }
  }

  if (result.type.toLowerCase() === "tracking" && parts.length >= 5) {
    result.type = parts[parts.length - 2].trim();
  }

  return result;
}

/**
 * Convert gDE period string to YYYY-MM-DD date.
 * Input: "20260324000000" → Output: "2026-03-24"
 */
function periodToDate(period: string): string {
  const s = period.substring(0, 8);
  return `${s.substring(0, 4)}-${s.substring(4, 6)}-${s.substring(6, 8)}`;
}

/**
 * Format a Date as YYYYMMDD for gDE API.
 */
function formatDateGde(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/**
 * Deduplicate rows by campaign+publisher+format+type+date.
 * Aggregates impressions and clicks, recalculates CTR.
 */
function deduplicateRows(rows: LocalDisplayRow[]): LocalDisplayRow[] {
  const map: Record<string, LocalDisplayRow> = {};
  for (const r of rows) {
    const key = `${r.date}|${r.campaign}|${r.publisher}|${r.format}|${r.type}`;
    if (!map[key]) {
      map[key] = { ...r };
    } else {
      map[key].impressions += r.impressions;
      map[key].clicks += r.clicks;
      map[key].actions += r.actions;
      map[key].spend += r.spend;
    }
  }
  // Recalculate CTR
  for (const row of Object.values(map)) {
    row.ctr = row.impressions > 0 ? (row.clicks / row.impressions) * 100 : 0;
  }
  return Object.values(map);
}
