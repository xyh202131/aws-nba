# 付费模型首轮实测 · 2026-10-10

已在赛事项目完成 **3 次真实 Bedrock 多模态调用**，两款模型均有成功响应。实际用量共输入 **6,653**、输出 **503 tokens**，按公开单价估算 **$0.0222931**。这是调用用量估算，不是 AWS 已结算账单。此次没有部署、训练或提交平台评测。

## 环境与范围

- CLI profile：`nba`；入口区域：`us-east-1`；STS 项目：`414702114718`，角色：`NBAHackathonParticipantRole`。`nba-sso` 仅承担登录；未回退到 default 或个人项目。
- 用户已明确要求开始付费调用；本轮限定 3 个请求，每请求最多输出 1,000 tokens，`AWS_MAX_ATTEMPTS=1`，没有自动重试或持续收费任务。
- Qwen `get-foundation-model` 返回 ACTIVE、TEXT/IMAGE、ON_DEMAND；`get-foundation-model-availability` 返回 AUTHORIZED，agreement/entitlement/region 均 AVAILABLE。
- Sonnet `get-inference-profile` 返回 ACTIVE；使用正式赛事指南列出的 `global.anthropic.claude-sonnet-4-6`。请求发往 us-east-1，但 Global profile 可能跨区域路由，不声称推理一定在单一区域内执行。
- 本轮通过 AWS CLI 2.37.10 调用 Converse；当前会话没有可调用的 AWS MCP。未重新安装 Toolkit，未修改全局 MCP 的个人 profile 配置。
- 样本仅 `train_002` 阿门回合，三张 960×540 JPEG，真实 PTS 为 15.0817、18.0514、21.021 秒。沿用既有抽帧文件，调用前重新校验每张帧及预览视频 SHA-256；没有把已有观察、球员姓名或 xFG 当成模型答案传入。

## 逐次结果

| 请求 | 模型 | 输入 / 输出 tokens | 服务返回延迟 | 本地总耗时 | 估算 USD | 协议检查 | 内容检查 |
| --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| [Qwen](qwen-train002/response.json) | Qwen3-VL 235B A22B | 1,710 / 80 | 5.032 秒 | 10.861 秒 | 0.0011191 | 通过 | 待复核；把静帧间的进球过程写成直接观察 |
| [Sonnet 基线](sonnet-train002/response.json) | Claude Sonnet 4.6 Global | 2,337 / 296 | 6.180 秒 | 12.282 秒 | 0.0114510 | 未通过 | 拒收；有位置和篮球可见性错误 |
| [Sonnet 约束输出](sonnet-structured-train002/response.json) | Claude Sonnet 4.6 Global | 2,606 / 127 | 5.882 秒 | 13.189 秒 | 0.0097230 | 通过 | 拒收；将线内两分出手说成三分线外 |

三次均 `stopReason=end_turn`，没有截断。协议失败和内容拒收也消耗 tokens，均计入上述费用。服务延迟与本地总耗时口径不同；单次测量不能作为性能排名。

前两次的帧和提示词相同，用于初步对照；第三次同时增加 JSON Schema 并将提示改为只描述目标出手帧，因此不是单变量实验，不能据此单独衡量 Schema 对内容质量的影响。

## 实际发现

1. Qwen 返回单个 JSON 对象，通过既有 `agent/contracts.ts` 校验，但“球随后入网”没有对应的直接静帧证据。比分变化能够支持得分推断，不能冒充拍到了穿网瞬间。
2. Sonnet 基线返回 Markdown 代码块中的三个对象数组，违背现有单对象协议。没有偷偷移除代码块、择取一个对象并伪装为合格响应。
3. Sonnet 基线称末帧“球已离开可见区域”，实际末帧底线附近可见篮球；第三次虽结构正确，却仍误报三分线外。目标帧显示出手位于三分线内。
4. 增加服务端 JSON Schema 后，此次严格解析和字段校验通过；这只证明本样本格式符合要求，不证明内容正确，也不保证后续请求全部成功。
5. 本轮复核由 Codex 查看证据帧完成，**不是独立人工真值标注**。三个结果均未批准展示，原始内容保持不变，判断另存 `validation.json`。

## 费用依据

计算：`输入 tokens × 输入单价 / 1,000,000 + 输出 tokens × 输出单价 / 1,000,000`，使用整数费用单位累计，包含全部三个返回。

- Qwen：输入 $0.53、输出 $2.66 / 百万 tokens。已实查 AWS Price List API，筛选 `AmazonBedrock`、`Qwen3 VL 235B A22B`、`us-east-1`；采用 On-demand Inference 普通输入/输出 SKU，而非 Batch、Flex 或 Priority。完整响应见 [qwen-pricing-api.json](qwen-pricing-api.json)，价格生效日期 2026-10-01，并与[当日 AWS 官网快照](../../.firecrawl/bedrock-pricing-20261010.md)核对。
- Sonnet：输入 $3、输出 $15 / 百万 tokens；依据 [Anthropic 官方 AWS Bedrock 价目表](https://www-cdn.anthropic.com/files/4zrzovbb/website/3684c2faafb97418665782cea0001f439f74b1d2.pdf)第 5 页，Standard Global Cross Region，生效日期 2026-05-27，本日重新打开核验。不是 Geo / In-Region 的 $3.30 / $16.50 档。
- Sonnet 返回缓存读写均为 0；未启用缓存、批处理或预置吞吐。本估算未扣比赛额度/优惠，未加税，未查询结算账单。
- 项目级硬预算或提醒尚未实现。单次输出上限和关闭重试不等于总账户支出硬上限。

## 文件与复现边界

- [summary.json](summary.json)：用量、费用、请求状态、模型选择和价格来源。
- 每个请求目录的 `run.json`：完整提示词、模型 ID、真实帧时间/哈希、请求哈希和调用设置；`response.json` 为原始 CLI 响应；`validation.json` 为协议与视觉检查。
- [目标出手帧](qwen-train002/1.jpg)：三个请求复用同一组证据，图片集中保存于 Qwen 目录。
- 含 Base64 图片的完整请求仅存在 Git 忽略目录 `.local/*paid-request.json`，共享结果未保存凭据或认证缓存。
- 两模型的前两次调用均未设置 `outputConfig`；第三次使用的 `outputConfig` 完整保留在该次 `run.json`。CLI 设置显式包含 `--profile nba --region us-east-1 --cli-binary-format base64`，无 endpoint 覆写，未使用 debug 日志。

## 下一步

先把赛事环境和结构化输出支持正式接入现有 Agent，并让失败响应的原文、usage 和拒收原因也能存盘；再用加密集的出手前后帧及第二段回合做小样本质量验证。两分/三分等字段优先使用已有官方事件数据并独立注明来源，不由图片模型自由生成。Qwen 与 Sonnet 均保留为候选，这 1 个回合不足以宣布其中一个质量最佳。

此次是受控 CLI 实测，**尚未改写 `agent/config.ts` 的个人项目保护，也未开启网页自动付费调用**；当前网页仍运行 fixture。云端 AgentCore、官方协议适配及成片渲染仍待完成。

官方依据：[Sonnet 模型与推理入口](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-sonnet-4-6.html)、[Converse CLI](https://docs.aws.amazon.com/cli/latest/reference/bedrock-runtime/converse.html)、[JSON Schema 结构化输出](https://docs.aws.amazon.com/bedrock/latest/userguide/structured-output.html)、[AWS Bedrock 定价](https://aws.amazon.com/bedrock/pricing/)。
