/**
 * Promote module — semantic fusion of Strikes.
 *
 * Identifies Strikes within a cluster that are essentially saying the same thing
 * (not merely related) and promotes them into a higher-order abstracted Strike.
 */
export interface PromoteResult {
    promoted: number;
    skipped: number;
}
export declare function runPromote(userId: string): Promise<PromoteResult>;
