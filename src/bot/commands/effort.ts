import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import { getProject, setEffort } from "../../db/database.js";

export const data = new SlashCommandBuilder()
  .setName("effort")
  .setDescription("设置 Claude 的思考深度（effort level）")
  .addStringOption((opt) =>
    opt
      .setName("level")
      .setDescription("思考深度级别")
      .setRequired(true)
      .addChoices(
        { name: "low — 快速简单", value: "low" },
        { name: "medium — 默认平衡", value: "medium" },
        { name: "high — 深度推理", value: "high" },
        { name: "max — 最深推理 (Opus only)", value: "max" },
        { name: "auto — 恢复默认", value: "auto" },
      ),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const channelId = interaction.channelId;
  const level = interaction.options.getString("level", true);
  const project = getProject(channelId);

  if (!project) {
    await interaction.editReply({ content: "此频道未注册到任何项目。" });
    return;
  }

  const effort = level === "auto" ? null : (level as "low" | "medium" | "high" | "max");
  setEffort(channelId, effort);

  const labels: Record<string, string> = {
    low: "⚡ Low — 快速响应",
    medium: "⚖️ Medium — 平衡模式",
    high: "🧠 High — 深度推理",
    max: "🔥 Max — 最深推理",
    auto: "🔄 Auto — 使用默认",
  };

  await interaction.editReply({
    embeds: [
      {
        title: `Effort: ${labels[level]}`,
        description: level === "auto"
          ? "已恢复默认 effort level，下次对话生效。"
          : `已设置为 ${level}，下次对话生效。`,
        color: level === "max" ? 0xff4500 : level === "high" ? 0x3498db : level === "medium" ? 0x2ecc71 : level === "low" ? 0x95a5a6 : 0x7289da,
      },
    ],
  });
}
