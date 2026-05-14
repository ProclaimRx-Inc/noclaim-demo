"use client"

import { Suspense, useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { MessageSquare, Plus, Trash2 } from "lucide-react"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
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
import type { ChatSession } from "@/lib/types"
import {
  createEmptySession,
  deleteSession,
  loadSessions,
  navigateAfterChatDeleted,
  saveSessions,
  setActiveChatId,
} from "@/lib/chat-sessions"

function ChatSessionsInner() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const activeId = searchParams.get("c")

  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [pendingDelete, setPendingDelete] = useState<ChatSession | null>(null)

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

  const onNewChat = () => {
    const s = createEmptySession()
    const all = loadSessions()
    const next = [s, ...all]
    saveSessions(next)
    setActiveChatId(s.id)
    router.push(`/chat?c=${s.id}`)
  }

  const confirmDelete = () => {
    if (!pendingDelete) return
    const id = pendingDelete.id
    setPendingDelete(null)
    deleteSession(id)
    reload()
    navigateAfterChatDeleted(id, activeId, router)
  }

  return (
    <>
      <SidebarGroup>
        <SidebarGroupLabel>Chat History</SidebarGroupLabel>
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
                <div className="group/item flex w-full min-w-0 items-center gap-0.5">
                  <SidebarMenuButton asChild isActive={activeId === s.id} tooltip={s.title} className="min-w-0 flex-1">
                    <Link href={`/chat?c=${s.id}`} title={s.title}>
                      <MessageSquare className="h-4 w-4 shrink-0" />
                      <span className="truncate">{s.title}</span>
                    </Link>
                  </SidebarMenuButton>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    title="Delete chat"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setPendingDelete(s)
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete ? (
                <>
                  &quot;{pendingDelete.title}&quot; will be removed from this browser. This cannot be undone.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export function ChatSessionsSidebar() {
  return (
    <Suspense fallback={null}>
      <ChatSessionsInner />
    </Suspense>
  )
}
