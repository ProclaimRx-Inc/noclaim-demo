"use client"

import { useState, useEffect, useRef } from "react"
import { Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { FileSelector } from "@/components/file-selector"
import { ChatMessage } from "@/components/chat-message"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  files?: string[]
}

interface FileItem {
  id: string
  name: string
  type: string
  url: string
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [selectedFiles, setSelectedFiles] = useState<FileItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const stored = localStorage.getItem("chat-history")
    if (stored) {
      setMessages(JSON.parse(stored))
    }
  }, [])

  useEffect(() => {
    localStorage.setItem("chat-history", JSON.stringify(messages))
  }, [messages])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() && selectedFiles.length === 0) return

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: input,
      files: selectedFiles.map((f) => f.name),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setSelectedFiles([])
    setIsLoading(true)

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: input,
          files: selectedFiles.map((f) => ({ name: f.name, url: f.url, type: f.type })),
        }),
      })

      const data = await response.json()

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.response || "Sorry, I could not process your request.",
      }

      setMessages((prev) => [...prev, assistantMessage])
    } catch {
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "An error occurred. Please try again.",
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const clearHistory = () => {
    setMessages([])
    localStorage.removeItem("chat-history")
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <h1 className="text-xl font-semibold">Chat</h1>
        {messages.length > 0 && (
          <Button variant="outline" size="sm" onClick={clearHistory}>
            Clear History
          </Button>
        )}
      </header>

      <ScrollArea ref={scrollRef} className="flex-1 px-6">
        <div className="mx-auto max-w-3xl py-6">
          {messages.length === 0 ? (
            <div className="flex h-[60vh] flex-col items-center justify-center text-center">
              <div className="rounded-full bg-muted p-4">
                <Send className="h-8 w-8 text-muted-foreground" />
              </div>
              <h2 className="mt-4 text-lg font-medium">Start a conversation</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Send a message or attach files to begin.
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
          <FileSelector
            selectedFiles={selectedFiles}
            onFilesChange={setSelectedFiles}
          />
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message..."
              className="min-h-[80px] resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  handleSubmit(e)
                }
              }}
            />
            <Button type="submit" size="icon" className="h-[80px] w-[80px]" disabled={isLoading}>
              <Send className="h-5 w-5" />
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
