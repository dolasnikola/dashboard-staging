-- FAZA 4D: Alerts & Anomaly Detection System
-- Tables: alerts, alert_configs
-- RPC: detect_metric_anomalies

-- ============================================
-- 1. ALERTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS alerts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  platform TEXT,
  alert_type TEXT NOT NULL,       -- 'budget_pacing', 'metric_anomaly', 'sync_failure'
  severity TEXT NOT NULL DEFAULT 'warning',  -- 'info', 'warning', 'critical'
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  metric_name TEXT,               -- e.g. 'cpc', 'ctr', 'spend', 'cpm'
  metric_value DOUBLE PRECISION,
  metric_baseline DOUBLE PRECISION,
  deviation_pct DOUBLE PRECISION,
  is_read BOOLEAN NOT NULL DEFAULT false,
  is_dismissed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT now() + interval '7 days'
);

CREATE INDEX idx_alerts_client_created ON alerts(client_id, created_at DESC);
CREATE INDEX idx_alerts_unread ON alerts(is_read, created_at DESC) WHERE is_read = false;

ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read alerts for their clients"
  ON alerts FOR SELECT TO authenticated
  USING (has_client_access(client_id));

CREATE POLICY "Users can update their alerts"
  ON alerts FOR UPDATE TO authenticated
  USING (has_client_access(client_id));

-- Service role needs INSERT for Edge Function
CREATE POLICY "Service can insert alerts"
  ON alerts FOR INSERT TO authenticated
  WITH CHECK (true);

-- ============================================
-- 2. ALERT CONFIGS TABLE (admin thresholds)
-- ============================================
CREATE TABLE IF NOT EXISTS alert_configs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,       -- 'budget_pacing', 'metric_anomaly', 'sync_failure'
  metric_name TEXT,               -- null for budget_pacing/sync_failure, metric name for anomaly
  threshold_pct DOUBLE PRECISION NOT NULL DEFAULT 30,  -- deviation % to trigger alert
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, alert_type, metric_name)
);

ALTER TABLE alert_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read alert_configs for their clients"
  ON alert_configs FOR SELECT TO authenticated
  USING (has_client_access(client_id));

CREATE POLICY "Admins can manage alert_configs"
  ON alert_configs FOR ALL TO authenticated
  USING (get_user_role() = 'admin');

-- ============================================
-- 3. ANOMALY DETECTION RPC
-- ============================================
CREATE OR REPLACE FUNCTION detect_metric_anomalies(
  p_client_id TEXT,
  p_platform TEXT,
  p_lookback_days INTEGER DEFAULT 7,
  p_baseline_days INTEGER DEFAULT 30
) RETURNS TABLE (
  metric_name TEXT,
  recent_avg DOUBLE PRECISION,
  baseline_avg DOUBLE PRECISION,
  deviation_pct DOUBLE PRECISION
) AS $$
  WITH recent AS (
    SELECT
      AVG(CASE WHEN clicks > 0 THEN spend / clicks ELSE 0 END) as avg_cpc,
      AVG(CASE WHEN impressions > 0 THEN clicks::float / impressions * 100 ELSE 0 END) as avg_ctr,
      AVG(spend) as avg_spend,
      AVG(CASE WHEN impressions > 0 THEN spend / impressions * 1000 ELSE 0 END) as avg_cpm
    FROM campaign_data
    WHERE client_id = p_client_id AND platform = p_platform
      AND date >= CURRENT_DATE - p_lookback_days
  ),
  baseline AS (
    SELECT
      AVG(CASE WHEN clicks > 0 THEN spend / clicks ELSE 0 END) as avg_cpc,
      AVG(CASE WHEN impressions > 0 THEN clicks::float / impressions * 100 ELSE 0 END) as avg_ctr,
      AVG(spend) as avg_spend,
      AVG(CASE WHEN impressions > 0 THEN spend / impressions * 1000 ELSE 0 END) as avg_cpm
    FROM campaign_data
    WHERE client_id = p_client_id AND platform = p_platform
      AND date >= CURRENT_DATE - p_baseline_days
      AND date < CURRENT_DATE - p_lookback_days
  )
  SELECT m.metric_name, m.recent_avg, m.baseline_avg, m.deviation_pct
  FROM (
    SELECT 'cpc'::TEXT, r.avg_cpc, b.avg_cpc,
      CASE WHEN b.avg_cpc > 0 THEN ((r.avg_cpc - b.avg_cpc) / b.avg_cpc * 100) ELSE 0 END
    FROM recent r, baseline b
    UNION ALL
    SELECT 'ctr'::TEXT, r.avg_ctr, b.avg_ctr,
      CASE WHEN b.avg_ctr > 0 THEN ((r.avg_ctr - b.avg_ctr) / b.avg_ctr * 100) ELSE 0 END
    FROM recent r, baseline b
    UNION ALL
    SELECT 'spend'::TEXT, r.avg_spend, b.avg_spend,
      CASE WHEN b.avg_spend > 0 THEN ((r.avg_spend - b.avg_spend) / b.avg_spend * 100) ELSE 0 END
    FROM recent r, baseline b
    UNION ALL
    SELECT 'cpm'::TEXT, r.avg_cpm, b.avg_cpm,
      CASE WHEN b.avg_cpm > 0 THEN ((r.avg_cpm - b.avg_cpm) / b.avg_cpm * 100) ELSE 0 END
    FROM recent r, baseline b
  ) m(metric_name, recent_avg, baseline_avg, deviation_pct)
  WHERE ABS(m.deviation_pct) > 0;
$$ LANGUAGE sql SECURITY DEFINER;

-- ============================================
-- 4. CLEANUP EXPIRED ALERTS RPC
-- ============================================
CREATE OR REPLACE FUNCTION cleanup_expired_alerts()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM alerts WHERE expires_at < now();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
