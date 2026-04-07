/**
 * Push API — 轻量 HTTP server，让外部脚本推送消息到 Discord 频道
 *
 * POST /api/push
 *   Body: { channel: "daily" | "channel-id", content: "消息内容" }
 *   Header: Authorization: Bearer <API_SECRET>
 *
 * GET /api/health
 *   返回 { ok: true, channels: [...] }
 */

import http from "node:http";
import type { Client, TextChannel } from "discord.js";
import { ChannelType } from "discord.js";
import { getConfig } from "../utils/config.js";

const MAX_CONTENT_LENGTH = 50_000; // 50KB, 会自动分片
const DISCORD_MAX_LENGTH = 2000;

let discordClient: Client | null = null;

export function startPushApi(client: Client): void {
  discordClient = client;
  const config = getConfig();
  const port = config.API_PORT;
  const secret = config.API_SECRET;

  const server = http.createServer(async (req, res) => {
    // CORS
    res.setHeader("Content-Type", "application/json");

    // Health check
    if (req.method === "GET" && req.url === "/api/health") {
      const guild = client.guilds.cache.get(config.DISCORD_GUILD_ID);
      const channels = guild
        ? guild.channels.cache
            .filter((c) => c.type === ChannelType.GuildText)
            .map((c) => ({ id: c.id, name: c.name }))
        : [];
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, channels }));
      return;
    }

    // Push endpoint
    if (req.method === "POST" && req.url === "/api/push") {
      // Auth check
      if (secret) {
        const auth = req.headers.authorization;
        if (!auth || auth !== `Bearer ${secret}`) {
          res.writeHead(401);
          res.end(JSON.stringify({ error: "Unauthorized" }));
          return;
        }
      }

      // Read body
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (body.length > MAX_CONTENT_LENGTH) {
          res.writeHead(413);
          res.end(JSON.stringify({ error: "Payload too large" }));
          return;
        }
      }

      try {
        const data = JSON.parse(body);
        const { channel, content, username } = data;

        if (!channel || !content) {
          res.writeHead(400);
          res.end(
            JSON.stringify({ error: "Missing required fields: channel, content" })
          );
          return;
        }

        const result = await sendToChannel(channel, content);
        if (result.ok) {
          res.writeHead(200);
          res.end(
            JSON.stringify({
              ok: true,
              channel: result.channelName,
              chunks: result.chunks,
            })
          );
        } else {
          res.writeHead(404);
          res.end(JSON.stringify({ error: result.error }));
        }
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: "Invalid JSON" }));
      }
      return;
    }

    // 404
    res.writeHead(404);
    res.end(JSON.stringify({ error: "Not found" }));
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`Push API listening on http://127.0.0.1:${port}`);
  });
}

async function sendToChannel(
  channelNameOrId: string,
  content: string
): Promise<
  | { ok: true; channelName: string; chunks: number }
  | { ok: false; error: string }
> {
  if (!discordClient) {
    return { ok: false, error: "Discord client not ready" };
  }

  const config = getConfig();
  const guild = discordClient.guilds.cache.get(config.DISCORD_GUILD_ID);
  if (!guild) {
    return { ok: false, error: "Guild not found" };
  }

  // Find channel by name or ID
  let channel = guild.channels.cache.get(channelNameOrId) as
    | TextChannel
    | undefined;
  if (!channel) {
    channel = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildText && c.name === channelNameOrId
    ) as TextChannel | undefined;
  }

  if (!channel || channel.type !== ChannelType.GuildText) {
    return {
      ok: false,
      error: `Channel "${channelNameOrId}" not found. Available: ${guild.channels.cache
        .filter((c) => c.type === ChannelType.GuildText)
        .map((c) => c.name)
        .join(", ")}`,
    };
  }

  // Split and send
  const chunks = splitMessage(content);
  for (const chunk of chunks) {
    await channel.send(chunk);
  }

  return { ok: true, channelName: channel.name, chunks: chunks.length };
}

function splitMessage(text: string): string[] {
  if (text.length <= DISCORD_MAX_LENGTH) {
    return [text];
  }
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= DISCORD_MAX_LENGTH) {
      chunks.push(remaining);
      break;
    }
    let cut = remaining.lastIndexOf("\n", DISCORD_MAX_LENGTH);
    if (cut <= 0) cut = DISCORD_MAX_LENGTH;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).replace(/^\n/, "");
  }
  return chunks;
}
