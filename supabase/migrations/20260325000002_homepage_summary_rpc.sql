-- Korak 2a: RPC funkcija za homepage summary (server-side agregacija)
-- Vraca agregirane metrike po klijentu/platformi za dati mesec
-- Zamenjuje bulk fetch svih campaign_data redova na homepage
CREATE OR REPLACE FUNCTION get_homepage_summary(p_month text)
RETURNS TABLE (
  client_id text,
  platform text,
  total_spend double precision,
  total_impressions double precision,
  total_clicks double precision,
  total_conversions double precision
) AS $$
  SELECT
    cd.client_id,
    cd.platform,
    COALESCE(SUM(cd.spend), 0)::double precision as total_spend,
    COALESCE(SUM(cd.impressions), 0)::double precision as total_impressions,
    COALESCE(SUM(cd.clicks), 0)::double precision as total_clicks,
    COALESCE(SUM(cd.conversions), 0)::double precision as total_conversions
  FROM campaign_data cd
  WHERE cd.month = p_month
  GROUP BY cd.client_id, cd.platform;
$$ LANGUAGE sql SECURITY DEFINER;
