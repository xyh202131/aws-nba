# 人物检索与视频处理 · 2026-10-10

本轮完成本地匿名人物检索、关联参数优化、可校验检测缓存，以及原生 1080p 视频处理对照。未部署、训练或提交评测，没有新 AWS API 或付费模型调用。主服务已恢复原有 Bedrock 配置；这不是新的凭据或模型健康核验。本轮只检查功能、数据、时间和产物，不调整布局或手机端。

## 采用的改动

1. BoT-SORT 关闭 `fuse_score`。已复现高分初始化后、低分但连续重叠框消失的行为，回归测试确认新配置保持该合成连续段 ID。这个测试不替代真实比赛 ID 验收。
2. 尺寸合格的实际人物检测先参与关联，之后按估计地板区域决定是否绘制。暂时越过启发式场地边界不立即丢掉关联输入；区域外观测明确 `included=false`，不进入标注画面或检索索引。仍可能漏边线/腾空人物、误纳入裁判。
3. 原始检测缓存以视频、权重、图像尺寸、置信度、采样/显示版本、时长和库版本生成键；文件哈希、完整性、实际 PTS/帧号/尺寸和盒坐标逐项核验。损坏缓存直接失败；不同输入/检测参数不能复用。缓存只保存实测框，不保存预测位置；同一视频调整关联/区域参数不重复 YOLO 推理。
4. 每份新作品生成小型 `track-index.json`。按镜头与 T 编号检索、跳到真实代表帧、显示观测数/缺口、下载索引；浏览器按需读取索引，不加载整份逐帧轨迹。最多 2000 条索引，超出数量明确显示，完整 JSONL 仍保留。旧作品保持兼容。

默认是 YOLO11m + BoT-SORT，无 ReID、无自动角色分类。匿名编号不代表 NBA 球员身份，未确认姓名不参加检索，xFG 不挂到 T 编号。

## 同一批真实检测对照

每片四种关联/筛选配置及一个实验 ReID 共用同一检测文件；[实验摘要](association-comparison.json)保留配置哈希、缓存哈希、数量和资源。本轮多项本机工作曾同时运行，墙钟差异不能当作纯性能对比。下面是实际观测统计，**不是精确率、召回率或真实 ID 切换率**。

| 片段 / 配置 | 有合格框帧数 | 合格观测 | 镜头内匿名轨迹数 |
| --- | ---: | ---: | ---: |
| 阿门，原配置 | 638 / 686 | 7035 | 87 |
| 阿门，仅关闭分数融合 | 638 / 686 | 7417 | 92 |
| 阿门，后置区域筛选＋保留分数融合 | 638 / 686 | 7344 | 79 |
| 阿门，采用：后置区域筛选＋关闭融合 | 638 / 686 | 7680 | 79 |
| 弗拉格，原配置 | 644 / 646 | 8187 | 92 |
| 弗拉格，仅关闭分数融合 | 644 / 646 | 8950 | 95 |
| 弗拉格，后置区域筛选＋保留分数融合 | 644 / 646 | 8424 | 89 |
| 弗拉格，采用：后置区域筛选＋关闭融合 | 644 / 646 | 9169 | 90 |

合格观测增加约 9.2% / 12.0%，覆盖帧数没有增加。轨迹数下降不足以证明串人减少；遮挡后的关键球员 ID 切换仍存在。缺口不插值、不跨切镜连线、输出仍为真实检测框。

两份缓存分别有 20,776 / 16,846 个原始人物检测，首次生成实际墙钟 311.939 / 327.108 秒。复用后的阿门网页任务追踪阶段实际墙钟见 [Web 记录](web-report.json)；完整任务约 24 秒，包含证据帧、语音和渲染。缓存仅加速相同输入，首次处理新视频仍需完整推理，不能把缓存表现当作云端 2 vCPU 性能。

可复现实验命令（串行执行，输出新 UUID 目录）：

```powershell
.local/vision-venv/Scripts/python.exe vision/compare_association.py public/media/amen.mp4 --duration 22.89
.local/vision-venv/Scripts/python.exe vision/compare_association.py public/media/flagg.mp4 --duration 21.55
```

采用配置：[profile.json](../../vision/profile.json)、[tracker.yaml](../../vision/tracker.yaml)。运行时工具哈希随代码版本变化，每份 manifest 保留自身真实运行的哈希；测试后的私有 runtime YAML 写入修正不改变观测/筛选算法，不改写历史证据。

## 未采用的模型实验

- **YOLO26n-ReID**：官方发布的 448px / 512 维预训练 ONNX，实际 CPU 编码阿门 6699、弗拉格 10541 个人物裁剪。早期区域筛选、关闭分数融合条件下，轨迹数仍是 92 / 95，未获得数量收益；墙钟 92.848 / 137.550 秒，CPU 185.734 / 272.812 秒。保留实验入口，默认关闭；不是球员身份模型。首次出现“启用但实际编码 0 次”时已发现并修正原生 auto 特征路径问题，加入零编码拒绝和路由回归测试，最终记录是实际推理。
- **TinyCLIP 8M/3M**：18 个真实人物裁剪的零样本角色试验，大部分未知，明显裁判也没有成为裁判候选；[失败结果](role-experiment.json)保留相似度。拒绝用它自动删人或冒充已识别身份。相似度不是置信概率。发布者未提供此权重独立摘要，本地 SHA 只作为后续一致性指纹；ReID 权重已核对发布者 GitHub asset 摘要。

