-- ============================================================
-- Performance Dashboard — Supabase Migration
-- FAZA 1: Fundament (baza + auth + RLS)
-- ============================================================

-- 1. CLIENTS
CREATE TABLE clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  status TEXT NOT NULL DEFAULT 'active',
  status_label TEXT NOT NULL DEFAULT 'Aktivan',
  default_platform TEXT,
  platforms TEXT[] NOT NULL,
  tiktok BOOLEAN DEFAULT FALSE,
  setup JSONB NOT NULL,
  budget_note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. CAMPAIGN DATA
CREATE TABLE campaign_data (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  platform TEXT NOT NULL,
  month TEXT NOT NULL,
  date DATE,
  campaign TEXT NOT NULL,
  insertion_order TEXT DEFAULT '',
  impressions NUMERIC DEFAULT 0,
  clicks NUMERIC DEFAULT 0,
  spend NUMERIC DEFAULT 0,
  reach NUMERIC DEFAULT 0,
  conversions NUMERIC DEFAULT 0,
  conv_value NUMERIC DEFAULT 0,
  ctr NUMERIC DEFAULT 0,
  cpm NUMERIC DEFAULT 0,
  cpc NUMERIC DEFAULT 0,
  cpa NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_campaign_row UNIQUE (client_id, platform, month, date, campaign, insertion_order)
);

CREATE INDEX idx_campaign_lookup ON campaign_data(client_id, platform, month);
CREATE INDEX idx_campaign_date ON campaign_data(client_id, platform, date);

-- 3. BUDGETS
CREATE TABLE budgets (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  platform TEXT NOT NULL,
  month TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (client_id, platform, month)
);

-- 4. FLIGHT DAYS
CREATE TABLE flight_days (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  month TEXT NOT NULL,
  days INTEGER[] NOT NULL DEFAULT '{}',
  UNIQUE (client_id, month)
);

-- 5. GA4 KPI DATA
CREATE TABLE ga4_kpi_data (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  month TEXT NOT NULL,
  product TEXT NOT NULL,
  leads NUMERIC DEFAULT 0,
  sessions NUMERIC DEFAULT 0,
  users NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (client_id, month, product)
);

-- 6. USER PROFILES (extends Supabase Auth)
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'viewer'
    CHECK (role IN ('admin', 'account_manager', 'viewer')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 7. USER-CLIENT ACCESS
CREATE TABLE user_client_access (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, client_id)
);

-- 8. SHEET LINKS
CREATE TABLE sheet_links (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  platform TEXT NOT NULL,
  sheet_url TEXT NOT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  UNIQUE (client_id, platform)
);

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.user_profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION has_client_access(p_client_id TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'admin'
  ) OR EXISTS (
    SELECT 1 FROM public.user_client_access
    WHERE user_id = auth.uid() AND client_id = p_client_id
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Auto-create user profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'viewer')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- ROW-LEVEL SECURITY
-- ============================================================

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE flight_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE ga4_kpi_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_client_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE sheet_links ENABLE ROW LEVEL SECURITY;

-- CLIENTS policies
CREATE POLICY "clients_select" ON clients FOR SELECT
  USING (has_client_access(id));
CREATE POLICY "clients_insert" ON clients FOR INSERT
  WITH CHECK (get_user_role() = 'admin');
CREATE POLICY "clients_update" ON clients FOR UPDATE
  USING (get_user_role() = 'admin');

-- CAMPAIGN_DATA policies
CREATE POLICY "campaign_data_select" ON campaign_data FOR SELECT
  USING (has_client_access(client_id));
CREATE POLICY "campaign_data_insert" ON campaign_data FOR INSERT
  WITH CHECK (has_client_access(client_id) AND get_user_role() IN ('admin', 'account_manager'));
CREATE POLICY "campaign_data_update" ON campaign_data FOR UPDATE
  USING (has_client_access(client_id) AND get_user_role() IN ('admin', 'account_manager'));
CREATE POLICY "campaign_data_delete" ON campaign_data FOR DELETE
  USING (has_client_access(client_id) AND get_user_role() IN ('admin', 'account_manager'));

-- BUDGETS policies
CREATE POLICY "budgets_select" ON budgets FOR SELECT
  USING (has_client_access(client_id));
CREATE POLICY "budgets_insert" ON budgets FOR INSERT
  WITH CHECK (has_client_access(client_id) AND get_user_role() IN ('admin', 'account_manager'));
CREATE POLICY "budgets_update" ON budgets FOR UPDATE
  USING (has_client_access(client_id) AND get_user_role() IN ('admin', 'account_manager'));

-- FLIGHT_DAYS policies
CREATE POLICY "flight_days_select" ON flight_days FOR SELECT
  USING (has_client_access(client_id));
CREATE POLICY "flight_days_insert" ON flight_days FOR INSERT
  WITH CHECK (has_client_access(client_id) AND get_user_role() IN ('admin', 'account_manager'));
CREATE POLICY "flight_days_update" ON flight_days FOR UPDATE
  USING (has_client_access(client_id) AND get_user_role() IN ('admin', 'account_manager'));

-- GA4_KPI_DATA policies
CREATE POLICY "ga4_select" ON ga4_kpi_data FOR SELECT
  USING (has_client_access(client_id));
CREATE POLICY "ga4_insert" ON ga4_kpi_data FOR INSERT
  WITH CHECK (has_client_access(client_id) AND get_user_role() IN ('admin', 'account_manager'));
CREATE POLICY "ga4_update" ON ga4_kpi_data FOR UPDATE
  USING (has_client_access(client_id) AND get_user_role() IN ('admin', 'account_manager'));

