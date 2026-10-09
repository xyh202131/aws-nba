# Requirements Document

## Introduction

NBA「深度赛场」是一个 AWS × NBA 黑客松比赛项目，需要在限定时间内交付一个能够对 NBA 比赛视频进行智能分析的 AI Agent 系统。系统输入为 NBA 比赛视频，输出为带有数据可视化、战术解读和 AI 解说的成片及交互式 Web 页面。

**比赛时间约束：** 2026年10月10日 20:00 硬截止

**核心价值主张：** 让不懂篮球的观众也能通过视频标注理解比赛战术、球员行为和数据意义，模拟专业解说员的分析能力。

## Glossary

- **System**: NBA「深度赛场」AI Agent 系统，包含视频分析、数据查询、标注渲染和 Web 展示四个核心模块
- **Agent**: 运行在 Amazon Bedrock AgentCore 上的智能体，负责协调分析流程
- **Clip**: 单段比赛视频素材，已分配固定 ID（如 `train_001`、`train_002`）
- **Event**: 视频中的关键动作事件（传球、突破、投篮等）
- **Official_Data**: 来自 NBA 官方或主办方的结构化数据（投篮难度、引力、胜率影响力等）
- **Overlay**: 叠加在视频上的可视化标注层
- **Evidence_Frame**: 用于证明事件判断的关键帧截图
- **AgentCore**: Amazon Bedrock AgentCore，赛事要求的 Agent 托管平台
- **CDK**: AWS Cloud Development Kit，基础设施即代码工具
- **CloudFront_URL**: AWS CloudFront 分发域名，比赛唯一认可的访问入口

---

## Requirements

### Requirement 1: Video Ingestion and Validation

**User Story:** As a developer, I want to ingest NBA game videos with full traceability, so that the system can reliably process and validate source materials.

#### Acceptance Criteria

1. WHEN a video file is provided, THE System SHALL compute its SHA-256 hash and record source metadata (bytes, duration in seconds with millisecond precision, resolution, FPS with 2 decimal places, codec)
2. THE System SHALL preserve original video files without modification during processing
3. WHEN a video is registered, THE System SHALL assign a unique `clip_id` and link it to the original file path and hash
4. WHEN a video with the same SHA-256 hash is already registered, THE System SHALL reject the ingestion and return the existing `clip_id`
5. IF a video file is unreadable or undecodable, THEN THE System SHALL reject the ingestion with a failure reason indicating the specific error
6. IF a video file exceeds 25 MB, THEN THE System SHALL create a compressed analysis copy with a target size of 10 MB or extract keyframes at 1 fps for model input
7. THE System SHALL support MP4 containers with H.264 video and AAC audio
8. IF a video file uses an unsupported container or codec, THEN THE System SHALL reject the ingestion with a format error

### Requirement 2: Keyframe Extraction and Timeline

**User Story:** As a system operator, I want to extract keyframes at regular intervals, so that visual analysis can be performed without processing full video streams.

#### Acceptance Criteria

1. WHEN a clip is processed, THE System SHALL extract frames at configurable intervals (default: 1 second or scene change)
2. THE System SHALL assign each frame a millisecond timestamp relative to video start
3. THE System SHALL detect and mark replay segments to avoid treating them as new game events
4. WHEN keyframes are saved, THE System SHALL maintain a frame index mapping timestamps to file paths
5. THE System SHALL preserve aspect ratio and resolution during frame extraction

### Requirement 3: Event Detection and Classification

**User Story:** As a basketball analyst, I want the system to detect and classify key game events, so that highlights can be generated automatically.

#### Acceptance Criteria

1. WHEN a video is analyzed, THE System SHALL detect events of types: shot (ball released toward basket), pass (ball transferred between players), drive (dribble move toward basket), screen (player sets pick on defender), defensive_action (block, steal, or contest)
2. THE System SHALL assign each detected event a unique `event_id` in format EVT-{sequence_number}
3. FOR EACH detected event, THE System SHALL record `start_ms` and `end_ms` within video timeline bounds with millisecond precision
4. WHEN an event is detected, THE System SHALL provide between 1 and 3 evidence frames with timestamps
5. THE System SHALL output observation and interpretation as separate labeled fields
6. IF model confidence score is below 0.70, THEN THE System SHALL flag the event for human review with the confidence score
7. WHERE multiple models are used, THE System SHALL support cross-validation between primary (Qwen3 VL) and secondary (Claude Sonnet) analysis, outputting agreement score in 0.0-1.0 range

### Requirement 4: Official Data Integration

**User Story:** As a data analyst, I want to query official NBA statistics for detected events, so that annotations show verified numbers rather than model hallucinations.

#### Acceptance Criteria

