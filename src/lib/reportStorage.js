import { sb } from './supabase'

export async function uploadReportPDF(blob, clientId, reportMonth, filename, reportConfigId, clientName) {
  const storagePath = `${clientId}/${reportMonth}/${filename}`

  const { error: uploadError } = await sb.storage
    .from('reports')
    .upload(storagePath, blob, {
      contentType: 'application/pdf',
      upsert: true
    })

  if (uploadError) {
    console.error('[uploadReportPDF] upload error:', uploadError.message)
    return null
  }

  const { data: urlData, error: urlError } = await sb.storage
    .from('reports')
    .createSignedUrl(storagePath, 31536000)

  if (urlError) {
    console.error('[uploadReportPDF] signedUrl error:', urlError.message)
    return null
  }

  const { data: { user } } = await sb.auth.getUser()

  const { error: dbError } = await sb.from('report_history').insert({
    client_id: clientId,
    report_config_id: reportConfigId,
    report_month: reportMonth,
    pdf_url: urlData.signedUrl,
    generated_by: user?.email || 'admin',
    status: 'approved'
  })

  if (dbError) {
    console.error('[uploadReportPDF] db error:', dbError.message)
    return null
  }

  // Create alert notification for all users with access to this client
  const displayName = clientName || clientId
  const [ry, rm] = reportMonth.split('-')
  const monthNames = ['januar','februar','mart','april','maj','jun','jul','avgust','septembar','oktobar','novembar','decembar']
  const monthLabel = monthNames[parseInt(rm) - 1] + ' ' + ry

  await sb.from('alerts').insert({
    client_id: clientId,
    alert_type: 'report_ready',
    severity: 'info',
    title: `Mesecni izvestaj za ${displayName} je spreman`,
    message: `Izvestaj za ${monthLabel} je generisan i spreman za preuzimanje u Reports tabu.`
  })

  return urlData.signedUrl
}

export function clearAINarrativeCache(clientId, reportMonth) {
  localStorage.removeItem(`reportNarrative_${clientId}_${reportMonth}`)
}
