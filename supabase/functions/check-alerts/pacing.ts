import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { AlertRow, BudgetRow, FlightDaysRow } from "./types.ts";

export async function checkBudgetPacing(
  supabase: SupabaseClient,
  clientId: string,
  clientName: string,
  platforms: string[]
): Promise<AlertRow[]> {
  const alerts: AlertRow[] = [];
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const currentDay = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  // Fetch budgets for current month
  const { data: budgets } = await supabase
    .from("budgets")
    .select("*")
    .eq("client_id", clientId)
    .eq("month", month);

  if (!budgets || budgets.length === 0) return alerts;

  // Fetch flight days
  const { data: flightData } = await supabase
    .from("flight_days")
    .select("*")
    .eq("client_id", clientId)
    .eq("month", month)
    .single();

  const flightDays: number[] = flightData?.days || [];

  for (const platform of platforms) {
    if (platform === "ga4" || platform === "local_display") continue;

    const budget = (budgets as BudgetRow[]).find(
      (b) => b.platform === platform
    );
    if (!budget || budget.amount <= 0) continue;

    // Get actual spend for this month
    const { data: spendData } = await supabase
      .from("campaign_data")
      .select("spend")
      .eq("client_id", clientId)
      .eq("platform", platform)
      .gte("date", `${month}-01`)
      .lte("date", `${month}-${daysInMonth}`);

    const actualSpend = (spendData || []).reduce(
      (sum: number, r: { spend: number }) => sum + (r.spend || 0),
      0
    );

    // Calculate expected spend
    let daysPassed: number, daysTotal: number;
    if (flightDays.length > 0) {
      daysTotal = flightDays.length;
      daysPassed = flightDays.filter((d) => d <= currentDay).length;
    } else {
      daysTotal = daysInMonth;
      daysPassed = currentDay;
    }

    if (daysTotal === 0 || daysPassed === 0) continue;

    const expectedSpend = budget.amount * (daysPassed / daysTotal);
    const pacingRatio = expectedSpend > 0 ? actualSpend / expectedSpend : 0;

    // Generate alerts for significant deviations
    if (pacingRatio > 1.2) {
      alerts.push({
        client_id: clientId,
        platform,
        alert_type: "budget_pacing",
        severity: pacingRatio > 1.4 ? "critical" : "warning",
        title: `${clientName}: ${platform} prekoracuje budžet`,
        message: `Potrošeno ${Math.round(pacingRatio * 100)}% od ocekivanog tempa. Spend: ${Math.round(actualSpend)} / Ocekivano: ${Math.round(expectedSpend)} (dan ${daysPassed}/${daysTotal})`,
        metric_name: "spend",
        metric_value: actualSpend,
        metric_baseline: expectedSpend,
        deviation_pct: (pacingRatio - 1) * 100,
      });
    } else if (pacingRatio < 0.7 && daysPassed >= 5) {
      // Only alert for underspending after 5+ days
      alerts.push({
        client_id: clientId,
        platform,
        alert_type: "budget_pacing",
        severity: pacingRatio < 0.5 ? "critical" : "warning",
        title: `${clientName}: ${platform} zaostaje sa budžetom`,
        message: `Potrošeno samo ${Math.round(pacingRatio * 100)}% od ocekivanog tempa. Spend: ${Math.round(actualSpend)} / Ocekivano: ${Math.round(expectedSpend)} (dan ${daysPassed}/${daysTotal})`,
        metric_name: "spend",
        metric_value: actualSpend,
        metric_baseline: expectedSpend,
        deviation_pct: (1 - pacingRatio) * -100,
      });
    }
  }

  return alerts;
}
