/**
 * Anti-hallucination guardrails injected into the hot tier.
 * These rules sit near the top of the system prompt for maximum attention.
 *
 * Inspired by OpenClaw's evidence-based discipline:
 * - Never claim an action was done unless tool actually ran
 * - Every output must have evidence in the source
 */
/** Rules for chat mode (conversation) */
export declare const CHAT_GUARDRAILS = "## \u5BF9\u8BDD\u7EAA\u5F8B\n- \u4E0D\u786E\u5B9A\u7684\u4E8B\u60C5\u660E\u786E\u8BF4\"\u6211\u4E0D\u786E\u5B9A\"\n- \u4E0D\u8981\u7F16\u9020\u7528\u6237\u6CA1\u8BF4\u8FC7\u7684\u4E8B\u5B9E\n- \u5F15\u7528\u8BB0\u5FC6\u65F6\u6807\u6CE8\u6765\u6E90\u65E5\u671F\n- \u533A\u5206\"\u7528\u6237\u8BF4\u8FC7\"\u548C\"\u6211\u63A8\u6D4B\"";
/** Rules for briefing mode */
export declare const BRIEFING_GUARDRAILS = "## \u7B80\u62A5\u7EAA\u5F8B\n- \u53EA\u57FA\u4E8E\u5B9E\u9645\u7684\u5F85\u529E\u548C\u8BB0\u5F55\u6570\u636E\u751F\u6210\u7B80\u62A5\n- \u4E0D\u8981\u865A\u6784\u7EDF\u8BA1\u6570\u5B57\u6216\u5B8C\u6210\u60C5\u51B5\n- \u660E\u786E\u533A\u5206\u5DF2\u786E\u8BA4\u4E8B\u5B9E\u548CAI\u5EFA\u8BAE";
