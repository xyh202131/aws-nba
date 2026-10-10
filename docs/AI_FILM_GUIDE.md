# AI 比赛作品工作流

更新：2026-10-10。当前目标是 **NBA 数据 + 真实比赛视频 → 带数据可视化和中文解说的完整 MP4 → Web 播放与下载**。样片是快捷入口，上传素材使用独立注册 ID，不再由 train_001/train_002 白名单决定可用范围。

## 使用方法

1. 仓库根启动 `npm run agent`，另一终端运行 `npm run dev`，或 `npm run build` 后运行 `npm run preview`。
2. 打开网页默认的「AI 作品」工作室。可以直接选择已核验样片，也可以选择「上传视频 + 数据」。
3. 上传真实视频，上传或粘贴 JSON，点击「读取数据与时间关系」。没有视频时间的记录，需要填写播放器中的秒数；比赛的节次计时不能直接使用。
4. 点击「生成解说作品」。后台核对视频 → 提取证据帧 → 单次多模态分析 → 校验解说引用 → 合成中文语音、数据图形和字幕 → 编码 MP4。
5. 生成后在网页播放，点击解说段落或证据帧定位。可下载 MP4、VTT 字幕、时间轴 JSON 和模型调用记录。刷新或恢复历史任务不会重新调用模型。

语音已经合入 MP4，播放器开启声音即可听到。当前本地语音适配器使用 Windows 已安装的 Microsoft Huihui Desktop，不调用新的收费 AWS 语音服务。云端语音适配器尚未实现。

## 数据接口与时间

推荐内部格式如下。此示例对应阿门训练片段；换视频必须同时换成对应的真实数据与时间。

```json
{
  "schemaVersion": "courtside.match-data.v1",
  "events": [{
    "id": "amen-shot-396",
    "videoTimeSeconds": 18.0347,
    "playerName": "阿门·汤普森",
    "description": "急停跳投",
    "xfgPercent": 44.5,
    "recordId": "0022500491-396",
    "sourceUrl": "https://china.nba.cn/inside-the-game"
  }]
}
```

| 格式 | 接入规则 |
| --- | --- |
| `courtside.match-data.v1` | events 中视频时间以秒计，xfgPercent 为 0–100；没有 xFG 使用 null |
| 已有归一化投篮数组 / `{shots:[…]}` | 读取 record_id、player_name、inside_shot_description、official_xfg_percent；video_time_seconds 可选 |
| NBA `{data:{shotList:[…]}}` / `{shotList:[…]}` | eventId 对应记录 ID，value 明确按 0–1 概率转换成百分数；gameClock 不转换为视频秒数 |
| 本地 clip-events 草案 | 单 clip 的 events；video_time_ms 转换为秒；official_metrics 中预期命中率按 0–1 转换。多 clip 文件需先提取对应 clip，或 API 指定 dataClipId |

未对齐记录保留在作品时间轴档案中，不叠加到画面。不自动填充缺失 xFG、不把 null 显示成零。上传数据标「来源待核验」；只有已核验样片目录标「NBA 官方记录」。sourceUrl 只保留和展示，不触发服务器抓取。

目前烧录图形为事件信息卡和按真实 xFG 比例绘制的进度条。新增指标应在数据适配器中明确字段、单位和统计范围；赛季引力不能自动当作单回合引力。没有可靠场地坐标时不画伪造轨迹、距离或速度。

## 工程入口

| 文件 | 职责 |
| --- | --- |
| shared/agent.ts、shared/film.ts | 请求、数据、解说、作品契约；Web 与烧录画面共用数据卡时间区间 |
| agent/media.ts | 视频流式上传、大小/时长/解码校验、注册素材和 SHA-256 |
| agent/match-data.ts | 四种数据格式与显式时间对应关系，拒绝单位歧义和越界 |
| agent/story.ts | 按视频时长规划 1–6 个解说时间段、最多 20 张证据帧；真实引用与段数校验 |
| agent/providers.ts | 已核验模型单次 Converse、无自动重试、调用前后落盘与用量 |
| agent/render.ts | 本机中文 WAV、ASS 数据图形与字幕、原声混音、H.264/AAC MP4、VTT 与时间轴 |
| agent/pipeline.ts、agent/server.ts | 六阶段流水线、任务、文件白名单、视频 HTTP Range |
| src/AgentPanel.tsx、src/FilmPlayer.tsx | 上传、时间关系、生成、解说/指标同步、播放与下载 |
| tests/film.test.mjs | 真实上传 → 本地中文语音/视频编码 → 下载/拖动接口，及数据/时间边界 |

## HTTP 接口

