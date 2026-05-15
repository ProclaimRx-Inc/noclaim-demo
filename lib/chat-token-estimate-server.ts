import { composeChatSystem, turnsFromClientMessages, type ChatTurn } from "@/lib/llm-chat-providers"
import { contextWindowTokensForModel } from "@/lib/model-context-limits"
import { readModelSystemPromptBase } from "@/lib/model-system-prompt-server"
import { estimateTokensRough } from "@/lib/token-estimate"

type ClientMessage = { role: string; content: string }
type ClientFile = { name: string; plaintext: string }

function estimateTurnsTokens(turns: ChatTurn[]): number {
  let n = 0
  for (const t of turns) {
    n += estimateTokensRough(t.content)
    n += 4
  }
  return n
}

export function estimatePromptTokenBundle(modelId: string, messages: ClientMessage[], files: ClientFile[]): {
  estimatedPromptTokens: number
  contextWindowTokens: number
  breakdown: { system: number; messages: number; filesRaw: number }
} {
  const modelBase = readModelSystemPromptBase(modelId)
  const system = composeChatSystem(modelBase, files)
  const systemTokens = estimateTokensRough(system)
  const turns = turnsFromClientMessages(messages)
  const messagesTokens = estimateTurnsTokens(turns)
  const filesRawTokens = files.reduce((acc, f) => acc + estimateTokensRough(f.plaintext ?? ""), 0)
  const estimatedPromptTokens = systemTokens + messagesTokens
  return {
    estimatedPromptTokens,
    contextWindowTokens: contextWindowTokensForModel(modelId),
    breakdown: {
      system: systemTokens,
      messages: messagesTokens,
      filesRaw: filesRawTokens,
    },
  }
}
