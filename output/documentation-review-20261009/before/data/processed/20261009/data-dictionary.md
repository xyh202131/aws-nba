# 数据字段与消费规则 · 内部 v0.2

本目录不是赛事官方输入/输出协议。所有 `source_file` 和帧 `file` 路径以 NBA 工作目录为根；当前根为 `C:\Users\24048\Desktop\NBA`。JSON 为 UTF-8，CSV 为带 BOM 的 UTF-8。CSV 空格位表示 null，布尔值为 `True/False`；原接口空时钟也输出为空列，需从对应 JSON 区分原始空串与 null。用电子表格导入时将 ID 列设为文本，防止丢失比赛 ID 前导零。

## shots-enriched

| 字段 | 类型/来源 | 解释 |
| --- | --- | --- |
| record_id | string，内部组合 | `game_id:player_id:official_event_id`，唯一 |
| game_id / player_id / team_id | string，官方 ID | 跨接口统一为字符串；不由姓名推断 |
| player_name | string | 源姓名字段组合，用于展示，不用作关联键 |
| official_event_id | integer | 比赛内事件号；跨比赛不保证唯一 |
| period | integer | 官方节次，本包只有 1–4 节 |
| official_game_clock_text | string，PBP.cl | 节内剩余时间 `MM:SS`，不等于画面出手时钟 |
| period_remaining_seconds | integer，派生 | `60*MM+SS` |
| derived_regulation_elapsed_seconds | integer，派生 | `(period-1)*720+720-period_remaining_seconds`；只用于本包常规四节排序，不是现实时间或视频位置；加时需另定规则 |
| shot_type / shot_value_points | string / integer | 原 `2分投篮/3分投篮` 与对应 2/3 分；不含罚球 |
| made / points_scored | boolean / integer | 原 `success` 与 PBP `pts`；全部 41 条已交叉核对 |
| official_xfg_probability | number，Inside.value | 逐次预期命中率，0–1；不等于动作置信度、难度或胜率 |
| official_xfg_percent | number，派生 | `100*official_xfg_probability` |
| away_score_after_event / home_score_after_event | integer，PBP.vs/hs | 事件记录的客/主队比分，非球员得分 |
| away_team_id / home_team_id | string，games API | 明确主客队字段；不解析有冲突的 matchup 文本 |
| inside_shot_description / pbp_description | string | 两套原描述分别保留，不能假设动作分类完全一致 |
| inside_game_clock_raw | string | 原接口字段；本包 41 条均为空串 |
| inside_side_raw / inside_loc_x_raw / inside_loc_y_raw | string | 原 Inside 绘图字段，保留值；单位/方向转换未核实 |
| pbp_loc_x_raw / pbp_loc_y_raw | number | PBP 原坐标，与 Inside 分开；禁止直接当视频像素坐标 |
| pbp_epid_raw | string | 原始关联球员字段，`0` 不映射为某球员；本包不自行推导全部助攻/防守角色 |
| pbp_order_raw | integer | PBP 原排序值，保留作同一时钟下排序参考 |
| shot_source_file / shot_source_pointer | string | 原 JSON 路径及 `/data/shotList/N`，N 从 0 开始 |
| pbp_selected_file / pbp_selected_pointer | string | 本轮字段摘录位置。rows 为数组，列名见同文件 columns |
| pbp_original_source_pointer | string | 网页原响应 `/data/data/g/pla/N`；完整响应未保存，不能据此声称本地拥有完整逐回合数据 |
| clip_id | string 或 null | 只有两条 AI 核对事件有本地视频 ID；其余 39 条为 null |
| video_release_time_ms_approx | number 或 null | 相对第一解码视频帧 PTS 的毫秒数，出手约值 |
| video_release_interval_start_ms / video_release_interval_end_ms | number 或 null | 视觉出手不确定区间，不是完整动作开始/结束 |
| video_scorebug_clock_near_release | string 或 null | 画面出手附近观察到的记分牌时钟 |
| video_match_status | enum | matched_ai_visual_and_official_event / not_linked_to_local_video |
| independent_human_review | enum | 本包全部为 not_performed |

## clip-events 与叠字草案

- `clip-events.json` 是两份原视频的当前实际部分标注，不是空模板；通过 `record_id` 连接完整比赛索引。
- `start_ms/end_ms` 在本版本只表达出手不确定区间，`time_extent` 明确为 `estimated_release_interval_not_entire_action`。不能据此裁掉整段突破或认定完整动作只持续几十毫秒。
- `frames` 含真实文件、帧号、PTS 时间和 SHA-256；`evidence_frame_ids` 必须引用同素材帧。
- `observation` 为 AI 视觉观察；`interpretation=null` 不填无证据战术推测；`ai_generated=true`。
- `review_status=accepted` 必须结合 `review_scope/reviewer` 阅读：这里是具名 AI 视觉核对与官方事件检查，独立人工审核仍未做。
- `official_metrics` 保存指标原字段、原值、显示转换、记录键、原始文件哈希、JSON 路径和定义参考；不让生成模型填写无源数值。
- `entities[].image_bbox/image_position=null`、`segments=[]` 表示未标注，不代表没有球员或镜头。
- `overlay-cues.draft.json` 的显示区间是编辑规则（出手前 1.5 秒至后 3 秒，截在素材时长内），与事实动作区间分开。`placement=null`、`render_status=not_rendered`；尚需版位验收。

## 派生汇总和冲突

`derived-player-summaries.json` 的 `field_goal_attempts/field_goals_made` 分别数投篮记录和命中；`field_goal_points_scored` 不含罚球。`derived_fg_rate=FGM/FGA`；`derived_mean_attempt_xfg=mean(value)`；差值按 `100*(FG率-xFG均值)` 转为百分点。其它均值显式区分命中与未命中子集。不能推断因果贡献。

`source-field-conflicts.json` 原样保存顶层场次汇总及主客顺序冲突。它们不进入叠字或有效事件字段。原始快照保持不变；源空时钟由新字段补齐，未伪造原接口已提供时钟。

`games.csv` 的日期是源接口标签，没有换算成比赛场馆当地日期。`sources-manifest.json` 对输入摘录、源数据和使用的帧记录文件哈希；摘录文件哈希不是未保存的原 HTTP 响应哈希。
