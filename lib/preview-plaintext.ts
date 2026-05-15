import type { LibraryFileResolved } from "@/lib/types"

export function buildPlaintextForLibraryFile(name: string, path: string, content: string): string {
  return `=== FILE: ${name} ===
Path: ${path}

--- CONTENT ---
${content}
--- END CONTENT ---`
}

export function buildPlaintextForModel(file: LibraryFileResolved): string {
  return buildPlaintextForLibraryFile(file.name, file.path, file.content)
}
