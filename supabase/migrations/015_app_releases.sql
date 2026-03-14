-- App release / OTA update tracking
CREATE TABLE IF NOT EXISTS app_release (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version TEXT NOT NULL,              -- semver "1.2.0"
  version_code INTEGER NOT NULL,      -- android versionCode
  platform TEXT NOT NULL DEFAULT 'android',
  release_type TEXT NOT NULL,         -- 'apk' | 'ota'
  bundle_url TEXT,                    -- file path or full URL
  file_size INTEGER,
  checksum TEXT,                      -- sha256
  changelog TEXT,
  is_mandatory BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  min_native_version TEXT,            -- OTA: minimum APK version required
  published_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(version, platform, release_type)
);

CREATE INDEX idx_app_release_lookup
  ON app_release(platform, release_type, is_active, version_code DESC);
