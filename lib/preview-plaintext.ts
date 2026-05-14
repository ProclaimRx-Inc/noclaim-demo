import type { LibraryFileResolved } from "@/lib/types"

export function buildPlaintextForModel(file: LibraryFileResolved): string {
  return `=== FILE: ${file.name} ===
Path: ${file.path}

--- CONTENT ---
${file.content}
--- END CONTENT ---`
}
