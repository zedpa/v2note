# Task: URL content extraction

Read docs/PLAN-multimodal-input.md for spec.

## 1. Create gateway/src/ingest/url-extractor.ts

```typescript
export async function extractUrl(url: string): Promise<{
  title: string;
  content: string;
  image?: string;
}>
```

- Fetch the URL with timeout 10s and User-Agent header
- Parse HTML with jsdom (already in project or install)
- Use @mozilla/readability (install: npm install @mozilla/readability jsdom) to extract article
- Return title + cleaned article text + og:image if present
- On error return { title: url, content: '[内容无法提取]' }
- Limit content to 5000 chars

Note: Check if jsdom and @mozilla/readability are already installed. If not, install them in gateway/package.json.

## 2. Update gateway/src/routes/ingest.ts

For type='url':
1. Read content field as the URL string
2. Call extractUrl(url)
3. Create record(source_type='material', source='manual')
4. Create transcript(text=extracted content)
5. Create summary(title=extracted title, short_summary=content.slice(0,200))
6. Trigger Digest
7. Return { recordId, status: 'processing', title, preview: content.slice(0,200) }

Run: cd gateway && npx tsc --noEmit
