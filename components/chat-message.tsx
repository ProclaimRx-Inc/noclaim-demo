"use client"

import { useState } from "react"
import { User, Bot, FileText } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ChatMessage } from "@/lib/types"
import { ChatMarkdown } from "@/components/chat-markdown"
import { LLM_PROVIDER_ICON_SRC, LLM_UNKNOWN_PROVIDER_ICON_SRC } from "@/lib/llm-provider-icons"
import { modelLabelForId, providerForModel } from "@/lib/llm-models"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

function AssistantAvatar({ modelId }: { modelId?: string }) {
  const provider = modelId ? providerForModel(modelId) : undefined
  const src = provider ? LLM_PROVIDER_ICON_SRC[provider] : LLM_UNKNOWN_PROVIDER_ICON_SRC
  const [imgFailed, setImgFailed] = useState(false)

  const tooltip =
    modelId != null && modelId !== ""
      ? `${modelLabelForId(modelId)} (${modelId})`
      : "Assistant (model not recorded for this message)"

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 cursor-default items-center justify-center rounded-full bg-muted",
            provider === "openai" && "ring-1 ring-emerald-600/35 dark:ring-emerald-400/40",
            provider === "anthropic" && "ring-1 ring-violet-600/35 dark:ring-violet-400/40",
            provider === "gemini" && "ring-1 ring-sky-600/35 dark:ring-sky-400/40"
          )}
        >
          {imgFailed ? (
            <Bot className="h-4 w-4" aria-hidden />
          ) : (
            <img
              src={src}
              alt=""
              width={16}
              height={16}
              className="h-4 w-4 object-contain"
              referrerPolicy="no-referrer"
              onError={() => setImgFailed(true)}
            />
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs text-left font-sans text-xs font-normal normal-case">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  )
}

export function ChatMessage({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user"
  const assistantLabel =
    message.role === "assistant" && message.modelId ? modelLabelForId(message.modelId) : null

  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      {isUser ? (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <User className="h-4 w-4" />
        </div>
      ) : (
        <AssistantAvatar modelId={message.modelId} />
      )}
      <div
        className={cn(
          "flex max-w-[80%] min-w-0 flex-col gap-1 rounded-lg px-4 py-3",
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
        {assistantLabel && (
          <p className="text-[11px] font-medium leading-none text-muted-foreground">{assistantLabel}</p>
        )}
        {isUser ? (
          <p className="whitespace-pre-wrap text-sm">{message.content}</p>
        ) : (
          <ChatMarkdown source={message.content} />
        )}
      </div>
    </div>
  )
}
