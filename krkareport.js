// ============== MONTHLY SHEET CSV URLS ==============
const MONTHLY_SHEET_URLS = {
  krka: {
    search: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT1E2Lly22Fcmy0NILkwO8DMW5ZJm4ePHr7_NicCc2m5iSKvND9H1QQYy-MJ5wABllllOomYhhsgkOX/pub?gid=2072175072&single=true&output=csv',
    meta: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT1E2Lly22Fcmy0NILkwO8DMW5ZJm4ePHr7_NicCc2m5iSKvND9H1QQYy-MJ5wABllllOomYhhsgkOX/pub?gid=0&single=true&output=csv',
    gdn: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT1E2Lly22Fcmy0NILkwO8DMW5ZJm4ePHr7_NicCc2m5iSKvND9H1QQYy-MJ5wABllllOomYhhsgkOX/pub?gid=1032698057&single=true&output=csv'
  }
};

// ============== CREATIVES (FOLDER-BASED) ==============
const CREATIVES_CONFIG = {
  krka: {
    cover: { image: 'creatives/krka/cover.jpg', w: 110, h: 85 },
    thanks: { image: 'creatives/krka/thanks.jpg', w: 120, h: 80 },
    google_ads: {
      images: ['creatives/krka/google_ads_1.png', 'creatives/krka/google_ads_2.png', 'creatives/krka/google_ads_3.png'],
      w: 75, h: 45
    },
    meta: {
      images: ['creatives/krka/meta_preview.png'],
      w: 220, h: 45
    },
    dv360: {
      images: ['creatives/krka/dv360_1.jpg'],
      w: 120, h: 40
    }
  }
};

const _creativeImgCache = {};

function preloadCreatives() {
  const container = document.getElementById('creativesPreload');
  if (!container) return;
  container.innerHTML = '';
  Object.entries(CREATIVES_CONFIG).forEach(([clientId, platforms]) => {
    Object.entries(platforms).forEach(([key, config]) => {
      if (key === 'cover' || key === 'thanks') {
        const img = document.createElement('img');
        img.src = config.image;
        img.id = `creative_${clientId}_${key}`;
        img.onload = () => { _creativeImgCache[img.id] = img; };
        container.appendChild(img);
      } else if (config.images) {
        config.images.forEach((src, i) => {
          const img = document.createElement('img');
          img.src = src;
          img.id = `creative_${clientId}_${key}_${i}`;
          img.onload = () => { _creativeImgCache[img.id] = img; };
          container.appendChild(img);
        });
      }
    });
  });
}

function getCreativeBase64(imgElement) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = imgElement.naturalWidth;
    canvas.height = imgElement.naturalHeight;
    canvas.getContext('2d').drawImage(imgElement, 0, 0);
    const isPng = imgElement.src && imgElement.src.toLowerCase().endsWith('.png');
    return canvas.toDataURL(isPng ? 'image/png' : 'image/jpeg', 0.85);
  } catch(e) { return null; }
}

setTimeout(preloadCreatives, 500);

// ============== REPORT CONFIG ==============
const REPORT_PLATFORM_NAMES = {
  google_ads: 'Google Search',
  meta: 'Meta - Facebook & Instagram',
  dv360: 'Google Display Network'
};

const REPORT_METRIC_COLS = {
  google_ads: { label: 'Ad group', cols: ['campaign', 'impressions', 'clicks', 'ctr', 'spend'] },
  meta: { label: 'Campaign', cols: ['campaign', 'reach', 'impressions', 'clicks', 'ctr', 'spend'] },
  dv360: { label: 'Campaign', cols: ['campaign', 'impressions', 'clicks', 'ctr', 'cpm', 'spend'] },
  dv360_io: { label: 'Insertion Order', cols: ['campaign', 'impressions', 'clicks', 'ctr', 'cpm', 'spend'] }
};

