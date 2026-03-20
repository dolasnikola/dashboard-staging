// ============== MIGRATION: localStorage → Supabase ==============
// One-time script. Run from browser console or via a button in admin UI.
// Reads all data from localStorage and writes to Supabase tables.

async function migrateToSupabase() {
  const statusEl = document.getElementById('migrateStatus');
  const log = (msg) => {
    console.log('[migrate]', msg);
    if (statusEl) statusEl.textContent = msg;
  };

  log('Migracija započeta...');

  // 1. Read localStorage data
  let pmData;
  try {
    pmData = JSON.parse(localStorage.getItem('pmDashboard') || '{}');
  } catch {
    log('Greška: ne mogu da pročitam localStorage');
    return;
  }

  const keys = Object.keys(pmData);
  if (keys.length === 0) {
    log('Nema podataka za migraciju u localStorage.');
    return;
  }

  let totalRows = 0;
  let totalBudgets = 0;
  let totalFlights = 0;
  let errors = 0;

  // 2. Categorize and migrate each key
  for (const key of keys) {
    try {
      if (key.startsWith('budget_')) {
        // Budget: budget_clientId_platform_month → budgets table
        const rest = key.replace('budget_', '');
        const parts = rest.split('_');
        const clientId = parts[0];
        const month = parts[parts.length - 1]; // YYYY-MM
        const platform = parts.slice(1, -1).join('_'); // handles google_ads
        const amount = pmData[key];

        const { error } = await sb
          .from('budgets')
          .upsert({
            client_id: clientId,
            platform: platform,
            month: month,
            amount: amount
          }, { onConflict: 'client_id,platform,month' });

        if (error) { console.error('Budget migrate error:', key, error); errors++; }
        else totalBudgets++;

      } else if (key.startsWith('flight_')) {
        // Flight days: flight_clientId_month → flight_days table
        const rest = key.replace('flight_', '');
        const parts = rest.split('_');
        const clientId = parts[0];
        const month = parts.slice(1).join('_');
        const days = pmData[key];

        const { error } = await sb
          .from('flight_days')
          .upsert({
            client_id: clientId,
            month: month,
            days: days
          }, { onConflict: 'client_id,month' });

        if (error) { console.error('Flight migrate error:', key, error); errors++; }
        else totalFlights++;

      } else {
        // Campaign data: clientId_platform_month → campaign_data table
        const parts = key.split('_');
        const clientId = parts[0];
        const month = parts[parts.length - 1]; // YYYY-MM
        const platform = parts.slice(1, -1).join('_'); // handles google_ads

        const rows = pmData[key];
        if (!Array.isArray(rows) || rows.length === 0) continue;

        // Delete existing rows for this combo
        await sb
          .from('campaign_data')
          .delete()
          .eq('client_id', clientId)
          .eq('platform', platform)
          .eq('month', month);

        // Insert in batches
        const records = rows.map(r => ({
          client_id: clientId,
          platform: platform,
          month: month,
          date: r.date || null,
          campaign: r.campaign || 'Unknown',
          insertion_order: r.insertion_order || '',
          impressions: r.impressions || 0,
          clicks: r.clicks || 0,
          spend: r.spend || 0,
          reach: r.reach || 0,
          conversions: r.conversions || 0,
          conv_value: r.conv_value || 0,
          ctr: r.ctr || 0,
          cpm: r.cpm || 0,
          cpc: r.cpc || 0,
          cpa: r.cpa || 0
        }));

        for (let i = 0; i < records.length; i += 500) {
          const batch = records.slice(i, i + 500);
          const { error } = await sb.from('campaign_data').insert(batch);
          if (error) { console.error('Campaign migrate error:', key, error); errors++; }
        }
        totalRows += records.length;
      }
    } catch (err) {
      console.error('Migration error for key:', key, err);
      errors++;
    }
  }

  // 3. Migrate GA4 KPI data
  try {
    const ga4Raw = localStorage.getItem('ga4_kpi_data');
    if (ga4Raw) {
      const ga4Data = JSON.parse(ga4Raw);
      for (const [month, rows] of Object.entries(ga4Data)) {
        if (!Array.isArray(rows)) continue;
        await sb
          .from('ga4_kpi_data')
          .delete()
          .eq('client_id', 'nlb')
          .eq('month', month);

        const records = rows.map(r => ({
          client_id: 'nlb',
          month: month,
          product: r.product || '',
          leads: r.leads || 0,
          sessions: r.sessions || 0,
          users: r.users || 0
        }));

        if (records.length > 0) {
          const { error } = await sb.from('ga4_kpi_data').insert(records);
          if (error) { console.error('GA4 migrate error:', month, error); errors++; }
        }
      }
      log('GA4 KPI podaci migrirani.');
    }
  } catch (err) {
    console.error('GA4 migration error:', err);
    errors++;
  }

  // 4. Migrate sheet links
  try {
    const sheetLinks = JSON.parse(localStorage.getItem('pmSheetLinks') || '{}');
    for (const [key, url] of Object.entries(sheetLinks)) {
      const firstUnderscore = key.indexOf('_');
      const clientId = key.substring(0, firstUnderscore);
      const platform = key.substring(firstUnderscore + 1);

      const { error } = await sb
        .from('sheet_links')
        .upsert({
          client_id: clientId,
          platform: platform,
          sheet_url: url,
          is_default: false
        }, { onConflict: 'client_id,platform' });

      if (error) console.error('Sheet link migrate error:', key, error);
    }
  } catch (err) {
    console.error('Sheet links migration error:', err);
  }

  const summary = `Migracija završena! ${totalRows} redova podataka, ${totalBudgets} budžeta, ${totalFlights} flight dana.${errors > 0 ? ` ${errors} grešaka.` : ''}`;
  log(summary);
  notify(summary, errors > 0 ? 'warning' : 'success');
}
