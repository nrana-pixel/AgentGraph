-- Create GIN index for full-text search on the tools table.
-- Speeds up the plainto_tsquery / to_tsvector queries in the recommendation engine.
-- Note: CONCURRENTLY omitted — Drizzle's migrator wraps migrations in a transaction,
-- and CREATE INDEX CONCURRENTLY cannot run inside a transaction block.
CREATE INDEX IF NOT EXISTS idx_tools_fts
  ON tools
  USING gin (
    to_tsvector(
      'english',
      coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(array_to_string(tags, ' '), '')
    )
  );

CREATE INDEX IF NOT EXISTS idx_tools_category   ON tools (category);
CREATE INDEX IF NOT EXISTS idx_tools_data_source ON tools (data_source);
