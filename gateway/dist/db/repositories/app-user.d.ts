export interface AppUser {
    id: string;
    phone: string;
    password_hash: string;
    display_name: string | null;
    created_at: string;
}
export declare function findById(id: string): Promise<AppUser | null>;
export declare function findByPhone(phone: string): Promise<AppUser | null>;
export declare function create(fields: {
    phone: string;
    password_hash: string;
    display_name?: string;
}): Promise<AppUser>;
