#!/usr/bin/env node
/**
 * Precompute approximate token counts and CSV shape / file size for each library file.
 * Token count matches the plaintext shape used by the chat API.
 * Also records each CSV's detected date range (dateRange) so the UI can show the time
 * frame for every file, and merges per-file force-truncation metadata from
 * library-truncation.json (written by scripts/force_truncate_library.py) so the UI can
 * show "truncated to <time frame> to fit ~500k tokens".
 * Legacy fallback: files over ~1M estimated tokens with no truncation entry are cut to
 * the header plus 100 data rows, with display stats frozen in library-full-file-stats.json.
 * Writes public/library/library-token-meta.json. Run via package.json prebuild.
 */
const fs = require("fs")
const path = require("path")

const libDir = path.join(path.resolve(__dirname, ".."), "public", "library")
const OVERRIDES_PATH = path.join(libDir, "library-full-file-stats.json")
const TRUNCATION_PATH = path.join(libDir, "library-truncation.json")
/** Same threshold as lib/library-file-token-policy.ts */
const TOKEN_TRUNCATE_THRESHOLD = 1_000_000
const MAX_CSV_DATA_ROWS = 100

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

function loadOverrides() {
  if (!fs.existsSync(OVERRIDES_PATH)) return {}
  try {
    const j = JSON.parse(fs.readFileSync(OVERRIDES_PATH, "utf8"))
    return typeof j === "object" && j !== null && !Array.isArray(j) ? j : {}
  } catch {
    return {}
  }
}

function saveOverrides(obj) {
  fs.writeFileSync(OVERRIDES_PATH, JSON.stringify(obj, null, 2) + "\n")
}

/** Return new content or null if no truncation needed. */
function truncateCsvToMaxDataRows(content, maxDataRows) {
  const lines = content.split(/\r?\n/)
  if (lines.length <= maxDataRows + 1) return null
  const kept = lines.slice(0, maxDataRows + 1)
  return kept.join("\n") + "\n"
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

/** RFC-style split of a single CSV line into field strings. */
function parseCsvLine(line) {
  const out = []
  let field = ""
  let i = 0
  let inQuotes = false
  while (i < line.length) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        field += '"'
        i += 2
        continue
      }
      if (c === '"') {
        inQuotes = false
        i++
        continue
      }
      field += c
      i++
      continue
    }
    if (c === '"') {
      inQuotes = true
      i++
      continue
    }
    if (c === ",") {
      out.push(field)
      field = ""
      i++
      continue
    }
    field += c
    i++
  }
  out.push(field)
  return out
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/

/**
 * Detect the primary date column and its min/max range for a CSV.
 * Picks the first header column whose name looks date-ish and whose values parse
 * as YYYY-MM-DD. Returns { column, start, end } or null. ISO dates sort lexically.
 */
function detectDateRange(content) {
  const lines = content.split(/\r?\n/).filter((l) => l.length > 0)
  if (lines.length < 2) return null
  const header = parseCsvLine(lines[0])
  const candidates = header
    .map((name, idx) => ({ name, idx }))
    .filter((c) => /date|datetime/i.test(c.name))
  for (const cand of candidates) {
    let min = null
    let max = null
    for (let r = 1; r < lines.length; r++) {
      const fields = parseCsvLine(lines[r])
      const v = (fields[cand.idx] || "").trim()
      if (!ISO_DATE.test(v)) continue
      const d = v.slice(0, 10)
      if (min === null || d < min) min = d
      if (max === null || d > max) max = d
    }
    if (min !== null) return { column: cand.name, start: min, end: max }
  }
  return null
}

