# Bedrock 模型接入 · 2026-10-10

最新阶段已扩展为「AI 作品」：上传视频＋数据 → 7 张证据帧 → Sonnet → 中文语音/字幕/xFG 图形 MP4 → Web 播放和下载，成功请求估算 $0.022365。31 项测试通过，详见 [AI_FILM_GUIDE.md](AI_FILM_GUIDE.md)。下述单帧观察、26 项测试及截图记录是本日早期阶段的历史证据。

现有 Agent 和网页“数据档案”已接入 **Claude Sonnet 4.6**。完成一次从网页点击开始的真实 SDK 验证：素材哈希核验 → 3 张证据帧 → Bedrock Converse → 字段/时间/引用校验 → 独立关联官方指标 → 网页展示和 JSON 导出。Qwen3-VL 235B 也在配置白名单内，可显式切换；本次网页验证使用 Sonnet，不声称已经对 Qwen 的网页路径做了真实调用。

## 使用

本机已创建 Git 忽略的 `.env` 并启动付费 Agent。打开 `http://127.0.0.1:4173/` 默认的「AI 作品」，选择样片或上传视频与数据，点击「生成解说作品」。会先检查 SDK 连接，连接失败时不创建模型任务。每个作品一次模型分析，没有自动重试；刷新和恢复历史不再次收费。

重启时在仓库根执行：

```powershell
npm run agent
```

另一终端执行 `npm run dev`；使用构建预览时执行 `npm run build`、`npm run preview`。已有 `.env` 包含以下设置，不需要复制 AWS 密钥：

```ini
AGENT_PROVIDER=bedrock
AWS_PROFILE=nba
AWS_REGION=us-east-1
ALLOW_PAID_MODEL_CALLS=true
BEDROCK_MODEL_ID=global.anthropic.claude-sonnet-4-6
```

切换 Qwen 时修改 `BEDROCK_MODEL_ID=qwen.qwen3-vl-235b-a22b` 并重启 Agent。关闭收费时使用 `AGENT_PROVIDER=fixture`、`ALLOW_PAID_MODEL_CALLS=false`。仓库默认值和 `.env.example` 保持 fixture；这是可复现的本地配置入口，不会把登录缓存或凭据提交进 Git。

CLI 登录入口是 `nba-sso / us-west-2`，工作入口是 `nba / us-east-1`。SDK 使用显式 `fromIni({profile:"nba"})`，让 SSO 遵循自己的 `sso_region`、AssumeRole 遵循 nba profile 的区域，Bedrock 客户端单独固定 us-east-1。不要将 Bedrock 的区域写进共享凭据提供器 `clientConfig.region`：该 SDK 会用它覆盖 SSO 区域，导致 `UnauthorizedException: Session token not found or invalid`。本次已复现并修正此问题，修正后临时凭据项目 ID 为 `414702114718`；未再次登录。

## 调用和输出边界

- 仅接受 `nba / us-east-1` 和两款已实查模型，无 default、个人 profile、其他模型或推理路由的自动回退。
- Sonnet 请求带服务端 JSON Schema，约束单对象、真实目标帧秒数和证据 ID。Qwen 不假定支持该特性，仍使用严格 JSON 解析和公共契约校验。
- 每次重新提取三张 JPEG，最多输出 1,000 tokens，SDK `maxAttempts=1`、180 秒超时。首次 Schema 编译和凭据交换会增加耗时。
- 模型只描述目标出手帧可见动作。官方 xFG 从既有目录独立关联；结果保持 `needs_review`，结构通过不等于内容真实。
- 网页请求显式发送 `executionMode`，后端按当前配置检查。旧网页的 fixture 请求不能在 Bedrock 后端意外收费。浏览器提交也有即时点击锁。
- 每次调用尝试先存盘；收到响应后先保存原文和实际 usage，再解析校验。格式错误、截断或后续字段校验失败均不会丢弃已有用量。请求失败且未返回用量时使用 null，网页显示未知/待确认。
- 用量估算使用 10/10 核验的普通按需价率，公开价率来源见[首轮实测](../output/model-validation-20261010/README.md)。尚无项目级硬预算或账户账单核对。
- `.local/agent/jobs/<id>.json` 保存任务及调用记录；原文最多存 16,000 字符，超过时明确标识截断。任务最多 200 条，串行处理；重启中断不自动重跑。
- `/api/health` 返回当前模型、模式和付费开关，只证明本地服务配置/进程状态；本次真实模型成功证明来自下述运行记录。

