// ============== CREATIVES (FOLDER-BASED) ==============
const CREATIVES_CONFIG = {
  krka: {
    cover: { image: 'creatives/krka/cover.jpg', w: 110, h: 85 },
    thanks: { image: 'creatives/krka/thanks.jpg', w: 120, h: 80 },
    google_ads: {
      images: ['creatives/krka/google_ads_1.jpg', 'creatives/krka/google_ads_2.jpg', 'creatives/krka/google_ads_3.jpg'],
      w: 50, h: 65
    },
    meta: {
      images: ['creatives/krka/meta_1.jpg'],
      w: 170, h: 60
    },
    dv360: {
      images: ['creatives/krka/dv360_1.jpg'],
      w: 80, h: 50
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
    return canvas.toDataURL('image/jpeg', 0.85);
  } catch(e) { return null; }
}

setTimeout(preloadCreatives, 500);

// ============== REPORT CONFIG ==============
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
  const l = getMonthLabel(monthStr);
  return l.charAt(0).toUpperCase() + l.slice(1);
}

// ============== DATA COLLECTION ==============
function collectReportData(clientId) {
  const client = CLIENTS[clientId];
  const reportMonth = getReportMonth();
  const [ry, rm] = reportMonth.split('-').map(Number);
  const prevMonth = `${rm === 1 ? ry - 1 : ry}-${String(rm === 1 ? 12 : rm - 1).padStart(2, '0')}`;

  const reportData = { client, clientId, reportMonth, prevMonth, monthLabel: getMonthLabelCapital(reportMonth), platforms: {} };

  client.platforms.forEach(platform => {
    const setup = client.setup[platform];
    if (!setup || setup.type === 'ga4_kpi') return;

    const campaigns = aggregateByCampaign(getCampaignData(clientId, platform, reportMonth));
    const prevCampaigns = aggregateByCampaign(getCampaignData(clientId, platform, prevMonth));
    const budget = getBudget(clientId, platform, reportMonth);

    function sumTotals(camps) {
      const t = { impressions: 0, clicks: 0, spend: 0, reach: 0, conversions: 0, conv_value: 0 };
      camps.forEach(c => { t.impressions += c.impressions||0; t.clicks += c.clicks||0; t.spend += c.spend||0; t.reach += c.reach||0; t.conversions += c.conversions||0; t.conv_value += c.conv_value||0; });
      t.ctr = t.impressions > 0 ? t.clicks / t.impressions * 100 : 0;
      t.cpm = t.impressions > 0 ? t.spend / t.impressions * 1000 : 0;
      t.cpc = t.clicks > 0 ? t.spend / t.clicks : 0;
      t.cpa = t.conversions > 0 ? t.spend / t.conversions : 0;
      return t;
    }

    reportData.platforms[platform] = { setup, campaigns, totals: sumTotals(campaigns), prevTotals: sumTotals(prevCampaigns), budget };
  });

  return reportData;
}

// ============== TEXT GENERATION ==============
function generateExecutiveSummary(reportData) {
  const platformKeys = Object.keys(reportData.platforms);
  const channelNames = platformKeys.map(p => REPORT_PLATFORM_NAMES[p] || PLATFORM_NAMES[p]);
  const numWord = ['', 'jedan', 'dva', 'tri', 'cetiri', 'pet'][platformKeys.length] || platformKeys.length;

  let text = `U ${reportData.monthLabel.toLowerCase()}u je digitalno oglasavanje realizovano kroz ${numWord} kljucna kanala komunikacije:\n\n`;
  channelNames.forEach(n => { text += `- ${n}\n`; });
  text += '\n';

  platformKeys.forEach(platform => {
    const data = reportData.platforms[platform];
    const name = REPORT_PLATFORM_NAMES[platform] || PLATFORM_NAMES[platform];
    const t = data.totals;

    if (data.setup.type === 'performance') {
      text += `${name} kampanje ostvarile su ${fmt(t.conversions, 'number')} konverzija sa ukupnom vrednoscu od ${fmtMetric('conv_value', t.conv_value, reportData.client.currency)}, uz ulaganje od ${fmtMetric('spend', t.spend, reportData.client.currency)}`;
      if (t.cpa > 0) text += ` i prosecan CPA od ${fmtMetric('cpa', t.cpa, reportData.client.currency)}`;
      text += '.\n';
    } else {
      text += `${name} kampanje ostvarile su ${fmt(t.reach, 'number')} dosegnutih korisnika i ${fmt(t.impressions, 'number')} impresija, uz ${fmt(t.clicks, 'number')} klikova sa CTR-om od ${t.ctr.toFixed(2)}% i ukupnim ulaganjem od ${fmtMetric('spend', t.spend, reportData.client.currency)}.\n`;
    }
  });

  let totalSpend = 0;
  platformKeys.forEach(p => { totalSpend += reportData.platforms[p].totals.spend || 0; });
  text += `\nKombinovano, svi kanali su obezbedili balans izmedju volumena, vidljivosti i relevantnog saobracaja, uz ukupno ulaganje od ${fmtMetric('spend', totalSpend, reportData.client.currency)}.`;

  return text;
}

