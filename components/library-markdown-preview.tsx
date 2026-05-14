"use client"

import ReactMarkdown from "react-markdown"
import { cn } from "@/lib/utils"

export function LibraryMarkdownPreview({ markdown }: { markdown: string }) {
  return (
    <div className="library-md-preview text-sm leading-relaxed">
      <ReactMarkdown
        components={{
          h1: ({ children }) => (
            <h1 className="mb-3 shrink-0 border-b pb-2 text-lg font-semibold tracking-tight">{children}</h1>
          ),
          pre: ({ children }) => (
            <pre className="my-0 max-w-full overflow-x-auto rounded-md border border-border bg-muted p-3 font-mono text-xs leading-normal whitespace-pre text-foreground">
              {children}
            </pre>
          ),
          code: ({ className, children, ...props }) => (
            <code className={cn(className, "block whitespace-pre bg-transparent p-0 text-inherit")} {...props}>
              {children}
            </code>
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  )
}
