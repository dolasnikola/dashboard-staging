import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { AlertRow, AnomalyResult, AlertConfig } from "./types.ts";

const METRIC_LABELS: Record<string, string> = {
  cpc: "CPC",
  ctr: "CTR",
  spend: "Spend",
  cpm: "CPM",
};

const DEFAULT_THRESHOLD = 30; // 30% deviation

export async function checkAnomalies(
  supabase: SupabaseClient,
  clientId: string,
  clientName: string,
  platforms: string[]
): Promise<AlertRow[]> {
  const alerts: AlertRow[] = [];

  // Load alert configs for this client
  const { data: configs } = await supabase
    .from("alert_configs")
    .select("*")
    .eq("client_id", clientId)
    .eq("alert_type", "metric_anomaly");

  const configMap = new Map<string, AlertConfig>();
  (configs || []).forEach((c: AlertConfig) => {
    if (c.metric_name) configMap.set(c.metric_name, c);
  });

  for (const platform of platforms) {
    if (platform === "ga4" || platform === "local_display") continue;

    // Call anomaly detection RPC
    const { data: anomalies, error } = await supabase.rpc(
      "detect_metric_anomalies",
      {
        p_client_id: clientId,
        p_platform: platform,
        p_lookback_days: 7,
        p_baseline_days: 30,
      }
    );

    if (error) {
      console.error(
        `[check-alerts] anomaly RPC error for ${clientId}/${platform}:`,
        error.message
      );
      continue;
    }

    for (const anomaly of (anomalies || []) as AnomalyResult[]) {
      const config = configMap.get(anomaly.metric_name);
      // Skip if explicitly disabled
      if (config && !config.enabled) continue;

      const threshold = config?.threshold_pct || DEFAULT_THRESHOLD;
      const absDeviation = Math.abs(anomaly.deviation_pct);

      if (absDeviation < threshold) continue;
      // Skip if baseline is too small (noisy data)
      if (anomaly.baseline_avg < 0.01) continue;

      const direction = anomaly.deviation_pct > 0 ? "porastao" : "opao";
      const metricLabel =
        METRIC_LABELS[anomaly.metric_name] || anomaly.metric_name;

      alerts.push({
        client_id: clientId,
        platform,
        alert_type: "metric_anomaly",
        severity: absDeviation > 50 ? "critical" : "warning",
        title: `${clientName}: ${metricLabel} ${direction} ${Math.round(absDeviation)}% na ${platform}`,
        message: `${metricLabel} poslednjih 7 dana: ${anomaly.recent_avg.toFixed(2)} vs prosek 30 dana: ${anomaly.baseline_avg.toFixed(2)} (${anomaly.deviation_pct > 0 ? "+" : ""}${anomaly.deviation_pct.toFixed(1)}%)`,
        metric_name: anomaly.metric_name,
        metric_value: anomaly.recent_avg,
        metric_baseline: anomaly.baseline_avg,
        deviation_pct: anomaly.deviation_pct,
      });
    }
  }

  return alerts;
}
