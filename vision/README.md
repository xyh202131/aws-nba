# 本地人物追踪工具

已实现 P0/P1 工程闭环：注册视频 → YOLO11m 人物检测 → BoT-SORT 镜头内匿名关联 → JSONL → 带框、ID、短轨迹的 MP4 → 原有 Web。定位使用实际视频，不调用 AWS 或训练模型。精度验收、可靠身份关联和 ARM64 云端兼容性尚未通过，详见[验证记录](../output/tracking-validation-20261010/README.md)。

## 本机环境与准备

本次实际运行：Windows、Python 3.14.7、Ultralytics 8.4.174、PyTorch 2.12.0+cpu、PyAV 18.0.0。Python 库版本锁在 [requirements.txt](requirements.txt)，参数在 [profile.json](profile.json) 和 [tracker.yaml](tracker.yaml)。仅准备依赖时需要网络；请求执行阶段禁止自动下载模型、自动安装依赖或发送 Ultralytics 同步数据。

已有 `.local/vision-venv/Scripts/python.exe` 与 `.local/vision-models/yolo11m.pt` 可直接使用。首次在另一台 Windows 机器准备：

```powershell
python -m venv .local/vision-venv
.local/vision-venv/Scripts/python.exe -m pip install --index-url https://download.pytorch.org/whl/cpu torch==2.12.0 torchvision==0.27.0
.local/vision-venv/Scripts/python.exe -m pip install -r vision/requirements.txt
.local/vision-venv/Scripts/python.exe vision/prepare_weights.py
```

本机复用了已安装的 CPU Torch/PyAV，因此 venv 使用了 `--system-site-packages`；这不是干净 Linux/ARM64 镜像验证。`VISION_PYTHON` 可由服务管理员配置，HTTP 请求不能指定 Python、权重或脚本路径。当前语音成片仍依赖 Windows Huihui 和微软雅黑字体。

预训练权重约 40.7 MB（十进制），SHA-256 `d5ffc1a674953a08e11a8d21e022781b1b23a19b730afc309290bd9fb5305b95`。[model-lock.json](model-lock.json) 固定发布者、大小与哈希；运行时逐次核对视频、工具、配置和权重。当前文件来自 Ultralytics 官方 GitHub release，并与发布者 Hugging Face LFS 哈希核对。准备脚本使用发布者镜像，已有权重会核验而非重复下载。

