# 本地 Agent 骨架与 AWS 接入清单

更新：2026-10-09。当前交付是可以实际运行的本地工作流，默认 `fixture` 离线适配器。素材哈希核验、FFmpeg 抽帧、输入/输出校验、任务持久化、HTTP 接口和前端展示均有实现；离线观察来自已有目录，不是本次模型生成。

## 启动

Node.js 24，仓库根目录：

```powershell
npm ci
npm run agent
```

第二个终端：

```powershell
npm run dev
```

打开前端的“数据档案”，使用“运行离线流程”。开发服务器和预览服务器将 `/api` 转发到本机 `127.0.0.1:8080`。Agent 默认监听回环地址，无需 AWS 登录。默认不需要 `.env`；修改时参考 `.env.example`。任务与抽帧保存在 `.local/agent`，不会进 Git。

FFmpeg 为项目内 `ffmpeg-static@5.3.0` 依赖，首次安装会从其发布页获取平台二进制；npm 12 的安装脚本许可只开放这个固定版本。也可配置已有 `FFMPEG_PATH`，无需改系统 PATH。二进制遵循上游 FFmpeg/ffmpeg-static 许可，未提交到仓库。

## 数据流与真实能力

```mermaid
flowchart LR
  A[选择已收录视频] --> B[请求契约与视频 SHA-256]
  B --> C[重新解码三个证据帧]
  C --> D{分析适配器}
  D --> E[fixture: 回放既有观察]
  D --> F[Bedrock Converse: 默认关闭]
  E --> G[字段/时间/证据引用校验]
  F --> G
  G --> H[已有官方指标单独关联]
  H --> I[本地任务记录与 JSON]
  I --> J[前端证据帧与视频定位]
```

- 当前只接受 `train_001`、`train_002` 两个已收录素材 ID；拒绝任意文件路径、远程 URL、未知字段和未知协议。
- 每次对预览 MP4 重新计算 SHA-256，对照台账；从视频实际解码三个 JPEG，保存实际帧 PTS、请求时间和图像哈希。帧位置来自既有关键时刻标注，**尚不是自动事件定位**。
- 素材原件哈希与预览哈希分开保存。本次处理的是约 29.97 fps 预览副本，不宣称原始视频逐帧精度。
- 默认 fixture 只回放既有 AI 观察，模型调用数与 token 使用均为 0；没有伪造推理进度、云调用或分析结果。进度来自真实阶段状态。
- Bedrock 适配器支持 JPEG 多帧输入、显式 `maxTokens: 1000`、60 秒超时、最多一次请求。模型只能返回观察文本、时间和证据 ID；官方 xFG 不经过模型生成。
- 结构校验不能证明模型文本真实，真实模型结果始终标 `needs_review`。没有凭三帧推导球员引力、速度、距离或因果结论。
- 任务串行执行，最多 4 个待处理/运行任务；本地保存上限 200 条，列表展示最近 20 条。失败保留错误码，不自动重复调用；服务重启将未完成任务标为中断，防止隐式重收费。
- 浏览器展示接口错误、失败阶段、历史任务、证据帧、结果下载和对应视频定位。刷新页面可从后端恢复记录。

## 内部接口

| 接口                                  | 行为                                                         |
| ------------------------------------- | ------------------------------------------------------------ |
| `GET /ping` / `GET /api/health`       | `Healthy` / `HealthyBusy`，适配器、区域及付费开关状态        |
| `POST /api/jobs`                      | 校验后返回 202 和任务；后端继续处理                          |
| `GET /api/jobs`                       | 最近 20 个任务                                               |
| `GET /api/jobs/:id`                   | 任务状态与阶段                                               |
| `GET /api/jobs/:id/result`            | 已完成内部结果；未就绪返回 409                               |
| `GET /api/jobs/:id/frames/:index.jpg` | 已完成任务的真实提取帧                                       |
| `POST /invocations`                   | 同步运行相同流程并返回内部结果，路径符合 AgentCore HTTP 契约 |
| `POST /official/invocations`          | 明确返回 501，避免把内部格式当作赛事协议                     |

内部请求：

```json
{ "schemaVersion": "courtside.agent.request.v1", "clipId": "train_002" }
```

