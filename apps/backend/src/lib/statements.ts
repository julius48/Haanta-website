/** Vendor payout statements (CSV and PDF). Contain only vendor-safe data: no buyer details. */
import PDFDocument from "pdfkit"

export interface StatementLine {
  date: string
  order: string
  product: string
  type: string
  quantity: number
  amount_minor: number
}

export interface Statement {
  vendor_name: string
  payout_id: string
  paid_at: string
  bank_reference: string
  currency: string
  lines: StatementLine[]
  total_minor: number
}

const money = (minor: number, currency: string) => `${currency} ${(minor / 100).toFixed(2)}`

/** Prevent CSV/formula injection when statements are opened in spreadsheet apps. */
export function csvCell(value: string | number): string {
  let s = String(value)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function statementCsv(s: Statement): string {
  const rows: (string | number)[][] = [
    ["Haanta payout statement"],
    ["Vendor", s.vendor_name],
    ["Payout", s.payout_id],
    ["Paid on", s.paid_at],
    ["Bank reference", s.bank_reference],
    [],
    ["Date", "Order", "Product", "Type", "Quantity", `Amount (${s.currency})`],
    ...s.lines.map((l) => [l.date, l.order, l.product, l.type, l.quantity, (l.amount_minor / 100).toFixed(2)]),
    [],
    ["Total", "", "", "", "", (s.total_minor / 100).toFixed(2)],
  ]
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n"
}

export function statementPdf(s: Statement): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: `Haanta statement ${s.payout_id}`, Author: "Haanta" } })
    const chunks: Buffer[] = []
    doc.on("data", (c: Buffer) => chunks.push(c))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)
    doc.fontSize(20).text("Haanta", { continued: false })
    doc.fontSize(12).text("Payout statement").moveDown()
    doc.fontSize(10)
    doc.text(`Vendor: ${s.vendor_name}`)
    doc.text(`Payout: ${s.payout_id}`)
    doc.text(`Paid on: ${s.paid_at}`)
    doc.text(`Bank reference: ${s.bank_reference}`).moveDown()
    const cols = [48, 120, 190, 380, 440, 490]
    const header = ["Date", "Order", "Product", "Type", "Qty", "Amount"]
    const row = (cells: string[], bold = false) => {
      const y = doc.y
      doc.font(bold ? "Helvetica-Bold" : "Helvetica")
      cells.forEach((c, i) => doc.text(c, cols[i]!, y, { width: (cols[i + 1] ?? 560) - cols[i]! - 6, ellipsis: true }))
      doc.moveDown(0.4)
      if (doc.y > 760) doc.addPage()
    }
    row(header, true)
    for (const l of s.lines) row([l.date, l.order, l.product, l.type, String(l.quantity), money(l.amount_minor, s.currency)])
    doc.moveDown()
    row(["", "", "", "", "Total", money(s.total_minor, s.currency)], true)
    doc.end()
  })
}
