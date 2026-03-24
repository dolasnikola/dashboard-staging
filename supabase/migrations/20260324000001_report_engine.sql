-- FAZA 4B: Genericki Report Engine

CREATE TABLE report_configs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  report_type TEXT NOT NULL DEFAULT 'monthly',
  -- Platform labels (e.g. {"google_ads": "Google Search", "meta": "Meta - Facebook & Instagram"})
  platform_labels JSONB DEFAULT '{}',
  -- Per-platform metric columns (e.g. {"google_ads": {"label": "Ad group", "cols": ["campaign","impressions","clicks","ctr","spend"]}})
  metric_cols JSONB DEFAULT '{}',
  -- Data source: dedicated report sheet URLs (e.g. {"search": "https://...", "meta": "https://...", "gdn": "https://..."})
  sheet_urls JSONB DEFAULT '{}',
  -- Creative images config (e.g. {"cover": {"image": "/creatives/krka/cover.jpg", "w": 130, "h": 130}, ...})
  creatives_config JSONB DEFAULT '{}',
  -- AI narrative worker URL
  ai_worker_url TEXT,
  -- AI prompt context (business type, campaign focus)
  ai_prompt_context TEXT,
  -- GDN specific: filter campaign name contains this string
  gdn_campaign_filter TEXT,
  -- Scheduling
  schedule_day INTEGER DEFAULT 6,
  schedule_hour INTEGER DEFAULT 8,
  email_recipients TEXT[],
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE report_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id TEXT NOT NULL,
  report_config_id BIGINT REFERENCES report_configs(id),
  report_month TEXT NOT NULL,
  pdf_url TEXT,
  generated_at TIMESTAMPTZ DEFAULT now(),
  generated_by TEXT,
  status TEXT DEFAULT 'generated'
);

-- RLS
ALTER TABLE report_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "report_configs_select" ON report_configs FOR SELECT TO authenticated
  USING (has_client_access(client_id));

CREATE POLICY "report_configs_admin" ON report_configs FOR ALL TO authenticated
  USING (get_user_role() = 'admin') WITH CHECK (get_user_role() = 'admin');

CREATE POLICY "report_history_select" ON report_history FOR SELECT TO authenticated
  USING (has_client_access(client_id));

CREATE POLICY "report_history_admin" ON report_history FOR ALL TO authenticated
  USING (get_user_role() = 'admin') WITH CHECK (get_user_role() = 'admin');

-- Seed Krka config from existing hardcoded values
INSERT INTO report_configs (client_id, report_type, platform_labels, metric_cols, sheet_urls, creatives_config, ai_worker_url, ai_prompt_context, gdn_campaign_filter)
VALUES (
  'krka',
  'monthly',
  '{"google_ads": "Google Search", "meta": "Meta - Facebook & Instagram", "dv360": "Google Display Network"}'::jsonb,
  '{"google_ads": {"label": "Ad group", "cols": ["campaign","impressions","clicks","ctr","spend"]}, "meta": {"label": "Campaign", "cols": ["campaign","reach","impressions","clicks","ctr","spend"]}, "dv360": {"label": "Campaign", "cols": ["campaign","impressions","clicks","ctr","cpm","spend"]}, "dv360_io": {"label": "Insertion Order", "cols": ["campaign","impressions","clicks","ctr","cpm","spend"]}}'::jsonb,
  '{"search": "https://docs.google.com/spreadsheets/d/e/2PACX-1vT1E2Lly22Fcmy0NILkwO8DMW5ZJm4ePHr7_NicCc2m5iSKvND9H1QQYy-MJ5wABllllOomYhhsgkOX/pub?gid=2072175072&single=true&output=csv", "meta": "https://docs.google.com/spreadsheets/d/e/2PACX-1vT1E2Lly22Fcmy0NILkwO8DMW5ZJm4ePHr7_NicCc2m5iSKvND9H1QQYy-MJ5wABllllOomYhhsgkOX/pub?gid=0&single=true&output=csv", "gdn": "https://docs.google.com/spreadsheets/d/e/2PACX-1vT1E2Lly22Fcmy0NILkwO8DMW5ZJm4ePHr7_NicCc2m5iSKvND9H1QQYy-MJ5wABllllOomYhhsgkOX/pub?gid=1032698057&single=true&output=csv"}'::jsonb,
  '{"cover": {"image": "/creatives/krka/cover.jpg", "w": 130, "h": 130}, "thanks": {"image": "/creatives/krka/thanks.jpg", "w": 130, "h": 130}, "google_ads": {"images": ["/creatives/krka/google_ads_1.png", "/creatives/krka/google_ads_2.png", "/creatives/krka/google_ads_3.png"], "w": 82, "h": 48}, "meta": {"images": ["/creatives/krka/meta_preview.png"], "w": 180, "h": 55}, "dv360": {"images": ["/creatives/krka/dv360_1.jpg"], "w": 200, "h": 55}}'::jsonb,
  'https://report-narratives-api.dolas-nikolaa.workers.dev',
  'Turisticka industrija, banjski turizam. Fokus na wellness i spa ponudu.',
  'Krka Terme'
);
