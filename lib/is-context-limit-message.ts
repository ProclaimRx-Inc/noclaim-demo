/** Detect context / token limit errors from any provider (message text only). */
export function isLikelyContextLimitMessage(text: string): boolean {
  const s = text.toLowerCase()
  return (
    s.includes("context_length_exceeded") ||
    s.includes("maximum context length") ||
    s.includes("this model's maximum context length") ||
    s.includes("too many tokens") ||
    s.includes("requested token count") ||
    s.includes("reduce the length of the messages") ||
    s.includes("reduce your prompt") ||
    s.includes("input is too long") ||
    s.includes("prompt is too long") ||
    s.includes("exceeds the maximum") ||
    s.includes("token limit") ||
    s.includes("context window") ||
    s.includes("max_tokens") ||
    s.includes("resource_exhausted")
  )
}
