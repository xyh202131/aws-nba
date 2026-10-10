# COURTSIDE 云端部署记录

更新：2026-10-10，北京时间。部署使用 `nba` / `us-east-1` / 项目 `414702114718`。完成新版 UI 后，按用户授权发布指定成片及配套 ZIP，添加 Team11 标识和 `/readme` 页面。首页默认呈现演示，桌面浏览器已读取 28 秒、1920×1080 的真实视频，并验证开启声音与解说定位。

## 当前证据

| 组件 | 当前状态 | 证据或限制 |
| --- | --- | --- |
| CloudFront Web | 已上线 | https://d31azeixbvzmqd.cloudfront.net ，首页、JS、健康状态、作品索引、源码包均返回 HTTP 200；浏览器已显示页面 |
| 网站 S3 | 已创建、私有 | `courtside-web-414702114718-v1`，阻止公开访问，由 CloudFront OAC 读取 |
| CloudFormation | `CourtsideCloud` 为 `UPDATE_COMPLETE` | 已部署网站、分发、ECR 与 AgentCore v2；不代表模型验证成功 |
| ECR | v2 镜像已发布 | `courtside-agent:cloud-v2`，固定摘要 `sha256:ae51e7c46220e00b9f75815b1a0044c1662c31831f90ff75fc7a45e0187cd0f8` |
| 镜像转存函数 | 已部署 | `CourtsideImagePublisher` / `courtside-image-publisher`，私有 S3 → ECR，无公网入口 |
| AgentCore | Runtime v2 已返回 `READY` | `courtside_video_agent-BwtQOc8oya`，使用预置执行角色及 ARM64 容器 |
| Bedrock | 多模态调用与容器凭据适配已接入 | 赛事 Sonnet 4.6；v2 使用支持容器授权令牌文件的 `fromHttp`，保留调用 usage 记录机制 |
| 球员识别 | ARM64 镜像已打包 | YOLO11m + CLIP 角色筛选，镜头内匿名追踪与逐帧证据输出 |
| MP4 演示 | 已上传并通过 Web 播放 | `demo/durant-v1/final-video.mp4`，80,205,184 字节；原用户成片 SHA-256 为 `ab23aa2a1e99109167ad5c20fbf9b6f1260c517f70f64a7a33a053449493a992`；配套 ZIP 为 3,484,292 字节 |
| Polly / 云端成片生成 | 适配器已部署，执行验证保留独立状态 | 此次发布使用用户指定的现有成片，未触发新的模型或语音生成 |

公网当前是作品展示入口。新的收费任务由 IAM 认证的 AgentCore 接口提交；网页不携带 AWS 密钥，也未开放匿名收费接口。

## 资源边界

- 仅复用预置 `NBAHackathonWorkloadRole`，不创建、附加或修改 IAM 策略；角色原有授权不在本轮扩大。
- 不使用 `default`、个人项目或其他业务区域；`nba-sso` 只承担登录。
- 无 GPU、EC2、ECS、CodeBuild、训练或常驻服务器。
- AgentCore 配置：会话空闲 60 秒结束，最长 1,800 秒；单次同步请求限制仍以服务实际配额为准。
- 镜像转存 Lambda：ARM64 / Python 3.12 / 512 MB / 900 秒 / 并发 1 / 异步重试 0，无触发器和函数 URL。只接受固定镜像摘要，不调用模型。
- 模型调用 `maxAttempts=1`。存储传输的有限重试不包含模型重试。遇到调用超时，先查询任务和 usage，再决定是否需要一次新的调用。
- 原有两段样片保持原位；新发布的内置演示使用独立 `demo/durant-v1/` 前缀。只读展示与 IAM 生成入口保持分离。

## 部署与恢复顺序

1. `aws sts get-caller-identity --profile nba --region us-east-1` 必须确认赛事工作身份。
2. 镜像分片上传允许断点恢复，依据 S3 已确认的 parts 与 SHA-256；不凭命令退出码推断完整镜像已发布。
3. 转存函数在 AWS 内校验每层大小、摘要、架构和 ECR 结果；当前转存函数源码固定于历史 v1 摘要 `sha256:68d22461be4d1805da57471c0eee390c91960232fc0bafe3e6434e824b2c51df`，不能用于任意新镜像。当前 v2 摘要为上表的 `sha256:ae51e7c46220e00b9f75815b1a0044c1662c31831f90ff75fc7a45e0187cd0f8`，部署参数必须明确对应版本。
4. 使用固定摘要部署 `CourtsideCloud` 的 `runtime=true` 第二阶段。运行实例存在后，禁止用 `runtime=false` 再部署同一栈，否则会移除 Runtime。
5. 核实 Runtime/DEFAULT endpoint 就绪，然后提交一次 `analysis` 请求。不能把 CloudFormation 完成、镜像大小或 `/ping` 成功当作模型成功。
6. 核对结果中的证据帧、真实 usage、任务状态和公开作品索引；成功后再更新网站健康状态。

镜像压缩层合计约 1.20 GB，展开层合计约 2.88 GB。v1 已被本次平台接受并启动，v2 Runtime 也返回 READY；这些是本项目实测结果，不据此推断通用配额的大小口径。

首轮请求：

```json
{"schemaVersion":"courtside.agent.request.v2","clipId":"train_002","executionMode":"bedrock","outputMode":"analysis","trackingMode":"none"}
```

这验证容器启动、视频帧提取、Sonnet、云存储与 Web 结果展示；不验证球员追踪、Polly、成片渲染或识别精度。球员/裁判泛化结论继续以独立标注评估为准。

## 成本与保留事项

先前完整短片估算约 $0.1716（按 15 分钟 2 vCPU/8 GB、10,000 输入/2,400 输出 tokens、500 字符语音计算），不含存储、传输、日志。本轮只做帧分析，记录实际 token usage 后单列模型估算；不能把 $1 规划额度视为已配置的账单硬上限。

ECR、S3、日志、CloudFront 与转存执行也可能产生费用。当前保留部署资源供后续使用；无周期模型调用。临时分片和镜像备份后续可按明确清理授权处理，不在部署过程中删除其他项目对象。

官方依据：[AgentCore 限额](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/bedrock-agentcore-limits.html)、[HTTP 容器契约](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-http-protocol-contract.html)、[AgentCore 价格](https://aws.amazon.com/bedrock/agentcore/pricing/)、[Polly 价格](https://aws.amazon.com/polly/pricing/)。

## 源码与运行资料

- 部署源码：`infra/cloud.ts`、`infra/image-publisher/index.py`、`agent/Dockerfile.cloud`、`agent/cloud-store.ts`、`agent/credentials.ts`、`agent/polly.ts`。
- 公网对应源码包：站点 `/source/courtside-cloud-source.zip`，包含视觉集成与依赖许可说明；不含凭据、私人标注、权重、私有任务和视频文件。
- 本地辅助资料：`.local/aws-deployment-20261010/` 保存传输状态、构建上下文、镜像导出及完整运行记录；不进入源码提交。
- 部署轮次没有 Git 推送或赛事平台提交；本次 GitHub 源码同步单独记录在 [GITHUB_SYNC_REVIEW_20261010.md](GITHUB_SYNC_REVIEW_20261010.md)，不改变云端验证状态。
