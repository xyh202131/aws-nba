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
  type AgentHealth,
  type Job,
  type StageId,
} from "../shared/agent";

const labels: Record<StageId, string> = {
  material: "核对素材",
  frames: "提取证据帧",
  analysis: "分析适配器",
  validation: "校验结果",
  package: "整理结果",
};
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(6000) });
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
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const mounted = useRef(false);
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
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const job = await request<Job>("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schemaVersion: REQUEST_SCHEMA, clipId }),
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
      if (mounted.current) setSubmitting(false);
    }
  }
  const result = current?.result;
  return (
    <section className="agent-panel" aria-labelledby="agent-heading">
      <div className="agent-heading">
        <div className="agent-title">
          <span className="agent-icon">
            <Workflow size={22} />
          </span>
          <div>
            <span className="eyebrow">LOCAL AGENT / 01</span>
            <h2 id="agent-heading">从素材，到有据可查。</h2>
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
            : "Bedrock 已配置 · 调用将产生费用"
          : "等待本地 Agent"}
        <span>官方赛事协议待接入</span>
      </div>
      <p className="agent-description">
        先验证一条完整流程。重新抽取视频证据帧，回放已有观察，再校验时间、引用与来源。
      </p>
      <div className="agent-controls">
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
        <button
          className="agent-run"
          disabled={
            !health || submitting || busy || health.provider !== "fixture"
          }
          onClick={() => void start()}
        >
          {submitting || busy ? (
            <LoaderCircle className="agent-spin" size={17} />
          ) : (
            <Play size={16} />
          )}
          {busy ? "正在处理" : "运行离线流程"}
        </button>
      </div>
      {health?.provider === "bedrock" && (
        <p className="agent-notice">
          当前网页只开放离线演练。真实模型调用须完成权限、额度与费用确认后通过受控后端接入。
        </p>
      )}
      {error && (
        <p className="agent-error" role="alert">
          {error}
        </p>
      )}
      <div className="agent-stages" aria-label="Agent 处理阶段">
        {(
          current?.stages ??
          Object.keys(labels).map((id) => ({
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
            <b>{labels[stage.id]}</b>
          </div>
        ))}
      </div>
      {current && (
        <div className="agent-run-info" role="status">
          <span>
            {clips.find((clip) => clip.id === current.request.clipId)?.player} ·
            任务 {current.id.slice(0, 8)} ·{" "}
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
      {result ? (
        <div className="agent-result">
          <div className="agent-result-copy">
            <span className="eyebrow">
              {result.provider === "fixture"
                ? "已有观察 · 离线回放"
                : "模型观察 · 待复核"}
            </span>
            <h3>{result.observation.text}</h3>
            <p>
              官方 xFG <strong>{result.official.xfgPercent}%</strong> ·
              来自已有数据目录
            </p>
            <div className="agent-result-actions">
              <button
                onClick={() =>
                  onOpenClip(result.clipId, result.observation.time)
                }
              >
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
                onClick={() => onOpenClip(result.clipId, frame.time)}
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
            任务结果会保留在本机。完成后可查看证据帧、定位回合并导出 JSON。
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
                {clips.find((clip) => clip.id === job.request.clipId)?.player} ·{" "}
                {job.id.slice(0, 8)} ·{" "}
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
