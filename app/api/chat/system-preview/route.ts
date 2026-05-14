import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { composeChatSystem } from "@/lib/llm-chat-providers"
import { DEFAULT_LLM_MODEL_ID, isAllowedModelId } from "@/lib/llm-models"
import { readModelSystemPromptBase } from "@/lib/model-system-prompt-server"

type ClientFile = { name: string; plaintext: string }

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { model?: string; files?: ClientFile[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const modelId =
    typeof body.model === "string" && isAllowedModelId(body.model) ? body.model : DEFAULT_LLM_MODEL_ID
  const files = Array.isArray(body.files) ? body.files : []
  const base = readModelSystemPromptBase(modelId)
  const system = composeChatSystem(base, files)

  return NextResponse.json({ system, model: modelId })
}
