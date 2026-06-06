#!/usr/bin/env node
/**
 * One-time / on-demand: call OpenAI, Anthropic, and Gemini token-count APIs for each
 * library file and model. Merges results into public/library/library-token-meta.json.
 *
 * Requires API keys in .env (or env). Run after generate-library-token-meta.cjs when
 * library files change.
 *
 *   node scripts/precalculate-library-provider-tokens.mjs
 */
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const root = path.resolve(__dirname, "..")
const libDir = path.join(root, "public", "library")
const metaPath = path.join(libDir, "library-token-meta.json")

const FILE_SEPARATOR = "\n\n---\n\n"

const MODELS = [
  { id: "claude-opus-4-7", provider: "anthropic" },
  { id: "claude-sonnet-4-6", provider: "anthropic" },
  { id: "gpt-5.5", provider: "openai" },
  { id: "gpt-5.4-mini", provider: "openai" },
  { id: "gemini-3.1-flash-lite", provider: "gemini" },
  { id: "gemini-3.1-pro-preview", provider: "gemini" },
]

function loadEnvFile() {
  const envPath = path.join(root, ".env")
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = val
  }
}

function buildPlaintext(name, relPath, content) {
  return `=== FILE: ${name} ===
Path: ${relPath}

--- CONTENT ---
${content}
--- END CONTENT ---`
}

const PLACEHOLDER_USER_TURN = { role: "user", content: "." }

async function countAnthropic(apiKey, model, system, turns) {
  const Anthropic = (await import("@anthropic-ai/sdk")).default
  const client = new Anthropic({ apiKey })
  const safeTurns = turns.length > 0 ? turns : [PLACEHOLDER_USER_TURN]
  const res = await client.messages.countTokens({
    model,
    system: system.length > 0 ? system : undefined,
    messages: safeTurns.map((t) => ({ role: t.role, content: t.content })),
  })
  return res.input_tokens
}

async function countGemini(apiKey, modelId, system, turns) {
  const { GoogleGenerativeAI } = await import("@google/generative-ai")
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({
    model: modelId,
    systemInstruction: system.length > 0 ? system : undefined,
  })
  const contents =
    turns.length > 0
      ? turns.map((t) => ({
          role: t.role === "user" ? "user" : "model",
          parts: [{ text: t.content }],
        }))
      : [{ role: "user", parts: [{ text: "" }] }]
  const res = await model.countTokens({ contents })
  return res.totalTokens
}

async function countOpenAI(apiKey, model, system, turns) {
  const OpenAI = (await import("openai")).default
  const client = new OpenAI({ apiKey })
  const safeTurns = turns.length > 0 ? turns : [{ role: "user", content: "" }]
  const input = safeTurns.map((t) => ({ role: t.role, content: t.content }))
  try {
    const res = await client.responses.inputTokens.count({
      model,
      instructions: system.length > 0 ? system : undefined,
      input,
    })
    return res.input_tokens
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!system || !msg.includes("too long")) throw err
    const res = await client.responses.inputTokens.count({
      model,
      input: [{ role: "user", content: system }],
    })
    return res.input_tokens
  }
}

async function countForProvider(provider, apiKey, modelId, system, turns = []) {
  if (provider === "anthropic") return countAnthropic(apiKey, modelId, system, turns)
  if (provider === "gemini") return countGemini(apiKey, modelId, system, turns)
  return countOpenAI(apiKey, modelId, system, turns)
}

function apiKeys() {
  return {
    openai: process.env.OPENAI_API_KEY?.trim(),
    anthropic: process.env.ANTHROPIC_API_KEY?.trim(),
    gemini:
      process.env.GEMINI_API_KEY?.trim() ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
      process.env.GOOGLE_API_KEY?.trim(),
  }
}

function keyForProvider(provider, keys) {
  if (provider === "openai") return keys.openai
  if (provider === "anthropic") return keys.anthropic
  return keys.gemini
}

async function main() {
  loadEnvFile()
  const keys = apiKeys()
  const missing = MODELS.map((m) => m.provider)
    .filter((p, i, arr) => arr.indexOf(p) === i)
    .filter((p) => !keyForProvider(p, keys))
  if (missing.length > 0) {
    console.error("Missing API keys for:", missing.join(", "))
    process.exit(1)
  }

  const manifestPath = path.join(libDir, "manifest.json")
  if (!fs.existsSync(manifestPath)) {
    console.error("No manifest.json")
    process.exit(1)
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  if (!Array.isArray(manifest)) {
    console.error("manifest.json is not an array")
    process.exit(1)
  }

  let meta = { version: 2, method: "chars/4 (approx)", fileStats: {} }
  if (fs.existsSync(metaPath)) {
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, "utf8"))
    } catch {
      /* keep default */
    }
  }
  if (!meta.fileStats || typeof meta.fileStats !== "object") meta.fileStats = {}

  meta.version = 3
  meta.method = "provider precalc (offline) + chars/4 fallback"
  delete meta.modelSystemTokens
  delete meta.docPreambleTokens
  meta.fileSeparatorTokens = meta.fileSeparatorTokens || {}

  console.log("Counting library file separator tokens per model…")
  for (const { id: modelId, provider } of MODELS) {
    const apiKey = keyForProvider(provider, keys)
    try {
      meta.fileSeparatorTokens[modelId] = await countForProvider(
        provider,
        apiKey,
        modelId,
        FILE_SEPARATOR
      )
      console.log(`  ${modelId}: sep=${meta.fileSeparatorTokens[modelId]}`)
    } catch (err) {
      console.error(`  ${modelId} separator failed:`, err.message || err)
    }
  }

  for (const entry of manifest) {
    if (!entry?.path || !entry?.name || !entry?.id) continue
    if (entry.path.includes("..")) continue
    const abs = path.join(libDir, entry.path)
    if (!abs.startsWith(libDir) || !fs.existsSync(abs)) {
      console.warn("Missing file:", entry.path)
      continue
    }

    const content = fs.readFileSync(abs, "utf8")
    const plaintext = buildPlaintext(entry.name, entry.path, content)

    if (!meta.fileStats[entry.path]) {
      meta.fileStats[entry.path] = { estimatedTokens: 0, rows: 0, columns: 0, sizeBytes: 0 }
    }
    const stats = meta.fileStats[entry.path]
    stats.libraryPromptTokensByModel = stats.libraryPromptTokensByModel || {}

    console.log(`File ${entry.path}…`)
    for (const { id: modelId, provider } of MODELS) {
      const apiKey = keyForProvider(provider, keys)
      try {
        const n = await countForProvider(provider, apiKey, modelId, plaintext)
        stats.libraryPromptTokensByModel[modelId] = n
        console.log(`  ${modelId}: ${n.toLocaleString()}`)
      } catch (err) {
        console.error(`  ${modelId} failed:`, err.message || err)
      }
    }

    const vals = Object.values(stats.libraryPromptTokensByModel).filter((x) => typeof x === "number")
    if (vals.length > 0) stats.maxLibraryPromptTokens = Math.max(...vals)
  }

  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n")
  console.log("Wrote", metaPath)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
