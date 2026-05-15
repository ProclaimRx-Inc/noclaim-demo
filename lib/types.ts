export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  /** File names included with this user message for UI */
  attachedFileNames?: string[]
}

export interface ChatSession {
  id: string
  title: string
  /** When true, `title` was set by the user and is not overwritten from message text. */
  titleManual?: boolean
  /** When true, this session hit the model context limit; further sends are disabled until history is cleared. */
  contextLimitBlocked?: boolean
  messages: ChatMessage[]
  updatedAt: string
}

export interface LibraryManifestEntry {
  id: string
  name: string
  /** Path under /library/, e.g. "notes/example.txt" */
  path: string
}

export interface LibraryFileResolved extends LibraryManifestEntry {
  content: string
}