YOLO11/Ultralytics 标注为 AGPL-3.0，源码与权重保留许可来源；正式公网发布前需落实对应许可或商业授权。[官方模型与许可说明](https://docs.ultralytics.com/models/yolo11/)

## 无模型收费的独立预览

在仓库根执行：

```powershell
node --experimental-strip-types vision/preview.mjs public/media/amen.mp4 .local/tracking-preview
```

这是本地开发 CLI，输出独立 UUID 目录、manifest 和 `tracking-preview.mp4`。文件路径只对本地操作者开放；网页入口仍只能上传/注册视频，再提交素材 ID。现有视频仍是样例，不限制新 UUID。

在 Web 中勾选“追踪画面人物”可生成新的带追踪作品。已有未追踪成片可点击“沿用解说，添加真实追踪（不重复模型收费）”：校验同一素材 ID、实际视频哈希、数据和时长，复用已完成解说文字和原审核状态，重新合成本机语音并渲染，不调用 Bedrock。读取旧作品、刷新、播放和下载均不生成任务。

## 数据和质量边界

- `tracks.jsonl`：解码后显示平面的实际检测框、底部中点近似锚点、PTS、原帧号、源帧时长、镜头内 ID。`detected/lost` 分开，失踪框为 null；不绘制 Kalman 预测位置或跨缺口补线。
- `excluded-detections.jsonl` / `floor-regions.jsonl`：尺寸、估计场地区域及边缘排除原因，供回查漏检。浅色/木地板凸包只是启发式筛选；球馆、光照、边线、腾空和特写会影响它，裁判/场边人员仍可能进入未知人物集合。
- `tracking-manifest.json`：输入、模型、工具与配置哈希，PTS 原点、SAR/旋转、帧率、分段、依赖、资源与每个文件哈希。`unique_tracks` 是镜头内轨迹数，不能当作球员数量或准确率。
- `overlay-timeline.json`：按实际 PTS 生效的源显示像素坐标，由 FFmpeg 烧录到最终画布；0.8 秒短轨迹只连接有效同镜头观测。新观测保存解码帧时长；缺失时明确退回平均帧率曝光，旧文件兼容。ASS 精度为 10 ms，不能声称达到任意高帧率精度。
- `identity-links.json` / `event-track-links.json`：当前均为空，身份未确认。xFG 仍来自输入数据，并独立显示，不能挂到未知 T 编号上。米制坐标、速度、引力和因果指标均未启用。

## 人物优化与检索

当前默认关闭 BoT-SORT 分数融合，尺寸合格的检测先关联再按估计场地区域决定是否绘制。边界外实测位置保留 `included=false`，不绘制或检索。该改动改善本机观测/轨迹数量，精度和真实 ID 连续性未通过；[同检测对照及取舍](../output/person-retrieval-optimization-20261010/README.md)记录了全部配置和失败模型试验。

`.local/vision-cache` 缓存实际 YOLO 检测，按视频/权重/检测参数/采样版本/库版本隔离，完整文件哈希和逐帧 PTS/尺寸/坐标均校验；损坏拒绝，不回退为新模型调用。改变关联/ROI 参数可命中，改变视频或检测参数重新推理。缓存暂不自动清理，目录随输入和配置增长；显示/SAR/采样行为变更须更新 `detections.py` 中版本，不能继续用旧键。

新追踪作品提供 `detections.jsonl` 作为原始检测来源和 `track-index.json` 作为小型检索摘要。Web 展开“人物检索 · 匿名 ID 定位”按 T 编号/镜头检索并跳转；只统计实际绘制曝光，不补齐丢失时间。最多 2000 条摘要、20 条当前匹配展示，完整轨迹可下载。它不是球员姓名/人脸检索，也没有身份确认或自动角色删除。

可用 `compare_association.py` 做串行对照，输出新 UUID 目录，不覆盖旧实验。可选 `--experimental-reid` 需要先按 `requirements-experiments.txt` 准备依赖，并显式执行 `prepare_aux_weights.py`；运行阶段不下载。ReID 权重发布者摘要已核对，TinyCLIP 本地摘要仅用于一致性；两者试验后均未设为默认。不需要为常规追踪重复安装这些实验依赖。

## 高清视频准备

现有训练原片是 1080p、约 60fps，网页示例是 720p30。优先保留原片。`prepare_video.mjs` 在新 UUID 目录生成原生尺寸/帧率转码及轻度降噪锐化 A/B；`inspect_video.py` 独立解码，核对逐帧 PTS、数量和尺寸并保存对应帧。不是 AI 超分，不补帧；不得把锐化后的号码当作新证据。详情/产物见上述优化记录。

当前 `render.ts` 和 `preview.mjs` 的烧录画布仍 720p，原生处理样本没有人物标注/中文解说。高清完整成片是后续独立验收项。

YOLO 推理线程显式限制为 2，并记录实际 Torch 线程数；这不等于已经验证 AgentCore 2 vCPU 性能。追踪单任务超时 900 秒、最多 150,000 条追踪/排除记录、视觉 JSONL 合计最多 100 MB；全片无合格轨迹、缺权重、非法坐标/哈希或执行失败会停在追踪阶段，不继续收费解说。建议先用 20–30 秒的回合，长片分段尚未实现。

## 独立人工验收

每段原片抽 30 帧，包括切镜邻域和均匀覆盖帧；不预填模型框、不把检测结果当真值。生成新的核对目录（已有标注不会被覆盖）：

```powershell
.local/vision-venv/Scripts/python.exe vision/quality.py sample --video public/media/amen.mp4 --manifest <tracking-manifest.json> --output .local/review-new
```

打开生成的 `review.html`，逐人拖框，选择清晰/遮挡，填写标注者；每帧完整检查后勾选已核对，导出 JSON 到独立目录。然后执行：

```powershell
.local/vision-venv/Scripts/python.exe vision/quality.py evaluate --annotations <人工导出.json> --manifest <tracking-manifest.json> --tracks <tracks.jsonl> --output .local/quality-report.json
.local/vision-venv/Scripts/python.exe -m unittest discover -s vision -p 'test_*.py'
```

未满 30 帧、未逐帧确认、来源不符、非法框或可见性会拒绝评估。IoU ≥ 0.5 做一对一匹配；清晰样本报告 precision/recall，遮挡样本另报匹配数和 recall。匹配到遮挡人物的预测不计为清晰样本假阳性。没有人工标注时不产生真实准确率；本机测试中的合成标注只检验算法规则。

下一步先标注两段原片并审查 ID 切换，再比较筛选/关联配置。还缺第三段未收录视频、身份/事件绑定证据，以及 Linux 语音/字体和 ARM64 完整性能验证。当前无需新增 AWS 资源。
