"use client"

import { useCallback, useEffect, useState } from "react"
import { Eye, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { LibraryMarkdownPreview } from "@/components/library-markdown-preview"
import { fetchLibraryFileText, fetchLibraryManifest } from "@/lib/library-client"
import { buildLibraryPreviewMarkdown } from "@/lib/library-preview-markdown"
import type { LibraryFileResolved, LibraryManifestEntry } from "@/lib/types"
import {
  clearSelectedFileIds,
  getSelectedFileIds,
  selectAllFileIds,
  toggleSelectedFileId,
} from "@/lib/selected-files"

export function ChatLibraryPanel() {
  const [manifest, setManifest] = useState<LibraryManifestEntry[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [preview, setPreview] = useState<{ markdown: string; title: string } | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)

  const load = useCallback(async () => {
    const entries = await fetchLibraryManifest()
    setManifest(entries)
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
  }

  const onSelectAll = () => {
    selectAllFileIds(allIds)
    setSelectedIds([...allIds])
  }

  const onUnselectAll = () => {
    clearSelectedFileIds()
    setSelectedIds([])
  }

  return (
    <>
      <aside className="flex max-h-[40vh] w-full shrink-0 flex-col border-t border-border bg-muted/20 md:max-h-none md:w-80 md:border-t-0 md:border-l">
        <div className="border-b px-3 py-3">
          <h2 className="text-sm font-semibold">Library</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Files from <code className="rounded bg-muted px-0.5">public/library/</code>. Checked items are sent with
            each message.
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

        <ScrollArea className="flex-1">
          <div className="space-y-1 p-2">
            {manifest.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center">
                <FileText className="h-8 w-8 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">
                  No entries in <code className="text-[0.65rem]">manifest.json</code>. Deploy after adding files.
                </p>
              </div>
            ) : (
              manifest.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start gap-2 rounded-md border border-transparent bg-background/60 px-2 py-2 hover:border-border"
                >
                  <Checkbox
                    id={`lib-${entry.id}`}
                    checked={selectedIds.includes(entry.id)}
                    onCheckedChange={() => toggle(entry.id)}
                    className="mt-0.5"
                    aria-label={`Include ${entry.name}`}
                  />
                  <div className="min-w-0 flex-1">
                    <label htmlFor={`lib-${entry.id}`} className="cursor-pointer text-sm font-medium leading-snug">
                      {entry.name}
                    </label>
                    <p className="truncate font-mono text-[0.65rem] text-muted-foreground">{entry.path}</p>
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
              ))
            )}
          </div>
        </ScrollArea>
      </aside>

      <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col gap-0 overflow-hidden sm:max-w-3xl">
          <DialogHeader className="shrink-0 space-y-2 border-b pb-4 text-left">
            <DialogTitle>Preview: {preview?.title}</DialogTitle>
            <DialogDescription className="text-left">
              Markdown view for reading. The chat API receives the raw file body in a fixed document block (not this
              markdown table).
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[min(60vh,480px)] min-h-[200px] pr-3">
            {preview ? <LibraryMarkdownPreview markdown={preview.markdown} /> : null}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  )
}
