import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import { getProject } from "../../db/database.js";
import { sessionManager } from "../../claude/session-manager.js";

export const data = new SlashCommandBuilder()
  .setName("stop")
  .setDescription("Stop the active Claude Code session in this channel");

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const channelId = interaction.channelId;
  const project = getProject(channelId);

  if (!project) {
    await interaction.editReply({
      content: "此频道未注册到任何项目。",
    });
    return;
  }

  const stopped = await sessionManager.stopSession(channelId);
  if (stopped) {
    await interaction.editReply({
      embeds: [
        {
          title: "会话已停止",
          description: `已停止 \`${project.project_path}\` 的 Claude Code 会话`,
          color: 0xff6600,
        },
      ],
    });
  } else {
    await interaction.editReply({
      content: "此频道没有活跃的会话。",
    });
  }
}
