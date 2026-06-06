import { buildSystemFromFiles, turnsFromClientMessages, type ChatTurn } from "@/lib/llm-chat-providers"
import { combinedLibraryPromptTokens } from "@/lib/library-prompt-tokens"
import { readLibraryTokenMetaFromDisk } from "@/lib/library-token-meta-server"
import { contextWindowTokensForModel } from "@/lib/model-context-limits"
import { estimateTokensRough } from "@/lib/token-estimate"

type ClientMessage = { role: string; content: string }
type ClientFile = { name: string; path: string; plaintext: string }

export type PromptTokenBreakdown = {
  system: number
  messages: number
  filesRaw: number
}

export type PromptTokenBundle = {
  estimatedPromptTokens: number
  contextWindowTokens: number
  breakdown: PromptTokenBreakdown
  /** Whether library counts came from offline provider precalc. */
  tokenCountSource: "precalculated" | "estimate"
}

function estimateTurnsTokens(turns: ChatTurn[]): number {
  let n = 0
  for (const t of turns) {
    n += estimateTokensRough(t.content)
    n += 4
  }
  return n
}

function estimatePromptTokenBundleFallback(
  messages: ClientMessage[],
  files: ClientFile[]
): PromptTokenBundle {
  const system = buildSystemFromFiles(files) ?? ""
  const systemTokens = estimateTokensRough(system)
  const turns = turnsFromClientMessages(messages)
  const messagesTokens = estimateTurnsTokens(turns)
  const filesRawTokens = files.reduce((acc, f) => acc + estimateTokensRough(f.plaintext ?? ""), 0)
  return {
    estimatedPromptTokens: systemTokens + messagesTokens,
    contextWindowTokens: 0,
    breakdown: {
      system: systemTokens,
      messages: messagesTokens,
      filesRaw: filesRawTokens,
    },
    tokenCountSource: "estimate",
  }
}

/**
 * Prompt size for the next send: offline provider counts for library files,
 * chars÷4 estimate for chat message turns.
 */
export function estimatePromptTokenBundle(
  modelId: string,
  messages: ClientMessage[],
  files: ClientFile[]
): PromptTokenBundle {
  const meta = readLibraryTokenMetaFromDisk()
  const filePaths = files.map((f) => f.path)
  const libraryTokens = combinedLibraryPromptTokens(meta, modelId, filePaths)

  if (libraryTokens === null && files.length > 0) {
    const fallback = estimatePromptTokenBundleFallback(messages, files)
    return {
      ...fallback,
      contextWindowTokens: contextWindowTokensForModel(modelId),
    }
  }

  const systemTokens = libraryTokens ?? 0
  const turns = turnsFromClientMessages(messages)
  const messagesTokens = estimateTurnsTokens(turns)

  return {
    estimatedPromptTokens: systemTokens + messagesTokens,
    contextWindowTokens: contextWindowTokensForModel(modelId),
    breakdown: {
      system: systemTokens,
      messages: messagesTokens,
      filesRaw: systemTokens,
    },
    tokenCountSource: files.length > 0 ? "precalculated" : "estimate",
  }
}
