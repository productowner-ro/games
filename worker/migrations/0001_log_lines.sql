-- The game log: one row per log line (issue #12). resources/2026-10-20-game-log-spec.md holds the format.
CREATE TABLE log_lines (
  game        TEXT NOT NULL,
  game_id     TEXT NOT NULL,
  seq         INTEGER NOT NULL,
  line        TEXT NOT NULL,
  received_at TEXT NOT NULL,
  PRIMARY KEY (game_id, seq)
);
