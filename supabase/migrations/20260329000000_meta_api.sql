-- ============================================
-- Direct Pipeline: Meta Marketing API Integration
-- meta_config table + date-range upsert RPC
-- ============================================

-- 1. meta_config — maps dashboard clients to Meta ad account IDs
CREATE TABLE IF NOT EXISTS meta_config (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, account_id)
);

COMMENT ON TABLE meta_config IS 'Maps dashboard clients to Meta ad account IDs for automated sync';
COMMENT ON COLUMN meta_config.account_id IS 'Meta ad account ID (e.g. act_459770415075805)';

-- RLS for meta_config
ALTER TABLE meta_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read meta_config for their clients"
  ON meta_config FOR SELECT
  TO authenticated
  USING (has_client_access(client_id));

-- Service role can do everything (Edge Function uses service_role key)
-- No explicit policy needed — service_role bypasses RLS

-- 2. Seed meta_config with existing accounts
INSERT INTO meta_config (client_id, account_id) VALUES
  ('nlb', 'act_459770415075805'),
  ('krka', 'act_405576035057636')
ON CONFLICT (client_id, account_id) DO NOTHING;

-- 3. Date-range scoped upsert for campaign_data
-- Deletes by (client_id, platform, date range) instead of by month.
-- Needed for: Meta daily sync, Google Ads lookback correction.
CREATE OR REPLACE FUNCTION upsert_campaign_data_by_dates(
  p_client_id TEXT,
  p_platform TEXT,
  p_date_from DATE,
  p_date_to DATE,
  p_rows JSONB
) RETURNS INTEGER AS $$
DECLARE
  row_count INTEGER;
BEGIN
  -- Delete existing rows for this client/platform within date range
  DELETE FROM campaign_data
  WHERE client_id = p_client_id
    AND platform = p_platform
    AND date >= p_date_from
    AND date <= p_date_to;

  -- Insert new rows (derive month from date)
  INSERT INTO campaign_data (
    client_id, platform, month, date, campaign, insertion_order,
    impressions, clicks, spend, reach, conversions, conv_value,
    ctr, cpm, cpc, cpa
  )
  SELECT
    p_client_id, p_platform,
    to_char((r->>'date')::DATE, 'YYYY-MM'),
    (r->>'date')::DATE,
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

COMMENT ON FUNCTION upsert_campaign_data_by_dates IS 'Date-range scoped atomic upsert for campaign_data. Used by sync-meta and Google Ads lookback.';
