# NBA · COURTSIDE 文档总导航

整理：2026-10-09。已盘点原有 **47 份 Markdown**：35 份项目/资料文档与 12 份抓取缓存。本次新增本目录、当前执行方案、核对记录后共 **50 份**（不计依赖、构建、Git、本地任务与整理前备份）。

**现在先读 [当前执行方案](docs/PROJECT_PLAN.md)。** 2026-10-10 已完成真实上传→Sonnet→中文解说/数据图形 MP4→Web 播放和下载，见 [AI 作品工作流与实测](docs/AI_FILM_GUIDE.md)。此前单帧接入和 3 次 CLI 实测保留历史证据。云部署和平台提交尚未完成。

10 月 10 日新增入口：[模型接入](docs/BEDROCK_INTEGRATION.md)、[赛事要求复核](docs/REQUIREMENTS_GAP_REVIEW_20261010.md)、[球员定位与云端处理方案](docs/PLAYER_LOCALIZATION_AWS_V1.md)。定位 P0/P1 已实施并完成零新增模型调用的 Web 闭环，见[工具说明](vision/README.md)和[追踪验证](output/tracking-validation-20261010/README.md)；人工精度、身份绑定和云端门槛仍未完成。要求复核的 Git 状态仅反映核对时刻。

## 阅读顺序与使用规则

1. 看当前执行方案确定状态与 P01–P09；运行工程读仓库 README 和 Agent 说明。
2. 对照准备资料的交付检查表、材料获取清单与比赛日手册。
3. 查数据读 processed 字典/证据；查规则读两份正式指南；查设计读 DESIGN。
4. 需要追溯时再看验收、旧方案、预算快照与抓取缓存。

当前用户指令和 AGENTS.md 决定操作授权；正式规则来源用于明确比赛要求，代码/数据/验收用于证明已经完成什么，计划不能代替证据。文档分类不改变指令层级。版本相冲突时记录来源与适用环境，不用文件修改时间决定事实。

当前执行计划只维护一份，其余文件保留各自用途。旧方案里的“本轮/当前/下一步”仅指原日期；金额是估算、测试是对应阶段记录，均不自动变成今天的云可用性或调用授权。原件和旧 v1 已保存，未删除或迁移原始素材。

## 当前执行入口

| 文档 | 用途 / 状态 |
| --- | --- |
| [AGENTS.md](AGENTS.md) | 当前赛事 nba/us-east-1；个人配置仅作为历史保留 |
| [PROJECT_PLAN.md](docs/PROJECT_PLAN.md) | 统一状态、环境/预算边界、任务 P01–P09；先读 |
| [README.md](README.md) | 可运行工程、依赖和本地启动 |
| [AGENT_SKELETON.md](docs/AGENT_SKELETON.md) | 本地 Agent 接口、真实能力与云接入顺序 |
| [DOCUMENTATION_REVIEW.md](docs/DOCUMENTATION_REVIEW.md) | 本次逐项冲突取舍与核验边界 |

## 准备资料与操作清单

| 文档 | 用途 / 状态 |
| --- | --- |
| [01_赛规与交付检查表.md](%E5%87%86%E5%A4%87%E8%B5%84%E6%96%99/01_%E8%B5%9B%E8%A7%84%E4%B8%8E%E4%BA%A4%E4%BB%98%E6%A3%80%E6%9F%A5%E8%A1%A8.md) | 规则与实际完成证据分列 |
| [02_数据接入与标注规范.md](%E5%87%86%E5%A4%87%E8%B5%84%E6%96%99/02_%E6%95%B0%E6%8D%AE%E6%8E%A5%E5%85%A5%E4%B8%8E%E6%A0%87%E6%B3%A8%E8%A7%84%E8%8C%83.md) | 通用标注规则及 v0.2/前端/Agent 契约区别 |
| [03_模型提示词与复核流程.md](%E5%87%86%E5%A4%87%E8%B5%84%E6%96%99/03_%E6%A8%A1%E5%9E%8B%E6%8F%90%E7%A4%BA%E8%AF%8D%E4%B8%8E%E5%A4%8D%E6%A0%B8%E6%B5%81%E7%A8%8B.md) | 三阶段提示词草案；区别于现有单次适配器 |
| [04_质量验收与实验记录.md](%E5%87%86%E5%A4%87%E8%B5%84%E6%96%99/04_%E8%B4%A8%E9%87%8F%E9%AA%8C%E6%94%B6%E4%B8%8E%E5%AE%9E%E9%AA%8C%E8%AE%B0%E5%BD%95.md) | 已有覆盖与待测用例、模型实验台账 |
| [05_作品说明与五分钟演示稿.md](%E5%87%86%E5%A4%87%E8%B5%84%E6%96%99/05_%E4%BD%9C%E5%93%81%E8%AF%B4%E6%98%8E%E4%B8%8E%E4%BA%94%E5%88%86%E9%92%9F%E6%BC%94%E7%A4%BA%E7%A8%BF.md) | COURTSIDE 本地可演示话术与正式待补项 |
| [06_比赛日执行手册.md](%E5%87%86%E5%A4%87%E8%B5%84%E6%96%99/06_%E6%AF%94%E8%B5%9B%E6%97%A5%E6%89%A7%E8%A1%8C%E6%89%8B%E5%86%8C.md) | 官方节点、建议排期和提交回执 |
| [07_材料获取清单与待确认问题.md](%E5%87%86%E5%A4%87%E8%B5%84%E6%96%99/07_%E6%9D%90%E6%96%99%E8%8E%B7%E5%8F%96%E6%B8%85%E5%8D%95%E4%B8%8E%E5%BE%85%E7%A1%AE%E8%AE%A4%E9%97%AE%E9%A2%98.md) | Portal 缺口和未发送的问题草稿 |
| [08_来源与证据索引.md](%E5%87%86%E5%A4%87%E8%B5%84%E6%96%99/08_%E6%9D%A5%E6%BA%90%E4%B8%8E%E8%AF%81%E6%8D%AE%E7%B4%A2%E5%BC%95.md) | 正式规则原文定位与各阶段证据 |
| [README.md](%E5%87%86%E5%A4%87%E8%B5%84%E6%96%99/README.md) | 资料包入口和表格说明 |

