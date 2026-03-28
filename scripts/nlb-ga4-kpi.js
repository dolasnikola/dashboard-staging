// ============== GA4 → Google Sheets ==============
// Vuče Leads, Sessions, Total Users iz GA4 za NLB proizvode
// Koristi GA4 Data API (AnalyticsData advanced service)
//
// SETUP:
// 1. U Apps Script editoru: Services → dodaj "Google Analytics Data API" (AnalyticsData)
// 2. Zameni SPREADSHEET_ID sa pravim ID-jem
// 3. Pokreni testRun() za test
// 4. Pokreni createMonthlyTrigger() za automatizaciju (1. u mesecu)

const GA4_CONFIG = {
  PROPERTY_ID: "312951737",
  SPREADSHEET_ID: "1xI23s2947MAAb7BoA1CJRI3Dp-ZJ-kohruZVxaC6DlQ",
  TAB_NAME: "GA4 KPI",

  // Proizvodi i njihovi URL-ovi
  PRODUCTS: {
    "Keš krediti": ["https://www.nlbkb.rs/stanovnistvo/krediti/kes-krediti"],
    "Keš online": [
      "https://www.nlbkb.rs/stanovnistvo/krediti/online-kes-kredit",
    ],
    "Keš refinansiranje": [
      "https://www.nlbkb.rs/stanovnistvo/krediti/krediti-za-refinansiranje",
    ],
    "Keš penzioneri": [
      "https://www.nlbkb.rs/stanovnistvo/krediti/krediti-za-penzionere",
    ],
    "Keš bez dokumentacije": [
      "https://www.nlbkb.rs/stanovnistvo/krediti/kes-kredit-bez-dodatne-dokumentacije",
    ],
    "Keš pokriven depozitom": [
      "https://www.nlbkb.rs/stanovnistvo/krediti/kes-kredit-pokriven-depozitom",
    ],
    "Keš do 100k": [
      "https://www.nlbkb.rs/stanovnistvo/krediti/krediti-za-klijente-sa-primanjima-do-100-000rsd",
    ],
    Stambeni: ["https://www.nlbkb.rs/stanovnistvo/krediti/stambeni-krediti"],
    "Zeleni stambeni": [
      "https://www.nlbkb.rs/stanovnistvo/krediti/zeleni-stambeni-kredit",
    ],
    Zeleni: [
      "https://www.nlbkb.rs/stanovnistvo/krediti/zeleni-potrosacki-krediti",
      "https://www.nlbkb.rs/stanovnistvo/krediti/potrosacki-krediti-za-unapredjenje-energetske-efikasnosti-geff",
    ],
    Računi: [
      "https://www.nlbkb.rs/stanovnistvo/racuni",
      "https://www.nlbkb.rs/premium-bankarstvo",
    ],
  },

  // Grupe za sabiranje u UKUPNO redove (ubacuju se POSLE članova grupe)
  GROUPS: {
    "UKUPNO Keš": [
      "Keš krediti",
      "Keš online",
      "Keš refinansiranje",
      "Keš penzioneri",
      "Keš bez dokumentacije",
      "Keš pokriven depozitom",
      "Keš do 100k",
    ],
  },

  // Redosled ispisa u Sheet-u
  OUTPUT_ORDER: [
    "Keš krediti",
    "Keš online",
    "Keš refinansiranje",
    "Keš penzioneri",
    "Keš bez dokumentacije",
    "Keš pokriven depozitom",
    "Keš do 100k",
    "UKUPNO Keš",
    "Stambeni",
    "Zeleni stambeni",
    "Zeleni",
    "Računi",
  ],

  LEAD_EVENT: "Success - Form Submit",
  // Za Keš krediti prikazujemo samo google/cpc leads
  CPC_ONLY_PRODUCTS: ["Keš krediti"],
  HEADERS: ["Mesec", "Proizvod", "Leads", "Sessions", "Total Users"],
};

// ============== MAIN ==============

