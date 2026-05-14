/** Minimal RFC-style CSV parser for preview (handles quoted fields and commas). */
export function parseCsv(content: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false
  const s = content.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n")

  const flushRow = () => {
    row.push(field)
    rows.push(row)
    row = []
    field = ""
  }

  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
      continue
    }
    if (ch === ",") {
      row.push(field)
      field = ""
      continue
    }
    if (ch === "\n") {
      row.push(field)
      rows.push(row)
      row = []
      field = ""
      continue
    }
    field += ch
  }
  row.push(field)
  rows.push(row)
  return rows.filter((r) => r.some((c) => c !== ""))
}

export function isCsvPath(path: string): boolean {
  return path.toLowerCase().endsWith(".csv")
}
