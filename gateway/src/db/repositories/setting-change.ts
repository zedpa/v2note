import { execute } from "../pool.js";

export async function create(
  items: Array<{ record_id: string; text: string; applied?: boolean }>,
): Promise<void> {
  if (items.length === 0) return;
  const values: string[] = [];
  const params: any[] = [];
  let i = 1;
  for (const item of items) {
    values.push(`($${i++}, $${i++}, $${i++})`);
    params.push(item.record_id, item.text, item.applied ?? false);
  }
  await execute(
    `INSERT INTO setting_change (record_id, text, applied) VALUES ${values.join(", ")}`,
    params,
  );
}
