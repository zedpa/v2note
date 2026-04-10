/**
 * 一次性迁移脚本：Strike Cluster → Wiki Page
 *
 * 将现有的 Cluster（is_cluster=true 的 Strike）迁移为 wiki_page 记录，
 * 并映射 goal.cluster_id → goal.wiki_page_id。
 *
 * 使用: node scripts/migrate-clusters-to-wiki.mjs [--dry-run]
 *
 * 步骤：
 * 1. 查询所有 is_cluster=true 的 Strike
 * 2. 为每个 Cluster 创建对应的 wiki_page
 * 3. 迁移 cluster_member bond → wiki_page_record 关联
 * 4. 映射 goal.cluster_id → goal.wiki_page_id
 * 5. 标记已迁移的 Record 为 compiled（跳过重复编译）
 */
import pg from "pg";
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../gateway/.env") });

const dryRun = process.argv.includes("--dry-run");

const pool = new pg.Pool({
  host: process.env.RDS_HOST,
  port: parseInt(process.env.RDS_PORT ?? "5432"),
  database: process.env.RDS_DATABASE,
  user: process.env.RDS_USER,
  password: process.env.RDS_PASSWORD,
  ssl: process.env.RDS_SSL === "true" ? { rejectUnauthorized: false } : false,
});

try {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Step 1: 查询所有 Cluster
    const { rows: clusters } = await client.query(`
      SELECT s.id, s.user_id, s.nucleus AS title, s.domain, s.embedding, s.created_at, s.updated_at
      FROM strike s
      WHERE s.is_cluster = true AND s.status = 'active'
      ORDER BY s.created_at
    `);
    console.log(`Found ${clusters.length} clusters to migrate`);

    let pagesCreated = 0;
    let goalsLinked = 0;
    let recordsLinked = 0;

    for (const cluster of clusters) {
      // Step 2: 创建 wiki_page
      const { rows: [page] } = await client.query(`
        INSERT INTO wiki_page (user_id, title, content, summary, level, domain, embedding, metadata, compiled_at, created_at, updated_at)
        VALUES ($1, $2, $3, $4, 3, $5, $6, $7, now(), $8, $9)
        RETURNING id
      `, [
        cluster.user_id,
        cluster.title || "未命名主题",
        `## 核心认知\n\n（从 Cluster "${cluster.title}" 迁移，待下次编译时由 AI 重新整理）\n`,
        cluster.title,
        cluster.domain,
        cluster.embedding,
        JSON.stringify({ migrated_from_cluster: cluster.id }),
        cluster.created_at,
        cluster.updated_at,
      ]);
      pagesCreated++;

      // Step 3: 迁移 cluster_member bond → wiki_page_record
      // cluster_member bond: source_strike_id = cluster.id, target_strike_id = member.id
      // member strike 有 source_id 指向 record
      const { rows: memberRecords } = await client.query(`
        SELECT DISTINCT s.source_id AS record_id
        FROM bond b
        JOIN strike s ON s.id = b.target_strike_id
        WHERE b.source_strike_id = $1
          AND b.type = 'cluster_member'
          AND s.source_id IS NOT NULL
      `, [cluster.id]);

      for (const mr of memberRecords) {
        if (mr.record_id) {
          await client.query(`
            INSERT INTO wiki_page_record (wiki_page_id, record_id)
            VALUES ($1, $2) ON CONFLICT DO NOTHING
          `, [page.id, mr.record_id]);
          recordsLinked++;
        }
      }

      // Step 4: 映射 goal.cluster_id → goal.wiki_page_id
      const { rowCount } = await client.query(`
        UPDATE todo SET wiki_page_id = $1
        WHERE cluster_id = $2 AND level >= 1 AND wiki_page_id IS NULL
      `, [page.id, cluster.id]);
      goalsLinked += rowCount ?? 0;

      console.log(`  Cluster "${cluster.title}" → wiki_page ${page.id} (${memberRecords.length} records, ${rowCount ?? 0} goals)`);
    }

    if (dryRun) {
      await client.query("ROLLBACK");
      console.log(`\n[DRY RUN] Would create ${pagesCreated} pages, link ${recordsLinked} records, ${goalsLinked} goals`);
    } else {
      await client.query("COMMIT");
      console.log(`\n Migration complete: ${pagesCreated} pages, ${recordsLinked} records linked, ${goalsLinked} goals linked`);
    }
  } finally {
    client.release();
  }
} catch (err) {
  console.error("Migration failed:", err);
  process.exit(1);
} finally {
  await pool.end();
}
