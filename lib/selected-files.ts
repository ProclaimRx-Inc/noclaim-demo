const KEY = "noclaim-selected-file-ids"

export function getSelectedFileIds(): string[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : []
  } catch {
    return []
  }
}

export function setSelectedFileIds(ids: string[]): void {
  localStorage.setItem(KEY, JSON.stringify(ids))
}

export function toggleSelectedFileId(id: string): string[] {
  const cur = getSelectedFileIds()
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
  setSelectedFileIds(next)
  return next
}

/** Select every library entry id (deduped). */
export function selectAllFileIds(ids: string[]): void {
  setSelectedFileIds([...new Set(ids)])
}

export function clearSelectedFileIds(): void {
  setSelectedFileIds([])
}

/** Fired when the user checks/unchecks library files (listen on `window` in the chat UI). */
export const LIBRARY_SELECTION_CHANGED_EVENT = "noclaim-library-selection-changed"

export function emitLibrarySelectionChanged(): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(LIBRARY_SELECTION_CHANGED_EVENT))
}