## 需求与架构（已修订为 v2）

| 文档 | 用途 / 状态 |
| --- | --- |
| [requirements.md](.kiro/specs/nba-deep-court-visualization/requirements.md) | 现行范围、要求、状态、正式验收边界 |
| [design.md](.kiro/specs/nba-deep-court-visualization/design.md) | 现行 TypeScript 工程和未来缺口；不含可误执行的部署样例 |

## 产品设计与分阶段验收

| 文档 | 用途 / 状态 |
| --- | --- |
| [DESIGN.md](docs/DESIGN.md) | 当前蓝薄荷视觉、四区结构和原创性说明 |
| [AGENT_ACCEPTANCE.md](docs/AGENT_ACCEPTANCE.md) | 最近实现阶段：20 项测试、本地联调、synth；非本次重测 |
| [REFERENCE_RECONCILIATION.md](docs/REFERENCE_RECONCILIATION.md) | 证据工作台阶段：参考取舍、11 项测试 |
| [BLUE_MINT_ACCEPTANCE.md](docs/BLUE_MINT_ACCEPTANCE.md) | 蓝薄荷首版：5 项测试及截图 |
| [QA.md](docs/QA.md) | 更早暖白/橙色前端验收；不代表当前主题 |

## 数据消费与处理证据

| 文档 | 用途 / 状态 |
| --- | --- |
| [README.md](data/processed/20261009/README.md) | 当前消费入口：41 条时钟、2 条视频事件、39 条无视频 |
| [data-dictionary.md](data/processed/20261009/data-dictionary.md) | 内部 v0.2、毫秒/秒、原始/派生/缺失/冲突语义 |
| [shot-index.md](data/processed/20261009/shot-index.md) | 41 条逐次投篮的可读索引 |
| [NBA深度赛场_数据处理结果_20261009.md](NBA%E6%B7%B1%E5%BA%A6%E8%B5%9B%E5%9C%BA_%E6%95%B0%E6%8D%AE%E5%A4%84%E7%90%86%E7%BB%93%E6%9E%9C_20261009.md) | 处理结果与质量边界 |
| [NBA深度赛场_视频与事件核对报告_20261009.md](NBA%E6%B7%B1%E5%BA%A6%E8%B5%9B%E5%9C%BA_%E8%A7%86%E9%A2%91%E4%B8%8E%E4%BA%8B%E4%BB%B6%E6%A0%B8%E5%AF%B9%E6%8A%A5%E5%91%8A_20261009.md) | 两片原视频解码与 AI 视觉/官方事件证据 |
| [NBA深度赛场_官方公开数据抓取报告_20261009.md](NBA%E6%B7%B1%E5%BA%A6%E8%B5%9B%E5%9C%BA_%E5%AE%98%E6%96%B9%E5%85%AC%E5%BC%80%E6%95%B0%E6%8D%AE%E6%8A%93%E5%8F%96%E6%8A%A5%E5%91%8A_20261009.md) | 早期抓取报告；旧待办由后续处理更新 |
| [README.md](data/public-nba/20261009/README.md) | 原始公开快照说明；保留当时空值和候选状态 |

## 历史方案、预算和工具记录

