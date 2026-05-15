import type { LibraryFileStats } from "@/lib/types"

/** Estimated tokens (chars÷4, wrapped file plaintext) above which a library file cannot be sent. */
export const LIBRARY_ESTIMATED_TOKEN_SEND_BLOCK_THRESHOLD = 1_000_000

export function isLibraryFileBlockedByEstimatedTokens(stats: LibraryFileStats | undefined): boolean {
  if (!stats || typeof stats.estimatedTokens !== "number") return false
  return stats.estimatedTokens > LIBRARY_ESTIMATED_TOKEN_SEND_BLOCK_THRESHOLD
}

export function formatBlockedLibrarySelectionMessage(names: string[]): string {
  return `These library files cannot be sent (over ${LIBRARY_ESTIMATED_TOKEN_SEND_BLOCK_THRESHOLD.toLocaleString()} estimated tokens): ${names.join(", ")}. Uncheck them to continue.`
}
