export interface Tag {
    id: string;
    name: string;
}
export declare function upsert(name: string): Promise<Tag>;
export declare function findByName(name: string): Promise<Tag | null>;
export declare function findAll(): Promise<Tag[]>;
export declare function findByRecordId(recordId: string): Promise<Tag[]>;
/** 批量查询多条 record 的 tags */
export declare function findByRecordIds(recordIds: string[]): Promise<Array<{
    record_id: string;
} & Tag>>;
export declare function addToRecord(recordId: string, tagId: string): Promise<void>;
export declare function removeFromRecord(recordId: string, tagId: string): Promise<void>;