1. WHEN a player or event is identified, THE System SHALL query the official data store using `player_id`, `game_id`, or `event_id` within 500 milliseconds of the identification
2. WHEN querying season aggregate metrics, THE System SHALL return official metrics including: shooting difficulty (shot-difficulty-2025-26-regular.csv), gravity (gravity-2025-26-regular.csv), and leverage impact (leverage-2025-26-regular.csv)
3. WHEN querying per-game detail, THE System SHALL return metrics from the corresponding game-specific files (e.g., game-0022500491-*.json) or normalized candidate files
4. IF official data is unavailable for a requested field, THEN THE System SHALL return null for that field and include the placeholder text "官方数据未提供" in the response
5. IF a query fails due to file read error, missing file, or data parsing error, THEN THE System SHALL return an error response indicating "数据查询失败" and preserve any partially retrieved data
6. THE System SHALL NOT include any statistical values in query responses that are not directly read from files in data/public-nba/20261009/
7. FOR ALL displayed official metrics, THE System SHALL include in the response: source file path relative to data/public-nba/20261009/, record identifier, and query timestamp in ISO 8601 format
8. IF a metric field contains conflicting values across source files, THEN THE System SHALL return the value from the file with the most recent modification timestamp and note the conflict in the response

### Requirement 5: Video-Event Alignment

**User Story:** As a quality assurance reviewer, I want to align video timestamps with official event records, so that annotations match the correct game moments.

#### Acceptance Criteria

1. WHEN an event is detected, THE System SHALL attempt to match it with official play-by-play records using `gameClock` and `period`
2. IF `gameClock` is unavailable in official data, THEN THE System SHALL require manual alignment with evidence documentation
3. FOR EACH matched event, THE System SHALL record both `video_time_ms` and `official_event_id`
4. THE System SHALL validate that matched events fall within the correct game period
5. IF automatic matching fails, THEN THE System SHALL preserve the event as "unverified" rather than guessing

### Requirement 6: Player Identification

**User Story:** As a viewer, I want to see accurate player names and team affiliations, so that I understand who is performing each action.

#### Acceptance Criteria

1. WHEN a player is visible in an event frame, THE System SHALL attempt identification via jersey number, face, or position
2. THE System SHALL query official rosters to map jersey numbers to player names for the specific game
3. IF a player cannot be confidently identified, THEN THE System SHALL display "未知球员" with a temporary tracking ID
4. THE System SHALL NOT fabricate player names when identification fails
5. WHERE YOLO tracking is used, THE System SHALL maintain consistent tracking IDs across frames within a clip

### Requirement 7: Overlay Rendering

**User Story:** As a content viewer, I want to see clear visual overlays on the video, so that I can understand the analysis without reading separate documents.

#### Acceptance Criteria

1. WHEN rendering overlays, THE System SHALL maintain original video aspect ratio and audio track
2. THE System SHALL display at most one explanation card and two highlight markers simultaneously
3. THE System SHALL visually distinguish between three annotation types: "画面观察" (observation), "战术推断" (interpretation), "官方数据" (official data)
4. THE System SHALL use Chinese subtitles by default with AI-generated content clearly labeled
5. WHERE TTS audio is added, THE System SHALL declare "AI 生成解说" in the output
6. THE System SHALL output H.264 MP4 format playable in standard browsers

### Requirement 8: Interactive Web Interface

**User Story:** As a judge or viewer, I want an interactive web page to navigate the video and explore analysis details, so that I can review the work at my own pace.

#### Acceptance Criteria

1. WHEN a user accesses the CloudFront URL, THE System SHALL load the interactive player within 3 seconds
2. THE System SHALL provide play/pause controls and timeline scrubbing
3. THE System SHALL display event markers on the timeline and allow jump-to-event navigation
4. WHEN an event marker is clicked, THE System SHALL show the associated explanation card with evidence
5. THE System SHALL provide a toggle to show/hide overlay annotations
6. THE System SHALL function correctly on desktop Chrome and Firefox browsers
7. THE System SHALL share a consistent annotation timeline between the web interface and exported MP4

### Requirement 9: Agent Orchestration

**User Story:** As a system operator, I want a single Agent to coordinate the analysis pipeline, so that the workflow is reproducible and auditable.

#### Acceptance Criteria

1. WHEN invoked with a video input, THE Agent SHALL execute a defined sequence: ingestion → keyframe extraction → visual analysis → data query → validation → rendering
2. THE Agent SHALL use explicit tool calls with validated parameters, not arbitrary shell commands
3. IF a step fails, THE Agent SHALL report the failure stage and preserve partial results
4. THE Agent SHALL support at most one retry per failed step
5. THE Agent SHALL log all model invocations with timestamps, token counts, and costs
6. WHERE multiple models provide cross-validation, THE Agent SHALL record agreement status and discrepancies

