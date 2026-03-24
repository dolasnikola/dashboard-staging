// Generic Report Narratives API
// Generates AI narrative texts for any client's monthly report.
// Receives campaign data + client context, returns JSON with per-platform narratives.

const BASE_SYSTEM_PROMPT = `Ti si digitalni marketing analiticar koji pise mesecne izvestaje o performansama kampanja.

PRAVILA:
- Pisi na srpskom jeziku, koristeci ASCII latinicu (bez dijakritika: koristi "s" umesto "š", "c" umesto "č"/"ć", "z" umesto "ž", "dj" umesto "đ")
- Budi profesionalan ali pristupacan
- Koristi KONKRETNE brojeve iz podataka - ne izmisljaj podatke
- Svaka sekcija treba da ima 3-5 kratkih paragrafa
- Razdvajaj paragrafe sa \\n\\n
- NE koristi markdown formatiranje (bez *, **, #, itd.)
- Brojeve formatiraj sa tackama za hiljade (npr. 1.234.567) i zarezom za decimale (npr. 2,45%)
- Budzet formatiraj sa EUR oznakom (npr. 1.234,56 EUR)`

function buildSystemPrompt(clientName, promptContext, platformKeys) {
  let prompt = BASE_SYSTEM_PROMPT

  if (clientName || promptContext) {
    prompt += `\n\nKONTEKST KLIJENTA:`
    if (clientName) prompt += `\n- Klijent: ${clientName}`
    if (promptContext) prompt += `\n- ${promptContext}`
  }

  // Build dynamic response structure
  const responseObj = { executiveSummary: 'tekst executive summary-ja' }
  platformKeys.forEach(key => {
    responseObj[key] = `tekst za ${key} platformu`
  })

  prompt += `\n\nVrati odgovor ISKLJUCIVO kao validan JSON objekat sa ovom strukturom:\n${JSON.stringify(responseObj, null, 2)}`

  prompt += `\n\nZa EXECUTIVE SUMMARY:
- Pocni sa pregledom kroz koje kanale je realizovano oglasavanje
- Za svaki kanal navedi kljucne metrike (impresije, klikovi, CTR, budzet)
- Zavrsi sa ukupnim ulaganjem i generalnim zakljuckom o performansama

Za SVAKU PLATFORMU:
- Analiziraj ukupne rezultate (impresije, klikovi, CTR, budzet)
- Izdvoj najbolje kampanje po impresijama i po CTR-u
- Daj kratak zakljucak o efikasnosti platforme
- Ako platforma ima reach podatke, ukljuci ih u analizu
- Ako platforma ima CPM podatke, komentarisi cost-efficiency`

  return prompt
}

function buildUserPrompt(reportData) {
  const { monthLabel, platforms } = reportData
  let prompt = `Generisi narativne tekstove za mesecni izvestaj za ${monthLabel}.\n\nPodaci o kampanjama:\n\n`

  for (const [key, platform] of Object.entries(platforms)) {
    const label = platform.label || key.toUpperCase()
    prompt += `${label}:\nKampanje:\n`

    platform.campaigns.forEach(c => {
      let line = `- ${c.campaign}: ${c.impressions} impresija, ${c.clicks} klikova, CTR ${c.ctr.toFixed(2)}%, budzet ${c.spend.toFixed(2)} EUR`
      if (c.reach) line = `- ${c.campaign}: reach ${c.reach}, ${c.impressions} impresija, ${c.clicks} klikova, CTR ${c.ctr.toFixed(2)}%, budzet ${c.spend.toFixed(2)} EUR`
      if (c.cpm) line += `, CPM ${c.cpm.toFixed(2)} EUR`
      prompt += line + '\n'
    })

    if (platform.insertionOrders && platform.insertionOrders.length > 0) {
      prompt += `Insertion Orders:\n`
      platform.insertionOrders.forEach(io => {
        prompt += `- ${io.campaign}: ${io.impressions} impresija, ${io.clicks} klikova, CTR ${io.ctr.toFixed(2)}%, CPM ${io.cpm.toFixed(2)} EUR, budzet ${io.spend.toFixed(2)} EUR\n`
      })
    }

    const t = platform.totals
    let totalLine = `Ukupno: ${t.impressions} impresija, ${t.clicks} klikova, CTR ${t.ctr.toFixed(2)}%, budzet ${t.spend.toFixed(2)} EUR`
    if (t.reach) totalLine = `Ukupno: reach ${t.reach}, ${t.impressions} impresija, ${t.clicks} klikova, CTR ${t.ctr.toFixed(2)}%, budzet ${t.spend.toFixed(2)} EUR`
    if (t.cpm) totalLine += `, CPM ${t.cpm.toFixed(2)} EUR`
    prompt += totalLine + '\n\n'
  }

  let totalSpend = 0
  Object.values(platforms).forEach(p => { totalSpend += p.totals.spend || 0 })
  prompt += `Ukupno ulaganje na svim platformama: ${totalSpend.toFixed(2)} EUR`

  return prompt
}

function corsHeaders(origin, allowedOrigin) {
  return {
    'Access-Control-Allow-Origin': allowedOrigin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  }
}

export default {
  async fetch(request, env) {
    const headers = corsHeaders(request.headers.get('Origin'), env.ALLOWED_ORIGIN)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers })
    }
    if (request.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405, headers })
    }

    try {
      const body = await request.json()
      const { clientId, clientName, promptContext, reportMonth, reportData } = body

      if (!clientId || !reportMonth || !reportData) {
        return Response.json({ error: 'Missing required fields: clientId, reportMonth, reportData' }, { status: 400, headers })
      }

      const platformKeys = Object.keys(reportData.platforms || {})
      if (platformKeys.length === 0) {
        return Response.json({ error: 'No platform data provided' }, { status: 400, headers })
      }

      const systemPrompt = buildSystemPrompt(clientName, promptContext, platformKeys)
      const userPrompt = buildUserPrompt(reportData)

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
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }]
        })
      })

      if (!claudeResponse.ok) {
        let errText = ''
        try { errText = await claudeResponse.text() } catch (e) { errText = 'Could not read error body' }
        console.error('Claude API error:', claudeResponse.status, errText)
        return Response.json({ error: 'Claude API error', status: claudeResponse.status }, { status: 502, headers })
      }

      const claudeData = await claudeResponse.json()
      const textContent = claudeData.content?.[0]?.text
      if (!textContent) {
        return Response.json({ error: 'Empty response from Claude' }, { status: 502, headers })
      }

      let narratives
      try {
        const jsonMatch = textContent.match(/\{[\s\S]*\}/)
        if (!jsonMatch) throw new Error('No JSON found in response')
        narratives = JSON.parse(jsonMatch[0])
      } catch (parseErr) {
        console.error('Failed to parse Claude response:', textContent)
        return Response.json({ error: 'Failed to parse AI response' }, { status: 502, headers })
      }

      // Validate that executiveSummary exists + at least one platform key
      if (typeof narratives.executiveSummary !== 'string') {
        return Response.json({ error: 'Missing narrative key: executiveSummary' }, { status: 502, headers })
      }

      return Response.json({ cached: false, narratives }, { status: 200, headers })
    } catch (err) {
      console.error('Worker error:', err)
      return Response.json({ error: 'Internal server error: ' + err.message }, { status: 500, headers })
    }
  }
}
