function fenceBody(raw: string): string {
  return raw.replace(/\n```/g, "\n```\u200b")
}

/** Markdown for the preview dialog: file title heading + raw body in a fenced code block (rendered as monospace). */
export function buildLibraryPreviewMarkdown(fileName: string, _path: string, content: string): string {
  const title = fileName.trim() || _path
  const body = content.trimEnd()
  if (!body) return `# ${title}\n\n\`\`\`\n(empty file)\n\`\`\`\n`
  return `# ${title}\n\n\`\`\`\n${fenceBody(body)}\n\`\`\`\n`
}