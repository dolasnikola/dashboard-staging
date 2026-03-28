import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { fetchInsights } from "./api.ts";
import type { MetaConfig, MetaInsightRow, CampaignRow, SyncResult } from "./types.ts";

// Conversion action types to extract from Meta's actions array
const CONVERSION_ACTIONS = [
  "offsite_conversion.fb_pixel_lead",
  "offsite_conversion.fb_pixel_purchase",
  "lead",
  "onsite_conversion.messaging_conversation_started_7d",
  "omni_purchase",
];

/**
 * Sync one client's Meta campaign data to Supabase.
 *
 * Flow:
 * 1. Fetch insights from Meta Marketing API (daily, campaign level)
 * 2. Map to CampaignRow format with computed metrics
 * 3. Upsert into campaign_data via date-range RPC
 */
export async function syncMetaClient(
  supabase: SupabaseClient,
  config: MetaConfig,
  accessToken: string,
  options?: { dateFrom?: string; dateTo?: string },
): Promise<SyncResult> {
  const { client_id, account_id } = config;

  try {
    // Date range: use overrides or default to yesterday
    let dateFrom: string;
    let dateTo: string;
    if (options?.dateFrom && options?.dateTo) {
      dateFrom = options.dateFrom;
      dateTo = options.dateTo;
    } else {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      dateFrom = formatDateISO(yesterday);
      dateTo = formatDateISO(yesterday);
    }

    console.log(`[sync-meta] ${client_id} (${account_id}): fetching ${dateFrom} to ${dateTo}`);

    // Fetch from Meta API
    const insights = await fetchInsights(accessToken, account_id, dateFrom, dateTo);
    console.log(`[sync-meta] ${client_id}: got ${insights.length} raw rows`);

    if (insights.length === 0) {
      return {
        clientId: client_id,
        platform: "meta",
        status: "ok",
        rows: 0,
      };
    }

    // Map to campaign_data format
    const rows = insights.map((row) => mapInsightRow(row));

    // Deduplicate: aggregate rows with same date+campaign
    const deduped = deduplicateRows(rows);
    console.log(`[sync-meta] ${client_id}: ${deduped.length} rows after dedup`);

    // Upsert via date-range RPC
    const { error: upsertError } = await supabase.rpc("upsert_campaign_data_by_dates", {
      p_client_id: client_id,
      p_platform: "meta",
      p_date_from: dateFrom,
      p_date_to: dateTo,
      p_rows: deduped,
    });

    if (upsertError) {
      throw new Error(`upsert_campaign_data_by_dates failed: ${upsertError.message}`);
    }

    // Update last_synced_at
    await supabase
      .from("meta_config")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("client_id", client_id)
      .eq("account_id", account_id);

    const months = [...new Set(deduped.map((r) => r.date.substring(0, 7)))];

    return {
      clientId: client_id,
      platform: "meta",
      status: "ok",
      rows: deduped.length,
      months,
    };
  } catch (err) {
    return {
      clientId: client_id,
      platform: "meta",
      status: "error",
      error: (err as Error).message || String(err),
    };
  }
}

/**
 * Map a Meta Insights API row to our CampaignRow format.
 */
function mapInsightRow(row: MetaInsightRow): CampaignRow {
  const impressions = parseInt(row.impressions) || 0;
  const clicks = parseInt(row.clicks) || 0;
  const spend = parseFloat(row.spend) || 0;
  const reach = parseInt(row.reach) || 0;

  // Extract conversions from the actions array
  let conversions = 0;
  if (row.actions) {
    for (const action of row.actions) {
      if (CONVERSION_ACTIONS.includes(action.action_type)) {
        conversions += parseInt(action.value) || 0;
      }
    }
  }

  // Extract conversion value from action_values array
  let convValue = 0;
  if (row.action_values) {
    for (const av of row.action_values) {
      if (CONVERSION_ACTIONS.includes(av.action_type)) {
        convValue += parseFloat(av.value) || 0;
      }
    }
  }

  // Compute derived metrics
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
  const cpc = clicks > 0 ? spend / clicks : 0;
  const cpa = conversions > 0 ? spend / conversions : 0;

  return {
    date: row.date_start,
    campaign: row.campaign_name || "Unknown",
    insertion_order: "",
    impressions,
    clicks,
    spend,
    reach,
    conversions,
    conv_value: Math.round(convValue * 100) / 100,
    ctr: Math.round(ctr * 100) / 100,
    cpm: Math.round(cpm * 100) / 100,
    cpc: Math.round(cpc * 100) / 100,
    cpa: Math.round(cpa * 100) / 100,
  };
}

/**
 * Deduplicate rows by date+campaign.
 * Aggregates metrics for duplicate combinations.
 */
function deduplicateRows(rows: CampaignRow[]): CampaignRow[] {
  const map: Record<string, CampaignRow> = {};
  for (const r of rows) {
    const key = `${r.date}|${r.campaign}`;
    if (!map[key]) {
      map[key] = { ...r };
    } else {
      map[key].impressions += r.impressions;
      map[key].clicks += r.clicks;
      map[key].spend += r.spend;
      map[key].reach += r.reach;
      map[key].conversions += r.conversions;
      map[key].conv_value += r.conv_value;
    }
  }
  // Recalculate derived metrics
  for (const row of Object.values(map)) {
    row.ctr = row.impressions > 0 ? Math.round((row.clicks / row.impressions) * 100 * 100) / 100 : 0;
    row.cpm = row.impressions > 0 ? Math.round((row.spend / row.impressions) * 1000 * 100) / 100 : 0;
    row.cpc = row.clicks > 0 ? Math.round((row.spend / row.clicks) * 100) / 100 : 0;
    row.cpa = row.conversions > 0 ? Math.round((row.spend / row.conversions) * 100) / 100 : 0;
  }
  return Object.values(map);
}

/**
 * Format a Date as YYYY-MM-DD.
 */
function formatDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
