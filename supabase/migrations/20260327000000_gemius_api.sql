-- ============================================
-- FAZA 4E+: Gemius gDE API Integration
-- gemius_config table + local_display_dashboard table
-- RPC functions for atomic upsert
-- ============================================

-- 1. gemius_config — maps dashboard clients to gDE campaign IDs
CREATE TABLE IF NOT EXISTS gemius_config (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  gde_client_name TEXT NOT NULL DEFAULT '',
  gde_campaign_ids TEXT[] NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id)
);

COMMENT ON TABLE gemius_config IS 'Maps dashboard clients to Gemius gDE campaign IDs for automated sync';
COMMENT ON COLUMN gemius_config.gde_client_name IS 'Client name as it appears in gDE (e.g. Nlb.rs) — used to auto-discover campaigns';
COMMENT ON COLUMN gemius_config.gde_campaign_ids IS 'Explicit campaign IDs to sync. If empty, auto-discovers by gde_client_name';

-- RLS for gemius_config
ALTER TABLE gemius_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read gemius_config for their clients"
  ON gemius_config FOR SELECT
  TO authenticated
  USING (has_client_access(client_id));

CREATE POLICY "Admins can manage gemius_config"
  ON gemius_config FOR ALL
  TO authenticated
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

-- 2. local_display_dashboard — daily granular data from gDE API
CREATE TABLE IF NOT EXISTS local_display_dashboard (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id TEXT NOT NULL,
  campaign TEXT NOT NULL,
  publisher TEXT NOT NULL DEFAULT '',
  format TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT '',
  date DATE NOT NULL,
  month TEXT NOT NULL,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  ctr NUMERIC(8,4) NOT NULL DEFAULT 0,
  actions INTEGER NOT NULL DEFAULT 0,
  spend NUMERIC(12,2) NOT NULL DEFAULT 0,
  UNIQUE(client_id, campaign, publisher, format, type, date)
);

COMMENT ON TABLE local_display_dashboard IS 'Daily Local Display metrics from Gemius gDE API, per placement';
COMMENT ON COLUMN local_display_dashboard.month IS 'YYYY-MM derived from date, for easy grouping';

-- RLS for local_display_dashboard
ALTER TABLE local_display_dashboard ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read local_display_dashboard for their clients"
  ON local_display_dashboard FOR SELECT
  TO authenticated
  USING (has_client_access(client_id));

-- Service role bypasses RLS for INSERT/DELETE from Edge Function

-- 3. Indexes
CREATE INDEX idx_ldd_client_date ON local_display_dashboard(client_id, date);
CREATE INDEX idx_ldd_client_month ON local_display_dashboard(client_id, month);
CREATE INDEX idx_gemius_config_client ON gemius_config(client_id);

-- 4. RPC: Atomic upsert for daily local display data
CREATE OR REPLACE FUNCTION upsert_local_display_daily(
  p_client_id TEXT,
  p_date_from DATE,
  p_date_to DATE,
  p_rows JSONB
) RETURNS INTEGER AS $$
DECLARE
  row_count INTEGER;
BEGIN
  -- Delete existing rows for this client in the date range
  DELETE FROM local_display_dashboard
  WHERE client_id = p_client_id
    AND date >= p_date_from
    AND date <= p_date_to;

  -- Insert new rows
  INSERT INTO local_display_dashboard (
    client_id, campaign, publisher, format, type, date, month,
    impressions, clicks, ctr, actions, spend
  )
  SELECT
    p_client_id,
    COALESCE(r->>'campaign', ''),
    COALESCE(r->>'publisher', ''),
    COALESCE(r->>'format', ''),
    COALESCE(r->>'type', ''),
    (r->>'date')::DATE,
    to_char((r->>'date')::DATE, 'YYYY-MM'),
    COALESCE((r->>'impressions')::INTEGER, 0),
    COALESCE((r->>'clicks')::INTEGER, 0),
    COALESCE((r->>'ctr')::NUMERIC, 0),
    COALESCE((r->>'actions')::INTEGER, 0),
    COALESCE((r->>'spend')::NUMERIC, 0)
  FROM jsonb_array_elements(p_rows) AS r;

  GET DIAGNOSTICS row_count = ROW_COUNT;
  RETURN row_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. RPC: Monthly rollup from daily data into local_display_report
CREATE OR REPLACE FUNCTION rollup_local_display_monthly(
  p_client_id TEXT,
  p_month TEXT
) RETURNS INTEGER AS $$
DECLARE
  row_count INTEGER;
  v_campaign TEXT;
BEGIN
  -- Get campaign name from daily data for this month
  SELECT DISTINCT campaign INTO v_campaign
  FROM local_display_dashboard
  WHERE client_id = p_client_id AND month = p_month
  LIMIT 1;

  IF v_campaign IS NULL THEN
    RETURN 0;
  END IF;

  -- Delete existing monthly rows
  DELETE FROM local_display_report
  WHERE client_id = p_client_id AND month = p_month;

  -- Insert aggregated monthly data grouped by publisher/format/type
  INSERT INTO local_display_report (
    client_id, campaign, publisher, format, type, month,
    impressions, clicks, ctr, actions
  )
  SELECT
    p_client_id,
    campaign,
    publisher,
    format,
    type,
    p_month,
    SUM(impressions),
    SUM(clicks),
    CASE WHEN SUM(impressions) > 0
      THEN (SUM(clicks)::NUMERIC / SUM(impressions)) * 100
      ELSE 0
    END,
    SUM(actions)
  FROM local_display_dashboard
  WHERE client_id = p_client_id AND month = p_month
  GROUP BY campaign, publisher, format, type;

  GET DIAGNOSTICS row_count = ROW_COUNT;
  RETURN row_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
