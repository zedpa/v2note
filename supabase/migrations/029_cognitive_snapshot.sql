-- 认知快照表：存储每个用户的认知结构压缩表示，供 Tier2 批量分析增量使用
CREATE TABLE IF NOT EXISTS cognitive_snapshot (
  user_id               UUID PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
  clusters              JSONB NOT NULL DEFAULT '[]',
  goals                 JSONB NOT NULL DEFAULT '[]',
  contradictions        JSONB NOT NULL DEFAULT '[]',
  patterns              JSONB NOT NULL DEFAULT '[]',
  last_analyzed_strike_id UUID,
  strike_count          INTEGER NOT NULL DEFAULT 0,
  version               INTEGER NOT NULL DEFAULT 1,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 加速按用户+时间查新增 Strike
CREATE INDEX IF NOT EXISTS idx_strike_user_created
  ON strike (user_id, created_at)
  WHERE status = 'active';
