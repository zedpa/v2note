/**
 * Decision analysis — deep cognitive graph traversal for decision support.
 *
 * When user says "帮我想想要不要换供应商", this module:
 * 1. Deep semantic retrieval across all time (not date-range limited)
 * 2. Loads related clusters + cognitive patterns
 * 3. Builds a decision-specific prompt with source attribution
 * 4. Returns structured analysis with Strike ID citations
 */
export interface DecisionContext {
    /** Relevant strikes with attribution */
    strikes: Array<{
        id: string;
        nucleus: string;
        polarity: string;
        confidence: number;
        created_at: string;
    }>;
    /** Related clusters */
    clusters: Array<{
        id: string;
        name: string;
        memberCount: number;
    }>;
    /** Cognitive patterns (realize strikes from emergence) */
    patterns: Array<{
        id: string;
        nucleus: string;
        confidence: number;
    }>;
    /** Contradiction pairs */
    contradictions: Array<{
        strikeA: {
            id: string;
            nucleus: string;
        };
        strikeB: {
            id: string;
            nucleus: string;
        };
    }>;
}
/**
 * Gather all relevant cognitive context for a decision question.
 */
export declare function gatherDecisionContext(question: string, userId: string): Promise<DecisionContext>;
/**
 * Build the decision analysis system prompt.
 */
export declare function buildDecisionPrompt(ctx: DecisionContext): string;
