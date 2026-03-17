// ============== CREATIVES (FOLDER-BASED) ==============
// Naming convention: creatives/{clientId}/{platform}_1.jpg, {platform}_2.jpg, ...
// Dimensions per image in PDF (mm): { w: width, h: height }
const CREATIVES_CONFIG = {
  krka: {
    cover: {
      image: 'creatives/krka/cover.jpg',  // naslovna slika (npr. bazen, hotel)
      w: 120, h: 90  // dimenzije na cover page-u (mm)
    },
    google_ads: {
      images: ['creatives/krka/google_ads_1.jpg', 'creatives/krka/google_ads_2.jpg', 'creatives/krka/google_ads_3.jpg'],
      w: 50, h: 65  // portrait ad screenshots
    },
    meta: {
      images: ['creatives/krka/meta_1.jpg'],
      w: 170, h: 60  // široka slika sa 4 kreative
    },
    dv360: {
      images: ['creatives/krka/dv360_1.jpg'],
      w: 80, h: 50  // landscape banner
    }
  }
  // Dodaj za druge klijente po potrebi:
  // nlb: { google_ads: { images: [...], w: 50, h: 65 }, meta: { ... } },
  // urban: { ... }
};

// Preload all creative images into hidden <img> tags
const _creativeImgCache = {};

