const ALLOWED_CLIENTS = ['krka'];

const SYSTEM_PROMPT = `Ti si digitalni marketing analiticar koji pise mesecne izvestaje o performansama kampanja za srpskog klijenta iz turizma (Krka Terme).

PRAVILA:
- Pisi na srpskom jeziku, koristeci ASCII latinicu (bez dijakritika: koristi "s" umesto "š", "c" umesto "č"/"ć", "z" umesto "ž", "dj" umesto "đ")
- Budi profesionalan ali pristupacan
- Koristi KONKRETNE brojeve iz podataka - ne izmisljaj podatke
- Svaka sekcija treba da ima 3-5 kratkih paragrafa
- Razdvajaj paragrafe sa \\n\\n
- NE koristi markdown formatiranje (bez *, **, #, itd.)
- Brojeve formatiraj sa tackama za hiljade (npr. 1.234.567) i zarezom za decimale (npr. 2,45%)
- Budzet formatiraj sa EUR oznakom (npr. 1.234,56 EUR)

Vrati odgovor ISKLJUCIVO kao validan JSON objekat sa ovom strukturom:
{
  "executiveSummary": "tekst executive summary-ja",
  "google_ads": "tekst za Google Search platformu",
  "meta": "tekst za Meta (Facebook & Instagram) platformu",
  "dv360": "tekst za Google Display Network platformu"
}

Za EXECUTIVE SUMMARY:
- Pocni sa pregledom kroz koje kanale je realizovano oglasavanje
- Za svaki kanal navedi kljucne metrike (impresije, klikovi, CTR, budzet)
- Zavrsi sa ukupnim ulaganjem i generalnim zakljuckom o performansama

Za SVAKU PLATFORMU:
- Analiziraj ukupne rezultate (impresije, klikovi, CTR, budzet)
- Izdvoj najbolje kampanje po impresijama i po CTR-u
- Daj kratak zakljucak o efikasnosti platforme
- Ako platforma ima reach podatke, ukljuci ih u analizu
- Ako platforma ima CPM podatke, komentarisi cost-efficiency`;

function buildUserPrompt(reportData) {
  const { monthLabel, platforms } = reportData;
  let prompt = `Generisi narativne tekstove za mesecni izvestaj za ${monthLabel}.\n\nPodaci o kampanjama:\n\n`;

  // Google Ads
  if (platforms.google_ads) {
    const ga = platforms.google_ads;
    prompt += `GOOGLE SEARCH:\n`;
    prompt += `Kampanje:\n`;
    ga.campaigns.forEach(c => {
      prompt += `- ${c.campaign}: ${c.impressions} impresija, ${c.clicks} klikova, CTR ${c.ctr.toFixed(2)}%, budzet ${c.spend.toFixed(2)} EUR\n`;
    });
    const t = ga.totals;
    prompt += `Ukupno: ${t.impressions} impresija, ${t.clicks} klikova, CTR ${t.ctr.toFixed(2)}%, budzet ${t.spend.toFixed(2)} EUR\n\n`;
  }

  // Meta
  if (platforms.meta) {
    const meta = platforms.meta;
    prompt += `META (Facebook & Instagram):\n`;
    prompt += `Kampanje:\n`;
    meta.campaigns.forEach(c => {
      prompt += `- ${c.campaign}: reach ${c.reach}, ${c.impressions} impresija, ${c.clicks} klikova, CTR ${c.ctr.toFixed(2)}%, budzet ${c.spend.toFixed(2)} EUR\n`;
    });
    const t = meta.totals;
    prompt += `Ukupno: reach ${t.reach}, ${t.impressions} impresija, ${t.clicks} klikova, CTR ${t.ctr.toFixed(2)}%, budzet ${t.spend.toFixed(2)} EUR\n\n`;
  }

  // DV360
  if (platforms.dv360) {
    const dv = platforms.dv360;
    prompt += `GOOGLE DISPLAY NETWORK (DV360):\n`;
    prompt += `Kampanje:\n`;
    dv.campaigns.forEach(c => {
      prompt += `- ${c.campaign}: ${c.impressions} impresija, ${c.clicks} klikova, CTR ${c.ctr.toFixed(2)}%, CPM ${c.cpm.toFixed(2)} EUR, budzet ${c.spend.toFixed(2)} EUR\n`;
    });
    if (dv.insertionOrders && dv.insertionOrders.length > 0) {
      prompt += `Insertion Orders:\n`;
      dv.insertionOrders.forEach(io => {
        prompt += `- ${io.campaign}: ${io.impressions} impresija, ${io.clicks} klikova, CTR ${io.ctr.toFixed(2)}%, CPM ${io.cpm.toFixed(2)} EUR, budzet ${io.spend.toFixed(2)} EUR\n`;
      });
    }
    const t = dv.totals;
    prompt += `Ukupno: ${t.impressions} impresija, ${t.clicks} klikova, CTR ${t.ctr.toFixed(2)}%, CPM ${t.cpm.toFixed(2)} EUR, budzet ${t.spend.toFixed(2)} EUR\n\n`;
  }

  // Total spend
  let totalSpend = 0;
  Object.values(platforms).forEach(p => { totalSpend += p.totals.spend || 0; });
  prompt += `Ukupno ulaganje na svim platformama: ${totalSpend.toFixed(2)} EUR`;

  return prompt;
}

function corsHeaders(origin, allowedOrigin) {
  return {
    'Access-Control-Allow-Origin': allowedOrigin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

export default {
  async fetch(request, env) {
    const headers = corsHeaders(request.headers.get('Origin'), env.ALLOWED_ORIGIN);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    if (request.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405, headers });
    }

    try {
      const body = await request.json();
      const { clientId, reportMonth, reportData } = body;

      // Validate
      if (!clientId || !reportMonth || !reportData) {
        return Response.json({ error: 'Missing required fields: clientId, reportMonth, reportData' }, { status: 400, headers });
      }

      if (!ALLOWED_CLIENTS.includes(clientId)) {
        return Response.json({ error: 'Unknown client: ' + clientId }, { status: 400, headers });
      }

      // Call Claude API
      const userPrompt = buildUserPrompt(reportData);

      const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2000,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userPrompt }]
        })
      });

      if (!claudeResponse.ok) {
        const errText = await claudeResponse.text();
        console.error('Claude API error:', claudeResponse.status, errText);
        return Response.json({ error: 'Claude API error', status: claudeResponse.status }, { status: 502, headers });
      }

      const claudeData = await claudeResponse.json();
      const textContent = claudeData.content?.[0]?.text;

      if (!textContent) {
        return Response.json({ error: 'Empty response from Claude' }, { status: 502, headers });
      }

      // Parse JSON from Claude's response
      let narratives;
      try {
        // Extract JSON if wrapped in code block
        const jsonMatch = textContent.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON found in response');
        narratives = JSON.parse(jsonMatch[0]);
      } catch (parseErr) {
        console.error('Failed to parse Claude response:', textContent);
        return Response.json({ error: 'Failed to parse AI response' }, { status: 502, headers });
      }

      // Validate structure
      const required = ['executiveSummary', 'google_ads', 'meta', 'dv360'];
      for (const key of required) {
        if (typeof narratives[key] !== 'string') {
          return Response.json({ error: `Missing narrative key: ${key}` }, { status: 502, headers });
        }
      }

      return Response.json({
        cached: false,
        narratives
      }, { status: 200, headers });

    } catch (err) {
      console.error('Worker error:', err);
      return Response.json({ error: 'Internal server error: ' + err.message }, { status: 500, headers });
    }
  }
};
