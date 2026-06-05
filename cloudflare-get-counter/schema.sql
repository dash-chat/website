-- Dash Chat /get aggregate scan counter — D1 schema.
--
-- One row per (month, country, device) combination. The value `n` is a running
-- count. There is intentionally NO per-click table, NO id column, NO timestamp
-- column, NO IP column, and NO user-agent column. An individual visit cannot be
-- reconstructed from this table — that is the point.
--
-- Example row:  month='2026-06'  country='IR'  device='android'  n=14

CREATE TABLE IF NOT EXISTS counts (
  month   TEXT    NOT NULL,           -- 'YYYY-MM'  (month bucket only)
  country TEXT    NOT NULL,           -- 2-letter code from request.cf.country
  device  TEXT    NOT NULL,           -- 'ios' | 'android' | 'desktop'
  n       INTEGER NOT NULL DEFAULT 0, -- aggregate count
  PRIMARY KEY (month, country, device)
);
