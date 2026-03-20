// Direct port from data.js:144-187
import type { CampaignRow } from "./types.ts";

export function detectPlatform(headers: string[]): string | null {
  const h = headers.map((x) => x.toLowerCase());
  if (
    h.some(
      (x) =>
        x.includes("amount spent") ||
        x.includes("ad set name") ||
        (x.includes("campaign name") && h.some((y) => y.includes("reach")))
    )
  )
    return "meta";
  if (
    h.some(
      (x) =>
        x.includes("insertion order") ||
        x.includes("line item") ||
        (x.includes("advertiser") && h.some((y) => y.includes("impressions")))
    )
  )
    return "dv360";
  if (
    h.some(
      (x) =>
        x === "cost" ||
        x.includes("conv. value") ||
        x.includes("search impr. share") ||
        (x.includes("campaign") && h.some((y) => y.includes("impr.")))
    )
  )
    return "google_ads";
  if (
    h.some(
      (x) =>
        x.includes("tiktok") ||
        (x.includes("campaign name") && h.some((y) => y.includes("cost")))
    )
  )
    return "tiktok";
  return null;
}

export function parseNum(v: string | number | undefined | null): number {
  if (!v || v === "--" || v === "N/A") return 0;
  const s = String(v)
    .replace(/[€$%,\s]/g, "")
    .replace(",", ".");
  return parseFloat(s) || 0;
}

export function mapRow(
  platform: string,
  row: Record<string, string>
): CampaignRow {
  const get = (...keys: string[]): string => {
    for (const k of keys) {
      for (const rk of Object.keys(row)) {
        if (rk.toLowerCase().includes(k.toLowerCase())) return row[rk];
      }
    }
    return "";
  };

  const campaign = get("campaign name", "campaign", "Campaign");
  const insertion_order = get("insertion order", "Insertion Order") || "";
  const date = get("reporting starts", "reporting start", "day", "date", "Date", "Day") || "";
  const impressions = parseNum(get("impressions", "impr.", "impr"));
  const clicks = parseNum(get("clicks (all)", "clicks", "link clicks"));
  const spend = parseNum(get("amount spent", "spend", "cost", "total cost"));
  const reach = parseNum(get("reach"));
  const conversions = parseNum(get("results", "conversions", "total conversions", "conv."));
  const conv_value = parseNum(get("conversion value", "conv. value", "total conversion value", "results value"));

  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
  const cpc = clicks > 0 ? spend / clicks : 0;
  const cpa = conversions > 0 ? spend / conversions : 0;

  return {
    date: date || null,
    campaign,
    insertion_order,
    impressions,
    clicks,
    spend,
    reach,
    conversions,
    conv_value,
    ctr,
    cpm,
    cpc,
    cpa,
  };
}
