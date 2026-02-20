import { execute } from "../pool.js";
export async function create(items) {
    if (items.length === 0)
        return;
    const values = [];
    const params = [];
    let i = 1;
    for (const item of items) {
        values.push(`($${i++}, $${i++}, $${i++})`);
        params.push(item.record_id, item.text, item.status ?? "pending");
    }
    await execute(`INSERT INTO customer_request (record_id, text, status) VALUES ${values.join(", ")}`, params);
}
//# sourceMappingURL=customer-request.js.map