export type LlmProvider = "openai" | "anthropic" | "gemini"

export interface LlmModelOption {
  id: string
  label: string
}

export interface LlmModelGroup {
  vendor: string
  models: LlmModelOption[]
}

/** Curated list (IDs must match provider APIs). */
export const LLM_MODEL_GROUPS: LlmModelGroup[] = [
  {
    vendor: "Anthropic",
    models: [
      { id: "claude-opus-4-7", label: "Claude Opus 4.7" },
      { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
    ],
  },
  {
    vendor: "OpenAI",
    models: [
      { id: "gpt-5.5", label: "GPT-5.5" },
      { id: "gpt-5.4-mini", label: "GPT-5.4 mini" },
    ],
  },
  {
    vendor: "Gemini",
    models: [
      { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite" },
      { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (preview)" },
    ],
  },
]

export const DEFAULT_LLM_MODEL_ID = "gpt-5.4-mini"

/** Every allowlisted model id (for prompt files and validation). */
export const ALLOWED_LLM_MODEL_IDS: string[] = LLM_MODEL_GROUPS.flatMap((g) => g.models.map((m) => m.id))

const MODEL_TO_PROVIDER: Record<string, LlmProvider> = {}
for (const g of LLM_MODEL_GROUPS) {
  for (const m of g.models) {
    MODEL_TO_PROVIDER[m.id] =
      g.vendor === "Anthropic" ? "anthropic" : g.vendor === "Gemini" ? "gemini" : "openai"
  }
}

export function isAllowedModelId(id: string): boolean {
  return id in MODEL_TO_PROVIDER
}

export function providerForModel(id: string): LlmProvider | undefined {
  return MODEL_TO_PROVIDER[id]
}

/** Human-readable label for the model picker; falls back to the raw id. */
export function modelLabelForId(id: string): string {
  for (const g of LLM_MODEL_GROUPS) {
    const m = g.models.find((x) => x.id === id)
    if (m) return m.label
  }
  return id
}
