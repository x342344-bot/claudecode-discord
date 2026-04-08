import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  TextChannel,
} from "discord.js";
import { getProject } from "../../db/database.js";
import { sessionManager } from "../../claude/session-manager.js";

const GPT_REVIEW_PROMPT = `调用 ask-gpt skill，让 GPT-5.4 review 你在这个 session 中做的所有修改。

你应该记得自己改了哪些文件、做了什么变更。把改动文本（diff 或 before/after）拼到 --context 里，附上 --files 指向被改的文件。**不要用 git diff**，git diff 会混入其他 session 的改动。

--task 用："Review 这次修改是否引入 bug、是否破坏现有功能、是否漏处理边界、依赖/类型/import 链路是否完整"

--context 应包含：用户原始意图、你改了哪些文件、每个文件的具体改动、你担心的点。

调用完把 GPT 的回复总结给我（不要原文倒贴），对比你自己的判断：同意哪些、不同意哪些、为什么。`;

export const data = new SlashCommandBuilder()
  .setName("gpt-review")
  .setDescription("让 GPT-5.4 review 最近的修改（通过 ask-gpt skill）");

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

  await interaction.editReply({ content: "🔍 让 GPT-5.4 review 中..." });

  const channel = interaction.channel as TextChannel;
  await sessionManager.sendMessage(channel, GPT_REVIEW_PROMPT);
}
