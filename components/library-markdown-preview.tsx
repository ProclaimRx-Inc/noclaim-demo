"use client"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

export function LibraryMarkdownPreview({ markdown }: { markdown: string }) {
  return (
    <div className="library-md-preview text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="mb-3 border-b pb-2 text-lg font-semibold tracking-tight">{children}</h1>
          ),
          p: ({ children }) => <p className="mb-2 text-muted-foreground last:mb-0">{children}</p>,
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[280px] border-collapse text-left text-xs">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-muted/80">{children}</thead>,
          tbody: ({ children }) => <tbody className="divide-y divide-border">{children}</tbody>,
          tr: ({ children }) => <tr className="hover:bg-muted/40">{children}</tr>,
          th: ({ children }) => (
            <th className="border-b border-border px-2 py-1.5 font-medium text-foreground">{children}</th>
          ),
          td: ({ children }) => <td className="px-2 py-1.5 align-top text-foreground">{children}</td>,
          pre: ({ children }) => (
            <pre className="my-2 overflow-x-auto rounded-md border border-border bg-muted p-3 font-mono text-xs leading-relaxed">
              {children}
            </pre>
          ),
          code: ({ className, children, ...props }) => (
            <code className={className} {...props}>
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