接口请求体上限 16 KB；只接受 JSON。浏览器来源限定本机开发/预览站点；本地服务校验 Host，防止外部网站利用本机接口。当前不是公网多用户服务，也不提供账号体系。

## AWS 接入边界

`aws-personal` / `us-east-2` 固定校验；禁止 `default`、Team11、其他区域及跨区域 inference profile。Bedrock 使用显式 `fromIni`，不通过默认凭据链回退。SDK 尚未在本项目运行真实模型推理。

真实模型运行必须同时配置 `AGENT_PROVIDER=bedrock`、明确区域内模型 ID 和 `ALLOW_PAID_MODEL_CALLS=true`。**这些条件只是代码开关，不代表已取得授权、权限或额度**。本次没有打开开关，也没有设置默认可收费模型。网页入口仅运行离线流程。模型可用性及额度仍需拿到资源后实测；已有个人项目的历史零配额不能按“已接通”处理。

官方赛事环境若使用不同 profile/区域，要先明确授权并核验后增加独立环境配置，不能直接把本项目切到 `us-east-1`。当前适配器只实现本机个人 profile；运行时 IAM role 凭据模式在云接入阶段实现，不把本地凭据复制进容器。

## 基础设施骨架

已提供 `infra/app.ts`，通过 `npm run infra:synth` **离线**生成 CDK 模板；不需要 AWS 凭据、不查询云端、不构建容器、不上传素材。模板包括：

- 两个私有 S3 bucket（前端文件 / 结果储备），强制 TLS、版本控制、保留删除策略。
- CloudFront + S3 Origin Access Control，HTTP 重定向 HTTPS。
- HTTP AgentCore Runtime，使用外部已核验执行角色 ARN 和 Ohio ARM64 ECR 镜像 digest 两个必填参数；模型调用仍禁用。
- 区域固定 Ohio，无 Lambda@Edge、跨区域推理或自动 bootstrap。

这是可合成的资源定义，**没有部署**。静态前端资源上传、CloudFront 到鉴权 API 的连接、云端任务持久化与 S3 读写、角色最小权限/赛事 boundary 都待接入。不能把直接上传 `dist` 视为完整云上线。容器配方在 `agent/Dockerfile`，使用系统 FFmpeg、普通 `node` 用户、8080 端口；本轮未执行 Docker 构建。

## 资源到位后的接入顺序

1. 核对实际项目、profile、区域、赛事 Portal 绑定仓库，以及模型访问权限/非零配额；维持本地 fixture 可运行。
2. 获取**官方输入 JSON、输出 JSON、超时与重跑要求**；只修改 `agent/official-adapter.ts` 与相关契约测试。
3. 获得付费调用授权后，使用一段短视频做单次高质量视觉模型实测；保存实际 usage、耗时、错误和人工复核。模型选择按实测质量与所在区域权限决定，不自动降级到弱模型。
4. 接入自动关键帧/事件发现，扩大素材入口；保留三种时钟和事实来源边界。
5. 实现标注渲染和成片下载；补齐端到端样例、正式返回包。
6. 明确部署授权后，核验执行角色/权限边界，补齐云端存储与鉴权 API，再评审 CDK 差异、部署并验证。最终提交平台另按授权执行。

两段离线流程已完成验收，首次使用者可按上述步骤复现。当前下一项工程任务为[执行方案 P01](PROJECT_PLAN.md)的本地标注成片；拿到资源后的第一个任务仍是**只读核对项目/区域/模型非零配额与官方协议样例**。

## 验证与资料

实际验收结果见 [AGENT_ACCEPTANCE.md](AGENT_ACCEPTANCE.md)。测试覆盖输入拒绝、费用/区域边界、真实抽帧、来源保留、失败持久化、重启中断及 HTTP 接口；不以离线测试代替云端可用性证明。

已读取本机 `amazon-bedrock`、`aws-cdk` 技能；SDK 文档使用 Context7，CDK 查询遇到连接错误后改用官方参考：

- [AgentCore HTTP 契约](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-http-protocol-contract.html)
- [Bedrock Converse JavaScript SDK 示例](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_bedrock-runtime_code_examples.html)
- [SDK 凭据提供器](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/migrate-credential-providers.html)
- [CDK CfnRuntime](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_bedrockagentcore.CfnRuntime.html)
- [CDK 私有 S3 origin](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_cloudfront_origins.S3BucketOrigin.html)
