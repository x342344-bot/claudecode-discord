import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import { getProject, setAutoApprove } from "../../db/database.js";
import { isAllowedUser } from "../../security/guard.js";

export const data = new SlashCommandBuilder()
  .setName("auto-approve")
  .setDescription("Toggle auto-approve mode for tool use in this channel")
  .addStringOption((opt) =>
    opt
      .setName("mode")
      .setDescription("on or off")
      .setRequired(true)
      .addChoices(
        { name: "on", value: "on" },
        { name: "off", value: "off" },
      ),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!isAllowedUser(interaction.user.id)) {
    await interaction.editReply({ content: "你没有权限执行此操作。" });
    return;
  }

  const channelId = interaction.channelId;
  const mode = interaction.options.getString("mode", true);
  const project = getProject(channelId);

  if (!project) {
    await interaction.editReply({
      content: "此频道未注册到任何项目。",
    });
    return;
  }

  const enabled = mode === "on";
  setAutoApprove(channelId, enabled);

  await interaction.editReply({
    embeds: [
      {
        title: `自动批准: ${enabled ? "开启" : "关闭"}`,
        description: enabled
          ? "Claude 将自动批准所有工具使用（Edit、Write、Bash 等）"
          : "Claude 将在使用工具前请求批准",
        color: enabled ? 0x00ff00 : 0xff6600,
      },
    ],
  });
}
