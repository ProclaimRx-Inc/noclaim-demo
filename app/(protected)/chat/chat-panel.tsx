"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Send, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ChatMessage } from "@/components/chat-message"
import type { ChatMessage as ChatMessageModel } from "@/lib/types"
import {
  createEmptySession,
  getActiveChatId,
  loadSessions,
  saveSessions,
  setActiveChatId,
  titleFromMessages,
  upsertSession,
} from "@/lib/chat-sessions"
import { fetchLibraryManifest, resolveLibraryFiles } from "@/lib/library-client"
import { buildPlaintextForModel } from "@/lib/preview-plaintext"
import { getSelectedFileIds } from "@/lib/selected-files"

export function ChatPanel() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const c = searchParams.get("c")

  const [messages, setMessages] = useState<ChatMessageModel[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const persistSession = useCallback((chatId: string, nextMessages: ChatMessageModel[]) => {
    const all = loadSessions()
    const existing = all.find((s) => s.id === chatId)
    if (!existing) return
    const updated = {
      ...existing,
      messages: nextMessages,
      title: titleFromMessages(nextMessages),
      updatedAt: new Date().toISOString(),
    }
    saveSessions(upsertSession(all, updated))
  }, [])

  useEffect(() => {
    const all = loadSessions()
    if (!c) {
      if (all.length === 0) {
        const s = createEmptySession()
        saveSessions([s])
        setActiveChatId(s.id)
        router.replace(`/chat?c=${s.id}`)
        return
      }
      const active = getActiveChatId()
      const pick = active && all.some((s) => s.id === active) ? active : all[0]!.id
      setActiveChatId(pick)
      router.replace(`/chat?c=${pick}`)
      return
    }

    if (!all.some((s) => s.id === c)) {
      const s = createEmptySession()
      const next = [s, ...all]
      saveSessions(next)
      setActiveChatId(s.id)
      router.replace(`/chat?c=${s.id}`)
      return
    }

    setActiveChatId(c)
  }, [c, router])

  useEffect(() => {
    if (!c) return
    const all = loadSessions()
    const s = all.find((x) => x.id === c)
    setMessages(s?.messages ?? [])
  }, [c])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!c || !input.trim()) return

    const text = input.trim()
    const selectedIds = getSelectedFileIds()
    const manifest = await fetchLibraryManifest()
    const resolved = await resolveLibraryFiles(selectedIds, manifest)
    const attachedNames = resolved.map((f) => f.name)

    const userMessage: ChatMessageModel = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      attachedFileNames: attachedNames.length > 0 ? attachedNames : undefined,
    }

    const nextAfterUser = [...messages, userMessage]
    setMessages(nextAfterUser)
    persistSession(c, nextAfterUser)
    setInput("")
    setIsLoading(true)

    const historyForApi = nextAfterUser.map(({ role, content }) => ({ role, content }))
    const filesPayload =
      resolved.length > 0
        ? resolved.map((f) => ({
            name: f.name,
            plaintext: buildPlaintextForModel(f),
          }))
        : undefined

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: historyForApi,
          files: filesPayload,
        }),
      })

      const data = (await response.json()) as { response?: string; error?: string }

      const assistantMessage: ChatMessageModel = {
        id: crypto.randomUUID(),
        role: "assistant",
        content:
          data.response ||
          (data.error ? `Error: ${data.error}` : "Sorry, I could not process your request."),
      }

      const finalMsgs = [...nextAfterUser, assistantMessage]
      setMessages(finalMsgs)
      persistSession(c, finalMsgs)
    } catch {
      const errorMessage: ChatMessageModel = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "An error occurred. Please try again.",
      }
      const finalMsgs = [...nextAfterUser, errorMessage]
      setMessages(finalMsgs)
      persistSession(c, finalMsgs)
    } finally {
      setIsLoading(false)
    }
  }

  const clearHistory = () => {
    if (!c) return
    setMessages([])
    persistSession(c, [])
  }

  const exportHistory = () => {
    if (!c) return
    const all = loadSessions()
    const session = all.find((s) => s.id === c)
    if (!session) return
    const exportPayload = {
      id: session.id,
      title: session.title,
      updatedAt: session.updatedAt,
      messages: session.messages,
    }
    const dataStr = JSON.stringify(exportPayload, null, 2)
    const blob = new Blob([dataStr], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `noclaim-chat-${session.id.slice(0, 8)}-${new Date().toISOString().split("T")[0]}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold">Chat</h1>
          {c && (
            <p className="text-xs text-muted-foreground">
              Session <code className="rounded bg-muted px-1">{c.slice(0, 8)}…</code>
            </p>
          )}
        </div>
        {messages.length > 0 && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportHistory}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
            <Button variant="outline" size="sm" onClick={clearHistory}>
              Clear session
            </Button>
          </div>
        )}
      </header>

      <ScrollArea className="flex-1 px-6">
        <div className="mx-auto max-w-3xl py-6">
          {messages.length === 0 ? (
            <div className="flex h-[60vh] flex-col items-center justify-center text-center">
              <div className="rounded-full bg-muted p-4">
                <Send className="h-8 w-8 text-muted-foreground" />
              </div>
              <h2 className="mt-4 text-lg font-medium">Start a conversation</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Send a message to begin. Select library files on the Library page to attach their text to each request.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((message) => (
                <ChatMessage key={message.id} message={message} />
              ))}
              {isLoading && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <div className="h-2 w-2 animate-pulse rounded-full bg-current" />
                  <span className="text-sm">Thinking...</span>
                </div>
              )}
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="border-t px-6 py-4">
        <form onSubmit={handleSubmit} className="mx-auto max-w-3xl">
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message..."
              className="min-h-[80px] resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  void handleSubmit(e)
                }
              }}
            />
            <Button type="submit" size="icon" className="h-[80px] w-[80px]" disabled={isLoading || !c}>
              <Send className="h-5 w-5" />
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
