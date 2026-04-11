export type SessionStatus = "online" | "offline" | "waiting" | "idle";

export type EffortLevel = "low" | "medium" | "high" | "max";

export interface Project {
  channel_id: string;
  project_path: string;
  guild_id: string;
  auto_approve: number; // 0 or 1
  effort: EffortLevel | null;
  created_at: string;
}

export interface Session {
  id: string;
  channel_id: string;
  session_id: string | null; // Claude Agent SDK session ID
  status: SessionStatus;
  last_activity: string | null;
  created_at: string;
}

export interface MessageLog {
  id: number;
  channel_id: string;
  user_id: string;
  content: string;
  has_attachments: number;
  source: string;
  discord_message_id: string | null;
  message_ts: number | null;
  created_at: string;
}