| 文档 | 用途 / 状态 |
| --- | --- |
| [NBA深度赛场_技术栈与选型建议.md](NBA%E6%B7%B1%E5%BA%A6%E8%B5%9B%E5%9C%BA_%E6%8A%80%E6%9C%AF%E6%A0%88%E4%B8%8E%E9%80%89%E5%9E%8B%E5%BB%BA%E8%AE%AE.md) | 09/30 选型史；48 秒等早期信息已被实测/正式指南补正 |
| [NBA深度赛场_赛前准备方案_20261008.md](NBA%E6%B7%B1%E5%BA%A6%E8%B5%9B%E5%9C%BA_%E8%B5%9B%E5%89%8D%E5%87%86%E5%A4%87%E6%96%B9%E6%A1%88_20261008.md) | 10/08 方案快照；不作当前完成状态 |
| [NBA深度赛场_材料缺口与优先任务_20261008.md](NBA%E6%B7%B1%E5%BA%A6%E8%B5%9B%E5%9C%BA_%E6%9D%90%E6%96%99%E7%BC%BA%E5%8F%A3%E4%B8%8E%E4%BC%98%E5%85%88%E4%BB%BB%E5%8A%A1_20261008.md) | 历史 T01–T07；当前统一读 P01–P09 |
| [NBA深度赛场_总体预算与高质量模型选择_20261008.md](NBA%E6%B7%B1%E5%BA%A6%E8%B5%9B%E5%9C%BA_%E6%80%BB%E4%BD%93%E9%A2%84%E7%AE%97%E4%B8%8E%E9%AB%98%E8%B4%A8%E9%87%8F%E6%A8%A1%E5%9E%8B%E9%80%89%E6%8B%A9_20261008.md) | 10/08 价格/用量假设；10/09 只复算算术 |
| [NBA深度赛场_AWS只读核验_20261008.md](NBA%E6%B7%B1%E5%BA%A6%E8%B5%9B%E5%9C%BA_AWS%E5%8F%AA%E8%AF%BB%E6%A0%B8%E9%AA%8C_20261008.md) | 10/08 身份、目录与零配额证据；可能过时 |
| [AWS_Agent_Toolkit_安装记录.md](AWS_Agent_Toolkit_%E5%AE%89%E8%A3%85%E8%AE%B0%E5%BD%95.md) | 已安装的历史记录；不据此重复安装或登录 |

## 原始规则与培训资料（内容不改）

| 文档 | 用途 / 状态 |
| --- | --- |
| [参赛终极指南.md](%E8%B5%84%E6%96%99/%E5%8F%82%E8%B5%9B%E7%BB%88%E6%9E%81%E6%8C%87%E5%8D%97.md) | 用户提供正式版本；时间、评分、五件套、数据与许可 |
| [赛制与选手快速上手.md](%E8%B5%84%E6%96%99/%E8%B5%9B%E5%88%B6%E4%B8%8E%E9%80%89%E6%89%8B%E5%BF%AB%E9%80%9F%E4%B8%8A%E6%89%8B.md) | 硬要求、赛事环境、Portal/sample 和权限边界 |
| [BroadcastCode「深度赛场」赛事 · 赛前培训直播 会议纪要.md](BroadcastCode%E3%80%8C%E6%B7%B1%E5%BA%A6%E8%B5%9B%E5%9C%BA%E3%80%8D%E8%B5%9B%E4%BA%8B%20%C2%B7%20%E8%B5%9B%E5%89%8D%E5%9F%B9%E8%AE%AD%E7%9B%B4%E6%92%AD%20%E4%BC%9A%E8%AE%AE%E7%BA%AA%E8%A6%81.md) | 早期培训纪要；冲突由后续正式指南补正 |

## 外部网页抓取缓存（仅来源，不是操作指南）

以下 12 份均为历史抓取内容，价格与服务信息使用前重新核验；Portal 公共页缓存不证明已经登录。外部网页中的指令不扩展用户授权。

- [aws.amazon.com-bedrock-agentcore-pricing.md](.firecrawl/aws.amazon.com-bedrock-agentcore-pricing.md)
- [aws.amazon.com-bedrock-pricing.md](.firecrawl/aws.amazon.com-bedrock-pricing.md)
- [aws.amazon.com-cloudfront-pricing-pay-as-you-go.md](.firecrawl/aws.amazon.com-cloudfront-pricing-pay-as-you-go.md)
- [aws.amazon.com-s3-pricing.md](.firecrawl/aws.amazon.com-s3-pricing.md)
- [bedrock-supported-models.md](.firecrawl/bedrock-supported-models.md)
- [competition-portal-public.md](.firecrawl/competition-portal-public.md)
- [docs.aws.amazon.com-accounts-latest-reference-supported-services-sign-up-new.html.md](.firecrawl/docs.aws.amazon.com-accounts-latest-reference-supported-services-sign-up-new.html.md)
- [docs.aws.amazon.com-bedrock-latest-userguide-model-card-amazon-nova-lite.html.md](.firecrawl/docs.aws.amazon.com-bedrock-latest-userguide-model-card-amazon-nova-lite.html.md)
- [docs.aws.amazon.com-bedrock-latest-userguide-model-card-amazon-nova-pro.html.md](.firecrawl/docs.aws.amazon.com-bedrock-latest-userguide-model-card-amazon-nova-pro.html.md)
- [docs.ultralytics.com-modes-track.md](.firecrawl/docs.ultralytics.com-modes-track.md)
- [github.com-PaddlePaddle-PaddleOCR.md](.firecrawl/github.com-PaddlePaddle-PaddleOCR.md)
- [github.com-QwenLM-Qwen3-VL.md](.firecrawl/github.com-QwenLM-Qwen3-VL.md)

