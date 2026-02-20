export interface Tag {
    id: string;
    name: string;
}
export declare function upsert(name: string): Promise<Tag>;
export declare function findAll(): Promise<Tag[]>;
export declare function findByRecordId(recordId: string): Promise<Tag[]>;
export declare function addToRecord(recordId: string, tagId: string): Promise<void>;
export declare function removeFromRecord(recordId: string, tagId: string): Promise<void>;
