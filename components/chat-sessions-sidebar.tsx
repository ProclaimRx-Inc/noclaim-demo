"use client"

import { Suspense, useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { MessageSquare, Plus } from "lucide-react"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import type { ChatSession } from "@/lib/types"
import { createEmptySession, loadSessions, saveSessions, setActiveChatId } from "@/lib/chat-sessions"

function ChatSessionsInner() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const activeId = searchParams.get("c")

  const [sessions, setSessions] = useState<ChatSession[]>([])

  const reload = useCallback(() => {
    const list = [...loadSessions()]
    list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    setSessions(list)
  }, [])

  useEffect(() => {
    reload()
  }, [reload, pathname, activeId])

  useEffect(() => {
    window.addEventListener("noclaim-chats-updated", reload)
    return () => window.removeEventListener("noclaim-chats-updated", reload)
  }, [reload])

  if (!pathname?.startsWith("/chat")) return null

  const onNewChat = () => {
    const s = createEmptySession()
    const all = loadSessions()
    const next = [s, ...all]
    saveSessions(next)
    setActiveChatId(s.id)
    router.push(`/chat?c=${s.id}`)
  }

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Chats</SidebarGroupLabel>
      <SidebarGroupContent>
        <div className="px-2 pb-2">
          <Button variant="outline" size="sm" className="w-full" onClick={onNewChat}>
            <Plus className="mr-2 h-4 w-4" />
            New chat
          </Button>
        </div>
        <SidebarMenu className="max-h-[40vh] overflow-y-auto">
          {sessions.map((s) => (
            <SidebarMenuItem key={s.id}>
              <SidebarMenuButton asChild isActive={activeId === s.id} tooltip={s.title}>
                <Link href={`/chat?c=${s.id}`} title={s.title}>
                  <MessageSquare className="h-4 w-4 shrink-0" />
                  <span className="truncate">{s.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

export function ChatSessionsSidebar() {
  return (
    <Suspense fallback={null}>
      <ChatSessionsInner />
    </Suspense>
  )
}