function processPreviousMonth() {
  const now = new Date();
  const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const month = now.getMonth() === 0 ? 12 : now.getMonth(); // prethodni mesec

  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const monthLabel = `${year}-${String(month).padStart(2, "0")}`;

  Logger.log(`Vučem podatke za: ${startDate} do ${endDate}`);

  const allResults = [];

  for (const [product, urls] of Object.entries(GA4_CONFIG.PRODUCTS)) {
    const data = fetchProductData(urls, startDate, endDate);
    // Za CPC_ONLY proizvode koristi samo google/cpc leads
    const useLeads = GA4_CONFIG.CPC_ONLY_PRODUCTS.includes(product)
      ? data.leadsCpc
      : data.leads;
    allResults.push({
      month: monthLabel,
      product: product,
      leads: useLeads,
      sessions: data.sessions,
      users: data.users,
    });
    Logger.log(
      `${product}: Leads=${useLeads}, Sessions=${data.sessions}, Users=${data.users}`,
    );
  }

  // Dodaj UKUPNO redove za grupe
  for (const [groupName, members] of Object.entries(GA4_CONFIG.GROUPS)) {
    const groupData = allResults.filter((r) => members.includes(r.product));
    allResults.push({
      month: monthLabel,
      product: groupName,
      leads: groupData.reduce((sum, r) => sum + r.leads, 0),
      sessions: groupData.reduce((sum, r) => sum + r.sessions, 0),
      users: groupData.reduce((sum, r) => sum + r.users, 0),
    });
  }

  writeToSheet(allResults);
  Logger.log("Gotovo! Upisano " + allResults.length + " redova.");
}

// ============== GA4 API CALLS ==============

function fetchProductData(urls, startDate, endDate) {
  let totalLeads = 0;
  let totalSessions = 0;
  let totalUsers = 0;
  let totalLeadsCpc = 0;

  for (const url of urls) {
    // 1. Leads (Event count za "Success - Form Submit" na ovom URL-u)
    const leadsResult = runGA4Report({
      startDate,
      endDate,
      metrics: ["eventCount"],
      dimensions: ["sessionSourceMedium"],
      dimensionFilter: makeAndFilter([
        makeContainsFilter("pageLocation", url),
        makeExactFilter("eventName", GA4_CONFIG.LEAD_EVENT),
      ]),
    });

    let urlLeads = 0;
    let urlLeadsCpc = 0;
    if (leadsResult.rows) {
      for (const row of leadsResult.rows) {
        const sourceMedium = row.dimensionValues[0].value;
        const count = parseInt(row.metricValues[0].value) || 0;
        urlLeads += count;
        if (sourceMedium === "google / cpc") {
          urlLeadsCpc += count;
        }
      }
    }

    // 2. Sessions & Users (bez event filtera, samo page filter)
    const trafficResult = runGA4Report({
      startDate,
      endDate,
      metrics: ["sessions", "totalUsers"],
      dimensions: [],
      dimensionFilter: makeContainsFilter("pageLocation", url),
    });

    let urlSessions = 0;
    let urlUsers = 0;
    if (trafficResult.rows && trafficResult.rows.length > 0) {
      urlSessions = parseInt(trafficResult.rows[0].metricValues[0].value) || 0;
      urlUsers = parseInt(trafficResult.rows[0].metricValues[1].value) || 0;
    }

    totalLeads += urlLeads;
    totalSessions += urlSessions;
    totalUsers += urlUsers;
    totalLeadsCpc += urlLeadsCpc;
  }

  return {
    leads: totalLeads,
    sessions: totalSessions,
    users: totalUsers,
    leadsCpc: totalLeadsCpc,
  };
}

function runGA4Report({
  startDate,
  endDate,
  metrics,
  dimensions,
  dimensionFilter,
}) {
  const request = {
    dateRanges: [{ startDate, endDate }],
    metrics: metrics.map((m) => ({ name: m })),
    dimensions: dimensions.map((d) => ({ name: d })),
  };

  if (dimensionFilter) {
    request.dimensionFilter = dimensionFilter;
  }

  try {
    return AnalyticsData.Properties.runReport(
      request,
      `properties/${GA4_CONFIG.PROPERTY_ID}`,
    );
  } catch (e) {
    Logger.log("GA4 API greška: " + e.message);
    return { rows: [] };
  }
}

// ============== FILTER HELPERS ==============

function makeContainsFilter(dimension, value) {
  return {
    filter: {
      fieldName: dimension,
      stringFilter: {
        matchType: "CONTAINS",
        value: value,
      },
    },
  };
}

function makeExactFilter(dimension, value) {
  return {
    filter: {
      fieldName: dimension,
      stringFilter: {
        matchType: "EXACT",
        value: value,
      },
    },
  };
}

function makeAndFilter(filters) {
  return {
    andGroup: {
      expressions: filters,
    },
  };
}

// ============== SHEET WRITING ==============

