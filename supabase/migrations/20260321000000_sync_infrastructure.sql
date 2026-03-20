-- ============================================
-- FAZA 2: Sync Infrastructure
-- sync_log table + atomic upsert RPC functions
-- ============================================

-- 1. sync_log table — tracks automated and manual syncs
CREATE TABLE IF NOT EXISTS sync_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',
  trigger TEXT NOT NULL DEFAULT 'cron',
  sheets_total INTEGER DEFAULT 0,
  sheets_ok INTEGER DEFAULT 0,
  sheets_failed INTEGER DEFAULT 0,
  rows_synced INTEGER DEFAULT 0,
  errors JSONB DEFAULT '[]'::jsonb
);

-- RLS: authenticated users can read sync_log
ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read sync_log"
  ON sync_log FOR SELECT
  TO authenticated
  USING (true);

-- 2. Atomic upsert for campaign_data (DELETE + INSERT in one transaction)
CREATE OR REPLACE FUNCTION upsert_campaign_data(
  p_client_id TEXT,
  p_platform TEXT,
  p_month TEXT,
  p_rows JSONB
) RETURNS INTEGER AS $$
DECLARE
  row_count INTEGER;
BEGIN
  -- Delete existing rows for this client/platform/month
  DELETE FROM campaign_data
  WHERE client_id = p_client_id AND platform = p_platform AND month = p_month;

  -- Insert new rows
  INSERT INTO campaign_data (
    client_id, platform, month, date, campaign, insertion_order,
    impressions, clicks, spend, reach, conversions, conv_value,
    ctr, cpm, cpc, cpa
  )
  SELECT
    p_client_id, p_platform, p_month,
    CASE WHEN r->>'date' = '' OR r->>'date' IS NULL THEN NULL ELSE (r->>'date')::DATE END,
    COALESCE(r->>'campaign', 'Unknown'),
    COALESCE(r->>'insertion_order', ''),
    COALESCE((r->>'impressions')::NUMERIC, 0),
    COALESCE((r->>'clicks')::NUMERIC, 0),
    COALESCE((r->>'spend')::NUMERIC, 0),
    COALESCE((r->>'reach')::NUMERIC, 0),
    COALESCE((r->>'conversions')::NUMERIC, 0),
    COALESCE((r->>'conv_value')::NUMERIC, 0),
    COALESCE((r->>'ctr')::NUMERIC, 0),
    COALESCE((r->>'cpm')::NUMERIC, 0),
    COALESCE((r->>'cpc')::NUMERIC, 0),
    COALESCE((r->>'cpa')::NUMERIC, 0)
  FROM jsonb_array_elements(p_rows) AS r;

  GET DIAGNOSTICS row_count = ROW_COUNT;
  RETURN row_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Atomic upsert for ga4_kpi_data
CREATE OR REPLACE FUNCTION upsert_ga4_data(
  p_client_id TEXT,
  p_month TEXT,
  p_rows JSONB
) RETURNS INTEGER AS $$
DECLARE
  row_count INTEGER;
BEGIN
  DELETE FROM ga4_kpi_data
  WHERE client_id = p_client_id AND month = p_month;

  INSERT INTO ga4_kpi_data (client_id, month, product, leads, sessions, users)
  SELECT
    p_client_id, p_month,
    COALESCE(r->>'product', ''),
    COALESCE((r->>'leads')::NUMERIC, 0),
    COALESCE((r->>'sessions')::NUMERIC, 0),
    COALESCE((r->>'users')::NUMERIC, 0)
  FROM jsonb_array_elements(p_rows) AS r;

  GET DIAGNOSTICS row_count = ROW_COUNT;
  RETURN row_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
