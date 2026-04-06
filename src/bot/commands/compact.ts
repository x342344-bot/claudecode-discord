import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  TextChannel,
} from "discord.js";
import { getProject } from "../../db/database.js";
import { sessionManager } from "../../claude/session-manager.js";

export const data = new SlashCommandBuilder()
  .setName("compact")
  .setDescription("压缩当前会话的上下文，释放 context window");

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

  if (sessionManager.isActive(channelId)) {
    await interaction.editReply({
      content: "当前有活跃的会话正在运行，请等待完成或先 /stop。",
    });
    return;
  }

  await interaction.editReply({
    content: "🗜️ 正在压缩会话上下文...",
  });

  const channel = interaction.channel as TextChannel;
  await sessionManager.sendMessage(channel, "/compact");
}
