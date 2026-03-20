// Port of syncGA4Sheet() from app.js:458-491 + dbSaveGA4Data() from db.js:360-384
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { parseCSV } from "./csv.ts";
import { parseNum } from "./platform.ts";
import type { SyncResult } from "./types.ts";

export async function syncGA4Sheet(
  supabase: SupabaseClient,
  clientId: string,
  sheetUrl: string
): Promise<SyncResult> {
  try {
    // 1. Fetch CSV
    const response = await fetch(sheetUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const csvText = await response.text();

    // 2. Parse CSV
    const { rows } = parseCSV(csvText);
    if (rows.length === 0) {
      return { clientId, platform: "ga4", status: "ok", rows: 0, months: [] };
    }

    // 3. Group by month — handle Serbian/English column names
    const byMonth: Record<string, { product: string; leads: number; sessions: number; users: number }[]> = {};

    rows.forEach((row) => {
      const month = row["Month"] || row["month"] || row["Mesec"] || "";
      if (!month) return;
      if (!byMonth[month]) byMonth[month] = [];
      byMonth[month].push({
        product: row["Product"] || row["product"] || row["Proizvod"] || "",
        leads: parseNum(row["Leads"] || row["leads"] || "0"),
        sessions: parseNum(row["Sessions"] || row["sessions"] || "0"),
        users: parseNum(
          row["Total Users"] || row["Total users"] || row["users"] || row["Users"] || "0"
        ),
      });
    });

    // 4. Save each month via atomic RPC
    let totalRows = 0;
    const monthKeys = Object.keys(byMonth);

    for (const month of monthKeys) {
      const { error } = await supabase.rpc("upsert_ga4_data", {
        p_client_id: clientId,
        p_month: month,
        p_rows: byMonth[month],
      });

      if (error) {
        throw new Error(`upsert_ga4_data failed for ${month}: ${error.message}`);
      }

      totalRows += byMonth[month].length;
    }

    return {
      clientId,
      platform: "ga4",
      status: "ok",
      rows: totalRows,
      months: monthKeys,
    };
  } catch (err) {
    return {
      clientId,
      platform: "ga4",
      status: "error",
      error: (err as Error).message || String(err),
    };
  }
}