| 接口 | 说明 |
| --- | --- |
| GET /api/data/template | 阿门示例的 JSON 模板 |
| POST /api/data/preview | 数据 JSON → 字段识别与缺少时间的记录；不调用模型 |
| POST /api/media | video/* 或 octet-stream 二进制 → 本机上传 ID；不接收文件路径或 URL |
| POST /api/materials | uploadId、data、可选 alignments / dataClipId / title → 素材 ID；不调用模型 |
| POST /api/jobs | 内部请求加 outputMode:"film"；executionMode 必须与服务配置一致 |
| GET /api/jobs/:id/artifacts/film.mp4 | 完成的成片，支持 byte Range 和下载 |
| GET /api/jobs/:id/artifacts/captions.vtt | 解说字幕 |
| GET /api/jobs/:id/artifacts/timeline.json | 原始输入记录、解说与视频时间关系 |

上传例的创建请求：

```json
{"schemaVersion":"courtside.agent.request.v1","clipId":"服务器返回的素材 UUID","executionMode":"bedrock","outputMode":"film"}
```

旧 `outputMode:"analysis"` / 未填写 outputMode 的内部请求保留已有三帧观察接口；当前 Web 创建作品均使用 film。官方赛事协议仍单独适配，`/official/invocations` 不接受自拟格式。

## 限制、费用与交付边界

- 视频 5–900 秒、512 MiB、长宽不超过 4096；JSON 2 MB、最多 200 条档案记录，每个作品最多对齐 8 个事件。长视频采用稀疏证据帧，不宣称逐帧动作分析；推荐一个完整回合作为输入。
- 当前英文/中文来源文本统一输出中文解说；解说待人工复核。模型不得生成指标数值，引用、时间和每段字数由程序检查。
- 每个新作品最多一次 Bedrock 调用，输出上限 2,400 tokens；仅使用 nba / us-east-1 与已核验的模型，不自动换模型或区域。实际用量、未知费用和失败原文均保留。
- 成片请求采用固定 JSON Schema；具体帧 ID/秒数在本地校验，避免每个上传素材都产生不同编译 Schema。[AWS 官方说明](https://docs.aws.amazon.com/bedrock/latest/userguide/structured-output.html)明确 minItems 只支持 0/1，时间段数量由本地约束。
- 图片数最多 20；成本取决于实际图像输入和输出 tokens。页面估算不是账户账单，也不构成项目硬预算。中文语音和编码在本机执行，没有额外云资源费用。
- 上传、抽帧、任务和作品放入 Git 忽略的 `.local/agent`；应用只监听回环，校验 Host/Origin。公网部署需另接鉴权、持久化、云端语音和运行时凭据。
- 验证以功能、时间、数据和产物为准，本轮不做排版优化或手机布局检查。未部署云资源、未训练、未提交平台评测。

## 实际验证 · 2026-10-10

- 31/31 行为测试、类型检查和生产构建通过。测试含真实视频编码和本机中文语音，不调用收费模型。
- CLI STS 与 SDK 均确认赛事项目 414702114718，CLI 角色 NBAHackathonParticipantRole；SDK 连接预检成功，无需重新登录。临时凭据只在内存复用，接近过期时刷新同一 profile；身份未确认时拒绝继续。
- 网页上传 amen.mp4 及 JSON，注册为新 UUID，使用 Sonnet 生成 3 段解说，7 张真实证据帧。任务 **4cd247e2-6a4f-4b2c-aae1-151f69e41d63** 完成。
- 成片 22.89 秒、1280×720、H.264/AAC、中文语音；实际 xFG 为 44.5%。另放入一条未对齐的 97% 记录验证隔离，它留在档案中，不烧录进画面。
- 用量 5,860 输入 / 319 输出 tokens；估算 **$0.022365**。模型返回 latency 7,771 ms，SDK 耗时 15,564 ms。此费用只指成功请求，失败且没返回 usage 的费用仍为未知。
- Web 实际播放（未静音，AAC 已解码）、解说段落定位、44.5% 指标同步、MP4 下载、刷新恢复通过，无页面异常；没有截图/布局/手机检查，没有云部署。
- 成片 SHA-256：`5a3c5cccd30ca7f2db1387112b32146a7cf36e20e85ef18e090918ee7ccaf749`，14,312,541 字节。

本机成片位于 `.local/agent/artifacts/4cd247e2-6a4f-4b2c-aae1-151f69e41d63/film.mp4`，浏览器记录位于 `.local/film-web-qa-20261010-run4/`。Web 中选择该完成任务可直接播放和下载；原任务、输入、时间轴均保留。

可随源码保存的脱敏任务/用量/浏览器验证见 [output/film-validation-20261010](../output/film-validation-20261010/README.md)。全片 FFmpeg 解码无错误，已确认中文字幕和数据卡烧录。模型的“内线弧顶/弧顶”位置表述存在歧义，仍需人工核对；不作为已测球场坐标。

失败记录保持可见：b341b273-53bf-4748-834b-e13d5b348f57 为不支持的数组 Schema 校验失败；52b5a1c1-b334-4079-a314-34350b51333e 未返回响应，错误原因未充分确认；8b1e1198-f0ad-4821-a781-3265b09e4720 为 SDK 凭据获取失败。它们均没有自动重试；修正及用户要求重试后手动创建新任务。CLI 登录可用不代表每次 SDK 获取都成功。
