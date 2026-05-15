#!/usr/bin/env node
/**
 * Precompute approximate token counts and CSV shape / file size for each library file.
 * Token count matches the plaintext shape used by the chat API.
 * Writes public/library/library-token-meta.json. Run via package.json prebuild.
 */
const fs = require("fs")
const path = require("path")

const root = path.resolve(__dirname, "..")
const libDir = path.join(root, "public", "library")

function estimateTokensRough(text) {
  if (!text || !String(text).trim()) return 0
  return Math.max(1, Math.ceil(text.length / 4))
}

function buildPlaintext(name, relPath, content) {
  return `=== FILE: ${name} ===
Path: ${relPath}

--- CONTENT ---
${content}
--- END CONTENT ---`
}

/** RFC-style first line: commas separate fields; `"` toggles quoting; `""` inside quotes. */
function countCsvColumns(line) {
  if (!line || !line.length) return 0
  let i = 0
  let cols = 0
  let inQuotes = false
  while (i < line.length) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        i += 2
        continue
      }
      if (c === '"') {
        inQuotes = false
        i++
        continue
      }
      i++
      continue
    }
    if (c === '"') {
      inQuotes = true
      i++
      continue
    }
    if (c === ",") {
      cols++
      i++
      continue
    }
    i++
  }
  return cols + 1
}

function csvRowsAndColumns(content) {
  const lines = content.split(/\r?\n/).filter((l) => l.length > 0)
  if (lines.length === 0) return { rows: 0, columns: 0 }
  return {
    rows: Math.max(0, lines.length - 1),
    columns: countCsvColumns(lines[0]),
  }
}

function fileStatsForContent(absPath, content) {
  const lower = absPath.toLowerCase()
  if (lower.endsWith(".csv")) return csvRowsAndColumns(content)
  const lines = content.split(/\r?\n/).filter((l) => l.length > 0)
  return { rows: lines.length, columns: lines.length > 0 ? 1 : 0 }
}

function main() {
  const manifestPath = path.join(libDir, "manifest.json")
  if (!fs.existsSync(manifestPath)) {
    console.warn("No manifest.json; skipping library-token-meta generation")
    return
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  if (!Array.isArray(manifest)) {
    console.warn("manifest.json is not an array; skipping")
    return
  }
  const byManifestId = {}
  const byFilePath = {}
  const fileStats = {}
  for (const e of manifest) {
    if (!e || typeof e.path !== "string" || typeof e.id !== "string" || typeof e.name !== "string") continue
    if (e.path.includes("..")) continue
    const abs = path.join(libDir, e.path)
    if (!abs.startsWith(libDir)) continue
    if (!fs.existsSync(abs)) {
      console.warn("Missing file, skipping:", e.path)
      continue
    }
    const content = fs.readFileSync(abs, "utf8")
    const pt = buildPlaintext(e.name, e.path, content)
    const estimatedTokens = estimateTokensRough(pt)
    const { rows, columns } = fileStatsForContent(abs, content)
    const sizeBytes = fs.statSync(abs).size
    byManifestId[e.id] = estimatedTokens
    byFilePath[e.path] = estimatedTokens
    fileStats[e.path] = { estimatedTokens, rows, columns, sizeBytes }
  }
  const out = {
    version: 2,
    method: "chars/4 (approx)",
    byManifestId,
    byFilePath,
    fileStats,
  }
  fs.writeFileSync(path.join(libDir, "library-token-meta.json"), JSON.stringify(out, null, 2) + "\n")
  console.log("Wrote public/library/library-token-meta.json")
}

main()
