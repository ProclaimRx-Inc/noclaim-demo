import type { LibraryFileResolved, LibraryManifestEntry } from "@/lib/types"

export async function fetchLibraryManifest(): Promise<LibraryManifestEntry[]> {
  const res = await fetch("/library/manifest.json", { cache: "no-store" })
  if (!res.ok) return []
  try {
    const data = (await res.json()) as unknown
    if (!Array.isArray(data)) return []
    return data.filter(
      (x): x is LibraryManifestEntry =>
        !!x &&
        typeof x === "object" &&
        typeof (x as LibraryManifestEntry).id === "string" &&
        typeof (x as LibraryManifestEntry).name === "string" &&
        typeof (x as LibraryManifestEntry).path === "string"
    )
  } catch {
    return []
  }
}

export async function fetchLibraryFileText(relativePath: string): Promise<string> {
  const segments = relativePath.split("/").filter(Boolean)
  const url = `/library/${segments.map(encodeURIComponent).join("/")}`
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) return ""
  return res.text()
}

export async function resolveLibraryFiles(
  ids: string[],
  manifest: LibraryManifestEntry[]
): Promise<LibraryFileResolved[]> {
  const byId = new Map(manifest.map((e) => [e.id, e]))
  const out: LibraryFileResolved[] = []
  for (const id of ids) {
    const entry = byId.get(id)
    if (!entry) continue
    const content = await fetchLibraryFileText(entry.path)
    out.push({ ...entry, content })
  }
  return out
}
