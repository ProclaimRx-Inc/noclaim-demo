import type { ChatMessage, ChatSession } from "@/lib/types"

const SESSIONS_KEY = "noclaim-chat-sessions"
const ACTIVE_CHAT_KEY = "noclaim-active-chat-id"
const LEGACY_KEY = "chat-history"

export function broadcastChatsUpdated(): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new Event("noclaim-chats-updated"))
}

function safeParseSessions(raw: string | null): ChatSession[] {
  if (!raw) return []
  try {
    const data = JSON.parse(raw) as unknown
    if (!Array.isArray(data)) return []
    return data.filter(isChatSession)
  } catch {
    return []
  }
}

function isChatSession(x: unknown): x is ChatSession {
  if (!x || typeof x !== "object") return false
  const o = x as Record<string, unknown>
  return (
    typeof o.id === "string" &&
    typeof o.title === "string" &&
    Array.isArray(o.messages) &&
    typeof o.updatedAt === "string" &&
    (o.titleManual === undefined || typeof o.titleManual === "boolean")
  )
}

export function loadSessions(): ChatSession[] {
  if (typeof window === "undefined") return []
  let sessions = safeParseSessions(localStorage.getItem(SESSIONS_KEY))
  if (sessions.length === 0) {
    const legacy = localStorage.getItem(LEGACY_KEY)
    if (legacy) {
      try {
        const msgs = JSON.parse(legacy) as ChatMessage[]
        if (Array.isArray(msgs) && msgs.length > 0) {
          const migrated: ChatSession = {
            id: crypto.randomUUID(),
            title: titleFromMessages(msgs),
            messages: msgs,
            updatedAt: new Date().toISOString(),
          }
          sessions = [migrated]
          localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions))
          localStorage.setItem(ACTIVE_CHAT_KEY, migrated.id)
          localStorage.removeItem(LEGACY_KEY)
        }
      } catch {
        /* ignore */
      }
    }
  }
  return sessions
}

export function saveSessions(sessions: ChatSession[]): void {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions))
  broadcastChatsUpdated()
}

export function getActiveChatId(): string | null {
  return localStorage.getItem(ACTIVE_CHAT_KEY)
}

export function setActiveChatId(id: string): void {
  localStorage.setItem(ACTIVE_CHAT_KEY, id)
}

export function titleFromMessages(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user")
  if (!firstUser?.content?.trim()) return "New chat"
  const t = firstUser.content.trim().replace(/\s+/g, " ")
  return t.length > 48 ? `${t.slice(0, 45)}…` : t
}

const MAX_SESSION_TITLE_LEN = 120

/** Set a custom session title, or clear manual mode with an empty string (title follows messages again). */
export function renameSession(sessionId: string, newTitle: string): void {
  const all = loadSessions()
  const existing = all.find((s) => s.id === sessionId)
  if (!existing) return
  const trimmed = newTitle.trim()
  let title: string
  let titleManual: boolean
  if (trimmed.length === 0) {
    title = titleFromMessages(existing.messages)
    titleManual = false
  } else {
    title = trimmed.length > MAX_SESSION_TITLE_LEN ? `${trimmed.slice(0, MAX_SESSION_TITLE_LEN - 1)}…` : trimmed
    titleManual = true
  }
  const updated: ChatSession = {
    ...existing,
    title,
    titleManual,
    updatedAt: new Date().toISOString(),
  }
  saveSessions(upsertSession(all, updated))
}

export function createEmptySession(): ChatSession {
  const id = crypto.randomUUID()
  return {
    id,
    title: "New chat",
    messages: [],
    updatedAt: new Date().toISOString(),
  }
}

export function upsertSession(sessions: ChatSession[], session: ChatSession): ChatSession[] {
  const i = sessions.findIndex((s) => s.id === session.id)
  if (i === -1) return [...sessions, session]
  const next = [...sessions]
  next[i] = session
  return next
}

/** Removes one session from storage. If it was the active session, points active at the newest remaining session or clears active if none left. */
export function deleteSession(sessionId: string): ChatSession[] {
  const all = loadSessions()
  const remaining = all.filter((s) => s.id !== sessionId)
  saveSessions(remaining)

  const wasActive = getActiveChatId() === sessionId
  if (wasActive) {
    if (remaining.length > 0) {
      const sorted = [...remaining].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
      setActiveChatId(sorted[0]!.id)
    } else {
      localStorage.removeItem(ACTIVE_CHAT_KEY)
    }
  }
  return remaining
}

/**
 * After `deleteSession`, if the deleted chat was the one open in the URL (`?c=`), move the user to another session or create a new empty one.
 */
export function navigateAfterChatDeleted(
  deletedId: string,
  urlChatId: string | null,
  router: { replace: (href: string) => void }
): void {
  if (!urlChatId || urlChatId !== deletedId) return
  const nextId = getActiveChatId()
  if (nextId) {
    router.replace(`/chat?c=${nextId}`)
    return
  }
  const neu = createEmptySession()
  saveSessions([neu])
  setActiveChatId(neu.id)
  router.replace(`/chat?c=${neu.id}`)
}
