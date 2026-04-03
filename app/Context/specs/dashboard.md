# Feature Spec: Dashboard

## Overview
The main workspace view after authentication. Displays the user's uploaded documents, provides navigation to upload a new document, and serves as the shell for the entire authenticated experience.

## Components

### Frontend: `DashboardShell.tsx` (20,820 bytes)
- Sidebar navigation with collapsible menu.
- Document listing area.
- Quick actions: upload new document, recent documents.
- Responsive layout adapting to screen size.
- Dark theme matching the DocuMind brand.

### Frontend: `WorkspaceShell.tsx` (3,103 bytes)
- Wrapper for the workspace area.
- Handles workspace-level state management.
- Routes between different workspace views (documents, analysis, settings).

### Frontend: `DocumindLanding.tsx` (19,985 bytes)
- Landing page with animated upload interaction.
- "Upload a document" as the primary CTA.
- Animation sequence (via `DocMindScroll.tsx`) before showing upload button.
- File picker integration for PDF, DOCX, images, and text files.

## Backend Routes

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/auth/me` | GET | Verify session, return user info for dashboard header |
| `/api/document/<doc_id>` | GET | Fetch document data (text, filename, size) for display |
| `/upload` | POST | Upload new document (redirects to analysis/chat after) |

## User Flow

```
Browser → localhost:3000
    ├── Not authenticated → AuthPortal.tsx (login/register)
    └── Authenticated →
        ├── / → DocumindLanding (with upload CTA)
        ├── /workspace → WorkspaceShell (document list)
        ├── /dashboard → DashboardShell (sidebar + content area)
        └── /analysis → Analysis page (after upload)
```

## Data Requirements
- User email and auth provider (from `/api/auth/me`).
- List of uploaded documents (future: from PostgreSQL `documents` table query).
- Document metadata: filename, upload date, page count, processing status.
