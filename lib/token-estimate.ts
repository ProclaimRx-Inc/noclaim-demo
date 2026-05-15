/**
 * Rough token estimate for UI budgeting (not billing-grade).
 * ~4 chars/token is a common English heuristic; real tokenizers differ by model.
 */
export function estimateTokensRough(text: string): number {
  if (!text || !text.trim()) return 0
  return Math.max(1, Math.ceil(text.length / 4))
}
