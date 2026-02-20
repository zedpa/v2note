export interface Summary {
    id: string;
    record_id: string;
    title: string;
    short_summary: string;
    long_summary: string;
    created_at: string;
}
export declare function findByRecordId(recordId: string): Promise<Summary | null>;
export declare function create(fields: {
    record_id: string;
    title?: string;
    short_summary?: string;
    long_summary?: string;
}): Promise<Summary>;
export declare function update(recordId: string, fields: {
    title?: string;
    short_summary?: string;
    long_summary?: string;
}): Promise<void>;