const REPORT_COL_LABELS = {
  campaign: 'Campaign', impressions: 'Impressions', clicks: 'Clicks',
  ctr: 'CTR', spend: 'Budget', reach: 'Reach', cpm: 'CPM'
};

function getReportMonth() {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthLabel(monthStr) {
  const [y, m] = monthStr.split('-');
  const months = ['januar', 'februar', 'mart', 'april', 'maj', 'jun', 'jul', 'avgust', 'septembar', 'oktobar', 'novembar', 'decembar'];
  return `${months[parseInt(m) - 1]} ${y}`;
}

function getMonthLabelCapital(monthStr) {
  const l = getMonthLabel(monthStr);
  return l.charAt(0).toUpperCase() + l.slice(1);
}

// ============== CSV PARSING ==============
async function fetchCSV(url) {
  const response = await fetch(url);
  const text = await response.text();
  return parseCSVText(text);
}

function parseCSVText(text) {
  const lines = text.split('\n');
  return lines.map(line => {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') { inQuotes = !inQuotes; }
      else if (line[i] === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
      else { current += line[i]; }
    }
    result.push(current.trim());
    return result;
  }).filter(row => row.length > 1 || (row[0] && row[0].trim() !== ''));
}

function cleanNum(val) {
  if (!val) return 0;
  const cleaned = val.toString().replace(/[€%\s\u00a0]/g, '').replace(/,/g, '');
  return parseFloat(cleaned) || 0;
}

// ============== PLATFORM PARSERS ==============
function parseSearchData(rows) {
  if (!rows || rows.length < 2) return [];
  const data = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row[0] || row[0] === 'Total' || row[0].startsWith('Period')) continue;
    const impressions = cleanNum(row[1]);
    const clicks = cleanNum(row[2]);
    data.push({
      campaign: row[0],
      impressions,
      clicks,
      ctr: impressions > 0 ? clicks / impressions * 100 : 0,
      spend: cleanNum(row[4])
    });
  }
  return data;
}

function parseMetaData(rows) {
  if (!rows || rows.length < 2) return [];
  const data = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row[0] || row[0] === 'Total' || row[0].startsWith('Period')) continue;
    const impressions = cleanNum(row[2]);
    const clicks = cleanNum(row[3]);
    data.push({
      campaign: row[0],
      reach: cleanNum(row[1]),
      impressions,
      clicks,
      ctr: impressions > 0 ? clicks / impressions * 100 : 0,
      spend: cleanNum(row[5])
    });
  }
  return data;
}

function parseGDNData(rows) {
  if (!rows || rows.length < 2) return { campaigns: [], insertionOrders: [] };
  const header = rows[0];

  // Detect format: raw DV360 export vs script-generated
  if (header[0] && header[0].trim() === 'Advertiser') {
    return parseGDNRaw(rows);
  }
  return parseGDNScript(rows);
}

function parseGDNRaw(rows) {
  // Raw DV360: Advertiser, Campaign, Insertion Order, Advertiser Currency,
  // Impressions, Unique Reach: Total Reach, Clicks, Click Rate (CTR), Media Cost
  const campaignAgg = {};
  const ioAgg = {};

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const campaignName = (row[1] || '').trim();
    if (campaignName.indexOf('Krka Terme') === -1) continue;

    const impressions = cleanNum(row[4]);
    const reach = cleanNum(row[5]);
    const clicks = cleanNum(row[6]);
    let cost = cleanNum(row[8]);
    // DV360 raw export often has micro-currency
    if (cost > 100000) cost = cost / 1000000;

    const ioName = (row[2] || '').trim();

    if (!campaignAgg[campaignName]) campaignAgg[campaignName] = { impressions: 0, reach: 0, clicks: 0, spend: 0 };
    campaignAgg[campaignName].impressions += impressions;
    campaignAgg[campaignName].reach += reach;
    campaignAgg[campaignName].clicks += clicks;
    campaignAgg[campaignName].spend += cost;

    if (ioName) {
      if (!ioAgg[ioName]) ioAgg[ioName] = { impressions: 0, reach: 0, clicks: 0, spend: 0 };
      ioAgg[ioName].impressions += impressions;
      ioAgg[ioName].reach += reach;
      ioAgg[ioName].clicks += clicks;
      ioAgg[ioName].spend += cost;
    }
  }

  const toArray = (obj) => Object.entries(obj).map(([name, d]) => ({
    campaign: name, ...d,
    ctr: d.impressions > 0 ? d.clicks / d.impressions * 100 : 0,
    cpm: d.impressions > 0 ? d.spend / d.impressions * 1000 : 0
  })).sort((a, b) => b.impressions - a.impressions);

  return { campaigns: toArray(campaignAgg), insertionOrders: toArray(ioAgg) };
}

