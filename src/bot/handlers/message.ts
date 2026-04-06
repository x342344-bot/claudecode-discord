import { Message, TextChannel, Attachment, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { getProject } from "../../db/database.js";
import { isAllowedUser, checkRateLimit } from "../../security/guard.js";
import { sessionManager } from "../../claude/session-manager.js";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

// Dangerous executable extensions that should not be downloaded
const BLOCKED_EXTENSIONS = new Set([
  ".exe", ".bat", ".cmd", ".com", ".msi", ".scr", ".pif",
  ".dll", ".sys", ".drv",
  ".vbs", ".vbe", ".wsf", ".wsh",
]);

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB (Discord free tier limit)

async function downloadAttachment(
  attachment: Attachment,
  projectPath: string,
): Promise<{ filePath: string; isImage: boolean } | { skipped: string } | null> {
  const ext = path.extname(attachment.name ?? "").toLowerCase();

  // Block dangerous executables
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return { skipped: `已阻止: \`${attachment.name}\`（危险文件类型）` };
  }

  // Skip files that are too large
  if (attachment.size > MAX_FILE_SIZE) {
    const sizeMB = (attachment.size / 1024 / 1024).toFixed(1);
    return { skipped: `已跳过: \`${attachment.name}\`（${sizeMB}MB 超过 25MB 限制）` };
  }

  const uploadDir = path.join(projectPath, ".claude-uploads");
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const fileName = `${Date.now()}-${attachment.name}`;
  const filePath = path.join(uploadDir, fileName);

  try {
    const response = await fetch(attachment.url);
    if (!response.ok || !response.body) {
      return { skipped: `下载失败: \`${attachment.name}\`` };
    }

    const fileStream = fs.createWriteStream(filePath);
    await pipeline(Readable.fromWeb(response.body as any), fileStream);
  } catch (e) {
    console.warn(`[download] Failed to download attachment ${attachment.name}:`, e instanceof Error ? e.message : e);
    return { skipped: `下载失败: \`${attachment.name}\`` };
  }

  return { filePath, isImage: IMAGE_EXTENSIONS.has(ext) };
}

export async function handleMessage(message: Message): Promise<void> {
  // Ignore bots and DMs
  if (message.author.bot || !message.guild) return;

  // Check if channel is registered
  const project = getProject(message.channelId);
  if (!project) return;

  // Auth check
  if (!isAllowedUser(message.author.id)) {
    await message.reply("你没有权限使用此机器人。");
    return;
  }

  // Rate limit
  if (!checkRateLimit(message.author.id)) {
    await message.reply("请求过于频繁，请稍后再试。");
    return;
  }

  // Check for pending custom text input (AskUserQuestion "直接输入")
  if (sessionManager.hasPendingCustomInput(message.channelId)) {
    const text = message.content.trim();
    if (text) {
      sessionManager.resolveCustomInput(message.channelId, text);
      await message.react("✅");
    }
    return;
  }

  let prompt = message.content.trim();

  // Download attachments (images, documents, code files, etc.)
  const imagePaths: string[] = [];
  const filePaths: string[] = [];
  const skippedMessages: string[] = [];

  for (const [, attachment] of message.attachments) {
    const result = await downloadAttachment(attachment, project.project_path);
    if (!result) continue;
    if ("skipped" in result) {
      skippedMessages.push(result.skipped);
      continue;
    }
    if (result.isImage) {
      imagePaths.push(result.filePath);
    } else {
      filePaths.push(result.filePath);
    }
  }

  if (skippedMessages.length > 0) {
    await message.reply(skippedMessages.join("\n"));
  }

  if (imagePaths.length > 0) {
    prompt += `\n\n[Attached images - use Read tool to view these files]\n${imagePaths.join("\n")}`;
  }
  if (filePaths.length > 0) {
    prompt += `\n\n[Attached files - use Read tool to read these files]\n${filePaths.join("\n")}`;
  }

  if (!prompt) return;

  const channel = message.channel as TextChannel;

  // If session is active, offer to queue the message
  if (sessionManager.isActive(message.channelId)) {
    if (sessionManager.hasQueue(message.channelId)) {
      await message.reply("⏳ 已有消息等待加入队列，请先处理。");
      return;
    }
    if (sessionManager.isQueueFull(message.channelId)) {
      await message.reply("⏳ 队列已满（最多 5 条），请等待当前任务完成。");
      return;
    }

    sessionManager.setPendingQueue(message.channelId, channel, prompt);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`queue-yes:${message.channelId}`)
        .setLabel("加入队列")
        .setStyle(ButtonStyle.Success)
        .setEmoji("✅"),
      new ButtonBuilder()
        .setCustomId(`queue-no:${message.channelId}`)
        .setLabel("取消")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("❌"),
    );

    await message.reply({
      content: "⏳ 上一个任务进行中，完成后自动处理？",
      components: [row],
    });
    return;
  }

  // Send message to Claude session
  await sessionManager.sendMessage(channel, prompt);
}