-- USER_PROFILES policies
CREATE POLICY "profiles_select_own" ON user_profiles FOR SELECT
  USING (id = auth.uid() OR get_user_role() = 'admin');
CREATE POLICY "profiles_update_own" ON user_profiles FOR UPDATE
  USING (id = auth.uid() OR get_user_role() = 'admin');

-- USER_CLIENT_ACCESS policies
CREATE POLICY "access_select" ON user_client_access FOR SELECT
  USING (user_id = auth.uid() OR get_user_role() = 'admin');
CREATE POLICY "access_manage" ON user_client_access FOR ALL
  USING (get_user_role() = 'admin');

-- SHEET_LINKS policies
CREATE POLICY "sheets_select" ON sheet_links FOR SELECT
  USING (has_client_access(client_id));
CREATE POLICY "sheets_manage" ON sheet_links FOR ALL
  USING (get_user_role() IN ('admin', 'account_manager'));

-- ============================================================
-- SEED DATA: Existing clients
-- ============================================================

INSERT INTO clients (id, name, currency, status, status_label, default_platform, platforms, tiktok, setup, budget_note) VALUES
(
  'nlb',
  'NLB Komercijalna banka',
  'EUR',
  'active',
  'Aktivan',
  'google_ads',
  '{google_ads,meta,dv360,ga4}',
  FALSE,
  '{"google_ads":{"type":"performance","label":"Performance","metrics":["conversions","cpa","conv_value","spend"]},"meta":{"type":"awareness","label":"Awareness","metrics":["impressions","reach","cpm","ctr","clicks","spend"]},"dv360":{"type":"awareness","label":"Awareness","metrics":["impressions","reach","cpm","ctr","clicks","spend"]},"ga4":{"type":"ga4_kpi","label":"GA4 KPI","metrics":["leads","sessions","users"]}}',
  'Daily budžeti na performance, po kampanjama na awareness'
),
(
  'urban',
  'Urban Garden',
  'USD',
  'active',
  'Aktivan',
  NULL,
  '{google_ads,meta}',
  FALSE,
  '{"google_ads":{"type":"performance","label":"Performance (PMAX + Search)","metrics":["conversions","cpa","conv_value","spend"]},"meta":{"type":"awareness","label":"Awareness","metrics":["impressions","reach","cpm","ctr","clicks","spend"]}}',
  'Sezonski budžeti (6+6 meseci)'
),
(
  'krka',
  'Krka Terme',
  'EUR',
  'active',
  'Aktivan',
  NULL,
  '{google_ads,meta,dv360}',
  FALSE,
  '{"google_ads":{"type":"performance","label":"Performance (Search)","metrics":["conversions","cpa","conv_value","spend"]},"meta":{"type":"awareness","label":"Awareness","metrics":["impressions","reach","cpm","ctr","clicks","spend"]},"dv360":{"type":"awareness","label":"Awareness","metrics":["impressions","reach","cpm","ctr","clicks","spend"]}}',
  'Budžeti stižu krajem meseca za naredni'
);

-- Seed default sheet links
INSERT INTO sheet_links (client_id, platform, sheet_url, is_default) VALUES
('nlb', 'google_ads', 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQc1yRWwl8JemLV4IwH1F1dR9qRRtd9LhuRfdWW8b2VxN9velSOvY1iI8WQDQ0P04Oav8KwciJlboaz/pub?gid=0&single=true&output=csv', TRUE),
('krka', 'google_ads', 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQc1yRWwl8JemLV4IwH1F1dR9qRRtd9LhuRfdWW8b2VxN9velSOvY1iI8WQDQ0P04Oav8KwciJlboaz/pub?gid=1114546017&single=true&output=csv', TRUE),
('urban', 'google_ads', 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQc1yRWwl8JemLV4IwH1F1dR9qRRtd9LhuRfdWW8b2VxN9velSOvY1iI8WQDQ0P04Oav8KwciJlboaz/pub?gid=1079909735&single=true&output=csv', TRUE),
('nlb', 'meta', 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTGBTKXEBVZP_COQS8mcSOuzpJWh3GMVJ9RMaQSgtTm6xafni_XQX-K9dj0cmsaBI5LOSrFnvn46HK7/pub?gid=0&single=true&output=csv', TRUE),
('krka', 'meta', 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTGBTKXEBVZP_COQS8mcSOuzpJWh3GMVJ9RMaQSgtTm6xafni_XQX-K9dj0cmsaBI5LOSrFnvn46HK7/pub?gid=1798421240&single=true&output=csv', TRUE),
('urban', 'meta', 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTGBTKXEBVZP_COQS8mcSOuzpJWh3GMVJ9RMaQSgtTm6xafni_XQX-K9dj0cmsaBI5LOSrFnvn46HK7/pub?gid=457165510&single=true&output=csv', TRUE),
('nlb', 'dv360', 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTIdAk8qTfnIjk7Znx2iQRGIpLZxOcxf05ESbkpsmhtmskXfpuzbHisFmKd7tQmFIO96PU5G32HHUYk/pub?gid=0&single=true&output=csv', TRUE),
('krka', 'dv360', 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTIdAk8qTfnIjk7Znx2iQRGIpLZxOcxf05ESbkpsmhtmskXfpuzbHisFmKd7tQmFIO96PU5G32HHUYk/pub?gid=1866728560&single=true&output=csv', TRUE),
('nlb', 'ga4', 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTq6-QCaIMlbEFe04kvUmvJSbKdNgMattF-A1h5uynSIUIUEl5Aj7ku-j2j7QOMZtJ4m2CM6OrToBmp/pub?gid=0&single=true&output=csv', TRUE);