### Requirement 10: Deployment and Infrastructure

**User Story:** As a competition participant, I want one-command deployment to AWS, so that I can meet the strict delivery requirements.

#### Acceptance Criteria

1. WHEN CDK deployment is executed, THE System SHALL create all required AWS resources: S3 buckets, CloudFront distribution, Lambda functions, AgentCore runtime
2. THE System SHALL deploy to the `us-east-1` region exclusively as required by competition rules
3. THE System SHALL configure IAM roles with the `NBAHackathonParticipantBoundary` permission boundary
4. THE System SHALL NOT re-run CDK bootstrap (already completed by organizers)
5. WHEN deployment completes, THE System SHALL output the CloudFront URL for submission
6. THE System SHALL support redeployment from a fresh clone of the GitHub repository

### Requirement 11: Competition Compliance

**User Story:** As a competition participant, I want to ensure all deliverables meet official requirements, so that my submission is accepted.

#### Acceptance Criteria

1. THE System SHALL deploy the Agent to Amazon Bedrock AgentCore in the us-east-1 region with an IAM role that includes the NBAHackathonParticipantBoundary policy
2. THE System SHALL use AWS CDK for all infrastructure definitions
3. THE System SHALL provide a CloudFront URL as the sole accepted access method
4. THE System SHALL store source code in a GitHub private repository, WHERE the repository is linked to the Team Portal, THE System SHALL display the binding status in the Portal interface
5. THE System SHALL include documentation that specifies: architecture diagrams, model IDs, software dependencies with versions, data sources with URLs, AI system declarations, runtime parameters, failure handling procedures, and cost estimates with calculation basis
6. THE System SHALL produce both a demo video and the exam video output in MP4 format, with each video duration between 1 and 10 minutes
7. WHEN the current time is between 20:00 and 22:30 Beijing Time on 2026-10-10, THE CloudFront URL SHALL return HTTP status 200 for video requests within 5 seconds

---

## Non-Functional Requirements

### Performance

1. WHEN processing a 24-second clip, THE System SHALL complete end-to-end analysis within 10 minutes (target, not yet validated)
2. THE interactive web interface SHALL load initial content within 3 seconds
3. THE System SHALL support at least 100 model invocations within the budget allocation

### Reliability

1. IF the primary vision model fails, THE System SHALL attempt fallback analysis or mark events as unverified
2. IF official data is unavailable, THE System SHALL gracefully degrade to observation-only annotations
3. THE System SHALL NOT display synthetic data as official statistics
4. THE System SHALL preserve original video files unmodified throughout processing

### Security

1. THE System SHALL NOT expose AWS credentials in client-side code or Git commits
2. THE System SHALL use S3 private buckets with CloudFront OAC for content access
3. THE System SHALL NOT transmit project code or user data to unauthorized third-party endpoints
4. WHERE external APIs are used, THE System SHALL secure API keys via AWS Secrets Manager or environment variables

### Maintainability

1. THE System SHALL lock all Python dependencies with exact versions in a requirements file
2. THE System SHALL use consistent naming conventions for clip IDs, event IDs, and file paths
3. THE System SHALL log sufficient detail to diagnose failures from logs alone

---

## Acceptance Criteria Summary

| Category | Criteria | Validation Method |
|----------|----------|-------------------|
| Input Traceability | Original video SHA-256, source, duration/FPS/resolution recorded | Check manifest file |
| Event Correctness | All key actions verified against evidence frames; time error ≤ ±0.5s | Manual review |
| Data Accuracy | All displayed names, teams, and metrics have source references; 100% linkage | Audit log check |
| Inference Boundary | Interpretive statements labeled as "推断", not assertions | Content review |
| Output Quality | H.264 MP4, correct aspect ratio, no misalignment, consistent with web | Playback test |
| Interactivity | Play/pause, 3 event jumps, overlay toggle functional | Browser test |
| Robustness | Clear degradation for missing data, blur, scene cuts, model errors | Failure injection |
| Timing & Cost | Processing time recorded; usage logs maintained | Log analysis |
| Reproducibility | Re-running with same input produces consistent output | Repeat execution |
| Competition Compliance | Five deliverables complete; all hard requirements met | Checklist |

---

## Data Requirements

### Required Data Sources

