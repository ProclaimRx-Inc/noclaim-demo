/**
 * Chat route: keep the main inset height-bounded so the chat panel can split
 * fixed chrome (header, library) from the scrolling message list.
 */
export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
}
