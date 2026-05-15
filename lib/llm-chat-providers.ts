import Anthropic from "@anthropic-ai/sdk"
import { GoogleGenerativeAI } from "@google/generative-ai"
import OpenAI from "openai"
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions"

const DOC_SYSTEM_PREAMBLE =
  "The user selected the following documents from their library. Their full text appears below each document header. Use this material as primary evidence when the user asks about it; quote or paraphrase specifics when helpful. If a question does not require the documents, answer from general knowledge without inventing document contents.\n\n"

export type ChatTurn = { role: "user" | "assistant"; content: string }

export function buildSystemFromFiles(files: { plaintext: string }[]): string | undefined {
  if (!Array.isArray(files) || files.length === 0) return undefined
  const docBlock = files
    .filter((f) => typeof f?.plaintext === "string" && f.plaintext.trim().length > 0)
    .map((f) => f.plaintext)
    .join("\n\n---\n\n")
  if (!docBlock.trim()) return undefined
  return DOC_SYSTEM_PREAMBLE + docBlock
}

const ASSISTANT_MARKDOWN_HINT =
  "When you reply to the user, you may use GitHub-flavored Markdown (headings, bullet or numbered lists, links, inline code, fenced code blocks, and tables) when it improves readability. The chat UI renders Markdown in assistant messages."

const DEFAULT_MODEL_BASE =
  "You are a helpful assistant. Be clear, accurate, and concise. If you are unsure, say so rather than guessing."

/**
 * Full system string for the API: optional per-model base (from repo text file), UI markdown hint,
 * then optional library document block.
 */
export function composeChatSystem(modelBaseFromFile: string, files: { plaintext: string }[]): string {
  const trimmed = modelBaseFromFile.trim()
  const base = trimmed.length > 0 ? trimmed : DEFAULT_MODEL_BASE
  const doc = buildSystemFromFiles(files)
  const parts = [base, ASSISTANT_MARKDOWN_HINT]
  if (doc) parts.push(doc)
  return parts.join("\n\n")
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
  const apiMessages: ChatCompletionMessageParam[] = [{ role: "system", content: system }]
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
    system,
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
    systemInstruction: system,
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
