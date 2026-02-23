/**
 * Voice command matching — detects command patterns in ASR transcripts.
 */
/**
 * Match a voice transcript against known command patterns.
 * Short transcripts (< 10 chars) are checked for command matches.
 */
export declare function matchVoiceCommand(text: string): {
    command: string;
    args: string[];
} | null;
