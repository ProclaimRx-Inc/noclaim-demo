import { isCsvPath, parseCsv } from "@/lib/csv-parse"

function escapeMdTableCell(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim()
}

function rowsToMarkdownTable(rows: string[][]): string {
  if (rows.length === 0) return "_No rows._\n"
  const header = rows[0]!.map(escapeMdTableCell)
  const sep = header.map(() => "---")
  const lines = [
    `| ${header.join(" | ")} |`,
    `| ${sep.join(" | ")} |`,
    ...rows.slice(1).map((r) => {
      const cells = r.map((c, j) => escapeMdTableCell(c ?? ""))
      while (cells.length < header.length) cells.push("")
      if (cells.length > header.length) cells.splice(header.length)
      return `| ${cells.join(" | ")} |`
    }),
  ]
  return `${lines.join("\n")}\n`
}

/** Markdown for the preview dialog: heading + CSV table or fenced raw content. */
export function buildLibraryPreviewMarkdown(fileName: string, path: string, content: string): string {
  const title = fileName.trim() || path
  const body = content.trimEnd()
  if (!body) return `# ${title}\n\n_(empty file)_\n`

  if (isCsvPath(path)) {
    const rows = parseCsv(body)
    if (rows.length === 0) return `# ${title}\n\n_(could not parse CSV)_\n`
    return `# ${title}\n\n${rowsToMarkdownTable(rows)}`
  }

  return `# ${title}\n\n\`\`\`\n${body.replace(/\n```/g, "\n```\u200b")}\n\`\`\`\n`
}
