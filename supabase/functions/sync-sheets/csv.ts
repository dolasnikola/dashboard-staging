// Direct port from data.js:112-142

export function parseCSV(
  text: string
): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = parseCSVLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = parseCSVLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h.trim()] = vals[idx] ? vals[idx].trim() : "";
    });
    rows.push(row);
  }
  return { headers: headers.map((h) => h.trim()), rows };
}

export function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    if (inQuotes) {
      if (line[i] === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (line[i] === '"') {
        inQuotes = false;
      } else {
        current += line[i];
      }
    } else {
      if (line[i] === '"') {
        inQuotes = true;
      } else if (line[i] === ",") {
        result.push(current);
        current = "";
      } else {
        current += line[i];
      }
    }
  }
  result.push(current);
  return result;
}