function loadTruncation() {
  if (!fs.existsSync(TRUNCATION_PATH)) return {}
  try {
    const j = JSON.parse(fs.readFileSync(TRUNCATION_PATH, "utf8"))
    return typeof j === "object" && j !== null && !Array.isArray(j) ? j : {}
  } catch {
    return {}
  }
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

  const manifestPaths = new Set(
    manifest.map((e) => (e && typeof e.path === "string" ? e.path : null)).filter(Boolean)
  )
  const overrides = loadOverrides()
  for (const k of Object.keys(overrides)) {
    if (!manifestPaths.has(k)) delete overrides[k]
  }
  const overridesAfterPrune = JSON.stringify(overrides)
  const truncation = loadTruncation()

  let metaExisting = null
  const metaPath = path.join(libDir, "library-token-meta.json")
  if (fs.existsSync(metaPath)) {
    try {
      metaExisting = JSON.parse(fs.readFileSync(metaPath, "utf8"))
    } catch {
      metaExisting = null
    }
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

    if (overrides[e.path]) {
      // Truncated preview on disk; the real file is too large to send. Keep only the
      // full-file estimatedTokens (no per-model provider counts) so the UI keeps showing
      // the "over context limit" error state for these files.
      const o = overrides[e.path]
      byManifestId[e.id] = o.estimatedTokens
      byFilePath[e.path] = o.estimatedTokens
      fileStats[e.path] = {
        estimatedTokens: o.estimatedTokens,
        rows: o.rows,
        columns: o.columns,
        sizeBytes: o.sizeBytes,
      }
      continue
    }

    const content = fs.readFileSync(abs, "utf8")
    const sizeBytes = fs.statSync(abs).size
    const { rows, columns } = fileStatsForContent(abs, content)
    const pt = buildPlaintext(e.name, e.path, content)
    const estimatedTokens = estimateTokensRough(pt)
    const fullStats = { estimatedTokens, rows, columns, sizeBytes }

    if (estimatedTokens > TOKEN_TRUNCATE_THRESHOLD && e.path.toLowerCase().endsWith(".csv")) {
      const truncated = truncateCsvToMaxDataRows(content, MAX_CSV_DATA_ROWS)
      if (truncated !== null) {
        fs.writeFileSync(abs, truncated, "utf8")
        overrides[e.path] = fullStats
        console.warn("Truncated oversized library CSV to", MAX_CSV_DATA_ROWS, "data rows:", e.path)
      }
    }

    byManifestId[e.id] = fullStats.estimatedTokens
    byFilePath[e.path] = fullStats.estimatedTokens
    const existing = metaExisting?.fileStats?.[e.path]
    const dateRange = e.path.toLowerCase().endsWith(".csv") ? detectDateRange(content) : null
    const trunc = truncation[e.path]
    fileStats[e.path] = {
      ...fullStats,
      ...(existing?.libraryPromptTokensByModel
        ? { libraryPromptTokensByModel: existing.libraryPromptTokensByModel }
        : {}),
      ...(typeof existing?.maxLibraryPromptTokens === "number"
        ? { maxLibraryPromptTokens: existing.maxLibraryPromptTokens }
        : {}),
      ...(dateRange ? { dateRange } : {}),
      ...(trunc
        ? {
            truncation: {
              strategy: trunc.strategy,
              budgetTokens: trunc.budgetTokens,
              dateColumn: trunc.dateColumn ?? null,
              timeFrame: trunc.timeFrame ?? null,
              keyRange: trunc.keyRange ?? null,
              full: trunc.full,
            },
          }
        : {}),
    }
  }

  if (JSON.stringify(overrides) !== overridesAfterPrune) {
    saveOverrides(overrides)
    console.log("Wrote public/library/library-full-file-stats.json")
  }

  const out = {
    version: metaExisting?.version === 3 ? 3 : 2,
    method: metaExisting?.method || "chars/4 (approx)",
    ...(metaExisting?.fileSeparatorTokens ? { fileSeparatorTokens: metaExisting.fileSeparatorTokens } : {}),
    byManifestId,
    byFilePath,
    fileStats,
  }
  fs.writeFileSync(path.join(libDir, "library-token-meta.json"), JSON.stringify(out, null, 2) + "\n")
  console.log("Wrote public/library/library-token-meta.json")
}

main()
