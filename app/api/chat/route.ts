import { APIError } from "openai"
import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { estimatePromptTokenBundle } from "@/lib/chat-token-estimate-server"
import { CONTEXT_WINDOW_USER_MESSAGE } from "@/lib/context-window-copy"
import { isLikelyContextLimitMessage } from "@/lib/is-context-limit-message"
import {
  composeChatSystem,
  completeAnthropic,
  completeGemini,
  completeOpenAI,
  turnsFromClientMessages,
} from "@/lib/llm-chat-providers"
import { DEFAULT_LLM_MODEL_ID, isAllowedModelId, providerForModel } from "@/lib/llm-models"
import { readModelSystemPromptBase } from "@/lib/model-system-prompt-server"
import { isContextWindowExceeded } from "@/lib/openai-context-server"
import { getLibrarySelectionBlockMessage, resolveLibraryPlaintextFilesByIds } from "@/lib/library-resolve-server"

type ClientMessage = { role: string; content: string }

function contextLimitHit(err: unknown): boolean {
  if (err instanceof APIError && isContextWindowExceeded(err)) return true
  if (err instanceof Error && isLikelyContextLimitMessage(err.message)) return true
  return false
}

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { messages?: ClientMessage[]; model?: string; selectedLibraryIds?: string[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { messages } = body
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "messages array is required" }, { status: 400 })
  }

  const modelId =
    typeof body.model === "string" && isAllowedModelId(body.model) ? body.model : DEFAULT_LLM_MODEL_ID
  const provider = providerForModel(modelId)
  if (!provider) {
    return NextResponse.json({ error: "Invalid model" }, { status: 400 })
  }

  const openaiKey = process.env.OPENAI_API_KEY?.trim()
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim()
  const geminiKey =
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim()

  if (provider === "openai" && !openaiKey) {
    return NextResponse.json(
      {
        error:
          "Missing OPENAI_API_KEY. Add it under Vercel → Project → Settings → Environment Variables, then redeploy.",
      },
      { status: 503 }
    )
  }
  if (provider === "anthropic" && !anthropicKey) {
    return NextResponse.json(
      {
        error:
          "Missing ANTHROPIC_API_KEY. Add it under Vercel → Project → Settings → Environment Variables, then redeploy.",
      },
      { status: 503 }
    )
  }
  if (provider === "gemini" && !geminiKey) {
    return NextResponse.json(
      {
        error:
          "Missing Gemini API key. Set GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY in Vercel env, then redeploy.",
      },
      { status: 503 }
    )
  }

  const ids = Array.isArray(body.selectedLibraryIds)
    ? body.selectedLibraryIds.filter((x): x is string => typeof x === "string")
    : []
  const block = getLibrarySelectionBlockMessage(ids)
  if (block) {
    return NextResponse.json({ error: block, librarySelectionBlocked: true }, { status: 400 })
  }
  const filesList = resolveLibraryPlaintextFilesByIds(ids)
  const modelBase = readModelSystemPromptBase(modelId)
  const system = composeChatSystem(modelBase, filesList)
  const turns = turnsFromClientMessages(messages)
  if (turns.length === 0) {
    return NextResponse.json({ error: "No valid messages" }, { status: 400 })
  }

  const bundle = estimatePromptTokenBundle(modelId, messages, filesList)

  try {
    let result
    if (provider === "openai") {
      result = await completeOpenAI(openaiKey!, modelId, system, turns)
    } else if (provider === "anthropic") {
      result = await completeAnthropic(anthropicKey!, modelId, system, turns)
    } else {
      result = await completeGemini(geminiKey!, modelId, system, turns)
    }
    return NextResponse.json({
      response: result.text,
      usage: result.usage,
      estimatedPromptTokens: bundle.estimatedPromptTokens,
      contextWindowTokens: bundle.contextWindowTokens,
    })
  } catch (err: unknown) {
    if (contextLimitHit(err)) {
      return NextResponse.json(
        {
          error: CONTEXT_WINDOW_USER_MESSAGE,
          contextWindowExceeded: true,
          estimatedPromptTokens: bundle.estimatedPromptTokens,
          contextWindowTokens: bundle.contextWindowTokens,
        },
        { status: 400 }
      )
    }
    const msg = err instanceof Error ? err.message : "Request failed"
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
