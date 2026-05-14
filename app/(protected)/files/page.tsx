"use client"

import { useState, useEffect, useCallback } from "react"
import { FileText, Eye, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { fetchLibraryFileText, fetchLibraryManifest } from "@/lib/library-client"
import { buildPlaintextPreview } from "@/lib/preview-plaintext"
import type { LibraryFileResolved, LibraryManifestEntry } from "@/lib/types"
import { getSelectedFileIds, setSelectedFileIds, toggleSelectedFileId } from "@/lib/selected-files"

export default function FilesPage() {
  const [manifest, setManifest] = useState<LibraryManifestEntry[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [previewFile, setPreviewFile] = useState<LibraryFileResolved | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)

  const refreshManifest = useCallback(async () => {
    const entries = await fetchLibraryManifest()
    setManifest(entries)
  }, [])

  useEffect(() => {
    void refreshManifest()
    setSelectedIds(getSelectedFileIds())
  }, [refreshManifest])

  const openPreview = async (entry: LibraryManifestEntry) => {
    setLoadingPreview(true)
    const content = await fetchLibraryFileText(entry.path)
    setPreviewFile({ ...entry, content })
    setLoadingPreview(false)
  }

  const toggleInclude = (id: string) => {
    const next = toggleSelectedFileId(id)
    setSelectedIds(next)
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <h1 className="text-xl font-semibold">Library</h1>
        <Button variant="outline" size="sm" onClick={() => void refreshManifest()}>
          Refresh list
        </Button>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <p className="mb-4 max-w-2xl text-sm text-muted-foreground">
          Documents are read from <code className="rounded bg-muted px-1 py-0.5 text-xs">public/library/</code> via{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">manifest.json</code>. Add or edit files in the repo,
          update the manifest, deploy, then use &quot;Refresh list&quot;. Select files to include their plaintext in the
          next chat request. Preview shows exactly what is sent to the model (plus a short header).
        </p>

        {manifest.length === 0 ? (
          <Card className="mx-auto max-w-md">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <FileText className="h-6 w-6 text-muted-foreground" />
              </div>
              <CardTitle>No library entries</CardTitle>
              <CardDescription>
                Add <code className="text-xs">public/library/manifest.json</code> and text files under{" "}
                <code className="text-xs">public/library/</code>.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {manifest.map((entry) => (
              <Card key={entry.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <Checkbox
                        id={`sel-${entry.id}`}
                        checked={selectedIds.includes(entry.id)}
                        onCheckedChange={() => toggleInclude(entry.id)}
                        aria-label={`Include ${entry.name} in chat`}
                      />
                      <div className="min-w-0">
                        <label htmlFor={`sel-${entry.id}`} className="cursor-pointer">
                          <CardTitle className="truncate text-base">{entry.name}</CardTitle>
                        </label>
                        <CardDescription className="truncate font-mono text-xs">{entry.path}</CardDescription>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                      onClick={() => void openPreview(entry)}
                      disabled={loadingPreview}
                      title="Preview plaintext for AI"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">
                    {selectedIds.includes(entry.id) ? "Included in chat context" : "Not included"}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!previewFile} onOpenChange={(open) => !open && setPreviewFile(null)}>
        <DialogContent className="max-h-[80vh] max-w-2xl">
          <DialogHeader>
            <DialogTitle>Plaintext preview: {previewFile?.name}</DialogTitle>
            <DialogDescription>
              This matches the document block appended for the model when this file is selected for chat (system
              context), except the server wraps it with a short instruction prefix.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] overflow-auto">
            <pre className="whitespace-pre-wrap rounded-lg bg-muted p-4 font-mono text-sm">
              {previewFile && buildPlaintextPreview(previewFile)}
            </pre>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                if (!previewFile) return
                const next = new Set(selectedIds)
                if (next.has(previewFile.id)) next.delete(previewFile.id)
                else next.add(previewFile.id)
                const arr = [...next]
                setSelectedFileIds(arr)
                setSelectedIds(arr)
              }}
            >
              {previewFile && selectedIds.includes(previewFile.id) ? "Remove from chat" : "Include in chat"}
            </Button>
            <Button variant="outline" onClick={() => setPreviewFile(null)}>
              <X className="mr-2 h-4 w-4" />
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
