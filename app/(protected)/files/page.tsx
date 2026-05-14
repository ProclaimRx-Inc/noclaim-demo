"use client"

import { useState, useEffect } from "react"
import { Plus, Trash2, FileText, Link as LinkIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface FileItem {
  id: string
  name: string
  type: string
  url: string
  createdAt: string
}

const FILE_TYPES = [
  { value: "pdf", label: "PDF Document" },
  { value: "doc", label: "Word Document" },
  { value: "txt", label: "Text File" },
  { value: "csv", label: "CSV File" },
  { value: "json", label: "JSON File" },
  { value: "other", label: "Other" },
]

export default function FilesPage() {
  const [files, setFiles] = useState<FileItem[]>([])
  const [open, setOpen] = useState(false)
  const [newFile, setNewFile] = useState({ name: "", type: "pdf", url: "" })

  useEffect(() => {
    const stored = localStorage.getItem("managed-files")
    if (stored) {
      setFiles(JSON.parse(stored))
    }
  }, [])

  const saveFiles = (updatedFiles: FileItem[]) => {
    setFiles(updatedFiles)
    localStorage.setItem("managed-files", JSON.stringify(updatedFiles))
  }

  const handleAddFile = () => {
    if (!newFile.name || !newFile.url) return

    const file: FileItem = {
      id: crypto.randomUUID(),
      name: newFile.name,
      type: newFile.type,
      url: newFile.url,
      createdAt: new Date().toISOString(),
    }

    saveFiles([...files, file])
    setNewFile({ name: "", type: "pdf", url: "" })
    setOpen(false)
  }

  const handleDeleteFile = (id: string) => {
    saveFiles(files.filter((f) => f.id !== id))
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <h1 className="text-xl font-semibold">File Management</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add File
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add File Reference</DialogTitle>
              <DialogDescription>
                Add a reference to an externally hosted file.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">File Name</Label>
                <Input
                  id="name"
                  value={newFile.name}
                  onChange={(e) => setNewFile({ ...newFile, name: e.target.value })}
                  placeholder="e.g., Company Guidelines.pdf"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="type">File Type</Label>
                <Select
                  value={newFile.type}
                  onValueChange={(value) => setNewFile({ ...newFile, type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FILE_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="url">File URL</Label>
                <Input
                  id="url"
                  value={newFile.url}
                  onChange={(e) => setNewFile({ ...newFile, url: e.target.value })}
                  placeholder="https://..."
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddFile} disabled={!newFile.name || !newFile.url}>
                Add File
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      <div className="flex-1 overflow-auto p-6">
        {files.length === 0 ? (
          <Card className="mx-auto max-w-md">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <FileText className="h-6 w-6 text-muted-foreground" />
              </div>
              <CardTitle>No files yet</CardTitle>
              <CardDescription>
                Add file references that can be attached to chat messages.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {files.map((file) => (
              <Card key={file.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{file.name}</CardTitle>
                        <CardDescription className="text-xs uppercase">
                          {file.type}
                        </CardDescription>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => handleDeleteFile(file.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                  >
                    <LinkIcon className="h-3 w-3" />
                    <span className="truncate">{file.url}</span>
                  </a>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
