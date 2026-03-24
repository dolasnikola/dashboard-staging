// Krka Terme — thin wrapper around generic report engine
// Kept for backward compatibility. New clients use generateReport() directly.
import { generateReport } from './generator'

export async function generateMonthlyReport(clientId, onNotify, onProgress) {
  return generateReport(clientId || 'krka', onNotify, onProgress)
}
