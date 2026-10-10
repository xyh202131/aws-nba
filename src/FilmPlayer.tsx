import { useState, type RefObject } from "react";
import type { FilmArtifact } from "../shared/agent";
import { timecode } from "./data";
import { dataOverlays } from "../shared/film";

export function FilmPlayer({
  film,
  videoRef,
}: {
  film: FilmArtifact;
  videoRef: RefObject<HTMLVideoElement | null>;
}) {
  const [time, setTime] = useState(0);
  const active = film.cues.find((c) => time >= c.start && time < c.end);
  const events = dataOverlays(film.data, film.duration)
    .filter((o) => time >= o.start && time < o.end)
    .map((o) => o.event);
  function seek(seconds: number) {
    if (videoRef.current) videoRef.current.currentTime = seconds;
    setTime(seconds);
  }
  return (
    <section className="agent-film" aria-label="生成的比赛作品">
      <div className="agent-film-heading">
        <h3>{film.title}</h3>
        <span>AI 解说 · 待复核</span>
      </div>
      <video
        ref={videoRef}
        controls
        playsInline
        preload="metadata"
        src={film.video}
        aria-label="带数据可视化与中文解说的比赛视频"
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onSeeked={(e) => setTime(e.currentTarget.currentTime)}
      />
      <div className="agent-result-actions">
        <a href={film.video} download="courtside-film.mp4">
          下载比赛作品 MP4
        </a>
        <a href={film.captions} download="courtside-captions.vtt">
          下载解说字幕
        </a>
        <a href={film.timeline} download="courtside-timeline.json">
          下载作品时间轴
        </a>
      </div>
      <div className="agent-live-narration" aria-live="off">
        <span className="eyebrow">当前解说 · {timecode(time)}</span>
        <p>{active?.narration ?? "等待播放"}</p>
      </div>
      <div className="agent-film-metrics">
        {events.map((e) => (
          <div key={e.id}>
            <span>
              {e.playerName || "数据事件"} · {e.description}
            </span>
            {e.xfgPercent !== null && (
              <>
                <strong>xFG {e.xfgPercent}%</strong>
                <meter
                  min="0"
                  max="100"
                  value={e.xfgPercent}
                  aria-label={`${e.playerName}预期命中率`}
                />
              </>
            )}
            <small>
              {film.data.source === "existing_catalog"
                ? "NBA 官方记录"
                : "上传数据 · 来源待核验"}
            </small>
          </div>
        ))}
      </div>
      <details open className="agent-transcript">
        <summary>完整解说 · 点击定位画面</summary>
        {film.cues.map((cue, i) => (
          <button
            key={i}
            className={cue === active ? "active" : ""}
            onClick={() => seek(cue.start)}
            aria-current={cue === active ? "true" : undefined}
          >
            <time>{timecode(cue.start)}</time>
            <span>{cue.narration}</span>
          </button>
        ))}
      </details>
      <small>
        中文语音已合入 MP4；请开启播放器音量。
        {film.data.events.filter((e) => e.videoTimeSeconds === null).length}{" "}
        条未对齐记录未叠加。
      </small>
    </section>
  );
}
