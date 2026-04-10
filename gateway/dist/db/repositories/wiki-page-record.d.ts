export interface WikiPageRecord {
    wiki_page_id: string;
    record_id: string;
    added_at: string;
}
/** 关联 wiki page 与 record */
export declare function link(wikiPageId: string, recordId: string): Promise<void>;
/** 解除关联 */
export declare function unlink(wikiPageId: string, recordId: string): Promise<void>;
/** 查找某个 wiki page 关联的所有 record ID */
export declare function findRecordsByPage(wikiPageId: string): Promise<WikiPageRecord[]>;
/** 查找某个 record 关联的所有 wiki page ID */
export declare function findPagesByRecord(recordId: string): Promise<WikiPageRecord[]>;
/** 统计某个 wiki page 关联的 record 数量 */
export declare function countByPage(wikiPageId: string): Promise<number>;
