import { DEFAULT_LLM_MODEL_ID, isAllowedModelId } from "@/lib/llm-models"

const KEY = "noclaim-llm-model"

export function getStoredLlmModelId(): string {
  if (typeof window === "undefined") return DEFAULT_LLM_MODEL_ID
  try {
    const raw = localStorage.getItem(KEY)
    if (raw && isAllowedModelId(raw)) return raw
  } catch {
    /* ignore */
  }
  return DEFAULT_LLM_MODEL_ID
}

export function setStoredLlmModelId(id: string): void {
  if (!isAllowedModelId(id)) return
  localStorage.setItem(KEY, id)
}
