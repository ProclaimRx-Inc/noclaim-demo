"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Send, Download, Trash2, ScrollText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { ChatMessage } from "@/components/chat-message"
import { ChatLibraryPanel } from "@/components/chat-library-panel"
import type { ChatMessage as ChatMessageModel } from "@/lib/types"
import {
  createEmptySession,
  deleteSession,
  getActiveChatId,
  loadSessions,
  navigateAfterChatDeleted,
  saveSessions,
  setActiveChatId,
  titleFromMessages,
  upsertSession,
} from "@/lib/chat-sessions"
import { fetchLibraryManifest, resolveLibraryFiles } from "@/lib/library-client"
import { buildPlaintextForModel } from "@/lib/preview-plaintext"
import { CONTEXT_WINDOW_USER_MESSAGE } from "@/lib/context-window-copy"
import { DEFAULT_LLM_MODEL_ID, LLM_MODEL_GROUPS } from "@/lib/llm-models"
import { getStoredLlmModelId, setStoredLlmModelId } from "@/lib/selected-llm-model"
import { getSelectedFileIds } from "@/lib/selected-files"

export function ChatPanel() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const c = searchParams.get("c")

  const [messages, setMessages] = useState<ChatMessageModel[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [systemPromptOpen, setSystemPromptOpen] = useState(false)
  const [systemPromptText, setSystemPromptText] = useState("")
  const [systemPromptLoading, setSystemPromptLoading] = useState(false)
  const [systemPromptError, setSystemPromptError] = useState<string | null>(null)
  const [modelId, setModelId] = useState(DEFAULT_LLM_MODEL_ID)

  useEffect(() => {
    setModelId(getStoredLlmModelId())
  }, [])

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
          model: modelId,
        }),
      })

      let data: {
        response?: string
        error?: string
        contextWindowExceeded?: boolean
      } = {}
      try {
        data = (await response.json()) as typeof data
      } catch {
        /* non-JSON body */
      }

      let assistantText: string
      if (data.contextWindowExceeded) {
        assistantText = data.error ?? CONTEXT_WINDOW_USER_MESSAGE
      } else if (!response.ok) {
        assistantText = data.error ? `Error: ${data.error}` : `Request failed (${response.status}).`
      } else {
        assistantText =
          data.response || (data.error ? `Error: ${data.error}` : "Sorry, I could not process your request.")
      }

      const assistantMessage: ChatMessageModel = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: assistantText,
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

  const deleteThisChat = () => {
    if (!c) return
    const id = c
    setDeleteOpen(false)
    deleteSession(id)
    navigateAfterChatDeleted(id, id, router)
    setMessages([])
  }

  const openSystemPromptPreview = async () => {
    setSystemPromptOpen(true)
    setSystemPromptLoading(true)
    setSystemPromptError(null)
    setSystemPromptText("")
    try {
      const selectedIds = getSelectedFileIds()
      const manifest = await fetchLibraryManifest()
      const resolved = await resolveLibraryFiles(selectedIds, manifest)
      const filesPayload =
        resolved.length > 0
          ? resolved.map((f) => ({
              name: f.name,
              plaintext: buildPlaintextForModel(f),
            }))
          : undefined
      const response = await fetch("/api/chat/system-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelId, files: filesPayload }),
      })
      const data = (await response.json()) as { system?: string; error?: string }
      if (!response.ok) {
        setSystemPromptError(data.error ?? `Request failed (${response.status})`)
        return
      }
      setSystemPromptText(typeof data.system === "string" ? data.system : "")
    } catch {
      setSystemPromptError("Could not load system prompt preview.")
    } finally {
      setSystemPromptLoading(false)
    }
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
    <div className="flex min-h-0 min-w-0 flex-1 flex-col md:flex-row">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b px-6 py-4">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold">Chat</h1>
            {c && (
              <p className="text-xs text-muted-foreground">
                Session <code className="rounded bg-muted px-1">{c.slice(0, 8)}…</code>
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Label htmlFor="llm-model" className="text-xs text-muted-foreground whitespace-nowrap">
              Model
            </Label>
            <Select
              value={modelId}
              onValueChange={(v) => {
                setModelId(v)
                setStoredLlmModelId(v)
              }}
            >
              <SelectTrigger id="llm-model" size="sm" className="h-8 w-[min(14rem,calc(100vw-8rem))] min-w-[10rem]">
                <SelectValue placeholder="Model" />
              </SelectTrigger>
              <SelectContent align="end" className="max-h-[min(24rem,70vh)]">
                {LLM_MODEL_GROUPS.map((group) => (
                  <SelectGroup key={group.vendor}>
                    <SelectLabel>{group.vendor}</SelectLabel>
                    {group.models.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 shrink-0 gap-1 px-2"
              title="Preview the full system string for the selected model and library files"
              onClick={() => void openSystemPromptPreview()}
            >
              <ScrollText className="h-4 w-4" />
              <span className="hidden sm:inline">System prompt</span>
            </Button>
          </div>
          {c && (
            <div className="flex flex-wrap items-center justify-end gap-2 sm:ml-auto">
            {messages.length > 0 && (
              <>
                <Button variant="outline" size="sm" onClick={exportHistory}>
                  <Download className="mr-2 h-4 w-4" />
                  Export
                </Button>
                <Button variant="outline" size="sm" onClick={clearHistory}>
                  Clear session
                </Button>
              </>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete chat
            </Button>
            <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This conversation will be removed from this browser. Export first if you need a copy. This cannot
                    be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={deleteThisChat}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            </div>
          )}
        </header>

        <Dialog open={systemPromptOpen} onOpenChange={setSystemPromptOpen}>
          <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col gap-0 overflow-hidden sm:max-w-2xl">
            <DialogHeader className="shrink-0 border-b pb-4 text-left">
              <DialogTitle>System prompt (debug)</DialogTitle>
              <DialogDescription className="text-left">
                Exact <code className="rounded bg-muted px-0.5 text-xs">system</code> string for model{" "}
                <code className="rounded bg-muted px-0.5 text-xs">{modelId}</code>
                {systemPromptLoading ? " — loading…" : ""}, including the markdown hint and any checked library files.
                Per-model text lives under <code className="rounded bg-muted px-0.5 text-xs">content/system-prompts/</code>
                .
              </DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-y-auto py-3">
              {systemPromptError ? (
                <p className="text-sm text-destructive">{systemPromptError}</p>
              ) : (
                <pre className="whitespace-pre-wrap break-words rounded-md border border-border bg-muted p-3 font-mono text-xs leading-relaxed text-foreground">
                  {systemPromptLoading ? "…" : systemPromptText}
                </pre>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto max-w-3xl">
            {messages.length === 0 ? (
              <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
                <div className="rounded-full bg-muted p-4">
                  <Send className="h-8 w-8 text-muted-foreground" />
                </div>
                <h2 className="mt-4 text-lg font-medium">Start a conversation</h2>
                <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                  Send a message to begin. Use the library on the right to include files with each request.
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
        </div>

        <div className="shrink-0 border-t px-6 py-4">
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

      <ChatLibraryPanel />
    </div>
  )
}
