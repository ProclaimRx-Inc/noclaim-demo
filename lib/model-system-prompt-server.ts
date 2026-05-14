import { existsSync, readFileSync } from "fs"
import { join } from "path"

const REL_DIR = join("content", "system-prompts")

export function modelSystemPromptPath(modelId: string): string {
  return join(process.cwd(), REL_DIR, `${modelId}.txt`)
}

/** Raw UTF-8 contents of the per-model system prompt file, or empty string if missing. */
export function readModelSystemPromptBase(modelId: string): string {
  const p = modelSystemPromptPath(modelId)
  if (!existsSync(p)) return ""
  return readFileSync(p, "utf8")
}
