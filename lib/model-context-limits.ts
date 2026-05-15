/**
 * Approximate **total** context window sizes (input + output budget varies by provider).
 * Tune these when vendors publish official limits for your exact model ids.
 * Unknown models fall back to `DEFAULT_CONTEXT_WINDOW_TOKENS`.
 */
export const DEFAULT_CONTEXT_WINDOW_TOKENS = 128_000

export const MODEL_CONTEXT_WINDOW_TOKENS: Record<string, number> = {
  // Anthropic — typical 200k class for recent Claude (verify in console docs).
  "claude-opus-4-7": 200_000,
  "claude-sonnet-4-6": 200_000,
  "claude-haiku-4-5-2051001": 200_000,
  // OpenAI — conservative defaults until exact limits are pinned for these ids.
  "gpt-5.5": 256_000,
  "gpt-5.4": 256_000,
  "gpt-5.4-mini": 128_000,
  // Gemini — placeholders; Flash often smaller than Pro.
  "gemini-3.1-flash-lite": 1_000_000,
  "gemini-3.1-pro-preview": 1_000_000,
}

export function contextWindowTokensForModel(modelId: string): number {
  return MODEL_CONTEXT_WINDOW_TOKENS[modelId] ?? DEFAULT_CONTEXT_WINDOW_TOKENS
}
