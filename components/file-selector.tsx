"use client"

import { useState, useEffect } from "react"
import { Paperclip, X, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Checkbox } from "@/components/ui/checkbox"

interface FileItem {
  id: string
  name: string
  type: string
  url: string
}

interface FileSelectorProps {
  selectedFiles: FileItem[]
  onFilesChange: (files: FileItem[]) => void
}

export function FileSelector({ selectedFiles, onFilesChange }: FileSelectorProps) {
  const [files, setFiles] = useState<FileItem[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem("managed-files")
    if (stored) {
      setFiles(JSON.parse(stored))
    }
  }, [open])

  const toggleFile = (file: FileItem) => {
    const isSelected = selectedFiles.some((f) => f.id === file.id)
    if (isSelected) {
      onFilesChange(selectedFiles.filter((f) => f.id !== file.id))
    } else {
      onFilesChange([...selectedFiles, file])
    }
  }

  const removeFile = (fileId: string) => {
    onFilesChange(selectedFiles.filter((f) => f.id !== fileId))
  }

  return (
    <div className="mb-2">
      {selectedFiles.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {selectedFiles.map((file) => (
            <Badge key={file.id} variant="secondary" className="gap-1 pr-1">
              <FileText className="h-3 w-3" />
              <span className="max-w-[150px] truncate">{file.name}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-4 w-4 p-0 hover:bg-transparent"
                onClick={() => removeFile(file.id)}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          ))}
        </div>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <Paperclip className="h-4 w-4" />
            Attach Files
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="start">
          <div className="space-y-2">
            <h4 className="font-medium">Select Files</h4>
            {files.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No files available. Add files in the Files page.
              </p>
            ) : (
              <ScrollArea className="h-[200px]">
                <div className="space-y-2">
                  {files.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center gap-2 rounded-lg border p-2 cursor-pointer hover:bg-muted"
                      onClick={() => toggleFile(file)}
                    >
                      <Checkbox
                        checked={selectedFiles.some((f) => f.id === file.id)}
                        onCheckedChange={() => toggleFile(file)}
                      />
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm truncate flex-1">{file.name}</span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
