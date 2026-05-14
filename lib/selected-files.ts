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
