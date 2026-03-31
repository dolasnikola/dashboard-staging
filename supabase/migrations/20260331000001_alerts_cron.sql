-- FAZA 4D: pg_cron job for check-alerts Edge Function
-- Runs at 8:00 UTC (10:00 Belgrade CEST) daily, after data syncs complete
-- Edge Function does its own timezone check

SELECT cron.schedule(
  'check-alerts-daily',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://vorffefuboftlcwteucu.supabase.co/functions/v1/check-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{"trigger":"cron"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
