import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  TextChannel,
} from "discord.js";
import { getProject } from "../../db/database.js";
import { splitMessage } from "../../claude/output-formatter.js";
import { execSync } from "node:child_process";

const REVIEW_PROMPT = `You are a senior code reviewer providing a second opinion on changes made by another AI (Claude). Review the git diff carefully.

Check for:
1. **正确性** — 改动是否符合 commit message 描述的意图，有没有逻辑错误
2. **二次错误** — 改动是否引入新 bug，是否破坏已有功能
3. **依赖问题** — import/export 链路是否完整，有没有遗漏的引用更新
4. **类型安全** — 类型定义是否一致，有没有类型不匹配
5. **边界情况** — 有没有漏处理的 null/undefined、空数组、异常路径
6. **遗漏** — 有没有改了一半的地方，逻辑不完整的部分

Focus on real issues. Point out file name + line number + specific problem. If nothing is wrong, say so briefly. Don't pad your answer.

用中文回答。`;

const RELAY_URL = "https://ai-relay.chainbot.io/v1/responses";
const DEFAULT_MODEL = "gpt-5.4";
const MAX_DIFF_CHARS = 80_000;
const REQUEST_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

interface ResponseOutput {
  type: string;
  content?: Array<{ type: string; text?: string }>;
}

export const data = new SlashCommandBuilder()
  .setName("cross-review")
  .setDescription("用 GPT 交叉 review 最近的修改（second opinion）")
  .addIntegerOption((opt) =>
    opt
      .setName("commits")
      .setDescription("Review 最近几个 commit（默认 3）")
      .setMinValue(1)
      .setMaxValue(20),
  )
  .addStringOption((opt) =>
    opt
      .setName("model")
      .setDescription(`模型（默认 ${DEFAULT_MODEL}）`),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const channelId = interaction.channelId;
  const project = getProject(channelId);

  if (!project) {
    await interaction.editReply({ content: "此频道未注册到任何项目。" });
    return;
  }

  const commits = interaction.options.getInteger("commits") ?? 3;
  const model = interaction.options.getString("model") ?? DEFAULT_MODEL;
  const apiKey = process.env.RELAY_API_KEY;

  if (!apiKey) {
    await interaction.editReply({
      content: "❌ 未配置 `RELAY_API_KEY`，在 .env 中添加后重启 bot。",
    });
    return;
  }

  await interaction.editReply({
    content: `🔀 正在用 **${model}** 交叉 review 最近 ${commits} 个 commit...`,
  });

  try {
    // Get commit log for context
    const log = execSync(
      `git log --oneline -${commits}`,
      { cwd: project.project_path, encoding: "utf-8", timeout: 10_000 },
    ).trim();

    // Get diff
    const diff = execSync(
      `git diff HEAD~${commits} HEAD`,
      { cwd: project.project_path, maxBuffer: 2 * 1024 * 1024, encoding: "utf-8", timeout: 30_000 },
    ).trim();

    if (!diff) {
      await interaction.editReply({ content: "没有找到最近的修改。" });
      return;
    }

    // Truncate large diffs
    const truncated = diff.length > MAX_DIFF_CHARS;
    const diffText = truncated
      ? diff.slice(0, MAX_DIFF_CHARS) + "\n\n[... diff truncated, showing first 80K chars ...]"
      : diff;

    // Call relay OpenAI Responses API
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const response = await fetch(RELAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        instructions: REVIEW_PROMPT,
        input: `Commits:\n${log}\n\nGit diff:\n\n${diffText}`,
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Relay API ${response.status}: ${errorText.slice(0, 200)}`);
    }

    const result = await response.json();

    // Extract text from OpenAI Responses API format
    let reviewText = "";
    const outputs: ResponseOutput[] = result.output ?? [];
    for (const item of outputs) {
      if (item.type === "message" && item.content) {
        for (const block of item.content) {
          if (block.type === "output_text" && block.text) {
            reviewText += block.text;
          }
        }
      }
    }

    if (!reviewText) {
      reviewText = "⚠️ 无法解析模型输出:\n```json\n" + JSON.stringify(result, null, 2).slice(0, 1500) + "\n```";
    }

    // Format and send
    const header = `## 🔀 Cross Review by \`${model}\`\n_${commits} commits, ${diff.split("\n").length} lines${truncated ? " (truncated)" : ""}_\n\n`;
    const parts = splitMessage(header + reviewText);
    const channel = interaction.channel as TextChannel;

    await interaction.editReply({ content: parts[0] });
    for (let i = 1; i < parts.length; i++) {
      await channel.send(parts[i]);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const display = msg.length > 300 ? msg.slice(0, 300) + "..." : msg;
    await interaction.editReply({ content: `❌ Cross review 失败: ${display}` });
  }
}
