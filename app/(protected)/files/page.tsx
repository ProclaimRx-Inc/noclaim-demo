"use client"

import { useState, useEffect, useCallback, DragEvent } from "react"
import { Trash2, FileText, Link as LinkIcon, Upload, Eye, X } from "lucide-react"
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

interface FileItem {
  id: string
  name: string
  type: string
  url: string
  content?: string
  createdAt: string
}

// Fixed test file for debugging
const TEST_FILE: FileItem = {
  id: "test-file-001",
  name: "Test Document.txt",
  type: "txt",
  url: "internal://test-document",
  content: `This is a test document for debugging purposes.

It contains multiple lines of text that would be sent to the chat when this file is selected.

Key features:
- Line 1: Introduction
- Line 2: Details about the system
- Line 3: Configuration options
- Line 4: Summary and conclusion

END OF TEST DOCUMENT`,
  createdAt: new Date().toISOString(),
}

export default function FilesPage() {
  const [files, setFiles] = useState<FileItem[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem("managed-files")
    if (stored) {
      const parsedFiles = JSON.parse(stored)
      // Ensure test file is always present
      const hasTestFile = parsedFiles.some((f: FileItem) => f.id === TEST_FILE.id)
      if (!hasTestFile) {
        const updatedFiles = [TEST_FILE, ...parsedFiles]
        setFiles(updatedFiles)
        localStorage.setItem("managed-files", JSON.stringify(updatedFiles))
      } else {
        setFiles(parsedFiles)
      }
    } else {
      // Initialize with test file
      setFiles([TEST_FILE])
      localStorage.setItem("managed-files", JSON.stringify([TEST_FILE]))
    }
  }, [])

  const saveFiles = (updatedFiles: FileItem[]) => {
    setFiles(updatedFiles)
    localStorage.setItem("managed-files", JSON.stringify(updatedFiles))
  }

  const handleDeleteFile = (id: string) => {
    // Don't allow deleting the test file
    if (id === TEST_FILE.id) return
    saveFiles(files.filter((f) => f.id !== id))
  }

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const droppedFiles = Array.from(e.dataTransfer.files)
    
    droppedFiles.forEach((file) => {
      const reader = new FileReader()
      reader.onload = (event) => {
        const content = event.target?.result as string
        const newFile: FileItem = {
          id: crypto.randomUUID(),
          name: file.name,
          type: file.name.split(".").pop() || "other",
          url: `local://${file.name}`,
          content: content,
          createdAt: new Date().toISOString(),
        }
        
        setFiles((prev) => {
          const updated = [...prev, newFile]
          localStorage.setItem("managed-files", JSON.stringify(updated))
          return updated
        })
      }
      reader.readAsText(file)
    })
  }, [])

  const generatePlaintext = (file: FileItem): string => {
    return `=== FILE: ${file.name} ===
Type: ${file.type.toUpperCase()}
URL: ${file.url}
Created: ${new Date(file.createdAt).toLocaleString()}

--- CONTENT ---
${file.content || "(No content available - external URL reference)"}
--- END CONTENT ---`
  }

  return (
    <div 
      className="flex h-screen flex-col"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <header className="flex items-center justify-between border-b px-6 py-4">
        <h1 className="text-xl font-semibold">File Management</h1>
      </header>

      <div className="flex-1 overflow-auto p-6">
        {/* Drop zone overlay */}
        {isDragging && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-4 rounded-lg border-2 border-dashed border-primary p-12">
              <Upload className="h-12 w-12 text-primary" />
              <p className="text-lg font-medium">Drop files here to add them</p>
            </div>
          </div>
        )}

        {files.length === 0 ? (
          <Card className="mx-auto max-w-md">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <FileText className="h-6 w-6 text-muted-foreground" />
              </div>
              <CardTitle>No files yet</CardTitle>
              <CardDescription>
                Drag and drop files here to add them.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <>
            <p className="mb-4 text-sm text-muted-foreground">
              Drag and drop files anywhere to add them to your library.
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {files.map((file) => (
                <Card key={file.id} className={file.id === TEST_FILE.id ? "border-primary/50" : ""}>
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
                            {file.id === TEST_FILE.id && " (Test File)"}
                          </CardDescription>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => setPreviewFile(file)}
                          title="Preview plaintext"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {file.id !== TEST_FILE.id && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => handleDeleteFile(file.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <a
                      href={file.url.startsWith("internal://") || file.url.startsWith("local://") ? "#" : file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                      onClick={(e) => {
                        if (file.url.startsWith("internal://") || file.url.startsWith("local://")) {
                          e.preventDefault()
                          setPreviewFile(file)
                        }
                      }}
                    >
                      <LinkIcon className="h-3 w-3" />
                      <span className="truncate">{file.url}</span>
                    </a>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Preview Dialog */}
      <Dialog open={!!previewFile} onOpenChange={(open) => !open && setPreviewFile(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Plaintext Preview: {previewFile?.name}</span>
            </DialogTitle>
            <DialogDescription>
              This is the exact plaintext that would be sent to the chat when this file is selected.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 max-h-[50vh] overflow-auto">
            <pre className="whitespace-pre-wrap rounded-lg bg-muted p-4 font-mono text-sm">
              {previewFile && generatePlaintext(previewFile)}
            </pre>
          </div>
          <div className="flex justify-end">
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
