import {
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
} from "discord.js";
import fs from "node:fs";
import path from "node:path";
import { registerProject, getProject } from "../../db/database.js";
import { validateProjectPath } from "../../security/guard.js";
import { getConfig } from "../../utils/config.js";

export const data = new SlashCommandBuilder()
  .setName("register")
  .setDescription("Register this channel to a project directory")
  .addStringOption((opt) =>
    opt
      .setName("path")
      .setDescription(`Project folder name (${getConfig().BASE_PROJECT_DIR})`)
      .setRequired(true)
      .setAutocomplete(true),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const input = interaction.options.getString("path", true);
  const config = getConfig();
  // If input is absolute path, use as-is; otherwise join with base dir
  const projectPath = path.isAbsolute(input)
    ? input
    : path.join(config.BASE_PROJECT_DIR, input);
  const channelId = interaction.channelId;
  const guildId = interaction.guildId!;

  // Check if already registered
  const existing = getProject(channelId);
  if (existing) {
    await interaction.editReply({
      content: `此频道已注册到 \`${existing.project_path}\`，请先使用 \`/unregister\` 解除绑定。`,
    });
    return;
  }

  // Create directory if it doesn't exist (new project)
  if (!fs.existsSync(projectPath)) {
    const resolved = path.resolve(projectPath);
    const baseDir = path.resolve(config.BASE_PROJECT_DIR);
    if (!resolved.startsWith(baseDir + path.sep) && resolved !== baseDir) {
      await interaction.editReply({ content: `无效路径: 必须在 ${baseDir} 内` });
      return;
    }
    if (projectPath.includes("..")) {
      await interaction.editReply({ content: "无效路径: 不能包含 '..'" });
      return;
    }
    fs.mkdirSync(projectPath, { recursive: true });
  }

  // Validate path
  const error = validateProjectPath(projectPath);
  if (error) {
    await interaction.editReply({ content: `无效路径: ${error}` });
    return;
  }

  registerProject(channelId, projectPath, guildId);

  await interaction.editReply({
    embeds: [
      {
        title: "项目已注册",
        description: `此频道已关联到:\n\`${projectPath}\``,
        color: 0x00ff00,
        fields: [
          { name: "状态", value: "🔴 离线", inline: true },
          { name: "自动批准", value: "关闭", inline: true },
        ],
      },
    ],
  });
}

export async function autocomplete(
  interaction: AutocompleteInteraction,
): Promise<void> {
  const focused = interaction.options.getFocused();
  const config = getConfig();
  const baseDir = config.BASE_PROJECT_DIR;

  try {
    // Split into parent path and current typed prefix
    const lastSlash = focused.lastIndexOf("/");
    const parentPart = lastSlash >= 0 ? focused.slice(0, lastSlash) : "";
    const currentPrefix = lastSlash >= 0 ? focused.slice(lastSlash + 1) : focused;

    // Directory to list: baseDir/parentPart (or baseDir if no slash yet)
    const listDir = parentPart ? path.join(baseDir, parentPart) : baseDir;

    // Security: must stay within baseDir
    const resolvedList = path.resolve(listDir);
    const resolvedBase = path.resolve(baseDir);
    if (!resolvedList.startsWith(resolvedBase)) {
      await interaction.respond([]);
      return;
    }

    const entries = fs.readdirSync(listDir, { withFileTypes: true });
    const dirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => e.name)
      .filter((name) => name.toLowerCase().includes(currentPrefix.toLowerCase()))
      .slice(0, 24);

    const choices: { name: string; value: string }[] = [];

    // Add base directory itself as first option (only at root level)
    if (!parentPart && (!focused || ".".includes(focused.toLowerCase()) || baseDir.toLowerCase().includes(focused.toLowerCase()))) {
      choices.push({ name: `. (${baseDir})`, value: baseDir });
    }

    choices.push(
      ...dirs.map((name) => {
        const value = parentPart ? `${parentPart}/${name}` : name;
        return { name: value, value };
      }),
    );

    // Offer to create if no exact match
    if (focused && !dirs.some((d) => d.toLowerCase() === currentPrefix.toLowerCase())) {
      choices.push({ name: `📁 Create new: ${focused}`, value: focused });
    }

    await interaction.respond(choices.slice(0, 25));
  } catch {
    await interaction.respond([]);
  }
}
