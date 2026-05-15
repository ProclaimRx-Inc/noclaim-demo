import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { composeChatSystem } from "@/lib/llm-chat-providers"
import { DEFAULT_LLM_MODEL_ID, isAllowedModelId } from "@/lib/llm-models"
import { getLibrarySelectionBlockMessage, resolveLibraryPlaintextFilesByIds } from "@/lib/library-resolve-server"
import { readModelSystemPromptBase } from "@/lib/model-system-prompt-server"

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { model?: string; selectedLibraryIds?: string[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const modelId =
    typeof body.model === "string" && isAllowedModelId(body.model) ? body.model : DEFAULT_LLM_MODEL_ID
  const ids = Array.isArray(body.selectedLibraryIds)
    ? body.selectedLibraryIds.filter((x): x is string => typeof x === "string")
    : []

  const block = getLibrarySelectionBlockMessage(ids)
  if (block) {
    return NextResponse.json({ error: block, librarySelectionBlocked: true }, { status: 400 })
  }

  const files = resolveLibraryPlaintextFilesByIds(ids)
  const base = readModelSystemPromptBase(modelId)
  const system = composeChatSystem(base, files)

  return NextResponse.json({ system, model: modelId })
}
