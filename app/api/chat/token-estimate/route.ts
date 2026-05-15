import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { estimatePromptTokenBundle } from "@/lib/chat-token-estimate-server"
import { DEFAULT_LLM_MODEL_ID, isAllowedModelId } from "@/lib/llm-models"
import { resolveLibraryPlaintextFilesByIds } from "@/lib/library-resolve-server"

type ClientMessage = { role: string; content: string }

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: {
    model?: string
    messages?: ClientMessage[]
    selectedLibraryIds?: string[]
    pendingUserText?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const modelId =
    typeof body.model === "string" && isAllowedModelId(body.model) ? body.model : DEFAULT_LLM_MODEL_ID
  const messages = Array.isArray(body.messages) ? body.messages : []
  const ids = Array.isArray(body.selectedLibraryIds)
    ? body.selectedLibraryIds.filter((x): x is string => typeof x === "string")
    : []
  const files = resolveLibraryPlaintextFilesByIds(ids)

  const merged: ClientMessage[] = messages
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content }))

  const pending =
    typeof body.pendingUserText === "string" && body.pendingUserText.trim().length > 0
      ? body.pendingUserText.trim()
      : ""

  const bundleHistory = estimatePromptTokenBundle(modelId, merged, files)
  const mergedWithPending = pending ? [...merged, { role: "user" as const, content: pending }] : merged
  const bundleTotal = estimatePromptTokenBundle(modelId, mergedWithPending, files)

  const nextMessageTokens = Math.max(0, bundleTotal.estimatedPromptTokens - bundleHistory.estimatedPromptTokens)
  const previousHistoryTokens = bundleHistory.estimatedPromptTokens

  return NextResponse.json({
    ...bundleTotal,
    nextMessageTokens,
    previousHistoryTokens,
  })
}
