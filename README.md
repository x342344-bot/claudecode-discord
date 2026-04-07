<p align="center">
  <img src="docs/icon-rounded.png" alt="Claude Code Discord Controller" width="120">
</p>

# Claude Code Discord Controller

通过 Discord 远程控制 Claude Code — 多频道独立 session，手机随时操控。
**不需要 API key — 直接使用你的 Claude Pro / Max 订阅。**

<p align="center">
  <img src="docs/demo.gif" alt="Demo — register a project and code with Claude from Discord" width="300">
</p>

## 为什么用这个 Bot？

Anthropic 的 [Remote Control](https://code.claude.com/docs/en/remote-control) 只能查看正在运行的 session。这个 bot 更进一步 — 它是一个 **多机器 Agent 中枢**，作为守护进程运行，按需创建 session，支持团队协作。

|                              | 本 Bot | 官方 Remote Control |
|------------------------------|:------:|:-------------------:|
| 手机发起新 session           | ✅     | ❌                  |
| 守护进程（关终端不断）       | ✅     | ❌                  |
| 多机器统一管理               | ✅     | ❌                  |
| 每台机器并发 session         | ✅     | ❌                  |
| 推送通知                     | ✅     | ❌                  |
| 团队协作                     | ✅     | ❌                  |
| 零开放端口                   | ✅     | ✅                  |

### 多机器中枢

每台机器创建一个 Discord bot，邀请到同一个 server，分配频道：

```
Your Discord Server
├── #work-mac-frontend     ← 公司 Mac 上的 Bot
├── #work-mac-backend      ← 公司 Mac 上的 Bot
├── #home-pc-sideproject   ← 家里 PC 上的 Bot
├── #cloud-server-infra    ← 云服务器上的 Bot
```

**一部手机控制所有机器的 Claude Code。** 频道列表就是你的实时状态看板。

## 为什么选 Discord？

- **手机上已经有了。** 不用装新 app，不用记网址
- **免费推送通知。** Claude 需要审批或完成任务时立即收到通知
- **频道 = 工作区。** 每个频道映射一个项目目录，侧边栏就是项目看板
- **丰富的 UI。** 按钮、下拉菜单、Embed、文件上传 — Discord 自带交互组件
- **天然支持团队。** 邀请队友到 server，一起看 Claude 工作、审批工具调用
- **全平台。** Windows、macOS、Linux、iOS、Android、浏览器

## 功能

- 💰 **不需要 API key** — 使用 Claude Code CLI + 你的 Pro/Max 订阅
- 📱 从 Discord 远程控制 Claude Code（桌面/网页/手机）
- 🔀 每个频道独立 session（项目目录映射）
- ✅ 工具调用通过 Discord 按钮审批/拒绝
- ❓ 交互式问答 UI（可选选项 + 自定义文本输入）
- ⏹️ 进行中 Stop 按钮即时取消，消息队列顺序处理
- 📎 文件附件支持（图片、文档、代码文件）
- 🔄 Session 恢复/删除/新建（重启后保持，支持预览最后对话）
- ⏱️ 实时进度展示（工具使用、耗时、工具计数）
- 🔒 用户白名单、频率限制、路径安全、重复实例防护
- 🧠 Effort level 设置（low/medium/high/max）
- 🔍 一键 Review 最近修改
- 🗜️ 手动 Compact 压缩上下文
- 📡 Push API — 外部脚本推送消息到 Discord 频道
- 🛡️ Session resume 失败保护（通知 + 手动修复）

## 技术栈

| 类别 | 技术 |
|------|------|
| 运行时 | Node.js 20+, TypeScript |
| Discord | discord.js v14 |
| AI | @anthropic-ai/claude-agent-sdk |
| 数据库 | better-sqlite3 (SQLite) |
| 校验 | zod v4 |
| 构建 | tsup (ESM) |
| 测试 | vitest |

## 安装

```bash
git clone https://github.com/x342344-bot/claudecode-discord.git
cd claudecode-discord
npm install
cp .env.example .env
# 编辑 .env 填入配置
npm run build
npm start
```

### 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `DISCORD_BOT_TOKEN` | ✅ | Discord bot token |
| `DISCORD_GUILD_ID` | ✅ | Discord server ID |
| `ALLOWED_USER_IDS` | ✅ | 允许使用的用户 ID（逗号分隔） |
| `BASE_PROJECT_DIR` | ✅ | 项目根目录（`/register` 在此目录下查找子目录） |
| `RATE_LIMIT_PER_MINUTE` | | 每分钟请求限制（默认 10） |
| `SHOW_COST` | | 显示费用（默认 true，Max plan 建议 false） |
| `CHANNEL_MAPPINGS` | | 启动时自动注册频道映射（JSON） |
| `API_PORT` | | Push API 端口（默认 18801） |
| `API_SECRET` | | Push API 密钥（可选） |

## 使用

| 命令 | 说明 |
|------|------|
| `/register <folder>` | 将当前频道关联到项目目录 |
| `/unregister` | 取消关联 |
| `/status` | 查看 session 状态 |
| `/stop` | 停止当前 session |
| `/auto-approve on\|off` | 切换自动审批模式 |
| `/sessions` | 列出可恢复/删除的 session |
| `/effort <level>` | 设置思考深度（low/medium/high/max/auto） |
| `/review` | Review 当前 session 的修改 |
| `/compact` | 压缩 session 上下文 |
| `/last` | 显示最后一条 Claude 回复 |
| `/usage` | 查看 Claude Code 用量 |
| `/queue list\|clear` | 查看/清空消息队列 |
| `/clear-sessions` | 删除项目所有 session 文件 |

`/register` 支持自动补全 — 输入时显示 `BASE_PROJECT_DIR` 下的子目录列表。

在已注册的频道发送**普通消息**，Claude 就会回复。附加图片、文档或代码文件，Claude 可以读取和分析。

### 进行中控制

- **⏹️ Stop** 按钮即时取消
- 忙碌时发新消息会提示加入**消息队列** — 当前任务完成后自动处理
- `/queue list` 查看队列，可单独取消或全部取消

### Push API

外部脚本可通过 HTTP 推送消息到 Discord 频道：

```bash
curl -X POST http://127.0.0.1:18801/api/push \
  -H "Content-Type: application/json" \
  -d '{"channel": "daily", "content": "Hello from cron!"}'
```

支持按频道名或频道 ID 查找。

<details>
<summary><strong>架构</strong></summary>

```
[Discord] ←→ [Discord Bot (discord.js v14)] ←→ [Session Manager] ←→ [Claude Agent SDK]
                        ↕                              ↕
                   [SQLite DB]                   [Push API :18801]
```

- 每个频道独立 session（项目目录映射）
- Claude Agent SDK 以子进程运行 Claude Code（共享现有登录）
- 工具调用通过 Discord 按钮审批（支持自动审批模式）
- 流式响应每 1.5s 编辑到 Discord 消息
- 文本输出前每 15s heartbeat 显示进度
- Markdown 代码块跨消息分割时保持完整
- Session resume 失败时通知用户并提供修复选项

**Session 状态：** 🟢 工作中 · 🟡 等待审批 · ⚪ 空闲 · 🔴 离线

</details>

## 安全

### 零外部攻击面

Bot **不开放任何 HTTP 服务器或端口**（Push API 仅监听 127.0.0.1）。通过出站 WebSocket 连接 Discord — 没有入站监听器，外部攻击者无法触达。

### 自托管架构

Bot 完全运行在你自己的机器上。不涉及外部服务器，除了 Discord 和 Anthropic API（使用你自己的 Claude Code 登录 session）外不会泄露数据。

### 访问控制

- `ALLOWED_USER_IDS` 白名单认证 — 未授权用户的所有消息和命令被忽略
- Discord server 默认私有（无邀请链接无法访问）
- 每分钟请求频率限制

### 执行保护

- 工具调用默认：文件修改、命令执行等**每次需用户审批**（Discord 按钮）
- 路径穿越（`..`）拦截
- 文件附件：可执行文件（.exe, .bat 等）拦截，25MB 大小限制

## 开发

```bash
npm run dev          # 开发模式（tsx）
npm run build        # 生产构建（tsup）
npm start            # 运行构建产物
npm test             # 测试（vitest）
npm run test:watch   # 测试 watch 模式
```

## 致谢

Fork 自 [chadingTV/claudecode-discord](https://github.com/chadingTV/claudecode-discord)，在此基础上做了中文化、安全加固和功能扩展。

## License

[MIT License](LICENSE)
