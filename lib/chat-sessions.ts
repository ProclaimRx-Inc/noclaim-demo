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
    typeof o.updatedAt === "string"
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
