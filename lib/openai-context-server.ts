import { APIError } from "openai"

export function isContextWindowExceeded(err: unknown): boolean {
  const parts: string[] = []
  if (err instanceof APIError) {
    parts.push(String(err.code ?? ""), String(err.message ?? ""))
    const e = err.error as { code?: string; message?: string; type?: string } | undefined
    if (e && typeof e === "object") {
      parts.push(String(e.code ?? ""), String(e.message ?? ""), String(e.type ?? ""))
    }
  } else if (err instanceof Error) {
    parts.push(err.message)
  }
  const blob = parts.join(" ").toLowerCase()
  return (
    blob.includes("context_length_exceeded") ||
    blob.includes("maximum context length") ||
    blob.includes("this model's maximum context length") ||
    blob.includes("too many tokens") ||
    blob.includes("requested token count") ||
    blob.includes("reduce the length of the messages") ||
    blob.includes("reduce your prompt") ||
    blob.includes("input is too long")
  )
}
