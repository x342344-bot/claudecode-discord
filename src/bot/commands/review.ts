import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  TextChannel,
} from "discord.js";
import { getProject } from "../../db/database.js";
import { sessionManager } from "../../claude/session-manager.js";

const REVIEW_PROMPT = `Review 你在这个 session 中做的所有修改。你应该记得自己改了哪些文件、做了什么变更。

逐个文件重新读一遍你改过的代码，检查：

1. **正确性** — 改动是否符合原始意图，有没有逻辑错误
2. **二次错误** — 改动是否引入新 bug，是否破坏了已有功能
3. **依赖问题** — import/export 链路是否完整，有没有遗漏的引用更新（其他文件是否需要同步修改）
4. **类型安全** — 类型定义是否一致，有没有类型不匹配
5. **边界情况** — 有没有漏处理的 null/undefined、空数组、异常路径
6. **遗漏** — 有没有说了要做但没做的事，有没有改了一半的地方

发现问题直接指出文件名+行号+具体问题。没问题就说没问题，不要凑字数。`;

export const data = new SlashCommandBuilder()
  .setName("review")
  .setDescription("Review 最近的修改，检查 bug、二次错误和依赖问题");

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const channelId = interaction.channelId;
  const project = getProject(channelId);

  if (!project) {
    await interaction.editReply({ content: "此频道未注册到任何项目。" });
    return;
  }

  if (sessionManager.isActive(channelId)) {
    await interaction.editReply({
      content: "当前有活跃的会话正在运行，请等待完成或先 /stop。",
    });
    return;
  }

  await interaction.editReply({ content: "🔍 正在 review 最近的修改..." });

  const channel = interaction.channel as TextChannel;
  await sessionManager.sendMessage(channel, REVIEW_PROMPT);
}
