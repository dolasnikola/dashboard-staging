-- Korak 1: Indeksi za skaliranje na 50+ klijenata
-- campaign_data (najveca tabela)
CREATE INDEX IF NOT EXISTS idx_campaign_data_client_id ON campaign_data(client_id);
CREATE INDEX IF NOT EXISTS idx_campaign_data_client_platform_month ON campaign_data(client_id, platform, month);
CREATE INDEX IF NOT EXISTS idx_campaign_data_client_date ON campaign_data(client_id, date DESC);

-- budgets, flight_days, ga4
CREATE INDEX IF NOT EXISTS idx_budgets_lookup ON budgets(client_id, platform, month);
CREATE INDEX IF NOT EXISTS idx_flight_days_lookup ON flight_days(client_id, month);
CREATE INDEX IF NOT EXISTS idx_ga4_lookup ON ga4_kpi_data(client_id, month);

-- user access (RLS performance)
CREATE INDEX IF NOT EXISTS idx_user_client_access_user ON user_client_access(user_id);
CREATE INDEX IF NOT EXISTS idx_user_client_access_client ON user_client_access(client_id);

-- sync_log
CREATE INDEX IF NOT EXISTS idx_sync_log_started ON sync_log(started_at DESC);
