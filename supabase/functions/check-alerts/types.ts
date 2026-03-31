export interface AlertRow {
  client_id: string;
  platform?: string;
  alert_type: "budget_pacing" | "metric_anomaly" | "sync_failure";
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  metric_name?: string;
  metric_value?: number;
  metric_baseline?: number;
  deviation_pct?: number;
}

export interface AnomalyResult {
  metric_name: string;
  recent_avg: number;
  baseline_avg: number;
  deviation_pct: number;
}

export interface ClientConfig {
  id: string;
  name: string;
  platforms: string[];
}

export interface BudgetRow {
  client_id: string;
  platform: string;
  month: string;
  amount: number;
}

export interface FlightDaysRow {
  client_id: string;
  month: string;
  days: number[];
}

export interface AlertConfig {
  client_id: string;
  alert_type: string;
  metric_name: string | null;
  threshold_pct: number;
  enabled: boolean;
}
