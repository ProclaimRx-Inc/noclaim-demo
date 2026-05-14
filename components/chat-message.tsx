import { User, Bot, FileText } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ChatMessage } from "@/lib/types"

export function ChatMessage({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user"

  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted"
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div
        className={cn(
          "flex max-w-[80%] flex-col gap-2 rounded-lg px-4 py-3",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted"
        )}
      >
        {message.attachedFileNames && message.attachedFileNames.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {message.attachedFileNames.map((name) => (
              <div
                key={name}
                className={cn(
                  "flex items-center gap-1 rounded px-2 py-1 text-xs",
                  isUser ? "bg-primary-foreground/20" : "bg-background"
                )}
              >
                <FileText className="h-3 w-3" />
                <span className="max-w-[180px] truncate">{name}</span>
              </div>
            ))}
          </div>
        )}
        <p className="whitespace-pre-wrap text-sm">{message.content}</p>
      </div>
    </div>
  )
}
