/** Minimal RFC 4180 CSV parser/writer (quoted fields, embedded commas, quotes and newlines). */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ",") {
      row.push(field)
      field = ""
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++
      row.push(field)
      rows.push(row)
      row = []
      field = ""
    } else field += c
  }
  if (field !== "" || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""))
}

export function parseCsvObjects(text: string): Record<string, string>[] {
  const [header, ...rows] = parseCsv(text)
  if (!header) return []
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])))
}

/** CSV cell with formula-injection protection (cells opened in spreadsheet apps). */
export function csvCell(value: unknown): string {
  let s = value == null ? "" : String(value)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(header: string[], rows: object[]): string {
  const cell = (r: object, h: string) => csvCell((r as Record<string, unknown>)[h])
  return [header.map(csvCell).join(","), ...rows.map((r) => header.map((h) => cell(r, h)).join(","))].join("\r\n") + "\r\n"
}