function parseGDNScript(rows) {
  // Script format: Campaign table, empty row, IO table
  const table1 = [];
  const table2 = [];
  let currentTable = 1;
  let foundFirstHeader = false;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const isEmpty = row.every(cell => !cell || cell.trim() === '');

    if (isEmpty) {
      if (foundFirstHeader) currentTable = 2;
      continue;
    }

    if (row[0] === 'Campaign' || row[0] === 'Insertion Order') {
      foundFirstHeader = true;
      continue;
    }
    if (row[0] === 'Total') continue;

    const impressions = cleanNum(row[1]);
    const clicks = cleanNum(row[2]);
    const spend = cleanNum(row[5]);

    const item = {
      campaign: row[0],
      impressions,
      clicks,
      ctr: impressions > 0 ? clicks / impressions * 100 : 0,
      cpm: impressions > 0 ? spend / impressions * 1000 : 0,
      spend
    };

    if (currentTable === 1) table1.push(item);
    else table2.push(item);
  }

  return { campaigns: table1, insertionOrders: table2 };
}

// ============== DATA COLLECTION (FROM SHEETS) ==============
async function collectReportData(clientId) {
  const client = CLIENTS[clientId];
  const reportMonth = getReportMonth();
  const urls = MONTHLY_SHEET_URLS[clientId];

  if (!urls) throw new Error('Nema konfiguracije sheet URL-ova za: ' + clientId);

  const [searchRows, metaRows, gdnRows] = await Promise.all([
    fetchCSV(urls.search),
    fetchCSV(urls.meta),
    fetchCSV(urls.gdn)
  ]);

  const searchData = parseSearchData(searchRows);
  const metaData = parseMetaData(metaRows);
  const gdnData = parseGDNData(gdnRows);

  function sumTotals(items) {
    const t = { impressions: 0, clicks: 0, spend: 0, reach: 0 };
    items.forEach(c => {
      t.impressions += c.impressions || 0;
      t.clicks += c.clicks || 0;
      t.spend += c.spend || 0;
      t.reach += c.reach || 0;
    });
    t.ctr = t.impressions > 0 ? t.clicks / t.impressions * 100 : 0;
    t.cpm = t.impressions > 0 ? t.spend / t.impressions * 1000 : 0;
    return t;
  }

  // Za DV360 totale koristi IO podatke (detaljniji), ili campaign ako nema IO
  const gdnTotalSource = gdnData.insertionOrders.length > 0 ? gdnData.insertionOrders : gdnData.campaigns;

  return {
    client,
    clientId,
    reportMonth,
    monthLabel: getMonthLabelCapital(reportMonth),
    platforms: {
      google_ads: {
        campaigns: searchData,
        totals: sumTotals(searchData),
        setup: { type: 'awareness' }
      },
      meta: {
        campaigns: metaData,
        totals: sumTotals(metaData),
        setup: { type: 'awareness' }
      },
      dv360: {
        campaigns: gdnData.campaigns,
        insertionOrders: gdnData.insertionOrders,
        totals: sumTotals(gdnTotalSource),
        setup: { type: 'awareness' }
      }
    }
  };
}

