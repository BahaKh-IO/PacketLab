-- PacketLab backend: database schema (SQLite: Cloudflare D1 in production, node:sqlite locally).

-- One row per student account.
CREATE TABLE IF NOT EXISTS utilisateurs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nom           TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,          -- stored in lower case
  mot_de_passe  TEXT NOT NULL,                 -- "pbkdf2$<iterations>$<salt hex>$<hash hex>", never the password
  cree_le       TEXT NOT NULL
);

-- Open sessions. Only the SHA-256 hash of the token is stored:
-- someone who reads the database still cannot log in as a student.
CREATE TABLE IF NOT EXISTS sessions (
  jeton_hash      TEXT PRIMARY KEY,
  utilisateur_id  INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  expire_le       TEXT NOT NULL
);

-- The "labs réalisés": the progress object of js/progress.js, one per student.
CREATE TABLE IF NOT EXISTS progressions (
  utilisateur_id  INTEGER PRIMARY KEY REFERENCES utilisateurs(id) ON DELETE CASCADE,
  donnees         TEXT NOT NULL,               -- JSON
  maj             TEXT NOT NULL
);

-- Failed logins per email, to slow down password guessing.
CREATE TABLE IF NOT EXISTS tentatives (
  email          TEXT PRIMARY KEY,
  echecs         INTEGER NOT NULL,
  bloque_jusqu   TEXT
);
