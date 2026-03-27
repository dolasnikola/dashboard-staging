import { GDE_API_BASE } from "./auth.ts";
import type { GdeCampaign, PlacementStats } from "./types.ts";

// Indicator IDs (confirmed via live API testing 2026-03-27)
const INDICATOR_IDS = "4,2,120,1"; // impressions, clicks, CTR, actions
// Dimension ID for placement-level breakdown
const DIMENSION_PLACEMENT = "20";

/**
 * Fetch list of campaigns from gDE API.
 * Can filter by status (current, waiting, finished, all).
 */
export async function getCampaignsList(
  sessionId: string,
  status: string = "current",
  limit: number = 100,
): Promise<GdeCampaign[]> {
  const url = `${GDE_API_BASE}/GetCampaignsList.php?ignoreEmptyParams=Y` +
    `&sessionID=${sessionId}&status=${status}&limit=${limit}` +
    `&sortField=name&sortOrder=asc`;

  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`GetCampaignsList HTTP ${resp.status}`);
  const xml = await resp.text();

  checkApiError(xml, "GetCampaignsList");

  const campaigns: GdeCampaign[] = [];
  const campaignRegex = /<campaign>([\s\S]*?)<\/campaign>/g;
  let match;
  while ((match = campaignRegex.exec(xml)) !== null) {
    const block = match[1];
    campaigns.push({
      campaignID: extractTag(block, "campaignID"),
      name: extractTag(block, "name"),
      clientName: extractTag(block, "clientName"),
      clientID: extractTag(block, "clientID"),
      status: extractTag(block, "status"),
    });
  }
  return campaigns;
}

/**
 * Fetch daily placement stats for a campaign from gDE API.
 * Returns one record per placement per day.
 */
export async function getBasicStats(
  sessionId: string,
  campaignIds: string[],
  dateFrom: string, // YYYYMMDD
  dateTo: string,   // YYYYMMDD
): Promise<PlacementStats[]> {
  const url = `${GDE_API_BASE}/GetBasicStats.php?ignoreEmptyParams=Y` +
    `&sessionID=${sessionId}` +
    `&dimensionIDs=${DIMENSION_PLACEMENT}` +
    `&indicatorIDs=${INDICATOR_IDS}` +
    `&campaignIDs=${campaignIds.join(",")}` +
    `&timeDivision=Day` +
    `&lowerTimeUnit=${dateFrom}` +
    `&upperTimeUnit=${dateTo}` +
    `&showNames=Y&humanDates=Y&indicatorNames=Y`;

  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`GetBasicStats HTTP ${resp.status}`);
  const xml = await resp.text();

  checkApiError(xml, "GetBasicStats");

  const records: PlacementStats[] = [];
  const recordRegex = /<statisticsRecord>([\s\S]*?)<\/statisticsRecord>/g;
  let match;
  while ((match = recordRegex.exec(xml)) !== null) {
    const block = match[1];
    const placementFullName = extractTag(block, "placementFullName");

    // Skip root placements ("/" and "LD" — these are summary rows)
    if (placementFullName === "/" || placementFullName === "LD") continue;

    const impressions = parseFloat(extractTag(block, "impressions")) || 0;
    const clicks = parseFloat(extractTag(block, "clicks")) || 0;
    const ctrRaw = extractTag(block, "CTR");
    const ctr = ctrRaw === "NULL" ? 0 : (parseFloat(ctrRaw) || 0);
    const actionsRaw = extractTag(block, "actions");
    const actions = actionsRaw === "NULL" ? 0 : (parseInt(actionsRaw) || 0);

    records.push({
      campaignName: extractTag(block, "campaignName"),
      placementFullName,
      period: extractTag(block, "period"), // e.g. "20260324000000"
      impressions,
      clicks,
      ctr,
      actions,
    });
  }

  return records;
}

/**
 * Check XML response for API errors.
 */
function checkApiError(xml: string, endpoint: string): void {
  const statusMatch = xml.match(/<status>(.*?)<\/status>/);
  if (statusMatch && statusMatch[1] !== "OK") {
    const errorDesc = xml.match(/<errorDescription>(.*?)<\/errorDescription>/);
    throw new Error(
      `${endpoint} error: ${statusMatch[1]}` +
      (errorDesc ? ` — ${errorDesc[1]}` : "")
    );
  }
}

/**
 * Extract text content of an XML tag using regex.
 * Simple but reliable for the flat gDE response format.
 */
function extractTag(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}>(.*?)</${tag}>`));
  return match ? match[1] : "";
}