function generatePlatformNarrative(platform, data, reportData) {
  const name = REPORT_PLATFORM_NAMES[platform] || PLATFORM_NAMES[platform];
  const t = data.totals;
  const campaigns = data.campaigns;
  let text = '';

  if (data.setup.type === 'performance') {
    text += `Tekstualne kampanje u posmatranom periodu ostvarile su ukupno ${fmt(t.conversions, 'number')} konverzija sa vrednoscu od ${fmtMetric('conv_value', t.conv_value, reportData.client.currency)}, uz ulaganje od ${fmtMetric('spend', t.spend, reportData.client.currency)}.`;
  } else {
    text += `Kampanje na ${name} platformi tokom ${reportData.monthLabel.toLowerCase()}a ostvarile su stabilne rezultate, sa ukupno ${fmt(t.reach, 'number')} dosegnutih korisnika i ${fmt(t.impressions, 'number')} impresija, cime je obezbedjeno snazno prisustvo brenda.`;
  }

  if (campaigns.length > 1) {
    const sorted = [...campaigns].sort((a, b) => (b.impressions||0) - (a.impressions||0));
    const top = sorted[0];
    text += `\n${top.campaign || top.insertion_order} kampanja imala je kljucnu ulogu sa ${fmt(top.impressions, 'number')} impresija i ${fmt(top.clicks, 'number')} klikova.`;
    const bestCtr = [...campaigns].sort((a, b) => (b.ctr||0) - (a.ctr||0))[0];
    if (bestCtr.campaign !== top.campaign && bestCtr.ctr > 0) {
      text += ` Kampanja "${bestCtr.campaign || bestCtr.insertion_order}" se izdvaja sa najvisim CTR-om od ${bestCtr.ctr.toFixed(2)}%.`;
    }
  }

  text += `\nUkupno je ostvareno ${fmt(t.clicks, 'number')} klikova, uz prosecan CTR od ${t.ctr.toFixed(2)}%.`;

  if (data.budget > 0) {
    const util = (t.spend / data.budget * 100).toFixed(0);
    text += `\nSa ukupnim ulaganjem od ${fmtMetric('spend', t.spend, reportData.client.currency)}, kampanje su ostvarile dobar odnos budzeta i rezultata (iskoriscenje: ${util}%).`;
  } else {
    text += `\nSa ukupnim ulaganjem od ${fmtMetric('spend', t.spend, reportData.client.currency)}, kampanje su nesmetano emitovane tokom ${reportData.monthLabel.toLowerCase()}a.`;
  }

  return text;
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

// ============== MAIN GENERATE ==============
async function generateMonthlyReport() {
  if (!currentClient) return;
  const btn = document.getElementById('downloadReportBtn');
  const origText = btn.textContent;
  btn.textContent = 'Generisanje...';
  btn.disabled = true;

  try {
    if (!window.jspdf) { notify('jsPDF biblioteka nije ucitana. Osvezi stranicu.', 'error'); return; }

    const reportData = collectReportData(currentClient);
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const pw = 210, ph = 297, margin = 20;
    const cw = pw - 2 * margin;
    const currency = reportData.client.currency;

    // ========= PAGE 1: COVER =========
    pdfDrawBg(doc, pw, ph);

    const coverConfig = CREATIVES_CONFIG[reportData.clientId]?.cover;
    const coverImg = _creativeImgCache[`creative_${reportData.clientId}_cover`];
    const hasImage = coverConfig && coverImg;
    let imgRight = margin; // right edge of image

    if (hasImage) {
      try {
        const b64 = getCreativeBase64(coverImg);
        if (b64) {
          const imgX = margin;
          const imgY = (ph - coverConfig.h) / 2 - 15;
          doc.addImage(b64, 'JPEG', imgX, imgY, coverConfig.w, coverConfig.h);
          imgRight = imgX + coverConfig.w + 10;
        }
      } catch(e) { /* no image */ }
    }

    // Text area: right side of image, or full width centered
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

      // Check if line starts with a platform name (bold it)
      let boldPrefix = '';
      const platformNames = Object.values(REPORT_PLATFORM_NAMES);
      for (const pn of platformNames) {
        if (line.startsWith(pn)) { boldPrefix = pn; break; }
      }

      if (boldPrefix) {
        // Bold platform name + normal rest
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        const boldW = doc.getTextWidth(boldPrefix);
        const rest = line.substring(boldPrefix.length);

        // Wrap the whole line first, then render first part bold
        doc.setFont('helvetica', 'normal');
        const fullWrapped = doc.splitTextToSize(line, cw);

        fullWrapped.forEach((wl, idx) => {
          if (idx === 0) {
            doc.setFont('helvetica', 'bold');
            doc.text(boldPrefix, margin, y);
            doc.setFont('helvetica', 'normal');
            doc.text(rest.substring(0, wl.length - boldPrefix.length), margin + boldW, y);
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

      const platName = REPORT_PLATFORM_NAMES[platform] || PLATFORM_NAMES[platform];
      const colConfig = REPORT_METRIC_COLS[platform] || REPORT_METRIC_COLS.google_ads;

      // Title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(30, 30, 30);
      doc.text(`${platName} ${reportData.monthLabel}.`, margin, y + 6);

      // Date badge
      const [ry, rm] = reportData.reportMonth.split('-').map(Number);
      const lastDay = new Date(ry, rm, 0).getDate();
      const dateStr = `${reportData.reportMonth.replace('-', '/')}/01 - ${reportData.reportMonth.replace('-', '/')}/${String(lastDay).padStart(2,'0')}`;
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      const dateW = doc.getTextWidth(dateStr) + 10;
      doc.setFillColor(240, 200, 0);
      doc.roundedRect(pw - margin - dateW, y - 2, dateW, 12, 3, 3, 'F');
      doc.setTextColor(30, 30, 30);
      doc.text(dateStr, pw - margin - dateW + 5, y + 5);
      y += 18;

      // Table
      const cols = colConfig.cols;
      const headLabels = cols.map(c => c === 'campaign' ? colConfig.label : (REPORT_COL_LABELS[c] || c));

      const tableBody = data.campaigns.map(row => cols.map(c => {
        if (c === 'campaign') return row.campaign || row.insertion_order || 'Unknown';
        return fmtMetric(c, row[c], currency);
      }));
      tableBody.push(cols.map(c => c === 'campaign' ? 'Total' : fmtMetric(c, data.totals[c], currency)));

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
      y = doc.lastAutoTable.finalY + 10;

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
                doc.addImage(b64, 'JPEG', imgX, y, cc.w, cc.h);
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

    // Thanks image
    const thanksConfig = CREATIVES_CONFIG[reportData.clientId]?.thanks;
    const thanksImg = _creativeImgCache[`creative_${reportData.clientId}_thanks`];
    if (thanksConfig && thanksImg) {
      try {
        const b64 = getCreativeBase64(thanksImg);
        if (b64) {
          const ix = (pw - thanksConfig.w) / 2;
          doc.addImage(b64, 'JPEG', ix, 70, thanksConfig.w, thanksConfig.h);
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
