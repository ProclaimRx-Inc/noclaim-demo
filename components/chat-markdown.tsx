"use client"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

/** GFM markdown for assistant bubbles (compact, readable on `bg-muted`). */
export function ChatMarkdown({ source }: { source: string }) {
  return (
    <div className="chat-md-content min-w-0 text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="mb-2 mt-3 border-b border-border/60 pb-1 text-base font-semibold first:mt-0">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-2 mt-3 text-[0.95rem] font-semibold first:mt-0">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-1.5 mt-2 text-sm font-semibold first:mt-0">{children}</h3>
          ),
          p: ({ children }) => <p className="mb-2 last:mb-0 [&>code]:rounded [&>code]:bg-background/70 [&>code]:px-1 [&>code]:py-0.5">{children}</p>,
          ul: ({ children }) => <ul className="mb-2 list-disc space-y-0.5 pl-5 last:mb-0">{children}</ul>,
          ol: ({ children }) => <ol className="mb-2 list-decimal space-y-0.5 pl-5 last:mb-0">{children}</ol>,
          li: ({ children }) => <li className="[&>p]:mb-0">{children}</li>,
          a: ({ href, children }) => (
            <a
              href={href}
              className="font-medium text-primary underline underline-offset-2 hover:text-primary/90"
              target="_blank"
              rel="noopener noreferrer"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-primary/40 pl-3 text-muted-foreground italic">{children}</blockquote>
          ),
          hr: () => <hr className="my-3 border-border" />,
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[240px] border-collapse text-left text-xs">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-background/60">{children}</thead>,
          tbody: ({ children }) => <tbody className="divide-y divide-border">{children}</tbody>,
          tr: ({ children }) => <tr>{children}</tr>,
          th: ({ children }) => (
            <th className="border-b border-border px-2 py-1.5 font-medium text-foreground">{children}</th>
          ),
          td: ({ children }) => <td className="px-2 py-1.5 align-top">{children}</td>,
          pre: ({ children }) => (
            <pre className="my-2 overflow-x-auto rounded-md border border-border bg-background p-3 font-mono text-xs leading-relaxed">
              {children}
            </pre>
          ),
          code: ({ className, children, ...props }) => {
            const isBlock = /language-/.test(className ?? "")
            if (isBlock) {
              return (
                <code className={className} {...props}>
                  {children}
                </code>
              )
            }
            return (
              <code className="rounded bg-background/70 px-1 py-0.5 font-mono text-[0.85em]" {...props}>
                {children}
              </code>
            )
          },
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  )
}
