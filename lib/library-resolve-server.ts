import { existsSync, readFileSync } from "fs"
import { join, normalize, relative, resolve } from "path"
import {
  formatBlockedLibrarySelectionMessage,
  isLibraryFileBlockedByEstimatedTokens,
} from "@/lib/library-file-token-policy"
import { readLibraryFileStatsFromDisk } from "@/lib/library-token-meta-server"
import type { LibraryManifestEntry } from "@/lib/types"
import { buildPlaintextForLibraryFile } from "@/lib/preview-plaintext"

const LIBRARY_ROOT = resolve(process.cwd(), "public", "library")

function safeResolvedFilePath(relPath: string): string | null {
  if (!relPath || relPath.includes("..")) return null
  const abs = resolve(LIBRARY_ROOT, normalize(relPath))
  const rel = relative(LIBRARY_ROOT, abs)
  if (rel.startsWith("..") || rel.startsWith("/")) return null
  if (rel === "") return null
  return abs
}

export function readLibraryManifestFromDisk(): LibraryManifestEntry[] {
  const p = join(LIBRARY_ROOT, "manifest.json")
  if (!existsSync(p)) return []
  try {
    const data = JSON.parse(readFileSync(p, "utf8")) as unknown
    if (!Array.isArray(data)) return []
    return data.filter(
      (x): x is LibraryManifestEntry =>
        !!x &&
        typeof x === "object" &&
        typeof (x as LibraryManifestEntry).id === "string" &&
        typeof (x as LibraryManifestEntry).name === "string" &&
        typeof (x as LibraryManifestEntry).path === "string"
    )
  } catch {
    return []
  }
}

export function getLibrarySelectionBlockMessage(ids: string[]): string | null {
  if (!Array.isArray(ids) || ids.length === 0) return null
  const manifest = readLibraryManifestFromDisk()
  const stats = readLibraryFileStatsFromDisk()
  const byId = new Map(manifest.map((e) => [e.id, e]))
  const names: string[] = []
  for (const id of ids) {
    const entry = byId.get(id)
    if (!entry) continue
    if (isLibraryFileBlockedByEstimatedTokens(stats[entry.path])) names.push(entry.name)
  }
  if (names.length === 0) return null
  return formatBlockedLibrarySelectionMessage(names)
}

export function resolveLibraryPlaintextFilesByIds(ids: string[]): { name: string; plaintext: string }[] {
  if (!Array.isArray(ids) || ids.length === 0) return []
  const manifest = readLibraryManifestFromDisk()
  const byId = new Map(manifest.map((e) => [e.id, e]))
  const out: { name: string; plaintext: string }[] = []
  for (const id of ids) {
    const entry = byId.get(id)
    if (!entry) continue
    const abs = safeResolvedFilePath(entry.path)
    if (!abs || !existsSync(abs)) continue
    const content = readFileSync(abs, "utf8")
    out.push({ name: entry.name, plaintext: buildPlaintextForLibraryFile(entry.name, entry.path, content) })
  }
  return out
}
