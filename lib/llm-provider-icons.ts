import type { LlmProvider } from "@/lib/llm-models"

/**
 * Assistant avatar sources (absolute URLs work in `<img src>` — SVG, ICO, PNG, etc.).
 * Swap these strings anytime; keep local paths for anything you host under `public/`.
 */
export const LLM_PROVIDER_ICON_SRC: Record<LlmProvider, string> = {
  openai: "https://chatgpt.com/cdn/assets/favicon-l4nq08hd.svg",
  anthropic: "https://claude.ai/favicon.ico",
  gemini: "https://www.gstatic.com/lamda/images/gemini_sparkle_aurora_33f86dc0c0257da337c63.svg",
}

/** Shown when the model id is unknown or not mapped to a provider. */
export const LLM_UNKNOWN_PROVIDER_ICON_SRC = "/icons/llm/unknown.png"
