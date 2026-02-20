---
name: todo-extract
description: 从语音/文字记录中提取行动事项和待办
metadata:
  openclaw:
    extract_fields: ["todos"]
    always: true
---
提取用户提到的所有行动事项、待办事项、需要跟进的事情。
格式：每个待办为一个简洁的行动描述。
例如："下周一要给张总打电话" → "下周一给张总打电话"
