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
import type { LibraryFileResolved, LibraryFileStats, LibraryManifestEntry } from "@/lib/types"
import { isLibraryFileBlockedByEstimatedTokens } from "@/lib/library-file-token-policy"
import { cn } from "@/lib/utils"
import {
  clearSelectedFileIds,
  emitLibrarySelectionChanged,
  getSelectedFileIds,
  selectAllFileIds,
  toggleSelectedFileId,
} from "@/lib/selected-files"

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ChatLibraryPanel() {
  const [manifest, setManifest] = useState<LibraryManifestEntry[]>([])
  const [fileStats, setFileStats] = useState<Record<string, LibraryFileStats>>({})
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [preview, setPreview] = useState<{ markdown: string; title: string } | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)

  const load = useCallback(async () => {
    const [entries, stats] = await Promise.all([fetchLibraryManifest(), fetchLibraryFileStats()])
    setManifest(entries)
    setFileStats(stats)
    setSelectedIds(getSelectedFileIds())
  }, [])

  useEffect(() => {
    void load()
  }, [load])

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
    const next = toggleSelectedFileId(id)
    setSelectedIds(next)
    emitLibrarySelectionChanged()
  }

  const onSelectAll = () => {
    const allowed = allIds.filter((id) => {
      const entry = manifest.find((e) => e.id === id)
      if (!entry) return false
      return !isLibraryFileBlockedByEstimatedTokens(fileStats[entry.path])
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
          <p className="mt-1 text-xs text-muted-foreground">Checked items are sent with each message.</p>
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
                const unacceptable = isLibraryFileBlockedByEstimatedTokens(stats)
                return (
                <div
                  key={entry.id}
                  className={cn(
                    "flex items-start gap-2 rounded-md border px-2 py-2",
                    unacceptable &&
                      !selected &&
                      "border-red-200/90 bg-red-50/90 dark:border-red-900/60 dark:bg-red-950/30",
                    unacceptable &&
                      selected &&
                      "border-red-600 bg-red-600/15 dark:border-red-500 dark:bg-red-950/50",
                    !unacceptable && "border-transparent bg-background/60 hover:border-border"
                  )}
                >
                  <Checkbox
                    id={`lib-${entry.id}`}
                    checked={selected}
                    onCheckedChange={() => toggle(entry.id)}
                    className="mt-0.5"
                    aria-label={`Include ${entry.name}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-1.5">
                      {unacceptable ? (
                        <AlertTriangle
                          className={cn(
                            "mt-0.5 h-4 w-4 shrink-0",
                            selected ? "text-red-700 dark:text-red-400" : "text-red-500/90 dark:text-red-400/90"
                          )}
                          aria-hidden
                        />
                      ) : null}
                      <label htmlFor={`lib-${entry.id}`} className="cursor-pointer text-sm font-medium leading-snug">
                        {entry.name}
                      </label>
                    </div>
                    <p className="truncate font-mono text-[0.65rem] text-muted-foreground">{entry.path}</p>
                    {stats ? (
                      <div className="mt-1 space-y-0.5 text-[0.65rem] leading-snug text-muted-foreground tabular-nums">
                        <p>~{stats.estimatedTokens.toLocaleString()} tokens (estimate)</p>
                        <p>{stats.rows.toLocaleString()} rows</p>
                        <p>{stats.columns} columns</p>
                        <p>{formatFileSize(stats.sizeBytes)}</p>
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
              )})
            )}
          </div>
        </div>
      </aside>

      <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col gap-0 overflow-hidden sm:max-w-3xl">
          <DialogHeader className="shrink-0 space-y-2 border-b pb-4 text-left">
            <DialogTitle>Preview: {preview?.title}</DialogTitle>
            <DialogDescription className="text-left">
              Raw file text of the data. If the file is too large, it cannot be sent to the model.
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
