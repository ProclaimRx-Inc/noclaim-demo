Build a very simple internal demo chat application using Next.js, TypeScript, Tailwind, and shadcn/ui.

Purpose:
- This is a lightweight internal demo app
- Keep the architecture simple
- Do not overengineer anything

Core functionality:
- User can send chat messages
- User can attach/select uploaded files
- Frontend sends text + selected file metadata to an LLM API endpoint
- Display plain text responses from the API
- No streaming required
- No reasoning UI
- No markdown rendering complexity
- No agents/tools/workflows

Storage:
- Store chat history in localStorage only
- No database for chats
- Files are statically uploaded/admin managed by me
- Do not build a complex upload pipeline

Pages:
1. Login page
2. Chat page
3. File management page

Auth:
- Very simple password-based auth
- Enough to prevent public access
- Middleware protection is sufficient
- No OAuth/providers required

UI:
- Clean modern minimal interface
- Responsive
- Sidebar navigation
- Chat similar to ChatGPT layout but simpler
- Dark mode support

Technical preferences:
- Use App Router
- Use server actions/api routes where appropriate
- Keep components modular
- Avoid unnecessary abstractions
- Avoid Redux/global state libraries