# Task: Connect PC write panel placeholders to real Ingest API

Read app/write/page.tsx — it already has paste/drop handlers that insert placeholder blocks.
Read shared/lib/api.ts for api.post pattern.
Read gateway/src/routes/ingest.ts for the API spec.

## Update app/write/page.tsx

### 1. Image paste → real upload
When paste handler inserts [📷 image], also:
- Convert clipboard image to base64
- Call api.post('/api/v1/ingest', { type: 'image', file_base64: base64, source_type: 'material' })
- On success, update the placeholder block with the returned description preview

### 2. URL paste → real extraction  
When paste handler detects URL:
- Call api.post('/api/v1/ingest', { type: 'url', content: url, source_type: 'material' })
- On success, replace [🌐 url] block with: [🌐 title - preview text...]

### 3. File drop → real upload
When drop handler creates [📎 filename]:
- Read file as base64
- Call api.post('/api/v1/ingest', { type: 'file', file_base64: base64, filename: name, mimeType: type, source_type: 'material' })
- On success, update placeholder with preview

### 4. Source type toggle in timeline
Create a small component features/notes/components/source-type-badge.tsx:
- Props: recordId: string, currentType: 'think' | 'material'
- Shows: 📎素材 or 🧠Think badge (pill shape)
- Click toggles: calls api.patch('/api/v1/records/:id/source-type', { source_type: newType })
- Optimistic UI update

### Important:
- All uploads are fire-and-forget (don't block the editor)
- Show a small toast on success/failure
- Keep the placeholder text in editor even if upload fails

Run: npx tsc --noEmit
