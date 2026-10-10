import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Circle,
  Download,
  LoaderCircle,
  Play,
  RefreshCw,
  Workflow,
  X,
} from "lucide-react";
import { clips, downloadJson, timecode } from "./data";
import {
  REQUEST_SCHEMA,
  REQUEST_SCHEMA_V2,
  type AgentHealth,
  type Job,
  type StageId,
  type MatchData,
} from "../shared/agent";
import { FilmPlayer } from "./FilmPlayer";

const labels: Record<StageId, string> = {
  material: "核对素材",
  tracking: "真实人物追踪",
  binding: "保留匿名与事件边界",
  frames: "提取证据帧",
  analysis: "多模态分析",
  validation: "校验结果",
  render: "生成解说成片",
  package: "整理结果",
};
async function request<T>(
  url: string,
  init?: RequestInit,
  timeout = 6000,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(timeout),
    });
  } catch {
    throw new Error(
      "本地 Agent 尚未连接。请在项目目录运行 npm run agent，再点击刷新连接。",
    );
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      "未收到 Agent 的有效响应。请在项目目录运行 npm run agent，再刷新连接；若服务已运行，请检查代理配置。",
    );
  }
  if (!response.ok)
    throw new Error(data.error?.message ?? "请求失败，请重试。");
  return data as T;
}
export function AgentPanel({
  onOpenClip,
}: {
  onOpenClip: (id: string, time?: number) => void;
}) {
  const [health, setHealth] = useState<AgentHealth | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [clipId, setClipId] = useState(clips[0]!.id);
  const [inputMode, setInputMode] = useState<"sample" | "upload">("sample");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [dataText, setDataText] = useState("");
  const [preview, setPreview] = useState<MatchData | null>(null);
  const [alignments, setAlignments] = useState<Record<string, string>>({});
  const [uploadStatus, setUploadStatus] = useState("");
  const [trackingRequired, setTrackingRequired] = useState(false);
  const dataInput = useRef("");
  const dataReadGate = useRef(false);
  const uploaded = useRef<{ file: File; id: string } | null>(null);
  const filmVideo = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const mounted = useRef(false);
  const submitGate = useRef(false);
  const current = jobs.find((j) => j.id === selected) ?? jobs[0];
  const refresh = useCallback(async () => {
    try {
      const [state, history] = await Promise.all([
        request<AgentHealth>("/api/health"),
        request<Job[]>("/api/jobs"),
      ]);
      if (mounted.current) {
        setHealth(state);
        setJobs(history);
        setError("");
      }
    } catch (reason) {
      if (mounted.current) {
        setHealth(null);
        setError(reason instanceof Error ? reason.message : "连接失败。");
      }
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);
  const busy = jobs.some(
    (j) => j.status === "queued" || j.status === "running",
  );
  useEffect(() => {
    if (!busy || !health) return;
    const timer = window.setTimeout(() => void refresh(), 1200);
    return () => window.clearTimeout(timer);
  }, [busy, health, jobs, refresh]);
  async function start() {
    if (submitGate.current || !health || busy) return;
    submitGate.current = true;
    setSubmitting(true);
    setError("");
    try {
      let materialId = clipId;
      if (inputMode === "upload") {
        if (!videoFile || !dataText.trim())
          throw new Error("请选择比赛视频并提供数据 JSON。");
        const data: unknown = JSON.parse(dataText);
        const mapping = Object.entries(alignments)
          .filter(([, v]) => v !== "")
          .map(([eventId, v]) => ({ eventId, videoTimeSeconds: Number(v) }));
        if (!uploaded.current || uploaded.current.file !== videoFile) {
          setUploadStatus("正在上传并核验视频…");
          const media = await request<{ id: string }>(
            "/api/media",
            {
              method: "POST",
              headers: {
                "Content-Type": videoFile.type || "application/octet-stream",
              },
              body: videoFile,
            },
            300_000,
          );
          uploaded.current = { file: videoFile, id: media.id };
        }
        setUploadStatus("正在关联数据与视频时间…");
        const material = await request<{ id: string }>("/api/materials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            uploadId: uploaded.current.id,
            title: videoFile.name,
            data,
            alignments: mapping,
          }),
        });
        materialId = material.id;
      }
      setUploadStatus("正在创建成片任务…");
      if (health.provider === "bedrock") {
        setUploadStatus("正在核验赛事 SDK 连接…");
        await request("/api/connection", undefined, 180_000);
        setUploadStatus("连接成功，正在创建成片任务…");
      }
      const job = await request<Job>("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schemaVersion: trackingRequired ? REQUEST_SCHEMA_V2 : REQUEST_SCHEMA,
          clipId: materialId,
          executionMode: health.provider,
          outputMode: "film",
          ...(trackingRequired ? { trackingMode: "required" } : {}),
        }),
      });
      if (mounted.current) {
        setSelected(job.id);
        setJobs((previous) => [
          job,
          ...previous.filter((j) => j.id !== job.id),
        ]);
      }
    } catch (reason) {
      if (mounted.current)
        setError(reason instanceof Error ? reason.message : "任务创建失败。");
    } finally {
      submitGate.current = false;
      if (mounted.current) {
        setSubmitting(false);
        setUploadStatus("");
      }
    }
  }
  async function previewData() {
    if (dataReadGate.current) return;
    dataReadGate.current = true;
    const raw = dataText;
    setError("");
    try {
      const result = await request<MatchData>("/api/data/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: raw,
      });
      if (!mounted.current || dataInput.current !== raw) return;
      setPreview(result);
      setAlignments(
        Object.fromEntries(
          result.events.map((e) => [
            e.id,
            e.videoTimeSeconds === null ? "" : String(e.videoTimeSeconds),
          ]),
        ),
      );
    } catch (reason) {
      if (mounted.current && dataInput.current === raw)
        setError(reason instanceof Error ? reason.message : "数据读取失败。");
    } finally {
      dataReadGate.current = false;
    }
  }
  async function addTrackingToExistingFilm() {
    if (submitGate.current || !health || busy || !current?.result?.film) return;
    submitGate.current = true;
    setSubmitting(true);
    setError("");
    try {
      const job = await request<Job>("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schemaVersion: REQUEST_SCHEMA_V2,
          clipId: current.request.clipId,
          executionMode: health.provider,
          outputMode: "film",
          trackingMode: "required",
          reuseNarrationJobId: current.id,
        }),
      });
      if (mounted.current) {
        setSelected(job.id);
        setJobs((previous) => [
          job,
          ...previous.filter((j) => j.id !== job.id),
        ]);
      }
    } catch (reason) {
      if (mounted.current)
        setError(reason instanceof Error ? reason.message : "追踪任务未创建。");
    } finally {
      submitGate.current = false;
      if (mounted.current) setSubmitting(false);
    }
  }
  function changeData(raw: string) {
    dataInput.current = raw;
    setDataText(raw);
    setPreview(null);
    setAlignments({});
  }
  function openEvidence(time: number) {
    if (current?.result?.film && filmVideo.current) {
      filmVideo.current.currentTime = time;
      filmVideo.current.focus();
    } else if (current) onOpenClip(current.request.clipId, time);
  }
  const result = current?.result;
  const invocation = current?.invocation;
  const paid = health?.provider === "bedrock";
  const modelName = health?.modelId?.startsWith("qwen.")
    ? "Qwen3-VL 235B"
    : "Claude Sonnet 4.6";
  return (
    <section className="agent-panel" aria-labelledby="agent-heading">
      <div className="agent-heading">
        <div className="agent-title">
          <span className="agent-icon">
            <Workflow size={22} />
          </span>
          <div>
            <span className="eyebrow">AI FILM STUDIO</span>
            <h2 id="agent-heading">数据进去，比赛作品出来。</h2>
          </div>
        </div>
        <button className="agent-refresh" onClick={() => void refresh()}>
          <RefreshCw size={14} />
          刷新连接
        </button>
      </div>
      <div className="agent-status-line">
        <span className={`agent-dot ${health ? "connected" : ""}`} />
        {health
          ? health.provider === "fixture"
            ? "离线适配器已连接 · 本次模型费用 $0"
            : `${modelName} 已配置 · 按次付费`
          : "等待本地 Agent"}
        <span>官方赛事协议待接入</span>
      </div>
      <p className="agent-description">
        上传真实比赛视频和数据，生成带数据图形、中文字幕与语音解说的
        MP4。先建立事件与视频时间的对应关系，再生成可播放的作品。
      </p>
      <fieldset className="agent-inputs" disabled={submitting || busy}>
        <legend>作品输入</legend>
        <div className="agent-input-mode">
          <label>
            <input
              type="radio"
              name="input-mode"
              checked={inputMode === "sample"}
              onChange={() => setInputMode("sample")}
            />{" "}
            使用已核验样片
          </label>
          <label>
            <input
              type="radio"
              name="input-mode"
              checked={inputMode === "upload"}
              onChange={() => setInputMode("upload")}
            />{" "}
            上传视频 + 数据
          </label>
        </div>
        {inputMode === "upload" && (
          <div className="agent-upload-form">
            <label>
              真实比赛视频
              <input
                type="file"
                accept="video/*,.mp4,.mov,.mkv,.webm"
                onChange={(e) => {
                  setVideoFile(e.target.files?.[0] ?? null);
                  uploaded.current = null;
                }}
              />
            </label>
            <p>
              5–900 秒 · 最大 512
              MB。长视频按稀疏证据帧生成解说，建议先使用一个完整回合。
            </p>
            <label>
              深度赛场数据 JSON
              <input
                type="file"
                accept=".json,application/json"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 2_000_000) {
                    setError("数据文件超过 2 MB。");
                    return;
                  }
                  try {
                    changeData(await file.text());
                  } catch {
                    setError("无法读取数据文件。");
                  }
                }}
              />
            </label>
            <label>
              或粘贴 JSON
              <textarea
                value={dataText}
                rows={5}
                maxLength={2_000_000}
                spellCheck={false}
                onChange={(e) => changeData(e.target.value)}
                placeholder={
                  '{"schemaVersion":"courtside.match-data.v1","events":[…]}'
                }
              />
            </label>
            <div className="agent-result-actions">
              <button
                type="button"
                onClick={() => void previewData()}
                disabled={!dataText.trim()}
              >
                读取数据与时间关系
              </button>
              <a href="/api/data/template" download="courtside-match-data.json">
                下载数据模板
              </a>
            </div>
            {preview && (
              <div className="agent-data-preview">
                <p>
                  已识别 {preview.events.length}{" "}
                  条记录。填写视频播放器中的秒数，比赛节次计时不等于视频时间。
                </p>
                {preview.events.map((event) => (
                  <label key={event.id}>
                    <span>
                      {event.playerName || event.id} · {event.description}{" "}
                      {event.xfgPercent !== null &&
                        `· xFG ${event.xfgPercent}%`}
                    </span>
                    <input
                      aria-label={`视频秒数 ${event.id}`}
                      type="number"
                      min="0"
                      max="900"
                      step="0.001"
                      value={alignments[event.id] ?? ""}
                      onChange={(e) =>
                        setAlignments((p) => ({
                          ...p,
                          [event.id]: e.target.value,
                        }))
                      }
                      placeholder="未对齐"
                    />
                  </label>
                ))}
                <small>
                  未填写时间的记录会保留在数据档案中，不叠加到比赛画面。
                </small>
              </div>
            )}
          </div>
        )}
      </fieldset>
      <div className="agent-controls">
        {inputMode === "sample" && (
          <label>
            选择训练素材
            <select
              value={clipId}
              onChange={(event) => setClipId(event.target.value)}
            >
              {clips.map((clip) => (
                <option key={clip.id} value={clip.id}>
                  {clip.player} · {clip.shotDescription}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          className="agent-run"
          disabled={
            !health || submitting || busy || (paid && !health.paidCallsEnabled)
          }
          onClick={() => void start()}
        >
          {submitting || busy ? (
            <LoaderCircle className="agent-spin" size={17} />
          ) : (
            <Play size={16} />
          )}
          {busy
            ? "正在生成作品"
            : submitting
              ? "准备素材中"
              : paid
                ? "生成解说作品"
                : "生成离线演示作品"}
        </button>
      </div>
      {health?.provider === "bedrock" && (
        <p className="agent-notice">
          每次创建作品执行一次模型分析，最多输出 2,400
          tokens；费用随输入和输出用量计。结果需结合画面复核。
        </p>
      )}
      <label>
        <input
          type="checkbox"
          checked={trackingRequired}
          disabled={submitting || busy}
          onChange={(e) => setTrackingRequired(e.target.checked)}
        />
        追踪画面人物：匿名框、镜头内 ID 与短轨迹
      </label>
      {trackingRequired && (
        <p className="agent-notice">
          使用本地预训练视觉工具，身份未确认；追踪失败会停止，不继续收费解说。视频采样与漏检会在结果中保留。
        </p>
      )}
      {uploadStatus && <p role="status">{uploadStatus}</p>}
      {error && (
        <p className="agent-error" role="alert">
          {error}
        </p>
      )}
      <div className="agent-stages" aria-label="Agent 处理阶段">
        {(
          current?.stages ??
          Object.keys(labels)
            .filter(
              (id) => trackingRequired || !["tracking", "binding"].includes(id),
            )
            .map((id) => ({
              id: id as StageId,
              status: "pending",
            }))
        ).map((stage, index) => (
          <div key={stage.id} className={`agent-stage ${stage.status}`}>
            <span>
              {stage.status === "completed" ? (
                <Check size={15} />
              ) : stage.status === "failed" ? (
                <X size={15} />
              ) : stage.status === "running" ? (
                <LoaderCircle size={15} className="agent-spin" />
              ) : (
                <Circle size={13} />
              )}
            </span>
            <small>0{index + 1}</small>
            <b>
              {stage.id === "analysis" && current?.request.reuseNarrationJobId
                ? "复用已有解说"
                : labels[stage.id]}
            </b>
          </div>
        ))}
      </div>
      {current && (
        <div className="agent-run-info" role="status">
          <span>
            {current.result?.film?.title ??
              clips.find((clip) => clip.id === current.request.clipId)
                ?.player ??
              "上传素材"}{" "}
            · 任务 {current.id.slice(0, 8)} ·{" "}
            {new Date(current.createdAt).toLocaleString("zh-CN", {
              hour12: false,
            })}
          </span>
          <b>
            {
              {
                queued: "等待处理",
                running: "处理中",
                completed: "流程完成",
                failed: "处理失败",
              }[current.status]
            }
          </b>
        </div>
      )}
      {current?.error && (
        <p className="agent-error" role="alert">
          {current.error.message} <code>{current.error.code}</code>
        </p>
      )}
      {invocation && (
        <div className="agent-invocation">
          <div className="agent-invocation-heading">
            <span className="eyebrow">本次模型调用</span>
            <span>
              {invocation.status === "received"
                ? "已收到响应"
                : invocation.status === "failed"
                  ? "调用失败"
                  : "等待响应"}
            </span>
          </div>
          <div className="agent-usage-grid">
            <div>
              <small>输入 / 输出 tokens</small>
              <strong>
                {invocation.usage.inputTokens ?? "未知"} /{" "}
                {invocation.usage.outputTokens ?? "未知"}
              </strong>
            </div>
            <div>
              <small>估算模型费用</small>
              <strong>
                {invocation.usage.estimatedUsd === null
                  ? "待确认"
                  : `$${invocation.usage.estimatedUsd.toFixed(5)}`}
              </strong>
            </div>
            <div>
              <small>调用耗时</small>
              <strong>
                {invocation.elapsedMs === null
                  ? "处理中"
                  : `${(invocation.elapsedMs / 1000).toFixed(1)} 秒`}
              </strong>
            </div>
          </div>
          <details className="agent-boundaries">
            <summary>调用原文与记录</summary>
            <p>
              {invocation.modelId} ·{" "}
              {invocation.stopReason ?? invocation.errorCode ?? "等待结束"}
            </p>
            <p>
              费用按 2026-10-10
              公开普通按需价格估算；失败且未返回用量时记为未知。
            </p>
            {invocation.rawText && <pre>{invocation.rawText}</pre>}
            {invocation.rawTextTruncated && (
              <p>原文超过存储上限，已截断保留。</p>
            )}
            <button
              className="agent-refresh"
              onClick={() =>
                downloadJson(current, `courtside-call-${current.id}.json`)
              }
            >
              <Download size={14} />
              导出调用记录
            </button>
          </details>
        </div>
      )}
      {result ? (
        <div className="agent-result">
          {result.film && !result.tracking && (
            <button
              className="agent-refresh"
              onClick={() => void addTrackingToExistingFilm()}
              disabled={!health || busy || submitting}
            >
              沿用解说，添加真实追踪（不重复模型收费）
            </button>
          )}
          {result.film && (
            <FilmPlayer
              key={current.id}
              film={result.film}
              videoRef={filmVideo}
            />
          )}
          <div className="agent-result-copy">
            <span className="eyebrow">
              {result.provider === "fixture"
                ? "已有观察 · 离线回放"
                : "模型观察 · 待复核"}
            </span>
            <h3>{result.observation.text}</h3>
            {result.official && (
              <p>
                官方 xFG <strong>{result.official.xfgPercent}%</strong> ·
                来自已有数据目录
              </p>
            )}
            <div className="agent-result-actions">
              <button onClick={() => openEvidence(result.observation.time)}>
                定位视频证据 <ArrowUpRight size={15} />
              </button>
              <button
                onClick={() =>
                  downloadJson(result, `courtside-agent-${current.id}.json`)
                }
              >
                <Download size={15} />
                导出运行结果
              </button>
            </div>
          </div>
          <div className="agent-frames">
            {result.frames.map((frame, index) => (
              <button
                key={frame.id}
                onClick={() => openEvidence(frame.time)}
                aria-label={`查看第 ${index + 1} 帧，${frame.time.toFixed(3)} 秒`}
              >
                <img
                  src={frame.image}
                  alt={`本次提取的证据帧 ${index + 1}`}
                  loading="lazy"
                />
                <span>
                  {timecode(frame.time)}
                  <small>{frame.time.toFixed(3)}s</small>
                </span>
              </button>
            ))}
          </div>
          <details className="agent-boundaries">
            <summary>本次运行的来源与边界</summary>
            <ul>
              {result.boundaries.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p>
              模型调用 {result.usage.modelCalls} 次 · 输入{" "}
              {result.usage.inputTokens} / 输出 {result.usage.outputTokens}{" "}
              tokens
            </p>
            <code>预览 SHA-256: {result.media.previewSha256}</code>
          </details>
        </div>
      ) : (
        <div className="agent-empty">
          <Workflow size={20} />
          <span>
            作品完成后，可在此播放带解说与数据可视化的视频，下载
            MP4、字幕和时间轴。
          </span>
        </div>
      )}
      {jobs.length > 1 && (
        <label className="agent-history">
          运行记录
          <select
            value={current?.id ?? ""}
            onChange={(event) => setSelected(event.target.value)}
          >
            {jobs.map((job) => (
              <option value={job.id} key={job.id}>
                {job.result?.film?.title ??
                  clips.find((clip) => clip.id === job.request.clipId)
                    ?.player ??
                  "上传素材"}{" "}
                · {job.id.slice(0, 8)} ·{" "}
                {
                  {
                    queued: "等待处理",
                    running: "处理中",
                    completed: "流程完成",
                    failed: "处理失败",
                  }[job.status]
                }
              </option>
            ))}
          </select>
        </label>
      )}
    </section>
  );
}