function preloadCreatives() {
  const container = document.getElementById('creativesPreload');
  if (!container) return;
  container.innerHTML = '';
  Object.entries(CREATIVES_CONFIG).forEach(([clientId, platforms]) => {
    Object.entries(platforms).forEach(([key, config]) => {
      if (key === 'cover') {
        const img = document.createElement('img');
        img.src = config.image;
        img.crossOrigin = 'anonymous';
        img.id = `creative_${clientId}_cover`;
        img.onload = () => { _creativeImgCache[img.id] = img; };
        container.appendChild(img);
      } else {
        config.images.forEach((src, i) => {
          const img = document.createElement('img');
          img.src = src;
          img.crossOrigin = 'anonymous';
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
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imgElement, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.85);
  } catch(e) {
    return null;
  }
}

setTimeout(preloadCreatives, 500);

// ============== MONTHLY REPORT PDF ==============
const REPORT_PLATFORM_NAMES = {
  google_ads: 'Google Search',
  meta: 'Meta - Facebook & Instagram',
  dv360: 'Google Display Network',
  tiktok: 'TikTok'
};

const REPORT_METRIC_COLS = {
  google_ads: { label: 'Ad group', cols: ['campaign', 'impressions', 'clicks', 'ctr', 'spend'] },
  meta: { label: 'Campaign', cols: ['campaign', 'reach', 'impressions', 'clicks', 'ctr', 'spend'] },
  dv360: { label: 'Campaign', cols: ['campaign', 'impressions', 'clicks', 'ctr', 'cpm', 'spend'] }
};

const REPORT_COL_LABELS = {
  campaign: 'Campaign', impressions: 'Impressions', clicks: 'Clicks',
  ctr: 'CTR', spend: 'Budget', reach: 'Reach', cpm: 'CPM',
  conv_value: 'Conv. Value', conversions: 'Conversions', cpa: 'CPA'
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
  const label = getMonthLabel(monthStr);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function collectReportData(clientId) {
  const client = CLIENTS[clientId];
  const reportMonth = getReportMonth();
  const [ry, rm] = reportMonth.split('-').map(Number);
  const prevMonth = `${rm === 1 ? ry - 1 : ry}-${String(rm === 1 ? 12 : rm - 1).padStart(2, '0')}`;

  const reportData = {
    client,
    clientId,
    reportMonth,
    prevMonth,
    monthLabel: getMonthLabelCapital(reportMonth),
    platforms: {}
  };

  client.platforms.forEach(platform => {
    const setup = client.setup[platform];
    if (!setup || setup.type === 'ga4_kpi') return;

    const currentRows = getCampaignData(clientId, platform, reportMonth);
    const prevRows = getCampaignData(clientId, platform, prevMonth);
    const campaigns = aggregateByCampaign(currentRows);
    const budget = getBudget(clientId, platform, reportMonth);

    // Aggregate totals
    const totals = { impressions: 0, clicks: 0, spend: 0, reach: 0, conversions: 0, conv_value: 0 };
    campaigns.forEach(c => {
      totals.impressions += c.impressions || 0;
      totals.clicks += c.clicks || 0;
      totals.spend += c.spend || 0;
      totals.reach += c.reach || 0;
      totals.conversions += c.conversions || 0;
      totals.conv_value += c.conv_value || 0;
    });
    totals.ctr = totals.impressions > 0 ? totals.clicks / totals.impressions * 100 : 0;
    totals.cpm = totals.impressions > 0 ? totals.spend / totals.impressions * 1000 : 0;
    totals.cpc = totals.clicks > 0 ? totals.spend / totals.clicks : 0;
    totals.cpa = totals.conversions > 0 ? totals.spend / totals.conversions : 0;

    // Previous month totals
    const prevCampaigns = aggregateByCampaign(prevRows);
    const prevTotals = { impressions: 0, clicks: 0, spend: 0, reach: 0, conversions: 0, conv_value: 0 };
    prevCampaigns.forEach(c => {
      prevTotals.impressions += c.impressions || 0;
      prevTotals.clicks += c.clicks || 0;
      prevTotals.spend += c.spend || 0;
      prevTotals.reach += c.reach || 0;
      prevTotals.conversions += c.conversions || 0;
      prevTotals.conv_value += c.conv_value || 0;
    });
    prevTotals.ctr = prevTotals.impressions > 0 ? prevTotals.clicks / prevTotals.impressions * 100 : 0;
    prevTotals.cpm = prevTotals.impressions > 0 ? prevTotals.spend / prevTotals.impressions * 1000 : 0;

    reportData.platforms[platform] = { setup, campaigns, totals, prevTotals, budget };
  });

  return reportData;
}

// Rule-based text generation
function generateExecutiveSummary(reportData) {
  const platformKeys = Object.keys(reportData.platforms);
  const channelNames = platformKeys.map(p => REPORT_PLATFORM_NAMES[p] || PLATFORM_NAMES[p]);
  const numWord = ['', 'jedan', 'dva', 'tri', 'četiri', 'pet'][platformKeys.length] || platformKeys.length;

  let text = `U ${reportData.monthLabel.toLowerCase()}u je digitalno oglašavanje realizovano kroz ${numWord} ključna kanala komunikacije:\n\n`;
  channelNames.forEach(n => { text += `- ${n}\n`; });
  text += '\n';

  platformKeys.forEach(platform => {
    const data = reportData.platforms[platform];
    const name = REPORT_PLATFORM_NAMES[platform] || PLATFORM_NAMES[platform];
    const t = data.totals;

    if (data.setup.type === 'performance') {
      text += `${name} kampanje ostvarile su ${fmt(t.conversions, 'number')} konverzija sa ukupnom vrednošću od ${fmtMetric('conv_value', t.conv_value, reportData.client.currency)}, uz ulaganje od ${fmtMetric('spend', t.spend, reportData.client.currency)}`;
      if (t.cpa > 0) text += ` i prosečan CPA od ${fmtMetric('cpa', t.cpa, reportData.client.currency)}`;
      text += '.\n';
    } else {
      text += `${name} kampanje ostvarile su ${fmt(t.reach, 'number')} dosegnutih korisnika i ${fmt(t.impressions, 'number')} impresija, uz ${fmt(t.clicks, 'number')} klikova`;
      if (t.ctr > 0) text += ` sa CTR-om od ${t.ctr.toFixed(2)}%`;
      text += ` i ukupnim ulaganjem od ${fmtMetric('spend', t.spend, reportData.client.currency)}.\n`;
    }
  });

  let totalSpend = 0;
  platformKeys.forEach(p => { totalSpend += reportData.platforms[p].totals.spend || 0; });
  text += `\nKombinovano, svi kanali su obezbedili balans između volumena, vidljivosti i relevantnog saobraćaja, uz ukupno ulaganje od ${fmtMetric('spend', totalSpend, reportData.client.currency)}.`;

  return text;
}

function generatePlatformNarrative(platform, data, reportData) {
  const name = REPORT_PLATFORM_NAMES[platform] || PLATFORM_NAMES[platform];
  const t = data.totals;
  const campaigns = data.campaigns;
  let text = '';

  if (data.setup.type === 'performance') {
    text += `Tekstualne kampanje u posmatranom periodu ostvarile su ukupno ${fmt(t.conversions, 'number')} konverzija sa vrednošću od ${fmtMetric('conv_value', t.conv_value, reportData.client.currency)}, uz ulaganje od ${fmtMetric('spend', t.spend, reportData.client.currency)}.\n`;
  } else {
    text += `Kampanje na ${name} platformi tokom ${reportData.monthLabel.toLowerCase()}a ostvarile su stabilne rezultate, sa ukupno ${fmt(t.reach, 'number')} dosegnutih korisnika i ${fmt(t.impressions, 'number')} impresija, čime je obezbeđen snažan obuhvat ciljne publike i kontinuirano prisustvo brenda.\n`;
  }

  // Analyze top campaigns
  if (campaigns.length > 1) {
    const sorted = [...campaigns].sort((a, b) => (b.impressions || 0) - (a.impressions || 0));
    const top = sorted[0];
    text += `${top.campaign || top.insertion_order} kampanja imala je ključnu ulogu sa ${fmt(top.impressions, 'number')} impresija i ${fmt(top.clicks, 'number')} klikova.\n`;

    // CTR analysis
    const bestCtr = [...campaigns].sort((a, b) => (b.ctr || 0) - (a.ctr || 0))[0];
    if (bestCtr.campaign !== top.campaign && bestCtr.ctr > 0) {
      text += `Kampanja „${bestCtr.campaign || bestCtr.insertion_order}" se izdvaja sa najvišim CTR-om od ${bestCtr.ctr.toFixed(2)}%.\n`;
    }
  }

  text += `Ukupno je ostvareno ${fmt(t.clicks, 'number')} klikova, uz prosečan CTR od ${t.ctr.toFixed(2)}%.`;

  // Budget utilization
  if (data.budget > 0) {
    const util = (t.spend / data.budget * 100).toFixed(0);
    text += `\nSa ukupnim ulaganjem od ${fmtMetric('spend', t.spend, reportData.client.currency)}, kampanje su ostvarile dobar odnos budžeta i ostvarenih rezultata (iskorišćenost budžeta: ${util}%).`;
  } else {
    text += `\nSa ukupnim ulaganjem od ${fmtMetric('spend', t.spend, reportData.client.currency)}, kampanje su nesmetano emitovane tokom ${reportData.monthLabel.toLowerCase()}a.`;
  }

  return text;
}

async function generateMonthlyReport() {
  if (!currentClient) return;

  const btn = document.getElementById('downloadReportBtn');
  const origText = btn.textContent;
  btn.textContent = 'Generisanje...';
  btn.disabled = true;

  try {
    if (!window.jspdf) {
      notify('jsPDF biblioteka nije učitana. Proveri internet konekciju i osvežavaj stranicu.', 'error');
      return;
    }
    const reportData = collectReportData(currentClient);
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const pw = 210, ph = 297, margin = 20;
    const cw = pw - 2 * margin;
    const currency = reportData.client.currency;

    // ========= PAGE 1: COVER =========
    doc.setFillColor(232, 228, 222); // bež
    doc.rect(0, 0, pw, ph, 'F');

    // Cover image (left side)
    const coverConfig = CREATIVES_CONFIG[reportData.clientId]?.cover;
    const coverImg = _creativeImgCache[`creative_${reportData.clientId}_cover`];
    let textStartX = pw / 2; // default: centered text
    if (coverConfig && coverImg) {
      try {
        const b64 = getCreativeBase64(coverImg);
        if (b64) {
          const imgX = margin + 5;
          const imgY = (ph - coverConfig.h) / 2 - 20;
          doc.addImage(b64, 'JPEG', imgX, imgY, coverConfig.w, coverConfig.h);
          textStartX = margin + coverConfig.w + 25 + (pw - margin - coverConfig.w - 25) / 2;
        }
      } catch(e) { /* fallback to centered text */ }
    }

    // Title text
    doc.setFont('times', 'bolditalic');
    doc.setFontSize(28);
    doc.setTextColor(30, 30, 30);
    doc.text(reportData.client.name, textStartX, ph / 2 - 25, { align: 'center' });

    doc.setFontSize(20);
    doc.setFont('times', 'italic');
    doc.text('Digital oglašavanje', textStartX, ph / 2 - 5, { align: 'center' });

    doc.setFontSize(22);
    doc.setFont('times', 'bolditalic');
    doc.text(`${reportData.monthLabel}.`, textStartX, ph / 2 + 20, { align: 'center' });

    // ========= PAGE 2: EXECUTIVE SUMMARY =========
    doc.addPage();
    doc.setFillColor(232, 228, 222);
    doc.rect(0, 0, pw, ph, 'F');

    let y = margin + 5;
    const summaryText = generateExecutiveSummary(reportData);
    const lines = summaryText.split('\n');

    doc.setFont('times', 'normal');
    doc.setFontSize(12);
    doc.setTextColor(30, 30, 30);

    lines.forEach(line => {
      if (line.trim() === '') { y += 4; return; }

      const platformNames = Object.values(REPORT_PLATFORM_NAMES);
      let isBold = false;
      for (const pn of platformNames) {
        if (line.startsWith(pn)) { isBold = true; break; }
      }

      if (line.startsWith('U ')) {
        doc.setFont('times', 'normal');
        const wrapped = doc.splitTextToSize(line, cw);
        wrapped.forEach(wl => { doc.text(wl, margin, y); y += 6; });
      } else if (line.startsWith('- ')) {
        doc.setFont('times', 'normal');
        doc.text(line, margin, y);
        y += 6;
      } else if (isBold) {
        const wrapped = doc.splitTextToSize(line, cw);
        doc.setFont('times', 'bold');
        wrapped.forEach((wl, i) => {
          if (i === 0) {
            doc.setFont('times', 'bold');
            const boldEnd = line.indexOf(' kampanje');
            if (boldEnd > 0) {
              const boldPart = line.substring(0, boldEnd);
              const rest = line.substring(boldEnd);
              doc.text(boldPart, margin, y);
              const boldWidth = doc.getTextWidth(boldPart);
              doc.setFont('times', 'normal');
              const restWrapped = doc.splitTextToSize(rest, cw - boldWidth);
              doc.text(restWrapped[0], margin + boldWidth, y);
              y += 6;
              if (restWrapped.length > 1) {
                for (let j = 1; j < restWrapped.length; j++) { doc.text(restWrapped[j], margin, y); y += 6; }
              }
            } else { doc.text(wl, margin, y); y += 6; }
          } else { doc.setFont('times', 'normal'); doc.text(wl, margin, y); y += 6; }
        });
      } else {
        doc.setFont('times', 'normal');
        const wrapped = doc.splitTextToSize(line, cw);
        wrapped.forEach(wl => { doc.text(wl, margin, y); y += 6; });
      }
    });

    // ========= PAGES 3+: PER-PLATFORM SECTIONS =========
    for (const [platform, data] of Object.entries(reportData.platforms)) {
      doc.addPage();
      doc.setFillColor(232, 228, 222);
      doc.rect(0, 0, pw, ph, 'F');
      y = margin;

      const platName = REPORT_PLATFORM_NAMES[platform] || PLATFORM_NAMES[platform];
      const colConfig = REPORT_METRIC_COLS[platform] || REPORT_METRIC_COLS.google_ads;

      // Platform title
      doc.setFont('times', 'bolditalic');
      doc.setFontSize(16);
      doc.setTextColor(30, 30, 30);
      doc.text(`${platName} ${reportData.monthLabel}.`, margin, y + 6);

      // Date range badge
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

      // Campaign table
      const cols = colConfig.cols;
      const headLabels = cols.map(c => {
        if (c === 'campaign') return colConfig.label;
        return REPORT_COL_LABELS[c] || METRIC_LABELS[c] || c;
      });

      const tableBody = data.campaigns.map(row => {
        return cols.map(c => {
          if (c === 'campaign') return row.campaign || row.insertion_order || 'Unknown';
          return fmtMetric(c, row[c], currency);
        });
      });

      // Total row
      const totalRow = cols.map(c => {
        if (c === 'campaign') return 'Total';
        return fmtMetric(c, data.totals[c], currency);
      });
      tableBody.push(totalRow);

      doc.autoTable({
        startY: y,
        head: [headLabels],
        body: tableBody,
        margin: { left: margin, right: margin },
        styles: { fontSize: 9, cellPadding: 3, font: 'helvetica', textColor: [30, 30, 30], lineColor: [200, 195, 185], lineWidth: 0.3 },
        headStyles: { fillColor: [240, 200, 0], textColor: [30, 30, 30], fontStyle: 'bold', lineWidth: 0 },
        bodyStyles: { fillColor: [255, 255, 255] },
        alternateRowStyles: { fillColor: [248, 245, 240] },
        didParseCell: function(hookData) {
          if (hookData.row.index === tableBody.length - 1 && hookData.section === 'body') {
            hookData.cell.styles.fontStyle = 'bold';
          }
        },
        theme: 'grid'
      });

      y = doc.lastAutoTable.finalY + 10;

      // Narrative text
      const narrative = generatePlatformNarrative(platform, data, reportData);
      doc.setFont('times', 'normal');
      doc.setFontSize(11);
      doc.setTextColor(30, 30, 30);

      const narrativeLines = narrative.split('\n');
      narrativeLines.forEach(line => {
        if (line.trim() === '') { y += 3; return; }
        const wrapped = doc.splitTextToSize(line, cw);
        wrapped.forEach(wl => {
          if (y > ph - margin) { doc.addPage(); doc.setFillColor(232, 228, 222); doc.rect(0, 0, pw, ph, 'F'); y = margin; }
          doc.text(wl, margin, y, { align: 'justify', maxWidth: cw });
          y += 5.5;
        });
        y += 2;
      });

      // Creatives from folder
      const creativeConfig = CREATIVES_CONFIG[reportData.clientId]?.[platform];
      if (creativeConfig && creativeConfig.images.length > 0) {
        const imgW = creativeConfig.w;
        const imgH = creativeConfig.h;
        const gap = 8;
        const totalW = creativeConfig.images.length * imgW + (creativeConfig.images.length - 1) * gap;
        const startX = totalW <= cw ? margin + (cw - totalW) / 2 : margin;

        y += 8;
        if (y + imgH > ph - margin) { doc.addPage(); doc.setFillColor(232, 228, 222); doc.rect(0, 0, pw, ph, 'F'); y = margin; }

        let imgX = startX;
        creativeConfig.images.forEach((src, i) => {
          const cached = _creativeImgCache[`creative_${reportData.clientId}_${platform}_${i}`];
          if (cached) {
            try {
              const b64 = getCreativeBase64(cached);
              if (b64) {
                if (imgX + imgW > pw - margin) {
                  imgX = startX;
                  y += imgH + gap;
                  if (y + imgH > ph - margin) { doc.addPage(); doc.setFillColor(232, 228, 222); doc.rect(0, 0, pw, ph, 'F'); y = margin; }
                }
                doc.addImage(b64, 'JPEG', imgX, y, imgW, imgH);
                imgX += imgW + gap;
              }
            } catch(e) { /* skip */ }
          }
        });
        y += imgH + 5;
      }
    }

    // Save PDF
    const filename = `${reportData.clientId}_izvestaj_${reportData.reportMonth}.pdf`;
    doc.save(filename);
    notify(`Izveštaj preuzet: ${filename}`);

  } catch (err) {
    console.error('Report generation error:', err);
    notify('Greška pri generisanju izveštaja: ' + err.message, 'error');
  } finally {
    btn.textContent = origText;
    btn.disabled = false;
  }
}