两个模型仅本机准备/推理，未创建 AWS 资源。可选依赖在 [requirements-experiments.txt](../../vision/requirements-experiments.txt)，来源/大小/摘要/许可在 [aux-model-lock.json](../../vision/aux-model-lock.json)。常规追踪不需要 OpenCLIP 或 ONNX Runtime。

## Web 与产物

阿门新作品任务 **31484ec4-ae48-495f-a912-43df9e25d42c**，本机文件：

- [带人物框、数据和中文解说 MP4](../../.local/agent/artifacts/31484ec4-ae48-495f-a912-43df9e25d42c/film.mp4)
- [人物索引](../../.local/agent/artifacts/31484ec4-ae48-495f-a912-43df9e25d42c/track-index.json)
- [追踪 manifest](amen-manifest.json)，[Web 验证](web-report.json)

沿用原 Sonnet 解说及 `needs_review` 状态，新增模型 calls/tokens/估算费用均为 0。实际检索 S001/T005、定位 20.4204 秒、空检索、解说定位、44.5% 独立数据、未静音音轨、下载哈希、Range、私有文件拒绝和刷新不重跑均通过。遗留解说“弧顶”语义歧义未改，不能当作已经复核。

[恢复后只读复测](web-restored-report.json)还验证了索引加载失败时的错误提示、显式重试和省略前导零的编号检索，不新建作品、不调用模型。

弗拉格新独立标注预览：
[tracking-preview.mp4](../../.local/person-optimization-preview/artifacts/eb2e85f4-0720-4e62-8fe0-c392a156afa5/tracking-preview.mp4)，[manifest](flagg-manifest.json)。它不是新收费解说作品。

烧录画面核对：[优化前](before-1.jpg) / [优化后](after-1.jpg)，[另一时刻](after-2.jpg)。这些是成片回查图，不是独立人工标注真值。

## 高清与处理取舍

训练目录两段原片已是 **1920×1080、约 59.94 fps**；现有网页素材是 1280×720、29.97 fps。优先使用原始高清视频，不能将 720p 放大称作恢复了真实细节。人物关联对照仍使用既有 720p 素材，没有假装已用 1080p 重新推理。

阿门原片 SHA `7ec745f5f1e75b0c6d6dd27d409875f67c2ac3ab76c73f7123794c96be5aee22`，87,308,125 字节。本轮生成：

- [原生分辨率、原帧率转码样本](../../.local/video-preparation/f2340624-7b95-467d-b7ed-1e5945696727/native.mp4)：79,610,275 字节，SHA `31dd474a3a2c6e05926245e08e5ed99650541d636cda31bd08f269b45934e1b2`。
- [轻度降噪＋锐化对照](../../.local/video-preparation/f2340624-7b95-467d-b7ed-1e5945696727/light.mp4)：90,853,904 字节，SHA `2a09e33dac569723d8c09bcf58a9f1cd00c55542766c317246feef52987802bb`。
- [原片 / 原生转码 / 轻度处理细节对照](detail-comparison.png)，[独立解码与 PTS 核验](video-quality-check.json)，[编码参数与哈希](video-preparation.json)。

两输出均保持原片 1371 帧、1920×1080、59.940016 fps；逐帧相对 PTS 最大误差 0，PTS 摘要相同。H.264 CRF 18、原音轨复制；不补帧、不改数据时间，不是 AI 超分。处理未带来明显可确认优势且体积更大，**原片仍为默认建议**。不能凭锐化生成的边缘认号码或名字。

```powershell
node --experimental-strip-types vision/prepare_video.mjs 'E:/Compressed/train_video/train_video/训练_阿门1月4日 .mp4'
.local/vision-venv/Scripts/python.exe vision/inspect_video.py <上述生成的目录> --time 18.78
```

现有 Agent 成片输出仍固定 **720p**。1080p 输入→高清带框解说成片还没有完成，需要在原片上重建定位/来源并验证高清烧录坐标和性能；不把本轮处理样本当作完整成片。

## 验证与下一项

41 项 Node 行为测试、15 项 Python 测试、类型检查和生产构建通过；真实比赛与网页验证如上。所有准确率目标仍待两片各 30 帧独立标注，未运行第三段新视频泛化验收；未验证 ARM64/AgentCore 性能。

汇总与最终源码摘要见 [verification.json](verification.json)；Python 日志中的合成真值分数只验证评估器规则，不是比赛实测准确率。

下一项先完成独立球员框及关键球员跨遮挡 ID 核对，再按错例决定关联阈值或球衣/角色模型。高清视频路径已核实，后续可直接接原片做 1080p 成片，优先保留原信息，不先做生成式超分。源码、小型证据和本记录纳入仓库；权重、缓存、MP4 和临时任务在忽略的 `.local`，仅留本机，不随 GitHub 同步。本记录中的 `.local` 产物链接只能在相应本机工作区使用。

官方依据：[Ultralytics 跟踪](https://docs.ultralytics.com/modes/track/)、[ReID 资产](https://github.com/ultralytics/assets/releases/tag/v8.4.0)、[TinyCLIP](https://github.com/wkcn/TinyCLIP)、[FFmpeg 参数](https://ffmpeg.org/ffmpeg-all.html)、[React Effect](https://react.dev/reference/react/useEffect)。本轮通过 Context7 与已安装源码核对 API，实际行为以本地运行记录为准。
