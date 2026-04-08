import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  Collection,
  type ChatInputCommandInteraction,
  type Interaction,
} from "discord.js";
import { getConfig } from "../utils/config.js";
import { handleMessage } from "./handlers/message.js";
import { handleButtonInteraction, handleSelectMenuInteraction } from "./handlers/interaction.js";
import { isAllowedUser } from "../security/guard.js";
import { getProject, unregisterProject } from "../db/database.js";

// Import commands
import * as registerCmd from "./commands/register.js";
import * as unregisterCmd from "./commands/unregister.js";
import * as statusCmd from "./commands/status.js";
import * as stopCmd from "./commands/stop.js";
import * as autoApproveCmd from "./commands/auto-approve.js";
import * as sessionsCmd from "./commands/sessions.js";
import * as clearSessionsCmd from "./commands/clear-sessions.js";
import * as lastCmd from "./commands/last.js";
import * as queueCmd from "./commands/queue.js";
import * as usageCmd from "./commands/usage.js";
import * as compactCmd from "./commands/compact.js";
import * as effortCmd from "./commands/effort.js";
import * as reviewCmd from "./commands/review.js";
import * as gptReviewCmd from "./commands/gpt-review.js";

const commands = [registerCmd, unregisterCmd, statusCmd, stopCmd, autoApproveCmd, sessionsCmd, clearSessionsCmd, lastCmd, queueCmd, usageCmd, compactCmd, effortCmd, reviewCmd, gptReviewCmd];
const commandMap = new Collection<
  string,
  { execute: (interaction: ChatInputCommandInteraction) => Promise<void> }
>();

for (const cmd of commands) {
  commandMap.set(cmd.data.name, cmd);
}

export async function startBot(): Promise<Client> {
  const config = getConfig();

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  // Register slash commands after successful login (network guaranteed)
  client.on("ready", async () => {
    console.log(`Bot logged in as ${client.user?.tag}`);
    try {
      const rest = new REST({ version: "10" }).setToken(config.DISCORD_BOT_TOKEN);
      const commandData = commands.map((c) => c.data.toJSON());
      await rest.put(
        Routes.applicationGuildCommands(
          (await rest.get(Routes.currentApplication()) as { id: string }).id,
          config.DISCORD_GUILD_ID,
        ),
        { body: commandData },
      );
      console.log(`Registered ${commandData.length} slash commands`);
    } catch (error) {
      console.error("Failed to register slash commands:", error);
    }

    // Pre-register channel mappings from config
    const channelMappings = config.CHANNEL_MAPPINGS;
    if (Object.keys(channelMappings).length > 0) {
      const { registerProject, getProject } = await import("../db/database.js");
      for (const [channelId, projectPath] of Object.entries(channelMappings)) {
        const existing = getProject(channelId);
        if (!existing) {
          registerProject(channelId, projectPath, config.DISCORD_GUILD_ID);
          console.log(`Pre-registered channel ${channelId} → ${projectPath}`);
        }
      }
    }
  });

  // Handle interactions (slash commands + buttons)
  client.on("interactionCreate", async (interaction: Interaction) => {
    try {
      if (interaction.isAutocomplete()) {
        const command = commandMap.get(interaction.commandName);
        if (command && "autocomplete" in command) {
          await (command as any).autocomplete(interaction);
        }
        return;
      }

      if (interaction.isChatInputCommand()) {
        // Auth check
        if (!isAllowedUser(interaction.user.id)) {
          await interaction.reply({
            content: "你没有权限使用此机器人。",
            flags: ["Ephemeral"],
          });
          return;
        }

        // Defer reply to avoid 3-second timeout
        await interaction.deferReply();

        const command = commandMap.get(interaction.commandName);
        if (command) {
          await command.execute(interaction);
        }
      } else if (interaction.isButton()) {
        await handleButtonInteraction(interaction);
      } else if (interaction.isStringSelectMenu()) {
        await handleSelectMenuInteraction(interaction);
      }
    } catch (error) {
      console.error("Interaction error:", error);
      const content = "处理命令时发生错误。";
      try {
        if (interaction.isRepliable()) {
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content, flags: ["Ephemeral"] });
          } else {
            await interaction.reply({ content, flags: ["Ephemeral"] });
          }
        }
      } catch {
        // ignore follow-up errors
      }
    }
  });

  // Handle messages (wrapped with error handler to prevent silent hangs)
  client.on("messageCreate", async (message) => {
    try {
      await handleMessage(message);
    } catch (error) {
      console.error("messageCreate error:", error);
      try {
        if (message.channel.isSendable()) {
          await message.reply("处理消息时发生错误。");
        }
      } catch {
        // ignore reply error
      }
    }
  });

  // Clean up DB when a channel is deleted
  client.on("channelDelete", (channel) => {
    const project = getProject(channel.id);
    if (project) {
      unregisterProject(channel.id);
      console.log(`Channel ${channel.id} deleted, unregistered from ${project.project_path}`);
    }
  });

  // Discord.js error handlers — prevent silent disconnects
  client.on("error", (error) => {
    console.error("Discord client error:", error);
  });

  client.on("warn", (warning) => {
    console.warn("Discord warning:", warning);
  });

  client.on("shardDisconnect", (event, shardId) => {
    console.warn(`Shard ${shardId} disconnected (code ${event.code}). Reconnecting...`);
  });

  client.on("shardReconnecting", (shardId) => {
    console.log(`Shard ${shardId} reconnecting...`);
  });

  client.on("shardResume", (shardId, replayedEvents) => {
    console.log(`Shard ${shardId} resumed (${replayedEvents} events replayed)`);
  });

  client.on("shardError", (error, shardId) => {
    console.error(`Shard ${shardId} error:`, error);
  });

  // Login with retry (network may not be ready on boot)
  await loginWithRetry(client, config.DISCORD_BOT_TOKEN);
  return client;
}

async function loginWithRetry(client: Client, token: string): Promise<void> {
  const delays = [5, 10, 15, 30, 30, 30]; // seconds — escalating, then steady 30s
  let attempt = 0;

  while (true) {
    try {
      await client.login(token);
      if (attempt > 0) {
        console.log(`Discord login successful after ${attempt} retries`);
      }
      return;
    } catch (error) {
      attempt++;
      const delay = delays[Math.min(attempt - 1, delays.length - 1)];
      console.error(`Discord login attempt ${attempt} failed: ${(error as Error).message}`);
      console.error(`Retrying in ${delay}s...`);
      await new Promise(resolve => setTimeout(resolve, delay * 1000));
    }
  }
}
