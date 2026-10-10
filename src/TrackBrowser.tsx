import { useEffect, useState } from "react";
import type { TrackIndex } from "../shared/tracking";
import { timecode } from "./data";

export function TrackBrowser({
  url,
  duration,
  onSeek,
}: {
  url: string;
  duration: number;
  onSeek: (time: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState<TrackIndex | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!open || index) return;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(url, {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(10000),
          ]),
        });
        if (!response.ok) throw new Error("人物索引暂不可用，请重试。");
        const value: TrackIndex = await response.json();
        if (
          value.schemaVersion !== "courtside.track-index.v1" ||
          value.identityStatus !== "unconfirmed" ||
          !Array.isArray(value.tracks) ||
          value.tracks.length > 2000 ||
          !value.tracks.every(
            (t) =>
              /^S\d{3,6}$/.test(t.segmentId) &&
              /^T\d{3,6}$/.test(t.trackId) &&
              Number.isFinite(t.sampleTime) &&
              t.sampleTime >= 0 &&
              t.sampleTime < duration,
          )
        )
          throw new Error("人物索引无效，无法定位画面。");
        if (!controller.signal.aborted) {
          setIndex(value);
          setError("");
        }
      } catch (reason) {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error ? reason.message : "人物索引读取失败。",
          );
      }
    }
    void load();
    return () => controller.abort();
  }, [open, url, duration, index, retry]);
  const typed = query.trim().toUpperCase();
  const number = typed.match(/^T?(\d{1,6})$/);
  const normalized = number ? `T${number[1].padStart(3, "0")}` : typed;
  const results =
    index?.tracks.filter((t) =>
      `${t.segmentId}/${t.trackId}`.includes(normalized),
    ) ?? [];
  return (
    <details
      className="agent-boundaries"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>人物检索 · 匿名 ID 定位</summary>
      <p>
        按画面 T
        编号检索；同编号在不同镜头中是不同轨迹。尚未确认球员姓名或裁判身份。
      </p>
      {!index && !error && <p role="status">正在读取人物索引…</p>}
      {error && (
        <p role="alert">
          {error}{" "}
          <button
            onClick={() => {
              setError("");
              setRetry((n) => n + 1);
            }}
          >
            重试索引
          </button>
        </p>
      )}
      {index && (
        <>
          <label>
            检索人物 ID 或镜头
            <input
              aria-label="检索人物 ID 或镜头"
              value={query}
              placeholder="T007 / S002"
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <p>
            {results.length} 条匹配，显示前 20 条。
            {index.omittedTracks > 0 &&
              `另有 ${index.omittedTracks} 条短轨迹可在逐帧文件中回查。`}
          </p>
          <div className="agent-result-actions">
            {results.slice(0, 20).map((t) => (
              <button
                key={`${t.segmentId}/${t.trackId}`}
                onClick={() => onSeek(t.sampleTime)}
                aria-label={`定位 ${t.segmentId}/${t.trackId}`}
              >
                {t.segmentId}/{t.trackId} · 代表帧 {timecode(t.sampleTime)} ·{" "}
                {t.observations} 帧 / {t.gapCount} 次缺口
              </button>
            ))}
          </div>
          {results.length === 0 && (
            <p>没有匹配轨迹；这里不能按未确认的姓名检索。</p>
          )}
          <a href={url} download="track-index.json">
            下载人物索引
          </a>
        </>
      )}
    </details>
  );
}