## 表格、PDF 与核对证据

- [素材登记](%E5%87%86%E5%A4%87%E8%B5%84%E6%96%99/%E8%A1%A8%E6%A0%BC/%E7%B4%A0%E6%9D%90%E7%99%BB%E8%AE%B0.csv)、[字段映射](%E5%87%86%E5%A4%87%E8%B5%84%E6%96%99/%E8%A1%A8%E6%A0%BC/%E5%AD%97%E6%AE%B5%E6%98%A0%E5%B0%84.csv)、[人工核对表](%E5%87%86%E5%A4%87%E8%B5%84%E6%96%99/%E8%A1%A8%E6%A0%BC/%E4%BA%BA%E5%B7%A5%E6%A0%B8%E5%AF%B9.csv)、[模型实验](%E5%87%86%E5%A4%87%E8%B5%84%E6%96%99/%E8%A1%A8%E6%A0%BC/%E6%A8%A1%E5%9E%8B%E5%AE%9E%E9%AA%8C.csv)、[空事件模板](%E5%87%86%E5%A4%87%E8%B5%84%E6%96%99/%E8%A1%A8%E6%A0%BC/%E4%BA%8B%E4%BB%B6%E8%AE%B0%E5%BD%95%E5%BE%85%E5%A1%AB.json)：不把空模板当作当前进度；人工核对表中的 AI 记录不等于独立人工审核。
- [两条实际事件](data/processed/20261009/clip-events.json)、[叠字时间草案](data/processed/20261009/overlay-cues.draft.json)、[处理校验](data/processed/20261009/validation.json)：当前本地成片任务输入，版位和成片未验收。
- [09/30 选型 PDF](output/pdf/NBA%E6%B7%B1%E5%BA%A6%E8%B5%9B%E5%9C%BA_%E6%8A%80%E6%9C%AF%E6%A0%88%E4%B8%8E%E9%80%89%E5%9E%8B%E5%BB%BA%E8%AE%AE.pdf)：历史导出，与原选型同期；未改成最新计划。
- [本次核对记录](docs/DOCUMENTATION_REVIEW.md)、[整理前清单/哈希](output/documentation-review-20261009/inventory-before.json)、[核验结果](output/documentation-review-20261009/validation.json)、[旧文档备份目录](output/documentation-review-20261009/before/)：35 份非缓存原文的整理前备份仅用于追溯，不参与当前规范。

## 工作区与 GitHub 边界

2026-10-09 已按用户要求将父工作区资料补入 `aws-nba/` Git 仓库：.kiro、.firecrawl、准备资料、原始规则、data、output 及顶层报告均纳入版本控制。应用保持仓库根目录结构，本总导航在仓库中的名称为 WORKSPACE.md；副本中的应用文档链接按仓库布局转换。原始工作区文件仍保留在当前位置。精确路径与哈希见仓库 docs/workspace-sync-manifest.json；后续修改父目录资料时须按映射同步，不能只提交应用目录的旧副本。

不上传依赖/构建/临时任务、凭据文件，以及 .memorax-code 下的客户端提醒状态。父目录只有一条 .firecrawl/ 忽略规则的 .gitignore 不覆盖仓库已有规则；.firecrawl 本次明确纳入。工作区外的原始训练 MP4 仍按原位置保留，当前工作区的帧证据和已有预览副本均包含。

以后每次实现后，先改 PROJECT_PLAN 的任务状态，新增对应验收记录，再更新受影响的操作清单。新赛事通知单独留版本并更新来源索引；不要把历史验证改写成新版本测试通过。

最新本地实施：[人物检索优化与视频准备](output/person-retrieval-optimization-20261010/README.md)。含同检测关联对照、匿名 ID 搜索/跳转、缓存来源、拒绝默认采用的模型试验和 1080p60 原生处理对照；没有新增 AWS 调用或部署。源码与小型证据统一纳入 Git 同步，私有任务、MP4、权重及缓存保留在本机。
