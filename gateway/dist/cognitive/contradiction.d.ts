/**
 * Proactive contradiction scanner.
 *
 * Scans recent Judge/Perceive strikes for contradictions against historical
 * strikes, uses AI to classify pairs, and creates bonds accordingly.
 */
export interface ContradictionResult {
    strikeA: {
        id: string;
        nucleus: string;
        polarity: string;
    };
    strikeB: {
        id: string;
        nucleus: string;
        polarity: string;
    };
    verdict: "contradiction" | "perspective_of" | "none";
    explanation: string;
}
export declare function scanContradictions(userId: string, daysBack?: number): Promise<ContradictionResult[]>;
