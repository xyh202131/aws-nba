# Team11 · COURTSIDE 深度赛场

**数据进去，能看的比赛作品出来。**

COURTSIDE 将真实 NBA 比赛视频、官方逐回合数据、中文解说与可视化结合，提供成片观看、证据回看、人物检索、投篮分析和视频创作工作区。

**[打开作品](https://d31azeixbvzmqd.cloudfront.net/) · [作品 README](https://d31azeixbvzmqd.cloudfront.net/readme) · [下载最终成片](https://d31azeixbvzmqd.cloudfront.net/demo/durant-v1/final-video.mp4) · [下载配套文件](https://d31azeixbvzmqd.cloudfront.net/demo/durant-v1/supporting-files.zip)**

## 先看这 28 秒

首页直接呈现杜兰特突破打板命中的完整演示。点击 **开启中文解说**，即可听到与比赛动作对齐的讲述；点击右侧解说段落，播放器跳到对应时刻。

| 演示内容 | 已完成的呈现 |
|---|---|
| 比赛 | 火箭客场对独行侠，2026 年 1 月 4 日（北京时间） |
| 主角与事件 | 凯文·杜兰特，第一节 05:38，出手事件 #88 |
| 成片 | 28 秒，1920×1080，60 fps，H.264 / AAC |
| 声画 | 五段中文解说、中文字幕、比赛原声混音 |
| 官方指标 | 本次出手 xFG 21.3%，按真实数值绘制数据图形 |
| 回合结果 | 突破漂移跳投打板命中，戴维斯投篮犯规，火箭比分由 17:9 变为 19:9 |
| 片尾 | 独立数据页，集中呈现预期值、结果、犯规与比分变化 |
| 配套交付 | 解说稿、音轨、三种字幕、回合 JSON、官方来源、来源哈希、制作文件与成片验证记录 |

这段演示通过比赛画面与官方记录交叉核对，完成解说编排、中文配音、图形合成与全片解码检查。原片动作顺序和播放速度保留，原声以 18% 音量参与混音。

内置杜兰特演示由助手结合真实视频逐句编写和核对，经本机中文语音与 FFmpeg 制作，视频、解说稿、字幕、官方数据和校验记录形成完整配套。Bedrock 创作流程、AgentCore v2、CloudFront 与私有 S3 构成作品的工程架构，详见 [AWS 部署记录](docs/AWS_CLOUD_DEPLOYMENT.md)。

## 作品亮点

### 1. 以成片为首页，让评委直接进入比赛

作品页左上角和演示播放器均展示 **Team11**。首页同时给出视频、中文解说开关、回合数据、逐句定位、MP4 下载和配套文件下载；创作工作区作为可展开入口保留在成片下方。独立 `/readme` 页面集中介绍作品与操作方式。

### 2. 把解说、数据和画面放到同一条时间线上

创作引擎接收比赛视频与数据 JSON，核对素材、提取证据帧、调用多模态模型、校验解说引用，再合成中文语音、字幕、事件信息卡与 xFG 图形。Web 播放器与渲染层共享数据时间区间，解说段落、数据事件和证据帧均可定位到视频秒数。

### 3. 每一个关键数字，都有具体回合和来源

演示将比赛编号、球员、节次、比赛时钟、比分与官方 eventId 联合核对，准确关联杜兰特事件 #88 的 xFG 21.3%。画面观察、官方记账和数据指标分别保留来源。xFG 表达普通 NBA 球员在本次投篮条件下的预期命中率；实际命中结果另行呈现。

### 4. 人物检索服务于视频复盘

视觉模块集成预训练 YOLO11m、BoT-SORT 和 CLIP 球员角色筛选，结合人工审核样本改进球员、裁判与场边人员的区分。系统提供人物框、镜头内匿名 ID、短轨迹、人物索引、首次出现时间、画面定位、角色判断依据和逐帧记录。检测缓存和已有解说复用让重复调优更高效。

### 5. 从一段作品扩展到完整复盘工作台

- **回合复盘：** 视频进度、关键帧、事件时间轴和证据链联动，支持倍速、原声、全屏、出手循环与逐秒定位。
- **分层解读：** 通俗解读、技术视角和复盘提问共享同一组证据。
- **投篮分析：** 与杜兰特成片共享官方出手事件 #88，提供 xFG 图表、节次与出手方式展示，点击记录即可返回对应画面。
- **数据档案：** 按球员、结果、关键字组合检索，查看原始来源并导出记录。
- **复盘笔记：** 将观察关联到视频时间点，支持分类、编辑、本机保存、回看和 JSON 导出。

### 6. 面向新素材的创作入口

创作工作区提供视频选择、拖入预览、JSON 导入、文本粘贴和事件时间关联。数据适配层支持内部比赛数据、归一化投篮记录、NBA shotList 和 clip-events 草案等输入。新视频通过独立素材 ID 登记，保留文件哈希、时长和事件映射。

### 7. 兼顾质量、可追溯性与资源使用

多模态引擎已接入 Amazon Bedrock，完成 Claude Sonnet 4.6 的真实 SDK 调用验证，并支持配置 Qwen3-VL。每次调用记录模型、输入输出 tokens、耗时和估算费用；输出设置显式上限。已有解说可以用于后续追踪渲染。视频、证据帧、数据与产物通过 SHA-256 关联，便于复核与复现。

### 8. 已部署的 AWS 作品交付

作品通过 CloudFront 提供 HTTPS 访问，私有 S3 承载页面、成片及配套资源；AgentCore ARM64 Runtime、ECR 镜像和 CDK 基础设施已部署。云端生成入口使用 IAM 认证。中文语音层包含本机语音与 Amazon Polly 适配，FFmpeg 负责视频图形、字幕、语音与原声的合成。

### 9. 为桌面复盘设计的蓝白工作区

界面以蓝色动作、薄荷色空间语义和银蓝背景区分信息层级。导航底板、视角切换和轻量云层提供连续反馈；动效支持手动暂停、离屏暂停和系统减弱动态偏好。原生视频控件、键盘操作、可见焦点及对话框焦点返回融入整个工作流。

## 推荐观看顺序

1. 打开作品首页，观看内置成片并开启中文解说。
2. 点击右侧任意一句解说，查看对应动作及数据。
3. 下载配套文件，阅读回合 JSON、解说稿和官方来源。
4. 切换到回合复盘、投篮分析和数据档案，体验证据联动。
5. 展开视频创作工作区，查看素材接入与任务流程。

## 技术结构

| 层次 | 技术与职责 |
|---|---|
| Web | React 19、TypeScript、Vite、HTML Video、原生 CSS、Lucide |
| Agent | Node.js 24，素材登记、队列、抽帧、模型适配、校验、渲染和产物接口 |
| 多模态 | Amazon Bedrock Converse，Claude Sonnet 4.6 / 可配置 Qwen3-VL |
| 视觉 | Python、YOLO11m、BoT-SORT、CLIP、检测缓存、角色筛选与轨迹索引 |
| 媒体 | FFmpeg、中文语音、ASS / SRT / VTT、H.264 / AAC |
| AWS | S3、CloudFront、ECR、AgentCore、CloudFormation / CDK |

```text
src/App.tsx             Team11 品牌、导航、默认成片、复盘工作区
src/FeaturedDemo.tsx    内置演示播放、解说同步、下载入口
src/AgentPanel.tsx      素材接入、生成任务与产物
src/FilmPlayer.tsx      生成作品播放、解说和指标联动
src/TrackBrowser.tsx    人物索引与画面定位
src/Studio.tsx          比分、投篮分析、复盘笔记
src/EvidenceStudio.tsx  关键时刻、证据链、解读、资料核验
src/ui.css              统一蓝白界面样式
src/motion/             导航与背景动效
shared/                前后端数据、作品与追踪契约
agent/                 视频创作流水线
vision/                人物检测、追踪、角色筛选与评估
public/readme/         作品说明页面
infra/cloud.ts         AWS 部署定义
```

## 本地运行

环境：Node.js 24。启动 Web 与 Agent：

```bash
npm ci
npm run agent
# 另一终端
npm run dev
```

Web 默认地址为 `http://127.0.0.1:5173/`，Agent 默认监听 `127.0.0.1:8080`。内置成片使用已发布的 CloudFront 媒体地址。配置项见 `.env.example`；赛事工作使用 `nba` / `us-east-1`，Bedrock 接入步骤见下方工程文档。

```bash
npm run check
npm test
npm run build
npm run preview
```

## 深入了解

- [AI 比赛作品工作流](docs/AI_FILM_GUIDE.md)
- [Bedrock 接入与调用记录](docs/BEDROCK_INTEGRATION.md)
- [人物定位与 AWS 方案](docs/PLAYER_LOCALIZATION_AWS_V1.md)
- [人物追踪工程优化](docs/PLAYER_TRACKING_OPEN_SOURCE_OPTIMIZATION_PLAN.md)
- [AWS 部署记录](docs/AWS_CLOUD_DEPLOYMENT.md)
- [UI 配色与动效复用](docs/UI_KIT_REUSE.md)
- [本次源码同步复核](docs/GITHUB_SYNC_REVIEW_20261010.md)
- [工作区资料索引](WORKSPACE.md)
- [对应源码与组件许可](https://d31azeixbvzmqd.cloudfront.net/source/courtside-cloud-source.zip)

## 数据来源与许可

演示使用 [NBA 官方逐回合记录](https://www.nba.com/game/hou-vs-dal-0022500491/play-by-play)、[NBA 中国杜兰特逐次出手数据](https://api.nba.cn/nba-web/api/web/inside/gpShot?gameId=0022500491&playerId=201142) 和 [NBA 中国比赛列表](https://api.nba.cn/nba-web/api/web/inside/game?date=2026-01-04)。来源快照、获取时间与 SHA-256 收录在配套文件中。比赛素材使用范围沿用原提供方授权；视觉及界面组件遵循各自开源许可，出处与许可文本随源码提供。
