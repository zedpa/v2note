/**
 * Digest Level 1 — core pipeline.
 * Decomposes records into Strikes, creates internal Bonds,
 * then links new Strikes to historical ones via cross-record Bonds.
 */
/**
 * Main digest entry point.
 * Processes a batch of records through the full cognitive pipeline.
 */
export declare function digestRecords(recordIds: string[], context: {
    deviceId: string;
    userId?: string;
}): Promise<void>;