付费内部请求示例：

```json
{
  "schemaVersion": "courtside.agent.request.v1",
  "clipId": "train_002",
  "executionMode": "bedrock"
}
```

早期 analysis 模式限定已收录样片；现在 film 模式接受注册上传素材 UUID。自动事件发现、赛事正式协议、AgentCore 云部署仍待接入。Docker/CDK 环境为 us-east-1，云端付费开关保持关闭；本地语音是 Windows 适配器，尚未验证容器构建、运行时 IAM 或部署，不复制 SSO 缓存到容器。

## 本次验证

本次实现文件：

| 文件 | 变更 |
| --- | --- |
| [config.ts](../agent/config.ts)、[.env.example](../.env.example) | 赛事环境及两款已核验模型白名单；仓库默认离线，本机 .env 启用 Sonnet |
| [providers.ts](../agent/providers.ts) | SSO/工作区域分别解析、Sonnet Schema、显式输出/重试上限、响应原文与用量估算 |
| [pipeline.ts](../agent/pipeline.ts)、[jobs.ts](../agent/jobs.ts) | 调用前后持久化，失败保留已收到响应和用量 |
| [contracts.ts](../agent/contracts.ts)、[server.ts](../agent/server.ts)、[shared/agent.ts](../shared/agent.ts) | 网页运行模式检查、模型健康状态、调用记录共享类型 |
| [AgentPanel.tsx](../src/AgentPanel.tsx)、[agent.css](../src/agent.css) | 网页收费分析入口、点击锁、原文/用量/费用/耗时、手机布局 |
| [agent.test.mjs](../tests/agent.test.mjs)、[bedrock.test.mjs](../tests/bedrock.test.mjs) | 配置和收费保护、结构约束、失败持久化/未知用量、无重试及存储失败检查 |
| [Dockerfile](../agent/Dockerfile)、[infra/app.ts](../infra/app.ts) | 同步赛事环境值，避免旧个人配置与新 Agent 校验冲突；不启用云端模型 |
| AGENTS、README、WORKSPACE、PROJECT_PLAN、AGENT_SKELETON | 同步当前接入状态和历史边界；父工作区入口同步更新 |

| 检查 | 结果 |
| --- | --- |
| 全部单元/行为测试 | 26/26 通过，包括真实离线抽帧及新增 Bedrock 契约/持久化/错误测试；测试不调用 AWS 模型 |
| 类型检查、前端生产构建 | 通过 |
| 凭据修正后的类型及 Bedrock 定向测试 | 通过，5/5 |
| CDK 离线合成 | 通过；模板区域与 Runtime 环境为 us-east-1/nba，云端付费开关仍关闭 |
| 网页真实 SDK 调用 | 完成，任务 `71df7b51-0d7a-4dcb-a3c6-0d66ac032670` |
| 实际用量 | 输入 2,653、输出 125 tokens；估算 $0.009834 |
| 时延 | Bedrock 返回 5,073 ms；SDK 调用含凭据交换 28,576 ms |
| 页面操作 | 新建任务、状态完成、3 张图片解码、JSON 下载、刷新恢复均通过 |
| 浏览器 | 本机 Edge，通过已安装 Playwright；未提供 Browser 插件，未安装浏览器 |
| 页面与响应式 | 标题/有效内容正常、无框架错误覆盖；1440×1000 和 390×844；手机无水平溢出；无控制台错误 |

首次网页尝试 `58881caa-8818-4555-ba5d-0b79d498d8cb` 在 SDK 取凭据阶段失败，记录未覆盖，保留未知用量和错误码；修正代码后手动创建新任务。不是自动重试，也不是删除失败后只展示成功。

最新观察包含“是否已完全脱手不确定”，避免将不确定静帧当作确定动作过程。本次仍是 Codex 视觉检查，不是独立人工真值评测；没有直接替换前端已有的审核字幕。

截图、导出验证及浏览器记录保存在本机临时目录 `C:/Users/24048/AppData/Local/Temp/courtside-bedrock-qa-20261010/`，本地任务保存在 `.local/agent/`。应用代码变更已做范围审查：网页没有导入 AWS SDK、原文通过 React 转义展示、公共错误不返回 SDK 凭据、配置仍有 profile/model 白名单。

AWS 文档通过 Context7 获取：[ConverseCommand](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/bedrock-runtime/command/ConverseCommand)、[凭据提供器](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-credential-providers)。具体 SSO 区域覆盖行为另核对已安装 SDK 源码并完成真实凭据解析与模型调用。
