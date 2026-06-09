export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  /** File names included with this user message for UI */
  attachedFileNames?: string[]
  /** Model id used for this assistant reply (set when the message is created). */
  modelId?: string
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

/** Build-time stats from `public/library/library-token-meta.json` (`fileStats` by path). */
export interface LibraryFileStats {
  /** Rough chars÷4 estimate (used when provider counts are missing). */
  estimatedTokens: number
  /** Provider token count for wrapped file plaintext (`buildSystemFromFiles([file])`), keyed by model id. */
  libraryPromptTokensByModel?: Record<string, number>
  /** Max `libraryPromptTokensByModel` across models (for library send blocking). */
  maxLibraryPromptTokens?: number
  /** Data rows (excluding header) for CSV; line count for other text. */
  rows: number
  /** Parsed from header line for CSV. */
  columns: number
  sizeBytes: number
  /** Detected date column + min/max date in the committed CSV (shown for all files). */
  dateRange?: { column: string; start: string; end: string }
  /** Present when the file was force-truncated to fit a token budget (SCRUM-1197). */
  truncation?: {
    strategy: "date-window" | "row-cap"
    budgetTokens: number
    /** Date column used for the window, or null for row-cap files. */
    dateColumn: string | null
    /** Kept date window, or null for row-cap files. */
    timeFrame: { start: string; end: string } | null
    /** Stats of the original full file before truncation. */
    full: { rows: number; sizeBytes: number; estimatedTokens: number }
  }
}

/** Shape of `public/library/library-token-meta.json`. */
export interface LibraryTokenMeta {
  version?: number
  method?: string
  /** Provider count for the `\n\n---\n\n` join between library files. */
  fileSeparatorTokens?: Record<string, number>
  byManifestId?: Record<string, number>
  byFilePath?: Record<string, number>
  fileStats: Record<string, LibraryFileStats>
}
