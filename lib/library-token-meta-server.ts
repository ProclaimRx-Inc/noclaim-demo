import { existsSync, readFileSync } from "fs"
import { join } from "path"
import type { LibraryFileStats, LibraryTokenMeta } from "@/lib/types"

export function readLibraryTokenMetaFromDisk(): LibraryTokenMeta {
  const p = join(process.cwd(), "public", "library", "library-token-meta.json")
  if (!existsSync(p)) {
    return { fileStats: {} }
  }
  try {
    const data = JSON.parse(readFileSync(p, "utf8")) as LibraryTokenMeta
    if (!data.fileStats || typeof data.fileStats !== "object") {
      return { fileStats: {} }
    }
    return data
  } catch {
    return { fileStats: {} }
  }
}

export function readLibraryFileStatsFromDisk(): Record<string, LibraryFileStats> {
  return readLibraryTokenMetaFromDisk().fileStats
}
