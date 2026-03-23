export interface ParseResult {
    success: boolean;
    content: string;
    error?: string;
}
export declare function parseFile(buffer: Buffer, filename: string, mimeType: string): Promise<ParseResult>;
