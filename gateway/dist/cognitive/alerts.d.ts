/**
 * Cognitive alerts — generates user-facing alerts for recent contradictions.
 */
export interface CognitiveAlert {
    type: "contradiction";
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
    bondId: string;
    description: string;
}
export declare function generateAlerts(userId: string): Promise<CognitiveAlert[]>;
