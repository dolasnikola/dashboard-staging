/**
 * DV360 Email Report → Google Sheets
 *
 * Čita DV360 scheduled report mejlove iz Gmaila,
 * parsira CSV attachment, upisuje podatke u odgovarajući tab,
 * i briše mejl nakon obrade.
 *
 * SETUP:
 * 1. Otvori Google Sheet gde želiš DV360 podatke
 * 2. Extensions → Apps Script
 * 3. Zalepi ovaj kod
 * 4. Podesi SHEET_ID i TAB imena dole
 * 5. Pokreni processDV360Emails() jednom ručno (odobri permissions)
 * 6. Triggers → Add trigger → processDV360Emails → Time-driven → Day timer → 6am-7am
 */

// ============== CONFIG ==============
const CONFIG = {
  // ID Google Sheet-a gde se upisuju podaci (iz URL-a sheet-a)
  SHEET_ID: "1WBdasEKrQ7c1izTK4fcw-U2mG-EXY-0mhfi7jE0o9YU",

  // Nazivi tabova u Sheet-u
  TABS: {
    "NLB banka": "NLB",
    Krka_RS_DV360: "Krka Terme",
  },

  // Gmail search query za DV360 mejlove
  GMAIL_QUERY:
    'from:noreply-dv360@google.com subject:"DV360 Dashboard" has:attachment',

  // Headeri koji se pišu u Sheet
  HEADERS: [
    "Date",
    "Campaign",
    "Insertion Order",
    "Impressions",
    "Reach",
    "Clicks",
    "Cost",
  ],

  // Krka Terme filter - preskače Krka Pharm/Farma redove
  KRKA_FILTER: {
    advertiser: "Krka_RS_DV360",
    include: ["krka terme"], // campaign mora sadržati bar jedan od ovih
    exclude: ["farma", "pharm", "septolete"], // preskače ako sadrži bilo koji od ovih
  },
};

// ============== MAIN ==============
function processDV360Emails() {
  const threads = GmailApp.search(CONFIG.GMAIL_QUERY, 0, 10);

  if (threads.length === 0) {
    Logger.log("Nema novih DV360 mejlova.");
    return;
  }

  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  let totalProcessed = 0;

  for (const thread of threads) {
    const messages = thread.getMessages();

    for (const message of messages) {
      const attachments = message.getAttachments();

      for (const attachment of attachments) {
        if (!attachment.getName().endsWith(".csv")) continue;

        const csvText = attachment.getDataAsString();
        const rows = parseCSV(csvText);

        if (rows.length === 0) continue;

        // Grupiši redove po advertiseru
        const grouped = groupByAdvertiser(rows);

        // Upiši u odgovarajuće tabove
        for (const [advertiser, advRows] of Object.entries(grouped)) {
          const tabName = CONFIG.TABS[advertiser];
          if (!tabName) {
            Logger.log("Nepoznat advertiser: " + advertiser + " - preskačem");
            continue;
          }

          let filteredRows = advRows;

          // Primeni Krka filter
          if (advertiser === CONFIG.KRKA_FILTER.advertiser) {
            filteredRows = filterKrkaRows(advRows);
            Logger.log(
              "Krka filter: " +
                advRows.length +
                " → " +
                filteredRows.length +
                " redova",
            );
          }

          if (filteredRows.length > 0) {
            writeToSheet(ss, tabName, filteredRows);
            totalProcessed += filteredRows.length;
          }
        }
      }
    }

    // Obriši mejl thread nakon obrade
    thread.moveToTrash();
    Logger.log("Mejl obrisan: " + thread.getFirstMessageSubject());
  }

  Logger.log("Završeno. Ukupno procesiranih redova: " + totalProcessed);
}

// ============== CSV PARSER ==============
function parseCSV(text) {
  const lines = text.split("\n");
  if (lines.length < 2) return [];

  // Parsiraj header
  const headers = parseCSVLine(lines[0]);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Prekini kad dođeš do metadata sekcije (Report Time:, itd.)
    if (
      line.startsWith("Report Time") ||
      line.startsWith("Date Range") ||
      line.startsWith("Group By") ||
      line.startsWith("MRC") ||
      line.startsWith("Filter") ||
      line.startsWith('"')
    )
      break;

    const values = parseCSVLine(line);
    if (values.length < headers.length) continue;

    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = values[idx];
    });

    // Proveri da li je validan red (ima datum)
    if (!obj["Date"] || !obj["Date"].match(/^\d{4}/)) continue;

    rows.push(obj);
  }

  return rows;
}

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