// ============== TEXT GENERATION ==============
function generateExecutiveSummary(reportData) {
  const platformKeys = Object.keys(reportData.platforms);
  const channelNames = platformKeys.map(p => REPORT_PLATFORM_NAMES[p]);
  const numWord = ['', 'jedan', 'dva', 'tri', 'cetiri', 'pet'][platformKeys.length] || platformKeys.length;

  let text = `U ${reportData.monthLabel.toLowerCase()}u je digitalno oglasavanje realizovano kroz ${numWord} kljucna kanala komunikacije:\n\n`;
  channelNames.forEach(n => { text += `- ${n}\n`; });
  text += '\n';

  platformKeys.forEach(platform => {
    const data = reportData.platforms[platform];
    const name = REPORT_PLATFORM_NAMES[platform];
    const t = data.totals;
    text += `${name} kampanje ostvarile su ${fmtNum(t.reach)} dosegnutih korisnika i ${fmtNum(t.impressions)} impresija, uz ${fmtNum(t.clicks)} klikova sa CTR-om od ${t.ctr.toFixed(2)}% i ukupnim ulaganjem od ${fmtEur(t.spend)}.\n`;
  });

  let totalSpend = 0;
  platformKeys.forEach(p => { totalSpend += reportData.platforms[p].totals.spend || 0; });
  text += `\nKombinovano, svi kanali su obezbedili balans izmedju volumena, vidljivosti i relevantnog saobracaja, uz ukupno ulaganje od ${fmtEur(totalSpend)}.`;

  return text;
}

function generatePlatformNarrative(platform, data, reportData) {
  const name = REPORT_PLATFORM_NAMES[platform];
  const t = data.totals;
  const campaigns = platform === 'dv360' && data.insertionOrders && data.insertionOrders.length > 0
    ? data.insertionOrders : data.campaigns;
  let text = '';

  text += `Kampanje na ${name} platformi tokom ${reportData.monthLabel.toLowerCase()}a ostvarile su stabilne rezultate, sa ukupno ${fmtNum(t.reach)} dosegnutih korisnika i ${fmtNum(t.impressions)} impresija, cime je obezbedjeno snazno prisustvo brenda.`;

  if (campaigns.length > 1) {
    const sorted = [...campaigns].sort((a, b) => (b.impressions || 0) - (a.impressions || 0));
    const top = sorted[0];
    text += `\n${top.campaign} imala je kljucnu ulogu sa ${fmtNum(top.impressions)} impresija i ${fmtNum(top.clicks)} klikova.`;
    const bestCtr = [...campaigns].sort((a, b) => (b.ctr || 0) - (a.ctr || 0))[0];
    if (bestCtr.campaign !== top.campaign && bestCtr.ctr > 0) {
      text += ` Kampanja "${bestCtr.campaign}" se izdvaja sa najvisim CTR-om od ${bestCtr.ctr.toFixed(2)}%.`;
    }
  }

  text += `\nUkupno je ostvareno ${fmtNum(t.clicks)} klikova, uz prosecan CTR od ${t.ctr.toFixed(2)}%.`;
  text += `\nSa ukupnim ulaganjem od ${fmtEur(t.spend)}, kampanje su nesmetano emitovane tokom ${reportData.monthLabel.toLowerCase()}a.`;

  return text;
}

// ============== FORMAT HELPERS ==============
function fmtNum(val) {
  if (!val || val === 0) return '0';
  return Math.round(val).toLocaleString('de-DE');
}

