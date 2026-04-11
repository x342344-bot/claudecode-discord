import Database from "better-sqlite3";
import path from "node:path";
import type { EffortLevel, MessageLog, Project, Session, SessionStatus } from "./types.js";

const DB_PATH = path.join(process.cwd(), "data.db");

let db: Database.Database;

export function initDatabase(): void {
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      channel_id TEXT PRIMARY KEY,
      project_path TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      auto_approve INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS message_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      content TEXT NOT NULL,
      has_attachments INTEGER DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'normal',
      discord_message_id TEXT,
      message_ts INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_message_logs_created ON message_logs(created_at);

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      channel_id TEXT REFERENCES projects(channel_id) ON DELETE CASCADE,
      session_id TEXT,
      status TEXT DEFAULT 'offline',
      last_activity TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Migration: add effort column to projects if not exists
  const columns = db.pragma("table_info(projects)") as { name: string }[];
  if (!columns.some((c) => c.name === "effort")) {
    db.exec("ALTER TABLE projects ADD COLUMN effort TEXT DEFAULT NULL");
  }

  // Migration: add new columns to message_logs if not exists
  const mlColumns = db.pragma("table_info(message_logs)") as { name: string }[];
  if (mlColumns.length > 0 && !mlColumns.some((c) => c.name === "source")) {
    db.exec("ALTER TABLE message_logs ADD COLUMN source TEXT NOT NULL DEFAULT 'normal'");
    db.exec("ALTER TABLE message_logs ADD COLUMN discord_message_id TEXT");
    db.exec("ALTER TABLE message_logs ADD COLUMN message_ts INTEGER");
  }
}

export function getDb(): Database.Database {
  return db;
}

// Project queries
export function registerProject(
  channelId: string,
  projectPath: string,
  guildId: string,
): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO projects (channel_id, project_path, guild_id)
    VALUES (?, ?, ?)
  `);
  stmt.run(channelId, projectPath, guildId);
}

export function unregisterProject(channelId: string): void {
  db.prepare("DELETE FROM sessions WHERE channel_id = ?").run(channelId);
  db.prepare("DELETE FROM projects WHERE channel_id = ?").run(channelId);
}

export function getProject(channelId: string): Project | undefined {
  return db
    .prepare("SELECT * FROM projects WHERE channel_id = ?")
    .get(channelId) as Project | undefined;
}

export function getAllProjects(guildId: string): Project[] {
  return db
    .prepare("SELECT * FROM projects WHERE guild_id = ?")
    .all(guildId) as Project[];
}

export function setAutoApprove(
  channelId: string,
  autoApprove: boolean,
): void {
  db.prepare("UPDATE projects SET auto_approve = ? WHERE channel_id = ?").run(
    autoApprove ? 1 : 0,
    channelId,
  );
}

export function setEffort(
  channelId: string,
  effort: EffortLevel | null,
): void {
  db.prepare("UPDATE projects SET effort = ? WHERE channel_id = ?").run(
    effort,
    channelId,
  );
}

// Session queries
export function upsertSession(
  id: string,
  channelId: string,
  sessionId: string | null,
  status: SessionStatus,
): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO sessions (id, channel_id, session_id, status, last_activity)
    VALUES (?, ?, ?, ?, datetime('now'))
  `);
  stmt.run(id, channelId, sessionId, status);
}

export function getSession(channelId: string): Session | undefined {
  return db
    .prepare(
      "SELECT * FROM sessions WHERE channel_id = ? ORDER BY created_at DESC LIMIT 1",
    )
    .get(channelId) as Session | undefined;
}

export function updateSessionStatus(
  channelId: string,
  status: SessionStatus,
): void {
  db.prepare(
    "UPDATE sessions SET status = ?, last_activity = datetime('now') WHERE channel_id = ?",
  ).run(status, channelId);
}

// Message logging
export function logMessage(
  channelId: string,
  userId: string,
  content: string,
  hasAttachments: boolean,
  source: "normal" | "ask_question" = "normal",
  discordMessageId?: string,
  messageTs?: number,
): void {
  try {
    db.prepare(
      "INSERT INTO message_logs (channel_id, user_id, content, has_attachments, source, discord_message_id, message_ts) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(channelId, userId, content, hasAttachments ? 1 : 0, source, discordMessageId ?? null, messageTs ?? null);
  } catch (e) {
    console.warn("[journal] Failed to log message:", e instanceof Error ? e.message : e);
  }
}

export function getMessageLogs(since: string, until?: string): MessageLog[] {
  if (until) {
    return db.prepare(
      "SELECT * FROM message_logs WHERE created_at >= ? AND created_at < ? ORDER BY created_at",
    ).all(since, until) as MessageLog[];
  }
  return db.prepare(
    "SELECT * FROM message_logs WHERE created_at >= ? ORDER BY created_at",
  ).all(since) as MessageLog[];
}

export function getAllSessions(guildId: string): (Session & { project_path: string })[] {
  return db
    .prepare(`
      SELECT s.*, p.project_path FROM sessions s
      JOIN projects p ON s.channel_id = p.channel_id
      WHERE p.guild_id = ?
    `)
    .all(guildId) as (Session & { project_path: string })[];
}
