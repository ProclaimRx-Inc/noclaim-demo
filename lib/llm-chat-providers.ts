import Anthropic from "@anthropic-ai/sdk"
import { GoogleGenerativeAI } from "@google/generative-ai"
import OpenAI from "openai"
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions"

export type ChatTurn = { role: "user" | "assistant"; content: string }

const FILE_SEPARATOR = "\n\n---\n\n"

export function buildSystemFromFiles(files: { plaintext: string }[]): string | undefined {
  if (!Array.isArray(files) || files.length === 0) return undefined
  const docBlock = files
    .filter((f) => typeof f?.plaintext === "string" && f.plaintext.trim().length > 0)
    .map((f) => f.plaintext)
    .join(FILE_SEPARATOR)
  if (!docBlock.trim()) return undefined
  return docBlock
}

/** Context passed as provider system: wrapped library file text only (empty when none). */
export function composeChatSystem(files: { plaintext: string }[]): string {
  return buildSystemFromFiles(files) ?? ""
}

export function turnsFromClientMessages(
  messages: { role: string; content: string }[]
): ChatTurn[] {
  const turns: ChatTurn[] = []
  for (const m of messages) {
    if (m.role !== "user" && m.role !== "assistant") continue
    if (typeof m.content !== "string") continue
    turns.push({ role: m.role, content: m.content })
  }
  return turns
}

export type LlmCompletionUsage = { promptTokens: number; completionTokens: number }

export type LlmCompletionResult = { text: string; usage?: LlmCompletionUsage }

export async function completeOpenAI(
  apiKey: string,
  model: string,
  system: string,
  turns: ChatTurn[]
): Promise<LlmCompletionResult> {
  const apiMessages: ChatCompletionMessageParam[] = []
  if (system.trim().length > 0) {
    apiMessages.push({ role: "system", content: system })
  }
  for (const t of turns) {
    apiMessages.push({ role: t.role, content: t.content })
  }
  const openai = new OpenAI({ apiKey })
  const completion = await openai.chat.completions.create({
    model,
    messages: apiMessages,
  })
  const choice = completion.choices[0]?.message
  const text =
    (typeof choice?.content === "string" ? choice.content : null)?.trim() ||
    "The model returned an empty reply."
  const u = completion.usage
  const usage: LlmCompletionUsage | undefined =
    u && typeof u.prompt_tokens === "number" && typeof u.completion_tokens === "number"
      ? { promptTokens: u.prompt_tokens, completionTokens: u.completion_tokens }
      : undefined
  return { text, usage }
}

export async function completeAnthropic(
  apiKey: string,
  model: string,
  system: string,
  turns: ChatTurn[]
): Promise<LlmCompletionResult> {
  const client = new Anthropic({ apiKey })
  const res = await client.messages.create({
    model,
    max_tokens: 16384,
    ...(system.trim().length > 0 ? { system } : {}),
    messages: turns.map((t) => ({
      role: t.role,
      content: t.content,
    })),
  })
  const parts = res.content
  let text = ""
  for (const block of parts) {
    if (block.type === "text") {
      text += (block as { type: "text"; text: string }).text
    }
  }
  text = text.trim()
  const u = res.usage
  const usage: LlmCompletionUsage | undefined =
    u && typeof u.input_tokens === "number" && typeof u.output_tokens === "number"
      ? { promptTokens: u.input_tokens, completionTokens: u.output_tokens }
      : undefined
  return { text: text || "The model returned an empty reply.", usage }
}

export async function completeGemini(
  apiKey: string,
  modelId: string,
  system: string,
  turns: ChatTurn[]
): Promise<LlmCompletionResult> {
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({
    model: modelId,
    systemInstruction: system.trim().length > 0 ? system : undefined,
  })

  if (turns.length === 0) {
    throw new Error("No messages")
  }

  const last = turns[turns.length - 1]!
  if (last.role !== "user") {
    throw new Error("Last message must be from the user")
  }

  const history = turns.slice(0, -1).map((t) => ({
    role: t.role === "user" ? ("user" as const) : ("model" as const),
    parts: [{ text: t.content }],
  }))

  const chat = model.startChat({ history })
  const result = await chat.sendMessage(last.content)
  const text = result.response.text()?.trim() || "The model returned an empty reply."
  const meta = result.response.usageMetadata
  const usage: LlmCompletionUsage | undefined =
    meta && typeof meta.promptTokenCount === "number"
      ? {
          promptTokens: meta.promptTokenCount,
          completionTokens:
            typeof meta.candidatesTokenCount === "number" ? meta.candidatesTokenCount : 0,
        }
      : undefined
  return { text, usage }
}