function fmtEur(val) {
  if (!val) return '0,00 €';
  return val.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function fmtTableVal(col, val) {
  if (col === 'campaign') return val || '';
  if (col === 'impressions' || col === 'clicks' || col === 'reach') return fmtNum(val);
  if (col === 'ctr') return (val || 0).toFixed(2) + '%';
  if (col === 'cpm') return fmtEur(val);
  if (col === 'spend') return fmtEur(val);
  return val;
}

// ============== PDF HELPERS ==============
function pdfDrawBg(doc, pw, ph) {
  doc.setFillColor(232, 228, 222);
  doc.rect(0, 0, pw, ph, 'F');
}

function pdfWriteText(doc, text, x, y, cw, fontSize, fontStyle, lineH) {
  doc.setFont('helvetica', fontStyle || 'normal');
  doc.setFontSize(fontSize || 11);
  doc.setTextColor(30, 30, 30);
  const wrapped = doc.splitTextToSize(text, cw);
  wrapped.forEach(wl => {
    doc.text(wl, x, y);
    y += lineH || 5.5;
  });
  return y;
}

function pdfRenderTable(doc, headLabels, tableBody, y, margin) {
  doc.autoTable({
    startY: y,
    head: [headLabels],
    body: tableBody,
    margin: { left: margin, right: margin },
    styles: { fontSize: 9, cellPadding: 3, font: 'helvetica', textColor: [30, 30, 30], lineColor: [200, 195, 185], lineWidth: 0.3 },
    headStyles: { fillColor: [240, 200, 0], textColor: [30, 30, 30], fontStyle: 'bold', lineWidth: 0 },
    bodyStyles: { fillColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [248, 245, 240] },
    didParseCell: function(d) { if (d.row.index === tableBody.length - 1 && d.section === 'body') d.cell.styles.fontStyle = 'bold'; },
    theme: 'grid'
  });
  return doc.lastAutoTable.finalY;
}

// ============== MAIN GENERATE ==============
async function generateMonthlyReport() {
  if (!currentClient) return;
  const btn = document.getElementById('downloadReportBtn');
  const origText = btn.textContent;
  btn.textContent = 'Generisanje...';
  btn.disabled = true;

  try {
    if (!window.jspdf) { notify('jsPDF biblioteka nije ucitana. Osvezi stranicu.', 'error'); return; }

    const reportData = await collectReportData(currentClient);
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'mm', 'a4');
    const pw = 297, ph = 210, margin = 20;
    const cw = pw - 2 * margin;

    // ========= PAGE 1: COVER =========
    pdfDrawBg(doc, pw, ph);

    const coverConfig = CREATIVES_CONFIG[reportData.clientId]?.cover;
    const coverImg = _creativeImgCache[`creative_${reportData.clientId}_cover`];
    const hasImage = coverConfig && coverImg;
    let imgRight = margin;

    if (hasImage) {
      try {
        const b64 = getCreativeBase64(coverImg);
        if (b64) {
          const imgX = margin;
          const imgY = (ph - coverConfig.h) / 2 - 15;
          doc.addImage(b64, b64.indexOf('image/png') > -1 ? 'PNG' : 'JPEG', imgX, imgY, coverConfig.w, coverConfig.h);
          imgRight = imgX + coverConfig.w + 10;
        }
      } catch(e) {}
    }

    const textAreaLeft = hasImage ? imgRight : margin;
    const textAreaW = pw - margin - textAreaLeft;
    const textCenterX = textAreaLeft + textAreaW / 2;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(26);
    doc.setTextColor(30, 30, 30);
    const titleLines = doc.splitTextToSize(reportData.client.name, textAreaW - 5);
    let ty = ph / 2 - 30;
    titleLines.forEach(l => { doc.text(l, textCenterX, ty, { align: 'center' }); ty += 10; });

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(16);
    doc.text('Digital oglasavanje', textCenterX, ty + 5, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text(`${reportData.monthLabel}.`, textCenterX, ty + 22, { align: 'center' });

    // ========= PAGE 2: EXECUTIVE SUMMARY =========
    doc.addPage();
    pdfDrawBg(doc, pw, ph);
    let y = margin + 5;

    const summaryText = generateExecutiveSummary(reportData);
    const paragraphs = summaryText.split('\n');

    paragraphs.forEach(line => {
      if (line.trim() === '') { y += 3; return; }

      let boldPrefix = '';
      const platformNames = Object.values(REPORT_PLATFORM_NAMES);
      for (const pn of platformNames) {
        if (line.startsWith(pn)) { boldPrefix = pn; break; }
      }

      if (boldPrefix) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        const boldW = doc.getTextWidth(boldPrefix);
        doc.setFont('helvetica', 'normal');
        const fullWrapped = doc.splitTextToSize(line, cw);

        fullWrapped.forEach((wl, idx) => {
          if (idx === 0) {
            doc.setFont('helvetica', 'bold');
            doc.text(boldPrefix, margin, y);
            doc.setFont('helvetica', 'normal');
            doc.text(wl.substring(boldPrefix.length), margin + boldW, y);
          } else {
            doc.setFont('helvetica', 'normal');
            doc.text(wl, margin, y);
          }
          y += 5.5;
        });
      } else if (line.startsWith('- ')) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        doc.text(line, margin, y);
        y += 5.5;
      } else {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        const wrapped = doc.splitTextToSize(line, cw);
        wrapped.forEach(wl => { doc.text(wl, margin, y); y += 5.5; });
      }
    });

    // ========= PAGES 3+: PER-PLATFORM =========
    for (const [platform, data] of Object.entries(reportData.platforms)) {
      doc.addPage();
      pdfDrawBg(doc, pw, ph);
      y = margin;

      const platName = REPORT_PLATFORM_NAMES[platform];
      const colConfig = REPORT_METRIC_COLS[platform];

      // Title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(30, 30, 30);
      doc.text(`${platName} ${reportData.monthLabel}.`, margin, y + 6);

      // Date badge
      const [ry, rm] = reportData.reportMonth.split('-').map(Number);
      const lastDay = new Date(ry, rm, 0).getDate();
      const dateStr = `${reportData.reportMonth.replace('-', '/')}/01 - ${reportData.reportMonth.replace('-', '/')}/${String(lastDay).padStart(2, '0')}`;
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      const dateW = doc.getTextWidth(dateStr) + 10;
      doc.setFillColor(240, 200, 0);
      doc.roundedRect(pw - margin - dateW, y - 2, dateW, 12, 3, 3, 'F');
      doc.setTextColor(30, 30, 30);
      doc.text(dateStr, pw - margin - dateW + 5, y + 5);
      y += 18;

      // === Table 1: Campaigns ===
      const cols = colConfig.cols;
      const headLabels = cols.map(c => c === 'campaign' ? colConfig.label : (REPORT_COL_LABELS[c] || c));

      const tableBody = data.campaigns.map(row => cols.map(c => {
        if (c === 'campaign') return row.campaign || '';
        return fmtTableVal(c, row[c]);
      }));
      // Total row
      const totalsRow = cols.map(c => {
        if (c === 'campaign') return 'Total';
        return fmtTableVal(c, data.totals[c]);
      });
      tableBody.push(totalsRow);

      y = pdfRenderTable(doc, headLabels, tableBody, y, margin);

      // === Table 2: Insertion Orders (only for DV360) ===
      if (platform === 'dv360' && data.insertionOrders && data.insertionOrders.length > 0) {
        const ioConfig = REPORT_METRIC_COLS.dv360_io;
        const ioCols = ioConfig.cols;
        const ioHeadLabels = ioCols.map(c => c === 'campaign' ? ioConfig.label : (REPORT_COL_LABELS[c] || c));

        // IO totals
        const ioTotals = { impressions: 0, clicks: 0, spend: 0 };
        data.insertionOrders.forEach(io => {
          ioTotals.impressions += io.impressions || 0;
          ioTotals.clicks += io.clicks || 0;
          ioTotals.spend += io.spend || 0;
        });
        ioTotals.ctr = ioTotals.impressions > 0 ? ioTotals.clicks / ioTotals.impressions * 100 : 0;
        ioTotals.cpm = ioTotals.impressions > 0 ? ioTotals.spend / ioTotals.impressions * 1000 : 0;

        const ioBody = data.insertionOrders.map(row => ioCols.map(c => {
          if (c === 'campaign') return row.campaign || '';
          return fmtTableVal(c, row[c]);
        }));
        ioBody.push(ioCols.map(c => {
          if (c === 'campaign') return 'Total';
          return fmtTableVal(c, ioTotals[c]);
        }));

        // Check if we need a new page
        if (y + 40 > ph - margin) { doc.addPage(); pdfDrawBg(doc, pw, ph); y = margin; }

        y = pdfRenderTable(doc, ioHeadLabels, ioBody, y, margin);
      }

      y += 10;

      // Narrative
      const narrative = generatePlatformNarrative(platform, data, reportData);
      narrative.split('\n').forEach(line => {
        if (line.trim() === '') { y += 3; return; }
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(30, 30, 30);
        const wrapped = doc.splitTextToSize(line, cw);
        wrapped.forEach(wl => {
          if (y > ph - margin) { doc.addPage(); pdfDrawBg(doc, pw, ph); y = margin; }
          doc.text(wl, margin, y);
          y += 5;
        });
        y += 2;
      });

      // Creatives
      const cc = CREATIVES_CONFIG[reportData.clientId]?.[platform];
      if (cc && cc.images && cc.images.length > 0) {
        y += 8;
        if (y + cc.h > ph - margin) { doc.addPage(); pdfDrawBg(doc, pw, ph); y = margin; }
        const totalImgW = cc.images.length * cc.w + (cc.images.length - 1) * 8;
        let imgX = totalImgW <= cw ? margin + (cw - totalImgW) / 2 : margin;

        cc.images.forEach((src, i) => {
          const cached = _creativeImgCache[`creative_${reportData.clientId}_${platform}_${i}`];
          if (cached) {
            try {
              const b64 = getCreativeBase64(cached);
              if (b64) {
                if (imgX + cc.w > pw - margin) { imgX = margin; y += cc.h + 8; }
                if (y + cc.h > ph - margin) { doc.addPage(); pdfDrawBg(doc, pw, ph); y = margin; }
                doc.addImage(b64, b64.indexOf('image/png') > -1 ? 'PNG' : 'JPEG', imgX, y, cc.w, cc.h);
                imgX += cc.w + 8;
              }
            } catch(e) {}
          }
        });
      }
    }

    // ========= LAST PAGE: HVALA =========
    doc.addPage();
    pdfDrawBg(doc, pw, ph);

    const thanksConfig = CREATIVES_CONFIG[reportData.clientId]?.thanks;
    const thanksImg = _creativeImgCache[`creative_${reportData.clientId}_thanks`];
    if (thanksConfig && thanksImg) {
      try {
        const b64 = getCreativeBase64(thanksImg);
        if (b64) {
          const ix = (pw - thanksConfig.w) / 2;
          doc.addImage(b64, b64.indexOf('image/png') > -1 ? 'PNG' : 'JPEG', ix, 70, thanksConfig.w, thanksConfig.h);
        }
      } catch(e) {}
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(36);
    doc.setTextColor(30, 30, 30);
    doc.text('HVALA!', pw / 2, thanksImg ? 185 : ph / 2, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.setTextColor(100, 100, 100);
    doc.text(reportData.client.name, pw / 2, thanksImg ? 198 : ph / 2 + 15, { align: 'center' });
    doc.text(`${reportData.monthLabel}.`, pw / 2, thanksImg ? 206 : ph / 2 + 25, { align: 'center' });

    // Save
    const filename = `${reportData.clientId}_izvestaj_${reportData.reportMonth}.pdf`;
    doc.save(filename);
    notify(`Izvestaj preuzet: ${filename}`);

  } catch (err) {
    console.error('Report generation error:', err);
    notify('Greska pri generisanju izvestaja: ' + err.message, 'error');
  } finally {
    btn.textContent = origText;
    btn.disabled = false;
  }
}
