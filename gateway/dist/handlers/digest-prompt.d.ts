/**
 * Prompts for the Digest pipeline (cognitive layer).
 * - buildDigestPrompt: guides AI to decompose text into Strikes + internal Bonds
 * - buildCrossLinkPrompt: guides AI to link new Strikes with historical ones
 */
export declare function buildDigestPrompt(existingDomains?: string[]): string;
export declare function buildCrossLinkPrompt(): string;
