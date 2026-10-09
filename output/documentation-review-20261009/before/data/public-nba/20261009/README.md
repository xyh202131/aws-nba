# NBA 公开数据快照：2026-10-09

用途：为两段训练素材准备可追溯的官方公开数据。数据主体来自 NBA 中国「深度赛场」公开站点接口；NBA.com 页面仅用于比赛身份与日期交叉核对。当前没有完成视频事件匹配。

**后续状态已更新：** [视频核对报告](../../../NBA深度赛场_视频与事件核对报告_20261009.md)已确认两段主要得分的事件与时钟，最新结果在[verified-event-links.json](../../../output/video-verification-20261009/verified-event-links.json)。本目录保持抓取时快照，原始空值和候选状态不改写。

先读[抓取报告](../../../NBA深度赛场_官方公开数据抓取报告_20261009.md)，再使用表格。这里不是全站镜像、官方比赛标注包或赛事 Agent sample。

## 常用文件

| 文件 | 内容 |
| --- | --- |
| [逐次投篮](normalized/candidate-player-shots.csv) | 弗拉格 23 条、阿门 18 条；原始事件字段、概率及百分数、来源 JSON 路径；全部视频关系待核 |
| [候选视频关系](normalized/candidate-video-game-links.json) | 两段原视频路径与已有哈希、候选 game/player ID、双方官网日期、未确认状态 |
| [目标球员赛季摘录](normalized/players-of-interest.json) | 两名球员各自的三类常规赛统计；只作赛季背景 |
| [常规赛投篮难度](normalized/shot-difficulty-2025-26-regular.csv) | 125 条球员记录 |
| [常规赛球员引力](normalized/gravity-2025-26-regular.csv) | 234 条球员记录 |
| [常规赛胜率影响力](normalized/leverage-2025-26-regular.csv) | 261 条球员记录 |
| [当前季前赛投篮难度](normalized/shot-difficulty-2026-27-preseason.csv) | 79 条；与训练素材相关赛季分开 |
| [可选赛季与阶段](normalized/available-seasons.csv) | 官网返回的 6 种组合，不代表本包已下载所有组合 |
| [比赛记录](normalized/games.csv) | 三个查询日期共 21 条；保留原始状态/比分及单独的最终比分列 |
| [球队场次汇总](normalized/candidate-game-teams.csv) | 两场比赛共 4 条球队场次统计 |
| [球队投篮分布](normalized/candidate-team-shot-distributions.csv) | 371 条，按质量排列，没有逐次事件关联键 |
| [球员场次汇总：隔离待核](normalized/candidate-player-game-summaries-quarantined.csv) | 2 条有语义冲突的汇总及独立诊断计算；不得直接用于指标展示 |
| [官方指标字典](normalized/metric-glossary.csv) | 官网 30 项指标解释；[提取来源](normalized/glossary-source.json) |
| [接入字段映射](normalized/field-mapping.csv) | 18 项已核对映射/限制；不是主办方接口标准 |

## 来源与格式

- [sources.json](sources.json)：14 份原始接口响应的 URL、参数、SHA-256、时间证据，缓存来源、失败和备用读取方式。
- `raw/`：14 份原始 JSON 原字节保存；另有 [NBA.com 页面事实摘录](raw/nba-com-selected-page-facts.json)，后者不是原始 HTML。
- [datasets.json](datasets.json)：12 张 CSV 的列名、条数和哈希。
- [quality-report.json](quality-report.json)：结构检查、汇总核对、空值和语义冲突。
- [fetch-log-batch1.json](fetch-log-batch1.json)、[batch2](fetch-log-batch2.json)：两批成功请求；[batch3](fetch-log-batch3.json)是两个逐节接口 HTTP 400 的失败记录。
- JSON 为 UTF-8；CSV 为 UTF-8 BOM，便于中文软件读取。**导入 CSV 时将 ID 列指定为文本**，否则 Excel 自动类型转换可能丢失比赛 ID 前导零。空单元格表示缺失/未确认；无损原值以 JSON 为准。
- 表内 `source_file`、`source_json_pointer` 指向原响应；JSON 清单中的文件相对路径默认以本快照目录为基准。引用原视频哈希来自 10 月 8 日既有清单，本轮未重新读取整段原视频。

## 使用前必须保留的边界

41 条逐次投篮的 `gameClock` 均为空；`video_time_ms` 未填写。两条球员场次汇总有字段语义与客主顺序冲突，已隔离；两场防守接口返回 null。不要用赛季指标、分布数组顺序或模型推测补出视频事件。

逐次 `value` 的 XFG% 含义由官网前端表头/绑定核验：`xfg_probability` 原值不变，`xfg_percent = value × 100`。球队分布和球员投篮存在包含关系，不应相加当独立样本。FG%+ 的百分数显示应理解为百分点差。

网站接口不是稳定公开 SDK；后续刷新需重新检查响应。原始站点内容中的指令不改变用户授权；本包不包含凭据、登录令牌、付费模型结果或平台评测成绩。