function writeToSheet(results) {
  const ss = SpreadsheetApp.openById(GA4_CONFIG.SPREADSHEET_ID);
  let sheet = ss.getSheetByName(GA4_CONFIG.TAB_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(GA4_CONFIG.TAB_NAME);
    sheet.appendRow(GA4_CONFIG.HEADERS);
    sheet.getRange(1, 1, 1, GA4_CONFIG.HEADERS.length).setFontWeight("bold");
    Logger.log("Kreiran novi tab: " + GA4_CONFIG.TAB_NAME);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(GA4_CONFIG.HEADERS);
    sheet.getRange(1, 1, 1, GA4_CONFIG.HEADERS.length).setFontWeight("bold");
  }

  // Proveri da li mesec već postoji (sprečava duplikate)
  const monthToWrite = results[0].month;
  const existingData =
    sheet.getLastRow() > 1
      ? sheet
          .getRange(2, 1, sheet.getLastRow() - 1, 1)
          .getValues()
          .map((r) => String(r[0]))
      : [];

  if (existingData.includes(monthToWrite)) {
    // Obriši stare redove za ovaj mesec pre upisa novih
    const rows = sheet.getDataRange().getValues();
    for (let i = rows.length - 1; i >= 1; i--) {
      if (String(rows[i][0]) === monthToWrite) {
        sheet.deleteRow(i + 1);
      }
    }
    Logger.log("Obrisani stari podaci za " + monthToWrite);
  }

  // Sortiraj po OUTPUT_ORDER
  const order = GA4_CONFIG.OUTPUT_ORDER;
  results.sort((a, b) => {
    const ia = order.indexOf(a.product);
    const ib = order.indexOf(b.product);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });

  // Upiši nove redove
  const newRows = results.map((r) => [
    r.month,
    r.product,
    r.leads,
    r.sessions,
    r.users,
  ]);
  sheet
    .getRange(sheet.getLastRow() + 1, 1, newRows.length, newRows[0].length)
    .setValues(newRows);
}

// ============== MANUAL HELPERS ==============

/** Ručno pokretanje za testiranje */
function testRun() {
  processPreviousMonth();
}

/** Vuci podatke za specifičan mesec (format: '2026-02') */
function fetchSpecificMonth(monthStr) {
  const [year, month] = monthStr.split("-").map(Number);
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  Logger.log(`Vučem podatke za: ${startDate} do ${endDate}`);

  const allResults = [];

  for (const [product, urls] of Object.entries(GA4_CONFIG.PRODUCTS)) {
    const data = fetchProductData(urls, startDate, endDate);
    const useLeads = GA4_CONFIG.CPC_ONLY_PRODUCTS.includes(product)
      ? data.leadsCpc
      : data.leads;
    allResults.push({
      month: monthStr,
      product: product,
      leads: useLeads,
      sessions: data.sessions,
      users: data.users,
    });
    Logger.log(
      `${product}: Leads=${useLeads}, Sessions=${data.sessions}, Users=${data.users}`,
    );
  }

  for (const [groupName, members] of Object.entries(GA4_CONFIG.GROUPS)) {
    const groupData = allResults.filter((r) => members.includes(r.product));
    allResults.push({
      month: monthStr,
      product: groupName,
      leads: groupData.reduce((sum, r) => sum + r.leads, 0),
      sessions: groupData.reduce((sum, r) => sum + r.sessions, 0),
      users: groupData.reduce((sum, r) => sum + r.users, 0),
    });
  }

  writeToSheet(allResults);
  Logger.log("Gotovo! Upisano " + allResults.length + " redova za " + monthStr);
}

/** Postavi mesečni trigger - pokreće se 5. u mesecu u 8h */
function createMonthlyTrigger() {
  ScriptApp.getProjectTriggers().forEach((t) => {
    if (t.getHandlerFunction() === "processPreviousMonth")
      ScriptApp.deleteTrigger(t);
  });

  ScriptApp.newTrigger("processPreviousMonth")
    .timeBased()
    .onMonthDay(5)
    .atHour(8)
    .create();

  Logger.log("Mesečni trigger kreiran (5. u mesecu, 8h)");
}

// ============== HELPER: Backfill prethodnih meseci ==============
// Koristi za ručno unošenje podataka za mesece koji su prošli pre nego što je skripta bila aktivna.
// Npr: test_jan() → upisuje januar, test_feb() → upisuje februar

//function test_jan() { fetchSpecificMonth('2026-01'); }
//function test_feb() { fetchSpecificMonth('2026-02'); }
