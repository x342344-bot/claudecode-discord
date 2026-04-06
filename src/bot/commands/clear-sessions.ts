import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
} from "discord.js";
import fs from "node:fs";
import path from "node:path";
import { getProject } from "../../db/database.js";
import { findSessionDir } from "./sessions.js";

export const data = new SlashCommandBuilder()
  .setName("clear-sessions")
  .setDescription("Delete all Claude Code session files for this project")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const channelId = interaction.channelId;
  const project = getProject(channelId);

  if (!project) {
    await interaction.editReply({
      content: "此频道未注册到任何项目，请先使用 `/register`。",
    });
    return;
  }

  const sessionDir = findSessionDir(project.project_path);
  if (!sessionDir) {
    await interaction.editReply({
      content: `未找到 \`${project.project_path}\` 的会话目录`,
    });
    return;
  }

  const files = fs.readdirSync(sessionDir).filter((f) => f.endsWith(".jsonl"));
  if (files.length === 0) {
    await interaction.editReply({
      content: "没有可删除的会话文件。",
    });
    return;
  }

  let deleted = 0;
  for (const file of files) {
    try {
      fs.unlinkSync(path.join(sessionDir, file));
      deleted++;
    } catch {
      // skip files that can't be deleted
    }
  }

  await interaction.editReply({
    embeds: [
      {
        title: "会话已清理",
        description: [
          `项目: \`${project.project_path}\``,
          `已删除 **${deleted}** 个会话文件`,
        ].join("\n"),
        color: 0xff6b6b,
      },
    ],
  });
}
