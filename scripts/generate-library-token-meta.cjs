#!/usr/bin/env node
/**
 * Precompute approximate token counts for each library file (same plaintext shape as the chat API).
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
    const t = estimateTokensRough(pt)
    byManifestId[e.id] = t
    byFilePath[e.path] = t
  }
  const out = {
    version: 1,
    method: "chars/4 (approx)",
    byManifestId,
    byFilePath,
  }
  fs.writeFileSync(path.join(libDir, "library-token-meta.json"), JSON.stringify(out, null, 2) + "\n")
  console.log("Wrote public/library/library-token-meta.json")
}

main()
