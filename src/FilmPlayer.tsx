import { useState, type RefObject } from "react";
import type { FilmArtifact } from "../shared/agent";
import { timecode } from "./data";
import { dataOverlays } from "../shared/film";
import { TrackBrowser } from "./TrackBrowser";

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
        <span>
          {film.narrationSource?.provider === "fixture"
            ? "离线演示解说"
            : "AI 解说 · 待复核"}
        </span>
      </div>
      {film.narrationSource?.reuseJobId && (
        <p className="agent-notice">
          沿用已生成解说，本次没有再次调用模型。原解说仍需复核。
        </p>
      )}
      <details className="agent-boundaries">
        <summary>
          {film.tracking ? "真实人物追踪 · 身份未确认" : "未执行人物追踪"}
        </summary>
        {film.tracking && (
          <>
            <p>
              {film.tracking.model} · BoT-SORT · {film.tracking.processedFrames}{" "}
              个处理帧，{film.tracking.framesWithTracks} 帧有合格人物框，
              {film.tracking.segmentCount} 个镜头。{film.tracking.uniqueTracks}{" "}
              个镜头内轨迹不等于同等数量球员；覆盖数量不是准确率。
            </p>
            <p>
              人物框与短轨迹已烧录到下载作品。匿名 ID
              不代表球员身份，事件数据卡独立显示；未推断米制距离、速度或个人引力。
            </p>
            <div className="agent-result-actions">
              <a href={film.tracking.tracks} download="tracks.jsonl">
                下载逐帧轨迹
              </a>
              <a
                href={film.tracking.manifest}
                download="tracking-manifest.json"
              >
                下载追踪来源与统计
              </a>
              <a href={film.tracking.overlays} download="overlay-timeline.json">
                下载标注时间轴
              </a>
              {film.tracking.detections && (
                <a href={film.tracking.detections} download="detections.jsonl">
                  下载原始人物检测
                </a>
              )}
              {film.tracking.exclusions && (
                <a
                  href={film.tracking.exclusions}
                  download="excluded-detections.jsonl"
                >
                  下载排除记录
                </a>
              )}
              {film.tracking.floorRegions && (
                <a
                  href={film.tracking.floorRegions}
                  download="floor-regions.jsonl"
                >
                  下载场地区域估计
                </a>
              )}
              <a
                href={film.tracking.identityLinks}
                download="identity-links.json"
              >
                下载身份关联
              </a>
              <a
                href={film.tracking.eventLinks}
                download="event-track-links.json"
              >
                下载事件关联
              </a>
            </div>
          </>
        )}
      </details>
      {film.tracking?.trackIndex && (
        <TrackBrowser
          key={film.tracking.trackIndex}
          url={film.tracking.trackIndex}
          duration={film.duration}
          onSeek={seek}
        />
      )}
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
        {
          film.data.events.filter((e) => e.videoTimeSeconds === null).length
        }{" "}
        条未对齐记录未叠加。
      </small>
    </section>
  );
}
