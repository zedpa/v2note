# Task: Simplify Process handler

Read docs/PLAN-multimodal-input.md section "Process 精简".
Read gateway/src/handlers/process.ts.

## What to change:

Process currently does these things after ASR:
1. Load skills and build prompt ← KEEP (for text cleanup only)
2. Call AI for structured extraction (intents, todos, tags, relays, summary) ← SIMPLIFY
3. Write todos to DB ← REMOVE (Digest handles this)
4. Write customer_requests ← REMOVE
5. Write setting_changes ← REMOVE
6. Write tags ← REMOVE  
7. Write summary ← KEEP
8. Route intents to pending_intent ← REMOVE
9. Goal linking ← REMOVE
10. Todo enrichment ← REMOVE
11. Memory creation (maybeCreateMemory) ← REMOVE (Digest handles this)
12. Soul update ← REMOVE (Digest handles this)
13. Profile update ← REMOVE (Digest handles this)
14. Diary append ← KEEP
15. Digest trigger ← KEEP

## Simplified Process should only:
1. Build a SIMPLIFIED prompt that only asks AI to clean the transcript text (remove filler words, fix typos, preserve sentence structure)
2. Call AI with the simplified prompt
3. Parse response: only extract `summary` field
4. Save summary to DB
5. Update record status to 'completed'
6. Append to diary
7. Trigger Digest (already exists from Phase 1 cognitive engine)

## The simplified AI prompt should be:
"你是一个转写文本清理工具。对以下语音转写文本进行最小化清理：
- 移除口语填充词（嗯、啊、那个、就是说等）
- 修正错别字和语音识别错误
- 严格保留原文表述结构
- 不改写句式，不合并拆分句子
返回 JSON: {\"summary\": \"清理后的文本\"}"

## Important:
- Do NOT delete the old code. Comment it out with /* MOVED TO DIGEST */ markers
- Keep the ProcessResult interface but make most fields optional
- Keep shouldDigestImmediately and the digest trigger at the end
- The function signature processEntry() should not change

Run: cd gateway && npx tsc --noEmit
