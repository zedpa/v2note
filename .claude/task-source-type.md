# Task: Add source_type column to record table

Read gateway/src/db/repositories/record.ts for the Record interface.

## Database migration
Create supabase/migrations/018_source_type.sql:
```sql
-- Add source_type to distinguish user's own thoughts from external materials
ALTER TABLE record ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'think' 
  CHECK (source_type IN ('think', 'material'));
```

## Update Record interface
In gateway/src/db/repositories/record.ts:
- Add source_type: string to the Record interface
- Add source_type parameter to the create() function
- Default to 'think' for voice/manual sources, 'material' for imported content

## Update ingest route
In gateway/src/routes/ingest.ts:
- Pass source_type from request body to recordRepo.create()

## Add API endpoint to toggle source_type
In gateway/src/routes/ingest.ts or records.ts:
PATCH /api/v1/records/:id/source-type
body: { source_type: 'think' | 'material' }
- Update the record's source_type field

Run: cd gateway && npx tsc --noEmit
