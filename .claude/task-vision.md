# Task: Image processing via Vision LLM

Read docs/PLAN-multimodal-input.md for spec.
Read gateway/src/ai/provider.ts for existing AI call patterns.

## 1. Create gateway/src/ai/vision.ts

```typescript
export async function describeImage(imageUrl: string): Promise<string>
```

- Call DashScope API with qwen-vl-max model (or env var VISION_MODEL)
- Use the same base URL and API key as existing provider.ts (DASHSCOPE_API_KEY, AI_BASE_URL)
- System prompt: "描述这张图片的内容。如果是文字截图，提取所有文字。如果是白板/笔记，提取要点。如果是照片，描述场景和关键信息。用中文回复。"
- Send image as URL in the message content (multimodal format)
- Return the description text
- Timeout 30s
- On error return fallback: "[图片内容无法识别]"

DashScope multimodal API format:
```json
{
  "model": "qwen-vl-max",
  "messages": [{
    "role": "user",
    "content": [
      {"type": "image_url", "image_url": {"url": "IMAGE_URL"}},
      {"type": "text", "text": "PROMPT"}
    ]
  }]
}
```

## 2. Update gateway/src/routes/ingest.ts

For type='image':
1. Accept file upload (for now, accept base64 in JSON body field 'file_base64')
2. Upload to OSS (use existing gateway/src/storage/oss.ts uploadFile)
3. Call describeImage(ossUrl)
4. Create record(source_type='material', source='manual')
5. Create transcript(text=description)
6. Create summary(title=description.slice(0,50), short_summary=description)
7. Trigger Digest
8. Return { recordId, status: 'processing', description }

If OSS is not configured, save base64 as data URL and pass directly to vision API.

Run: cd gateway && npx tsc --noEmit
