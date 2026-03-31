export interface StrikeEntry {
    id: string;
    user_id: string;
    nucleus: string;
    polarity: string;
    field: Record<string, any>;
    source_id: string | null;
    source_span: string | null;
    source_type: string | null;
    confidence: number;
    salience: number;
    status: string;
    superseded_by: string | null;
    is_cluster: boolean;
    level: number | null;
    origin: string | null;
    domain: string | null;
    embedding: any | null;
    created_at: string;
    digested_at: string | null;
}
export declare function create(fields: {
    user_id: string;
    nucleus: string;
    polarity: string;
    field?: Record<string, any>;
    source_id?: string;
    source_span?: string;
    source_type?: string;
    confidence?: number;
    salience?: number;
    status?: string;
    is_cluster?: boolean;
    level?: number;
    origin?: string;
    embedding?: number[];
}): Promise<StrikeEntry>;
export declare function findById(id: string): Promise<StrikeEntry | null>;
export declare function findByUser(userId: string, opts?: {
    status?: string;
    polarity?: string;
    limit?: number;
}): Promise<StrikeEntry[]>;
export declare function findBySource(sourceId: string): Promise<StrikeEntry[]>;
/** 检查同一 source_id 下是否已有相同 nucleus 的 active Strike */
export declare function existsBySourceAndNucleus(sourceId: string, nucleus: string): Promise<boolean>;
export declare function findActive(userId: string, limit?: number): Promise<StrikeEntry[]>;
export declare function updateStatus(id: string, status: string, supersededBy?: string): Promise<void>;
export declare function update(id: string, fields: {
    nucleus?: string;
    polarity?: string;
    field?: Record<string, any>;
    confidence?: number;
    salience?: number;
    status?: string;
    digested_at?: string;
}): Promise<void>;
