/**
 * =============================================================
 * GA4 KPI → SUPABASE (Direct, no Google Sheets)
 * =============================================================
 * Fetches Leads, Sessions, Total Users from GA4 for NLB products
 * and writes directly to Supabase ga4_kpi_data table via REST API.
 *
 * REPLACES: nlb-ga4-kpi.js
 *
 * SETUP:
 * 1. In Apps Script editor: Services → add "Google Analytics Data API" (AnalyticsData)
 * 2. Set Script Properties:
 *    SUPABASE_URL = https://vorffefuboftlcwteucu.supabase.co
 *    SUPABASE_KEY = <your service_role key>
 * 3. Run testRun() to test
 * 4. Run createMonthlyTrigger() for automation (5th of each month)
 * =============================================================
 */

var GA4_CONFIG = {
  PROPERTY_ID: '312951737',
  CLIENT_ID: 'nlb',

  // Supabase
  SUPABASE_URL: PropertiesService.getScriptProperties().getProperty('SUPABASE_URL'),
  SUPABASE_KEY: PropertiesService.getScriptProperties().getProperty('SUPABASE_KEY'),
  TABLE: 'ga4_kpi_data',
  BATCH_SIZE: 500,

  // Products and their URLs
  PRODUCTS: {
    'Keš krediti': ['https://www.nlbkb.rs/stanovnistvo/krediti/kes-krediti'],
    'Keš online': ['https://www.nlbkb.rs/stanovnistvo/krediti/online-kes-kredit'],
    'Keš refinansiranje': ['https://www.nlbkb.rs/stanovnistvo/krediti/krediti-za-refinansiranje'],
    'Keš penzioneri': ['https://www.nlbkb.rs/stanovnistvo/krediti/krediti-za-penzionere'],
    'Keš bez dokumentacije': ['https://www.nlbkb.rs/stanovnistvo/krediti/kes-kredit-bez-dodatne-dokumentacije'],
    'Keš pokriven depozitom': ['https://www.nlbkb.rs/stanovnistvo/krediti/kes-kredit-pokriven-depozitom'],
    'Keš do 100k': ['https://www.nlbkb.rs/stanovnistvo/krediti/krediti-za-klijente-sa-primanjima-do-100-000rsd'],
    'Stambeni': ['https://www.nlbkb.rs/stanovnistvo/krediti/stambeni-krediti'],
    'Zeleni stambeni': ['https://www.nlbkb.rs/stanovnistvo/krediti/zeleni-stambeni-kredit'],
    'Zeleni': [
      'https://www.nlbkb.rs/stanovnistvo/krediti/zeleni-potrosacki-krediti',
      'https://www.nlbkb.rs/stanovnistvo/krediti/potrosacki-krediti-za-unapredjenje-energetske-efikasnosti-geff',
    ],
    'Računi': [
      'https://www.nlbkb.rs/stanovnistvo/racuni',
      'https://www.nlbkb.rs/premium-bankarstvo',
    ],
  },

  // Groups for UKUPNO rows
  GROUPS: {
    'UKUPNO Keš': [
      'Keš krediti', 'Keš online', 'Keš refinansiranje', 'Keš penzioneri',
      'Keš bez dokumentacije', 'Keš pokriven depozitom', 'Keš do 100k',
    ],
  },

  // Output order
  OUTPUT_ORDER: [
    'Keš krediti', 'Keš online', 'Keš refinansiranje', 'Keš penzioneri',
    'Keš bez dokumentacije', 'Keš pokriven depozitom', 'Keš do 100k',
    'UKUPNO Keš', 'Stambeni', 'Zeleni stambeni', 'Zeleni', 'Računi',
  ],

  LEAD_EVENT: 'Success - Form Submit',
  CPC_ONLY_PRODUCTS: ['Keš krediti'],
};

// ============== MAIN ==============

function processPreviousMonth() {
  validateConfig_();

  var now = new Date();
  var year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  var month = now.getMonth() === 0 ? 12 : now.getMonth();

  var startDate = year + '-' + String(month).padStart(2, '0') + '-01';
  var lastDay = new Date(year, month, 0).getDate();
  var endDate = year + '-' + String(month).padStart(2, '0') + '-' + String(lastDay).padStart(2, '0');
  var monthLabel = year + '-' + String(month).padStart(2, '0');

  Logger.log('Vučem podatke za: ' + startDate + ' do ' + endDate);

  var allResults = [];

  var products = Object.keys(GA4_CONFIG.PRODUCTS);
  for (var p = 0; p < products.length; p++) {
    var product = products[p];
    var urls = GA4_CONFIG.PRODUCTS[product];
    var data = fetchProductData_(urls, startDate, endDate);

    var useLeads = GA4_CONFIG.CPC_ONLY_PRODUCTS.indexOf(product) >= 0
      ? data.leadsCpc
      : data.leads;

    allResults.push({
      month: monthLabel,
      product: product,
      leads: useLeads,
      sessions: data.sessions,
      users: data.users,
    });
    Logger.log(product + ': Leads=' + useLeads + ', Sessions=' + data.sessions + ', Users=' + data.users);
  }

  // Add UKUPNO rows for groups
  var groupNames = Object.keys(GA4_CONFIG.GROUPS);
  for (var g = 0; g < groupNames.length; g++) {
    var groupName = groupNames[g];
    var members = GA4_CONFIG.GROUPS[groupName];
    var groupLeads = 0, groupSessions = 0, groupUsers = 0;

    for (var r = 0; r < allResults.length; r++) {
      if (members.indexOf(allResults[r].product) >= 0) {
        groupLeads += allResults[r].leads;
        groupSessions += allResults[r].sessions;
        groupUsers += allResults[r].users;
      }
    }

    allResults.push({
      month: monthLabel,
      product: groupName,
      leads: groupLeads,
      sessions: groupSessions,
      users: groupUsers,
    });
  }

  // Write to Supabase
  writeToSupabase_(allResults, monthLabel);
  Logger.log('Gotovo! Upisano ' + allResults.length + ' redova za ' + monthLabel);
}

