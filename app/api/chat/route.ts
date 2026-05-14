import OpenAI, { APIError } from "openai"
import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions"
import { CONTEXT_WINDOW_USER_MESSAGE } from "@/lib/context-window-copy"
import { isContextWindowExceeded } from "@/lib/openai-context-server"

const DEFAULT_MODEL = "gpt-5.4-mini"

type ClientMessage = { role: string; content: string }
type ClientFile = { name: string; plaintext: string }

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Missing OPENAI_API_KEY. In Vercel: Project → Settings → Environment Variables → add OPENAI_API_KEY for Production and Preview, then redeploy.",
      },
      { status: 503 }
    )
  }

  const model = process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL

  let body: { messages?: ClientMessage[]; files?: ClientFile[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { messages, files } = body
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "messages array is required" }, { status: 400 })
  }

  const apiMessages: ChatCompletionMessageParam[] = []

  if (Array.isArray(files) && files.length > 0) {
    const docBlock = files
      .filter((f) => typeof f?.plaintext === "string" && f.plaintext.trim().length > 0)
      .map((f) => f.plaintext)
      .join("\n\n---\n\n")
    if (docBlock) {
      apiMessages.push({
        role: "system",
        content:
          "The user selected the following documents from their library. Their full text appears below each document header. Use this material as primary evidence when the user asks about it; quote or paraphrase specifics when helpful. If a question does not require the documents, answer from general knowledge without inventing document contents.\n\n" +
          docBlock,
      })
    }
  }

  for (const m of messages) {
    if (m.role !== "user" && m.role !== "assistant") continue
    if (typeof m.content !== "string") continue
    apiMessages.push({ role: m.role, content: m.content })
  }

  if (apiMessages.length === 0) {
    return NextResponse.json({ error: "No valid messages" }, { status: 400 })
  }

  const openai = new OpenAI({ apiKey })

  try {
    const completion = await openai.chat.completions.create({
      model,
      messages: apiMessages,
    })

    const choice = completion.choices[0]?.message
    const text =
      (typeof choice?.content === "string" ? choice.content : null)?.trim() ||
      "The model returned an empty reply."

    return NextResponse.json({ response: text })
  } catch (err: unknown) {
    if (isContextWindowExceeded(err)) {
      return NextResponse.json(
        {
          error: CONTEXT_WINDOW_USER_MESSAGE,
          contextWindowExceeded: true,
        },
        { status: 400 }
      )
    }
    const msg = err instanceof APIError ? err.message : err instanceof Error ? err.message : "OpenAI request failed"
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
