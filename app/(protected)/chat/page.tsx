import { Suspense } from "react"
import { ChatPanel } from "./chat-panel"

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center text-muted-foreground">Loading chat…</div>
      }
    >
      <ChatPanel />
    </Suspense>
  )
}
