"use client"

import { useCallback, useEffect, useState } from "react"
import { Eye, FileText, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { LibraryMarkdownPreview } from "@/components/library-markdown-preview"
import { fetchLibraryFileStats, fetchLibraryFileText, fetchLibraryManifest } from "@/lib/library-client"
import { buildLibraryPreviewMarkdown } from "@/lib/library-preview-markdown"
import {
  isLibraryFileBlockedForModel,
  libraryFileTokenSource,
  libraryFileTokensForModel,
} from "@/lib/library-file-token-policy"
import { contextWindowTokensForModel } from "@/lib/model-context-limits"
import { modelLabelForId } from "@/lib/llm-models"
import type { LibraryFileResolved, LibraryFileStats, LibraryManifestEntry } from "@/lib/types"
import { cn } from "@/lib/utils"
import {
  clearSelectedFileIds,
  emitLibrarySelectionChanged,
  getSelectedFileIds,
  selectAllFileIds,
  setSelectedFileIds,
  toggleSelectedFileId,
} from "@/lib/selected-files"

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

type ChatLibraryPanelProps = {
  modelId: string
}

export function ChatLibraryPanel({ modelId }: ChatLibraryPanelProps) {
  const [manifest, setManifest] = useState<LibraryManifestEntry[]>([])
  const [fileStats, setFileStats] = useState<Record<string, LibraryFileStats>>({})
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [preview, setPreview] = useState<{ markdown: string; title: string } | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)

  const contextLimit = contextWindowTokensForModel(modelId)

  const load = useCallback(async () => {
    const [entries, stats] = await Promise.all([fetchLibraryManifest(), fetchLibraryFileStats()])
    setManifest(entries)
    setFileStats(stats)
    setSelectedIds(getSelectedFileIds())
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (manifest.length === 0) return
    const ids = getSelectedFileIds()
    const allowed = ids.filter((id) => {
      const entry = manifest.find((e) => e.id === id)
      if (!entry) return false
      return !isLibraryFileBlockedForModel(fileStats[entry.path], modelId)
    })
    if (allowed.length === ids.length) return
    setSelectedFileIds(allowed)
    setSelectedIds(allowed)
    emitLibrarySelectionChanged()
  }, [modelId, manifest, fileStats])

  const allIds = manifest.map((e) => e.id)

  const openPreview = async (entry: LibraryManifestEntry) => {
    setLoadingPreview(true)
    const content = await fetchLibraryFileText(entry.path)
    const resolved: LibraryFileResolved = { ...entry, content }
    const markdown = buildLibraryPreviewMarkdown(resolved.name, resolved.path, resolved.content)
    setPreview({ markdown, title: entry.name })
    setLoadingPreview(false)
  }

  const toggle = (id: string) => {
    const entry = manifest.find((e) => e.id === id)
    if (entry && isLibraryFileBlockedForModel(fileStats[entry.path], modelId)) return
    const next = toggleSelectedFileId(id)
    setSelectedIds(next)
    emitLibrarySelectionChanged()
  }

  const onSelectAll = () => {
    const allowed = allIds.filter((id) => {
      const entry = manifest.find((e) => e.id === id)
      if (!entry) return false
      return !isLibraryFileBlockedForModel(fileStats[entry.path], modelId)
    })
    selectAllFileIds(allowed)
    setSelectedIds(allowed)
    emitLibrarySelectionChanged()
  }

  const onUnselectAll = () => {
    clearSelectedFileIds()
    setSelectedIds([])
    emitLibrarySelectionChanged()
  }

  return (
    <>
      <aside className="flex min-h-0 w-full max-h-[40vh] shrink-0 flex-col overflow-hidden border-t border-border bg-muted/20 md:h-full md:max-h-none md:w-80 md:self-stretch md:border-t-0 md:border-l">
        <div className="shrink-0 border-b px-3 py-3">
          <h2 className="text-sm font-semibold">Library</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Checked items are sent with each message. Token counts and limits are for{" "}
            <span className="font-medium text-foreground">{modelLabelForId(modelId)}</span> (
            {contextLimit.toLocaleString()} max).
          </p>
          {manifest.length > 0 && (
            <div className="mt-2 flex gap-2">
              <Button type="button" variant="secondary" size="sm" className="h-7 flex-1 text-xs" onClick={onSelectAll}>
                Select all
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-7 flex-1 text-xs" onClick={onUnselectAll}>
                Unselect all
              </Button>
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="space-y-1 p-2">
            {manifest.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center">
                <FileText className="h-8 w-8 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">
                  No entries in <code className="text-[0.65rem]">manifest.json</code>. Deploy after adding files.
                </p>
              </div>
            ) : (
              manifest.map((entry) => {
                const stats = fileStats[entry.path]
                const selected = selectedIds.includes(entry.id)
                const blocked = isLibraryFileBlockedForModel(stats, modelId)
                const fileTokens = libraryFileTokensForModel(stats, modelId)
                const tokenSource = libraryFileTokenSource(stats, modelId)
                return (
                  <div
                    key={entry.id}
                    className={cn(
                      "flex items-start gap-2 rounded-md border px-2 py-2",
                      blocked &&
                        !selected &&
                        "border-red-200/90 bg-red-50/90 dark:border-red-900/60 dark:bg-red-950/30",
                      blocked &&
                        selected &&
                        "border-red-600 bg-red-600/15 dark:border-red-500 dark:bg-red-950/50",
                      !blocked && "border-transparent bg-background/60 hover:border-border"
                    )}
                  >
                    <Checkbox
                      id={`lib-${entry.id}`}
                      checked={selected}
                      disabled={blocked}
                      onCheckedChange={() => toggle(entry.id)}
                      className="mt-0.5"
                      aria-label={`Include ${entry.name}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-1.5">
                        {blocked ? (
                          <AlertTriangle
                            className={cn(
                              "mt-0.5 h-4 w-4 shrink-0",
                              selected ? "text-red-700 dark:text-red-400" : "text-red-500/90 dark:text-red-400/90"
                            )}
                            aria-hidden
                          />
                        ) : null}
                        <label
                          htmlFor={`lib-${entry.id}`}
                          className={cn(
                            "text-sm font-medium leading-snug",
                            blocked ? "cursor-not-allowed text-muted-foreground" : "cursor-pointer"
                          )}
                        >
                          {entry.name}
                        </label>
                      </div>
                      <p className="truncate font-mono text-[0.65rem] text-muted-foreground">{entry.path}</p>
                      {stats ? (
                        <div className="mt-1 space-y-0.5 text-[0.65rem] leading-snug text-muted-foreground tabular-nums">
                          {typeof fileTokens === "number" ? (
                            <p className={cn(blocked && "font-medium text-red-600 dark:text-red-400")}>
                              {fileTokens.toLocaleString()} tokens
                              {tokenSource === "estimate" ? " (estimate)" : ""}
                              {blocked
                                ? ` — over ${contextLimit.toLocaleString()} limit`
                                : ` — fits ${modelLabelForId(modelId)}`}
                            </p>
                          ) : null}
                          <p>{stats.rows.toLocaleString()} rows</p>
                          <p>{stats.columns} columns</p>
                          <p>{formatFileSize(stats.sizeBytes)}</p>
                          {stats.truncation ? (
                            <>
                              <p className="font-medium text-amber-700 dark:text-amber-500">
                                Force-truncated to fit ~
                                {Math.round(stats.truncation.budgetTokens / 1000)}k tokens
                              </p>
                              <p className="text-amber-700 dark:text-amber-500">
                                {stats.truncation.timeFrame
                                  ? `Time frame: ${stats.truncation.timeFrame.start} → ${stats.truncation.timeFrame.end}`
                                  : "Kept leading rows (no date column)"}
                              </p>
                              <p>
                                from {stats.truncation.full.rows.toLocaleString()} rows ·{" "}
                                {formatFileSize(stats.truncation.full.sizeBytes)}
                              </p>
                            </>
                          ) : stats.dateRange ? (
                            <p>
                              Dates: {stats.dateRange.start} → {stats.dateRange.end}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground"
                      title="Preview"
                      disabled={loadingPreview}
                      onClick={() => void openPreview(entry)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </aside>

      <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col gap-0 overflow-hidden sm:max-w-3xl">
          <DialogHeader className="shrink-0 space-y-2 border-b pb-4 text-left">
            <DialogTitle>Preview: {preview?.title}</DialogTitle>
            <DialogDescription className="text-left">
              Raw file text of the data. Whether it can be sent depends on the selected model&apos;s context window.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden py-2 pr-1">
            {preview ? <LibraryMarkdownPreview markdown={preview.markdown} /> : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
