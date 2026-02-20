import { execute } from "../pool.js";

export async function create(
  items: Array<{ record_id: string; text: string; status?: string }>,
): Promise<void> {
  if (items.length === 0) return;
  const values: string[] = [];
  const params: any[] = [];
  let i = 1;
  for (const item of items) {
    values.push(`($${i++}, $${i++}, $${i++})`);
    params.push(item.record_id, item.text, item.status ?? "pending");
  }
  await execute(
    `INSERT INTO customer_request (record_id, text, status) VALUES ${values.join(", ")}`,
    params,
  );
}
