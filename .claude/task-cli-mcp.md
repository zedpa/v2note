# Task: CLI tool + MCP ingest tool

## 1. Create gateway/src/tools/ingest-tool.ts

Add an 'ingest' tool to the MCP server's builtin tools.

Read gateway/src/tools/builtin.ts to understand the BUILTIN_TOOLS pattern.

Add a new tool:
```typescript
{
  name: 'ingest',
  description: '将信息录入 v2note 认知系统。支持文本、URL。',
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string', description: '要录入的文本内容' },
      url: { type: 'string', description: '要导入的网页 URL' },
      source_type: { type: 'string', enum: ['think', 'material'], description: '内容类型，默认 material' }
    },
    required: ['text']
  }
}
```

Handler: 
- If url provided: create record + call extractUrl + transcript + trigger digest
- If only text: create record + transcript + trigger digest
- Return { success: true, recordId }

Add to BUILTIN_TOOLS array and handle in callBuiltinTool switch.

## 2. Create bin/v2note-cli.mjs

A simple CLI script (not a full npm package yet, just a local script):

```bash
#!/usr/bin/env node
# Usage: node bin/v2note-cli.mjs "text to record"
# Usage: node bin/v2note-cli.mjs --url https://example.com
# Usage: echo "text" | node bin/v2note-cli.mjs
```

Implementation:
- Parse args: first positional arg = text, --url flag, --gateway flag (default http://localhost:3001)
- Read stdin if no positional arg (piped input)
- POST to /api/v1/ingest with appropriate type
- Print result JSON
- No auth for now (add --token flag as placeholder)

Run: cd gateway && npx tsc --noEmit
