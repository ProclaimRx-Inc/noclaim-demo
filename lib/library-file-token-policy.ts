import { libraryPromptTokensForFile } from "@/lib/library-prompt-tokens"
import { contextWindowTokensForModel } from "@/lib/model-context-limits"
import { modelLabelForId } from "@/lib/llm-models"
import type { LibraryFileStats } from "@/lib/types"

export function libraryFileTokensForModel(
  stats: LibraryFileStats | undefined,
  modelId: string
): number | undefined {
  const precalc = libraryPromptTokensForFile(stats, modelId)
  if (typeof precalc === "number") return precalc
  if (typeof stats?.estimatedTokens === "number") return stats.estimatedTokens
  return undefined
}

export function libraryFileTokenSource(
  stats: LibraryFileStats | undefined,
  modelId: string
): "precalculated" | "estimate" | "unknown" {
  if (typeof stats?.libraryPromptTokensByModel?.[modelId] === "number") return "precalculated"
  if (typeof stats?.estimatedTokens === "number") return "estimate"
  return "unknown"
}

/** True when this file alone exceeds the selected model's context window. */
export function isLibraryFileBlockedForModel(
  stats: LibraryFileStats | undefined,
  modelId: string
): boolean {
  const tokens = libraryFileTokensForModel(stats, modelId)
  if (typeof tokens !== "number") return false
  return tokens > contextWindowTokensForModel(modelId)
}

export function formatBlockedLibrarySelectionMessage(names: string[], modelId: string): string {
  const limit = contextWindowTokensForModel(modelId)
  const label = modelLabelForId(modelId)
  return `These library files exceed the ${limit.toLocaleString()}-token context window for ${label}: ${names.join(", ")}. Uncheck them or choose a different model.`
}
