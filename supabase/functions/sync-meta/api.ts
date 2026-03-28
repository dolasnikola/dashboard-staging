import type { MetaInsightRow, TokenInfo } from "./types.ts";

const API_VERSION = "v25.0";
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

/**
 * Fetch campaign insights from Meta Marketing API.
 * Returns daily rows per campaign for the given date range.
 * Handles pagination automatically.
 */
export async function fetchInsights(
  accessToken: string,
  accountId: string,
  dateFrom: string, // YYYY-MM-DD
  dateTo: string,   // YYYY-MM-DD
): Promise<MetaInsightRow[]> {
  const fields = "campaign_name,reach,impressions,clicks,spend,actions,action_values";
  const timeRange = JSON.stringify({ since: dateFrom, until: dateTo });

  const params = new URLSearchParams({
    fields,
    level: "campaign",
    time_range: timeRange,
    time_increment: "1", // daily breakdown
    limit: "500",
    access_token: accessToken,
  });

  const url = `${BASE_URL}/${accountId}/insights?${params}`;
  const allData: MetaInsightRow[] = [];

  let nextPage: string | null = url;

  while (nextPage) {
    const resp = await fetch(nextPage);
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Meta API HTTP ${resp.status}: ${text.substring(0, 500)}`);
    }

    const json = await resp.json();

    if (json.error) {
      throw new Error(`Meta API Error: ${json.error.message} (code: ${json.error.code})`);
    }

    if (json.data) {
      allData.push(...json.data);
    }

    nextPage = json.paging?.next || null;
  }

  return allData;
}

/**
 * Check token validity and expiry date.
 * Returns token info including days until expiration.
 */
export async function checkTokenExpiry(accessToken: string): Promise<TokenInfo> {
  try {
    const url = `${BASE_URL}/debug_token?input_token=${accessToken}&access_token=${accessToken}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      return { valid: false, expiresAt: null, daysLeft: null, error: `HTTP ${resp.status}` };
    }

    const json = await resp.json();

    if (json.data?.error) {
      return { valid: false, expiresAt: null, daysLeft: null, error: json.data.error.message };
    }

    if (!json.data?.is_valid) {
      return { valid: false, expiresAt: null, daysLeft: null, error: "Token is not valid" };
    }

    const expiresAt = json.data.expires_at
      ? new Date(json.data.expires_at * 1000)
      : null;

    const daysLeft = expiresAt
      ? Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : null;

    return { valid: true, expiresAt, daysLeft };
  } catch (err) {
    return { valid: false, expiresAt: null, daysLeft: null, error: (err as Error).message };
  }
}