// ============== GROUPING & FILTERING ==============
function groupByAdvertiser(rows) {
  const grouped = {};
  for (const row of rows) {
    const adv = row["Advertiser"] || "unknown";
    if (!grouped[adv]) grouped[adv] = [];
    grouped[adv].push(row);
  }
  return grouped;
}

function filterKrkaRows(rows) {
  return rows.filter((row) => {
    const campaign = (row["Campaign"] || "").toLowerCase();
    const io = (row["Insertion Order"] || "").toLowerCase();
    const combined = campaign + " " + io;

    // Mora sadržati bar jedan include termin
    const hasInclude = CONFIG.KRKA_FILTER.include.some((term) =>
      combined.includes(term),
    );

    // Ne sme sadržati nijedan exclude termin
    const hasExclude = CONFIG.KRKA_FILTER.exclude.some((term) =>
      combined.includes(term),
    );

    return hasInclude && !hasExclude;
  });
}

// ============== SHEET WRITING ==============
function writeToSheet(ss, tabName, rows) {
  let sheet = ss.getSheetByName(tabName);

  // Kreiraj tab ako ne postoji
  if (!sheet) {
    sheet = ss.insertSheet(tabName);
    sheet.appendRow(CONFIG.HEADERS);
    Logger.log("Kreiran novi tab: " + tabName);
  }

  // Ako je sheet prazan, dodaj headere
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(CONFIG.HEADERS);
  }

  // Pretvori Date format iz 2026/03/14 u 2026-03-14
  const newRows = rows.map((row) => {
    const date = (row["Date"] || "").replace(/\//g, "-");
    const campaign = row["Campaign"] || "";
    const insertionOrder = row["Insertion Order"] || "";
    const impressions = parseFloat(row["Impressions"]) || 0;
    const reach = parseFloat(row["Unique Reach: Total Reach"]) || 0;
    const clicks = parseFloat(row["Clicks"]) || 0;
    const cost = parseFloat(row["Media Cost (Advertiser Currency)"]) || 0;

    return [
      date,
      campaign,
      insertionOrder,
      impressions,
      reach,
      clicks,
      parseFloat(cost.toFixed(2)),
    ];
  });

  // Proveri duplikate - uzmi postojeće datume
  const existingData =
    sheet.getLastRow() > 1
      ? sheet
          .getRange(2, 1, sheet.getLastRow() - 1, 1)
          .getValues()
          .map((r) => String(r[0]))
      : [];

  // Filtriraj samo nove datume (sprečava duplikate ako se skripta pokrene 2x)
  const newDates = [...new Set(newRows.map((r) => r[0]))];
  const existingDates = new Set(
    existingData.map((d) => {
      // Normalizuj datum format
      if (d.includes("T")) return d.split("T")[0]; // Date object
      return d.replace(/\//g, "-");
    }),
  );

  const filteredRows = newRows.filter((r) => !existingDates.has(r[0]));

  if (filteredRows.length === 0) {
    Logger.log(tabName + ": Svi datumi već postoje - preskačem");
    return;
  }

  // Append nove redove
  if (filteredRows.length > 0) {
    sheet
      .getRange(
        sheet.getLastRow() + 1,
        1,
        filteredRows.length,
        CONFIG.HEADERS.length,
      )
      .setValues(filteredRows);
    Logger.log(tabName + ": Dodato " + filteredRows.length + " novih redova");
  }
}

// ============== MANUAL HELPERS ==============

/** Ručno pokretanje za testiranje */
function testRun() {
  processDV360Emails();
}

/** Postavi daily trigger */
function createDailyTrigger() {
  // Obriši stare triggere za ovu funkciju
  ScriptApp.getProjectTriggers().forEach((trigger) => {
    if (trigger.getHandlerFunction() === "processDV360Emails") {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  // Kreiraj novi - svaki dan između 6-7 ujutru
  ScriptApp.newTrigger("processDV360Emails")
    .timeBased()
    .everyDays(1)
    .atHour(6)
    .create();

  Logger.log("Daily trigger kreiran (6-7 AM)");
}

/** Backfill - ručno unesi CSV podatke ako imaš fajl */
function backfillFromCSV() {
  // Zalepi CSV tekst ovde za ručni import
  const csvText = `OVDE_ZALEPI_CSV_TEKST`;

  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const rows = parseCSV(csvText);
  const grouped = groupByAdvertiser(rows);

  for (const [advertiser, advRows] of Object.entries(grouped)) {
    const tabName = CONFIG.TABS[advertiser];
    if (!tabName) continue;

    let filteredRows = advRows;
    if (advertiser === CONFIG.KRKA_FILTER.advertiser) {
      filteredRows = filterKrkaRows(advRows);
    }

    if (filteredRows.length > 0) {
      writeToSheet(ss, tabName, filteredRows);
    }
  }
}