// ============== GA4 API CALLS ==============

function fetchProductData_(urls, startDate, endDate) {
  var totalLeads = 0, totalSessions = 0, totalUsers = 0, totalLeadsCpc = 0;

  for (var u = 0; u < urls.length; u++) {
    var url = urls[u];

    // 1. Leads
    var leadsResult = runGA4Report_({
      startDate: startDate,
      endDate: endDate,
      metrics: ['eventCount'],
      dimensions: ['sessionSourceMedium'],
      dimensionFilter: makeAndFilter_([
        makeContainsFilter_('pageLocation', url),
        makeExactFilter_('eventName', GA4_CONFIG.LEAD_EVENT),
      ]),
    });

    var urlLeads = 0, urlLeadsCpc = 0;
    if (leadsResult.rows) {
      for (var i = 0; i < leadsResult.rows.length; i++) {
        var row = leadsResult.rows[i];
        var sourceMedium = row.dimensionValues[0].value;
        var count = parseInt(row.metricValues[0].value) || 0;
        urlLeads += count;
        if (sourceMedium === 'google / cpc') {
          urlLeadsCpc += count;
        }
      }
    }

    // 2. Sessions & Users
    var trafficResult = runGA4Report_({
      startDate: startDate,
      endDate: endDate,
      metrics: ['sessions', 'totalUsers'],
      dimensions: [],
      dimensionFilter: makeContainsFilter_('pageLocation', url),
    });

    var urlSessions = 0, urlUsers = 0;
    if (trafficResult.rows && trafficResult.rows.length > 0) {
      urlSessions = parseInt(trafficResult.rows[0].metricValues[0].value) || 0;
      urlUsers = parseInt(trafficResult.rows[0].metricValues[1].value) || 0;
    }

    totalLeads += urlLeads;
    totalSessions += urlSessions;
    totalUsers += urlUsers;
    totalLeadsCpc += urlLeadsCpc;
  }

  return { leads: totalLeads, sessions: totalSessions, users: totalUsers, leadsCpc: totalLeadsCpc };
}

function runGA4Report_(params) {
  var request = {
    dateRanges: [{ startDate: params.startDate, endDate: params.endDate }],
    metrics: params.metrics.map(function(m) { return { name: m }; }),
    dimensions: params.dimensions.map(function(d) { return { name: d }; }),
  };

  if (params.dimensionFilter) {
    request.dimensionFilter = params.dimensionFilter;
  }

  try {
    return AnalyticsData.Properties.runReport(
      request,
      'properties/' + GA4_CONFIG.PROPERTY_ID
    );
  } catch (e) {
    Logger.log('GA4 API greška: ' + e.message);
    return { rows: [] };
  }
}

// ============== FILTER HELPERS ==============

function makeContainsFilter_(dimension, value) {
  return {
    filter: {
      fieldName: dimension,
      stringFilter: { matchType: 'CONTAINS', value: value },
    },
  };
}

function makeExactFilter_(dimension, value) {
  return {
    filter: {
      fieldName: dimension,
      stringFilter: { matchType: 'EXACT', value: value },
    },
  };
}

function makeAndFilter_(filters) {
  return { andGroup: { expressions: filters } };
}

// ============== SUPABASE WRITE ==============

