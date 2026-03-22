# Task: File parsing for PDF/Word/Excel/text

## 1. Install dependencies in gateway
- pdf-parse (for PDF)
- mammoth (for .docx Word files)
- xlsx (for Excel files)

Install: cd gateway && npm install pdf-parse mammoth xlsx

## 2. Create gateway/src/ingest/file-parser.ts

```typescript
export async function parseFile(buffer: Buffer, filename: string, mimeType: string): Promise<string>
```

- Detect type by mimeType or file extension:
  - application/pdf, .pdf → use pdf-parse, extract text
  - application/vnd.openxmlformats-officedocument.wordprocessingml.document, .docx → use mammoth, extract raw text
  - application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, .xlsx → use xlsx, convert each sheet to CSV text
  - text/*, .txt, .md, .csv → read as UTF-8 text
  - Other → return "[不支持的文件格式: {mimeType}]"
- Limit output to 10000 chars
- On error return "[文件解析失败: {error message}]"

## 3. Update gateway/src/routes/ingest.ts

For type='file':
1. Accept file_base64 + filename + mimeType in JSON body
2. Decode base64 to Buffer
3. Call parseFile(buffer, filename, mimeType)
4. Upload to OSS if configured
5. Create record(source_type='material')
6. Create transcript(text=parsed content)
7. Create summary(title=filename, short_summary=content.slice(0,200))
8. Trigger Digest
9. Return { recordId, status: 'processing', filename, preview: content.slice(0,200) }

Run: cd gateway && npx tsc --noEmit
