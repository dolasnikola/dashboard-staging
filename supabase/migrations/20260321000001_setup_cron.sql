-- ============================================
-- FAZA 2: pg_cron + pg_net setup
-- Triggers Edge Function at 5:00, 6:00, 7:00 UTC
-- Edge Function itself checks Belgrade timezone (8:00 or 9:00)
-- ============================================

-- Enable extensions (may already be enabled via Supabase Dashboard)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule 3 UTC slots to cover both CET (UTC+1) and CEST (UTC+2)
-- Belgrade 8:00 = UTC 6:00 (CEST summer) or UTC 7:00 (CET winter)
-- Belgrade 9:00 = UTC 7:00 (CEST summer) or UTC 8:00 (CET winter)
-- Slots at 5,6,7 UTC cover all cases; Edge Function skips if not 8 or 9 Belgrade time

SELECT cron.schedule(
  'sync-sheets-slot-1',
  '0 5 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/sync-sheets',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{"trigger": "cron"}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'sync-sheets-slot-2',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/sync-sheets',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{"trigger": "cron"}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'sync-sheets-slot-3',
  '0 7 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/sync-sheets',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{"trigger": "cron"}'::jsonb
  );
  $$
);

-- NOTE: Before running this migration, set these Postgres config vars
-- in Supabase Dashboard > Project Settings > Database > Postgres Config:
--
-- app.settings.supabase_url = 'https://vorffefuboftlcwteucu.supabase.co'
-- app.settings.service_role_key = 'your-service-role-key-here'
--
-- Alternatively, hardcode the values directly in the SQL above.
