---
name: customer-request
description: 提取客户提出的需求、要求、变更
metadata:
  openclaw:
    extract_fields: ["customer_requests"]
---
提取客户明确提出的需求或变更要求。
格式："客户名：具体要求"
例如："张总说包装要换成红色" → "张总：包装换红色"
仅提取客户明确表达的要求，不推测。