function writeToSupabase_(results, monthLabel) {
  // Delete existing data for this month
  var url = GA4_CONFIG.SUPABASE_URL + '/rest/v1/' + GA4_CONFIG.TABLE +
    '?client_id=eq.' + encodeURIComponent(GA4_CONFIG.CLIENT_ID) +
    '&month=eq.' + encodeURIComponent(monthLabel);

  var response = UrlFetchApp.fetch(url, {
    method: 'DELETE',
    headers: {
      'apikey': GA4_CONFIG.SUPABASE_KEY,
      'Authorization': 'Bearer ' + GA4_CONFIG.SUPABASE_KEY,
    },
    muteHttpExceptions: true,
  });

  var code = response.getResponseCode();
  if (code >= 200 && code < 300) {
    Logger.log('Deleted old GA4 data for ' + GA4_CONFIG.CLIENT_ID + ' / ' + monthLabel);
  } else {
    Logger.log('WARNING: DELETE failed (' + code + '): ' + response.getContentText());
  }

  // Sort by OUTPUT_ORDER
  var order = GA4_CONFIG.OUTPUT_ORDER;
  results.sort(function(a, b) {
    var ia = order.indexOf(a.product);
    var ib = order.indexOf(b.product);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });

  // Map to ga4_kpi_data format
  var rows = results.map(function(r) {
    return {
      client_id: GA4_CONFIG.CLIENT_ID,
      month: r.month,
      product: r.product,
      leads: r.leads,
      sessions: r.sessions,
      users: r.users,
    };
  });

  // INSERT in batches
  var totalInserted = 0;
  for (var i = 0; i < rows.length; i += GA4_CONFIG.BATCH_SIZE) {
    var batch = rows.slice(i, i + GA4_CONFIG.BATCH_SIZE);

    var resp = UrlFetchApp.fetch(GA4_CONFIG.SUPABASE_URL + '/rest/v1/' + GA4_CONFIG.TABLE, {
      method: 'POST',
      headers: {
        'apikey': GA4_CONFIG.SUPABASE_KEY,
        'Authorization': 'Bearer ' + GA4_CONFIG.SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      payload: JSON.stringify(batch),
      muteHttpExceptions: true,
    });

    var respCode = resp.getResponseCode();
    if (respCode >= 200 && respCode < 300) {
      totalInserted += batch.length;
    } else {
      Logger.log('ERROR: INSERT failed (' + respCode + '): ' + resp.getContentText());
      throw new Error('Supabase insert failed at row ' + i + ': HTTP ' + respCode);
    }
  }

  Logger.log('Inserted ' + totalInserted + ' rows into ' + GA4_CONFIG.TABLE);
}

function validateConfig_() {
  if (!GA4_CONFIG.SUPABASE_URL || !GA4_CONFIG.SUPABASE_KEY) {
    throw new Error(
      'Supabase credentials missing! Set Script Properties:\n' +
      '  SUPABASE_URL = https://vorffefuboftlcwteucu.supabase.co\n' +
      '  SUPABASE_KEY = <your service_role key>'
    );
  }
}

// ============== MANUAL HELPERS ==============

function testRun() {
  processPreviousMonth();
}

function fetchSpecificMonth(monthStr) {
  validateConfig_();

  var parts = monthStr.split('-');
  var year = parseInt(parts[0]);
  var month = parseInt(parts[1]);
  var startDate = year + '-' + String(month).padStart(2, '0') + '-01';
  var lastDay = new Date(year, month, 0).getDate();
  var endDate = year + '-' + String(month).padStart(2, '0') + '-' + String(lastDay).padStart(2, '0');

  Logger.log('Vučem podatke za: ' + startDate + ' do ' + endDate);

  var allResults = [];

  var products = Object.keys(GA4_CONFIG.PRODUCTS);
  for (var p = 0; p < products.length; p++) {
    var product = products[p];
    var urls = GA4_CONFIG.PRODUCTS[product];
    var data = fetchProductData_(urls, startDate, endDate);

    var useLeads = GA4_CONFIG.CPC_ONLY_PRODUCTS.indexOf(product) >= 0
      ? data.leadsCpc
      : data.leads;

    allResults.push({
      month: monthStr,
      product: product,
      leads: useLeads,
      sessions: data.sessions,
      users: data.users,
    });
    Logger.log(product + ': Leads=' + useLeads + ', Sessions=' + data.sessions + ', Users=' + data.users);
  }

  var groupNames = Object.keys(GA4_CONFIG.GROUPS);
  for (var g = 0; g < groupNames.length; g++) {
    var groupName = groupNames[g];
    var members = GA4_CONFIG.GROUPS[groupName];
    var groupLeads = 0, groupSessions = 0, groupUsers = 0;

    for (var r = 0; r < allResults.length; r++) {
      if (members.indexOf(allResults[r].product) >= 0) {
        groupLeads += allResults[r].leads;
        groupSessions += allResults[r].sessions;
        groupUsers += allResults[r].users;
      }
    }

    allResults.push({
      month: monthStr,
      product: groupName,
      leads: groupLeads,
      sessions: groupSessions,
      users: groupUsers,
    });
  }

  writeToSupabase_(allResults, monthStr);
  Logger.log('Gotovo! Upisano ' + allResults.length + ' redova za ' + monthStr);
}

function createMonthlyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'processPreviousMonth') ScriptApp.deleteTrigger(t);
  });

  ScriptApp.newTrigger('processPreviousMonth')
    .timeBased()
    .onMonthDay(5)
    .atHour(8)
    .create();

  Logger.log('Mesečni trigger kreiran (5. u mesecu, 8h)');
}
