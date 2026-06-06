import type { LibraryFileStats, LibraryTokenMeta } from "@/lib/types"

export function libraryPromptTokensForFile(
  stats: LibraryFileStats | undefined,
  modelId: string
): number | undefined {
  const n = stats?.libraryPromptTokensByModel?.[modelId]
  return typeof n === "number" ? n : undefined
}

/**
 * Combines offline provider counts for attached library files.
 * Single file uses the exact precalculated wrapped-plaintext count.
 * Multiple files: sum(single-file counts) + (n−1)×separator (per model).
 */
export function combinedLibraryPromptTokens(
  meta: LibraryTokenMeta,
  modelId: string,
  filePaths: string[]
): number | null {
  if (filePaths.length === 0) return 0

  const singles: number[] = []
  for (const path of filePaths) {
    const t = libraryPromptTokensForFile(meta.fileStats[path], modelId)
    if (typeof t !== "number") return null
    singles.push(t)
  }

  if (singles.length === 1) return singles[0]!

  const separator = meta.fileSeparatorTokens?.[modelId]
  if (typeof separator !== "number") return null

  const n = singles.length
  return singles.reduce((acc, x) => acc + x, 0) + (n - 1) * separator
}
