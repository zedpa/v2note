# Task: Create Ingest API endpoint

Read docs/PLAN-multimodal-input.md for full spec.
Read docs/genes.md for project overview.
Read gateway/src/routes/records.ts and gateway/src/handlers/process.ts for existing patterns.

## Create: gateway/src/routes/ingest.ts

POST /api/v1/ingest

Accept multipart/form-data OR application/json.

### Parameters:
- type: 'text' | 'image' | 'file' | 'url' | 'audio' (required)
- content: string (for text/url types)
- file: uploaded file (for image/file/audio types)
- source_type: 'think' | 'material' (default 'material')
- metadata: JSON string with optional fields: source, tags[], linked_topic

### Implementation for type='text' (others are placeholder for now):
1. Get userId from auth (getUserId from http-helpers)
2. Get deviceId from header (getDeviceId)
3. Create a record: recordRepo.create({ device_id: deviceId, user_id: userId, status: 'completed', source: 'manual' })
4. Create transcript: transcriptRepo.create({ record_id: recordId, text: content })
5. Create summary: summaryRepo.create({ record_id: recordId, title: content.slice(0,50), short_summary: content })
6. Set source_type on record (need to check if column exists, if not skip)
7. Trigger Digest: import digestRecords from handlers/digest.ts, call digestRecords([recordId], {deviceId, userId})
8. Return { recordId, status: 'processing' }

### For other types, return placeholder:
- type='image': return { error: 'Image processing not yet implemented' } with 501
- type='file': return { error: 'File processing not yet implemented' } with 501  
- type='url': return { error: 'URL processing not yet implemented' } with 501
- type='audio': return { error: 'Use existing /process endpoint for audio' } with 400

### Register route in gateway/src/index.ts

### Handle multipart:
For now, only handle JSON body (Content-Type: application/json).
Multipart file upload support will be added in Phase 2.

Run: cd gateway && npx tsc --noEmit
