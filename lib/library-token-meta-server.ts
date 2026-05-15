import { existsSync, readFileSync } from "fs"
import { join } from "path"
import type { LibraryFileStats } from "@/lib/types"

type TokenMetaJson = {
  fileStats?: Record<string, LibraryFileStats>
}

export function readLibraryFileStatsFromDisk(): Record<string, LibraryFileStats> {
  const p = join(process.cwd(), "public", "library", "library-token-meta.json")
  if (!existsSync(p)) return {}
  try {
    const data = JSON.parse(readFileSync(p, "utf8")) as TokenMetaJson
    if (!data.fileStats || typeof data.fileStats !== "object") return {}
    return data.fileStats
  } catch {
    return {}
  }
}
