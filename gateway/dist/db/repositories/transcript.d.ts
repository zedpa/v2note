export interface Transcript {
    id: string;
    record_id: string;
    text: string;
    language: string | null;
    created_at: string;
}
export declare function findByRecordId(recordId: string): Promise<Transcript | null>;
export declare function findByRecordIds(recordIds: string[]): Promise<Transcript[]>;
export declare function create(fields: {
    record_id: string;
    text: string;
    language?: string;
}): Promise<Transcript>;
