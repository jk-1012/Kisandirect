CREATE TABLE IF NOT EXISTS storefronts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id VARCHAR(25) UNIQUE NOT NULL,
  owner_id UUID NOT NULL REFERENCES users(id),
  slug VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  template_used VARCHAR(50),
  page_json JSONB,
  published BOOLEAN NOT NULL DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  plan VARCHAR(20) NOT NULL DEFAULT 'FREE',
  custom_domain VARCHAR(200),
  watermark_hidden BOOLEAN NOT NULL DEFAULT FALSE,
  meta_title VARCHAR(200),
  meta_description TEXT,
  og_image_url TEXT,
  view_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS storefront_analytics (
  id BIGSERIAL PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES storefronts(id),
  event_type VARCHAR(30) NOT NULL,
  referrer VARCHAR(500),
  visitor_country VARCHAR(2),
  visitor_state VARCHAR(100),
  visitor_district VARCHAR(100),
  device_type VARCHAR(20),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

SELECT create_hypertable('storefront_analytics', 'recorded_at', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_analytics_store_time ON storefront_analytics(store_id, recorded_at DESC);