| Data Type | Source | Status | Notes |
|-----------|--------|--------|-------|
| Training Videos | Local files (2 clips, 44.444s total) | ✅ Available | SHA-256 verified |
| Official Metrics | NBA China API + Competition Portal | ⚠️ Partial | 620 records obtained; gameClock missing for 41 shots |
| Season Aggregates | `gravity`, `leverage`, `shot-difficulty` CSVs | ✅ Available | 2025-26 regular season |
| Player Rosters | NBA.com or Portal | ⚠️ To verify | Needed for jersey → name mapping |
| Play-by-Play | NBA.com or Portal | ❌ Not obtained | Required for video-event alignment |
| Model Samples | Competition Portal | ❌ Not obtained | Required for Agent interface definition |

### Data Quality Issues

1. **gameClock Missing:** All 41 candidate player shots have empty `gameClock` field, preventing automatic video-event alignment
2. **Field Semantics Conflict:** Player game summary fields have inconsistent interpretations (e.g., `fgPctAboveExpected` labeling)
3. **Defense Data Null:** Per-game defense/gravity endpoint returns `null` for both candidate games
4. **Video Match Unverified:** Relationship between training videos and game IDs is based on filename, not evidence

---

## Technical Constraints

### Hard Requirements (Competition Rules)

| Constraint | Value | Enforcement |
|------------|-------|-------------|
| AWS Region | `us-east-1` only | Deployment blocked for other regions |
| Agent Platform | Amazon Bedrock AgentCore | Mandatory for machine scoring |
| IaC Tool | AWS CDK | Mandatory for machine scoring |
| Access Method | CloudFront URL | Only accepted URL format |
| Code Repository | GitHub private repo | Must be bound via Portal |
| Permission Boundary | `NBAHackathonParticipantBoundary` | Required on all IAM roles |
| Submission Deadline | 2026-10-10 20:00 Beijing Time | Hard cutoff |

### Budget Constraints

| Resource | Allocation | Notes |
|----------|------------|-------|
| Model API Budget | ~$50-100 USD | Recommended: $69-79 for quality scenario |
| Competition Account Budget | Pre-provisioned | Sufficient for competition use per organizers |
| GPU | 0 quota on EC2 | No GPU instances available |

### Model Constraints

| Model | Use Case | Status |
|-------|----------|--------|
| Qwen3 VL 235B | Primary visual analysis | Personal quota 0 RPM/TPM; competition account TBD |
| Claude Sonnet 4.6 | Keyframe review, interpretation | Global ID listed in guide; competition account TBD |
| Claude Opus 4.8 | Hard case escalation | Optional; competition account TBD |
| Nova Lite | Smoke testing, quality comparison | Personal quota 0; not suitable for production content |

---

## Priority Classification

### P0 - Critical Path (Must Complete for Submission)

1. **T01:** Local video processing pipeline with event contract
2. **T02:** Portal access, sample code, and official data package review
3. **T03:** Cloud environment validation (region, model access, budget)
4. **T04:** Minimal AgentCore + CDK + CloudFront deployment
5. **T05:** Event detection and data alignment for training videos

### P1 - High Value (Significant Scoring Impact)

1. **T06:** Stability and presentation polish
2. **T07:** Exam video processing and five-deliverable assembly
3. Player identification and jersey number mapping
4. Interactive web interface with event navigation
5. Cross-validation between primary and secondary models

### P2 - Enhancement (Differentiation Opportunities)

1. TTS audio generation with AI declaration
2. Advanced visual effects and transitions
3. Mobile browser support
4. Caching and result reuse for repeated runs
5. Extended metric displays and comparisons

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Model quota remains 0 in competition account | Medium | Critical | Verify immediately upon Portal access; have fallback to provided model IDs |
| Video-event alignment fails due to missing gameClock | High | High | Manual alignment with evidence documentation for training videos |
| Deployment exceeds time budget | Medium | High | Practice CDK deployment before competition; use minimal viable stack |
| Model hallucinates statistics | High | Critical | Strict data contract; null for unavailable fields; model cannot write official values |
| CloudFront URL expires before judging | Low | Critical | Verify URL validity window; set appropriate expiration |
| API costs exceed budget | Medium | Medium | Log all invocations; implement early warning at 80% budget |

---

## Dependencies

### Internal Dependencies

- `AGENTS.md` - Project rules and AWS configuration
- Training videos in `E:\Compressed\train_video\train_video`
- Public data in `data/public-nba/20261009/`

### External Dependencies

- Competition Portal access and Team account credentials
- AWS Bedrock model access in `us-east-1`
- GitHub private repository bound to Portal
- Official sample code for Agent interface definition

### Unresolved Dependencies

1. **Agent input/output protocol:** Waiting for Portal sample
2. **Pre-provisioned S3 bucket:** Existence unverified
3. **Model access confirmation:** Competition account quota unknown
4. **Video source authorization:** Disclosure requirements unclear for public展示

---

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-09 | Requirements Agent | Initial requirements document based on competition materials |
