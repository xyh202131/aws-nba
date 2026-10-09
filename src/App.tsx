import { useEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Crosshair,
  ExternalLink,
  Film,
  Info,
  Keyboard,
  Layers2,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Volume2,
  VolumeX,
  X,
  ChartNoAxesCombined,
  NotebookPen,
  BookmarkPlus,
  Repeat2,
  Undo2,
} from "lucide-react";
import { clips, shots, timecode, downloadJson } from "./data";
import type { Clip, Shot } from "./data";
import {
  Analytics,
  MatchStrip,
  ReviewModules,
  NotesLibrary,
  NoteComposer,
  readNotes,
  NOTE_KEY,
} from "./Studio";
import type { NoteDraft, ReviewNote } from "./Studio";

type View = "review" | "analytics" | "archive" | "notes";
type DialogState =
  | { kind: "source"; shot?: Shot }
  | { kind: "help" }
  | { kind: "note"; draft: NoteDraft; note?: ReviewNote }
  | null;
type Layers = { player: boolean; metric: boolean; caption: boolean };
const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`;

function Brand() {
  return (
    <span className="brand">
      <img src={asset("court.svg")} alt="" width="36" height="36" />
      <span>
        <b>
          COURTSIDE<span className="brand-dot">.</span>
        </b>
        <small>深度赛场</small>
      </span>
    </span>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      previousFocus?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="modal-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-inner">
        <div className="modal-heading">
          <h2 id="modal-title">{title}</h2>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="关闭弹窗"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

function SourceContent({ clip, shot }: { clip: Clip; shot?: Shot }) {
  const gameId = shot?.game_id ?? clip.gameId;
  const eventId = shot?.official_event_id ?? clip.eventId;
  return (
    <div className="source-content">
      <div className="source-intro">
        <ShieldCheck size={24} />
        <div>
          <strong>每一个数字，都有来处。</strong>
          <p>公开比赛记录与画面观察分开保存，缺失的数据留空。</p>
        </div>
      </div>
      <dl className="source-grid">
        <div>
          <dt>比赛</dt>
          <dd>{gameId}</dd>
        </div>
        <div>
          <dt>官方事件</dt>
          <dd>#{eventId}</dd>
        </div>
        <div>
          <dt>球员</dt>
          <dd>{shot?.player_name ?? clip.player}</dd>
        </div>
        <div>
          <dt>官方记账时钟</dt>
          <dd>
            Q{shot?.period ?? clip.period} ·{" "}
            {shot?.official_game_clock_text ?? clip.officialClock}
          </dd>
        </div>
      </dl>
      <section>
        <h3>xFG · 预期命中率</h3>
        <p>
          本次出手的官方预期命中率为{" "}
          <strong>{shot?.official_xfg_percent ?? clip.xfg}%</strong>。来自 NBA
          中国 Inside the Game 的逐次投篮记录，原比例乘以 100
          显示。它不是投篮难度、模型置信度或球队胜率。
        </p>
      </section>
      <section>
        <h3>画面与数据的边界</h3>
        <p>
          {shot && !shot.clip_id
            ? "这条记录尚未关联到当前本地视频，只能用于比赛数据检索。"
            : `本片出手约在 ${clip.release.toFixed(3)} 秒。画面出手附近记分牌为 ${clip.observedClock}，官方记账为 ${clip.officialClock}；二者独立记录，不用于换算视频时间。`}
        </p>
        <p>
          2 次视频事件经过 AI
          视觉核对与官方记录交叉检查，尚未经独立人工复核。未提供本回合引力、关键度和精确球员轨迹，不生成替代数值。
        </p>
      </section>
      <a
        className="source-link"
        href={`https://china.nba.cn/game/${gameId}`}
        target="_blank"
        rel="noreferrer"
      >
        查看 NBA 官方比赛记录 <ExternalLink size={16} />
      </a>
      <a
        className="source-link"
        href="https://china.nba.cn/inside-the-game"
        target="_blank"
        rel="noreferrer"
      >
        Inside the Game 指标来源 <ExternalLink size={16} />
      </a>
      <p className="fine-print">
        数据快照：2026.10.09 ·
        原场次汇总存在字段语义冲突，已隔离；本页只使用逐次出手记录。
      </p>
    </div>
  );
}

function ClipRail({
  selected,
  onSelect,
  onSource,
}: {
  selected: Clip;
  onSelect: (clip: Clip) => void;
  onSource: () => void;
}) {
  return (
    <aside className="clip-rail" aria-label="比赛片段">
      <div className="rail-title">
        <span>回合档案</span>
        <span className="count">02</span>
      </div>
      <div className="clip-list">
        {clips.map((clip, i) => (
          <button
            key={clip.id}
            className={`clip-card ${clip.id === selected.id ? "selected" : ""}`}
            onClick={() => onSelect(clip)}
            aria-pressed={clip.id === selected.id}
          >
            <span className="clip-image">
              <img
                src={asset(clip.poster)}
                alt={`${clip.player}出手画面`}
                width="1280"
                height="720"
              />
              <span className="clip-duration">{timecode(clip.duration)}</span>
              <span className="clip-play">
                <Play size={13} fill="currentColor" />
              </span>
            </span>
            <span className="clip-title-row">
              <span className="clip-number">0{i + 1}</span>
              <span>
                <strong>{clip.player}</strong>
                <small>{clip.shotDescription} · 命中</small>
              </span>
              <ArrowUpRight className="clip-arrow" size={16} />
            </span>
            <span className="clip-foot">
              <span>
                {clip.team} <span className="muted">vs</span> {clip.opponent}
              </span>
              <span>{clip.date}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="rail-bottom">
        <div className="court-mark" aria-hidden="true">
          <svg viewBox="0 0 200 120">
            <path d="M10 110V10h180v100M10 110h180M10 60h180M73 10v26a27 27 0 0 0 54 0V10M73 110V84a27 27 0 0 1 54 0v26" />
            <circle cx="100" cy="60" r="14" />
          </svg>
        </div>
        <span className="rail-bottom-label">THE GAME, IN DETAIL.</span>
        <p>
          不止看见进球。
          <br />
          再看一次，发现细节。
        </p>
        <button className="text-button" onClick={onSource}>
          数据与素材说明 <ArrowUpRight size={16} />
        </button>
      </div>
    </aside>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      className="layer-toggle"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
    >
      <span className={`toggle-track ${checked ? "on" : ""}`}>
        <span />
      </span>
      {label}
    </button>
  );
}

function Player({
  clip,
  jumpSignal,
  jumpTime,
  onSource,
  onMark,
}: {
  clip: Clip;
  jumpSignal: number;
  jumpTime: number | null;
  onSource: () => void;
  onMark: (time: number) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(clip.release);
  const [duration, setDuration] = useState(clip.duration);
  const [rate, setRate] = useState(1);
  const [muted, setMuted] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [buffering, setBuffering] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [looping, setLooping] = useState(false);
  const loopStart = Math.max(0, clip.release - 3);
  const loopEnd = Math.min(clip.duration, clip.release + 3);
  const [ready, setReady] = useState(false);
  const [layers, setLayers] = useState<Layers>({
    player: true,
    metric: true,
    caption: false,
  });
  const [activeMoment, setActiveMoment] = useState(1);
  useEffect(() => {
    const updateFullscreen = () =>
      setFullscreen(document.fullscreenElement === stage.current);
    document.addEventListener("fullscreenchange", updateFullscreen);
    return () =>
      document.removeEventListener("fullscreenchange", updateFullscreen);
  }, []);

  function seek(value: number) {
    if (!video.current || !Number.isFinite(value)) return;
    const next = Math.max(0, Math.min(duration, value));
    video.current.currentTime = next;
    setTime(next);
  }
  useEffect(() => {
    if (jumpSignal > 0 && video.current?.readyState) {
      video.current.pause();
      video.current.currentTime = jumpTime ?? clip.release;
      stage.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
    }
  }, [jumpSignal, jumpTime, clip.release]);
  async function togglePlayback() {
    if (!video.current || !ready) return;
    if (video.current.paused) {
      if (video.current.ended) video.current.currentTime = 0;
      try {
        await video.current.play();
        setError("");
      } catch {
        setError("播放未能启动，请再次点击播放。");
      }
    } else video.current.pause();
  }
  function handleKeys(event: KeyboardEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button,input,select,a")) return;
    if (event.code === "Space" || event.key.toLowerCase() === "k") {
      event.preventDefault();
      void togglePlayback();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      seek(time + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      seek(time - 1);
    } else if (event.key.toLowerCase() === "m") {
      event.preventDefault();
      setMuted((m) => !m);
    }
  }
  const toggleLayer = (key: keyof Layers) =>
    setLayers((current) => ({ ...current, [key]: !current[key] }));

  return (
    <section className="media-column" aria-label="比赛回放">
      <div className="player" ref={stage}>
        <div
          id="review-player"
          className="video-stage"
          tabIndex={0}
          role="group"
          aria-label="视频画面，空格播放或暂停，左右箭头跳转一秒"
          onKeyDown={handleKeys}
        >
          <video
            ref={video}
            src={asset(clip.video)}
            poster={asset(clip.poster)}
            playsInline
            muted={muted}
            preload="metadata"
            onLoadStart={() => setBuffering(true)}
            onWaiting={() => setBuffering(true)}
            onCanPlay={() => setBuffering(false)}
            onPlaying={() => setBuffering(false)}
            onSeeked={() => setBuffering(false)}
            onLoadedMetadata={() => {
              if (video.current) {
                setDuration(video.current.duration);
                video.current.currentTime = jumpTime ?? clip.release;
                video.current.playbackRate = rate;
                setReady(true);
              }
            }}
            onTimeUpdate={() => {
              const value = video.current?.currentTime ?? 0;
              if (
                looping &&
                video.current &&
                !video.current.paused &&
                value >= loopEnd - 0.12
              ) {
                video.current.currentTime = loopStart;
                return;
              }
              setTime(value);
              setActiveMoment(
                clip.moments.reduce(
                  (active, moment, index) =>
                    value + 1 / 30 >= moment.time ? index : active,
                  0,
                ),
              );
            }}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            onError={() => {
              setReady(false);
              setBuffering(false);
              setError("视频加载失败。请检查本地素材后重试。");
            }}
          />
          <div className="video-topline">
            <span className="video-context">
              <span className="signal-dot" />
              回合 0{clip.id === "train_002" ? 1 : 2} <i />Q{clip.period} ·{" "}
              {clip.officialClock}
              <small>官方时钟</small>
            </span>
            <span className="video-format">HD · 赛事回看</span>
          </div>
          {layers.player && (
            <div className="player-nameplate">
              <span className="jersey">{clip.jersey.padStart(2, "0")}</span>
              <span>
                <strong>{clip.player}</strong>
                <small>{clip.englishName}</small>
              </span>
              <span className="team-chip">{clip.team}</span>
            </div>
          )}
          {layers.metric && (
            <button
              className="video-metric"
              onClick={onSource}
              aria-label={`查看预期命中率 ${clip.xfg}% 的来源`}
            >
              <Crosshair size={18} />
              <span>本回合 xFG</span>
              <b>
                {clip.xfg}
                <small>%</small>
              </b>
              <Info size={13} />
            </button>
          )}
          {layers.caption && (
            <div className="video-caption">{clip.observation}</div>
          )}
          {buffering && !error && (
            <div className="media-loading" role="status">
              <span className="loading-ring" aria-hidden="true" />
              正在准备画面
            </div>
          )}
          {!playing && ready && !buffering && (
            <button
              className="stage-play"
              onClick={() => void togglePlayback()}
              aria-label="播放当前片段"
            >
              <Play size={26} fill="currentColor" strokeWidth={1.3} />
            </button>
          )}
          {error && (
            <div className="media-error" role="alert">
              <p>{error}</p>
              <button
                onClick={() => {
                  setError("");
                  video.current?.load();
                }}
              >
                重新加载
              </button>
            </div>
          )}
        </div>
        <div className="transport">
          <button
            className="icon-button play-button"
            aria-label={playing ? "暂停" : "播放"}
            disabled={!ready}
            onClick={() => void togglePlayback()}
          >
            {playing ? (
              <Pause size={18} fill="currentColor" />
            ) : (
              <Play size={18} fill="currentColor" />
            )}
          </button>
          <span className="player-time">
            <b>{timecode(time)}</b>
            <span>/ {timecode(duration)}</span>
          </span>
          <div className="seek-wrap">
            <input
              aria-label="视频进度"
              aria-valuetext={`${timecode(time)}，共 ${timecode(duration)}`}
              type="range"
              min="0"
              max={duration}
              step="0.01"
              value={time}
              onChange={(e) => seek(Number(e.target.value))}
              style={
                { "--progress": `${(time / duration) * 100}%` } as CSSProperties
              }
            />
            <span
              className="release-tick"
              style={{ left: `${(clip.release / duration) * 100}%` }}
              title="已核对出手位置"
            />
          </div>
          <label className="speed-select">
            <span className="sr-only">播放速度</span>
            <select
              value={rate}
              onChange={(e) => {
                const value = Number(e.target.value);
                setRate(value);
                if (video.current) video.current.playbackRate = value;
              }}
            >
              <option value={0.5}>0.5×</option>
              <option value={1}>1×</option>
              <option value={1.5}>1.5×</option>
              <option value={2}>2×</option>
            </select>
            <ChevronDown size={12} />
          </label>
          <button
            className="icon-button sound-button"
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? "开启原声" : "静音"}
          >
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          <button
            className="icon-button fullscreen-button"
            aria-label={fullscreen ? "退出全屏" : "全屏观看"}
            onClick={async () => {
              try {
                setNotice("");
                if (document.fullscreenElement) await document.exitFullscreen();
                else await stage.current?.requestFullscreen();
              } catch {
                setNotice("当前浏览器不支持全屏，可以继续在此窗口观看。");
              }
            }}
          >
            {fullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
          </button>
        </div>
      </div>
      <div className="replay-tools" aria-label="精细回放工具">
        <div>
          <button
            className={looping ? "active" : ""}
            aria-pressed={looping}
            onClick={() => {
              setLooping(!looping);
              if (!looping) {
                seek(loopStart);
              }
            }}
          >
            <Repeat2 size={15} />
            {looping ? "循环已开启" : "出手循环"}
          </button>
          <span>
            {timecode(loopStart)} — {timecode(loopEnd)}
          </span>
        </div>
        <div>
          <button
            onClick={() => {
              video.current?.pause();
              seek(time - 1);
            }}
            aria-label="后退一秒"
          >
            −1s
          </button>
          <button
            onClick={() => {
              video.current?.pause();
              seek(time + 1);
            }}
            aria-label="前进一秒"
          >
            +1s
          </button>
          <button
            className="mark-time"
            onClick={() => {
              video.current?.pause();
              onMark(
                Math.min(clip.duration, video.current?.currentTime ?? time),
              );
            }}
          >
            <BookmarkPlus size={15} />
            标记此刻
          </button>
        </div>
      </div>
      {notice && (
        <p className="player-notice" role="status">
          {notice}
        </p>
      )}
      <div className="layer-bar">
        <span className="layer-heading">
          <SlidersHorizontal size={15} />
          画面图层
        </span>
        <div className="layer-options">
          <Toggle
            label="球员信息"
            checked={layers.player}
            onChange={() => toggleLayer("player")}
          />
          <Toggle
            label="出手数据"
            checked={layers.metric}
            onChange={() => toggleLayer("metric")}
          />
          <Toggle
            label="观察字幕"
            checked={layers.caption}
            onChange={() => toggleLayer("caption")}
          />
        </div>
        <span className="layer-note">随你的视角</span>
      </div>
      <div className="moments-heading">
        <h2>
          关键时刻<span>THE MOMENTS</span>
        </h2>
        <span>
          点选画面，回到这一秒 <ArrowDownToLine size={13} />
        </span>
      </div>
      <div className="moments">
        {clip.moments.map((moment, index) => (
          <button
            className={`moment ${activeMoment === index ? "active" : ""}`}
            key={moment.label}
            onClick={() => {
              seek(moment.time);
              video.current?.pause();
              setActiveMoment(index);
            }}
            aria-pressed={activeMoment === index}
          >
            <div className="moment-image">
              <img
                src={asset(moment.image)}
                alt={`${clip.player} · ${moment.label}`}
                width="1280"
                height="720"
              />
              <span className="moment-time">{timecode(moment.time)}</span>
              <span className="moment-arrow">
                <ArrowUpRight size={17} />
              </span>
            </div>
            <span className="moment-caption">
              <span>
                <small>0{index + 1}</small>
                {moment.label}
              </span>
              {activeMoment === index && (
                <span className="moment-status">当前</span>
              )}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function Inspector({
  clip,
  onJump,
  onSource,
}: {
  clip: Clip;
  onJump: () => void;
  onSource: () => void;
}) {
  const [tab, setTab] = useState<"read" | "facts">("read");
  return (
    <aside className="inspector" aria-label="回合解读">
      <div
        className="inspector-tabs"
        role="tablist"
        aria-label="解读与数据"
        onKeyDown={(e) => {
          if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
            e.preventDefault();
            const next =
              e.key === "Home"
                ? "read"
                : e.key === "End"
                  ? "facts"
                  : tab === "read"
                    ? "facts"
                    : "read";
            setTab(next);
            document.getElementById(`${next}-tab`)?.focus();
          }
        }}
      >
        <button
          id="read-tab"
          role="tab"
          tabIndex={tab === "read" ? 0 : -1}
          aria-selected={tab === "read"}
          aria-controls="inspector-content"
          onClick={() => setTab("read")}
        >
          回合解读
        </button>
        <button
          id="facts-tab"
          role="tab"
          tabIndex={tab === "facts" ? 0 : -1}
          aria-selected={tab === "facts"}
          aria-controls="inspector-content"
          onClick={() => setTab("facts")}
        >
          数据依据 <ArrowUpRight size={12} />
        </button>
      </div>
      <div
        id="inspector-content"
        role="tabpanel"
        aria-labelledby={tab === "read" ? "read-tab" : "facts-tab"}
      >
        {tab === "read" ? (
          <>
            <div className="insight-lead">
              <span className="insight-number">
                0{clip.id === "train_002" ? 1 : 2}
                <span> / PLAY BREAKDOWN</span>
              </span>
              <h2>
                {clip.title.split("，")[0]}，<br />
                <em>{clip.title.split("，")[1]}</em>
              </h2>
              <p>{clip.observation}</p>
              <span className="observed-label">
                <Check size={12} />
                画面观察 · AI 辅助核对
              </span>
            </div>
            <div className="shot-fact">
              <span className="fact-icon">
                <Crosshair size={18} />
              </span>
              <div>
                <span>这一球的结果</span>
                <strong>
                  {clip.shotDescription}
                  <i />
                  两分命中
                </strong>
              </div>
              <span className="made-stamp">+2</span>
            </div>
            <div className="xfg-block">
              <div className="metric-heading">
                <span>
                  预期命中率 <small>xFG</small>
                </span>
                <button
                  className="info-button"
                  aria-label="了解预期命中率"
                  onClick={onSource}
                >
                  <Info size={15} />
                </button>
              </div>
              <div className="xfg-value">
                {clip.xfg}
                <span>%</span>
                <span className="metric-origin">
                  NBA 官方
                  <br />
                  逐次投篮数据
                </span>
              </div>
              <div
                className="xfg-meter"
                role="img"
                aria-label={`预期命中率 ${clip.xfg}%`}
              >
                <span style={{ width: `${clip.xfg}%` }} />
                <i style={{ left: `${clip.xfg}%` }} />
              </div>
              <div className="meter-labels">
                <span>0%</span>
                <span>100%</span>
              </div>
              <p>
                理解出手机会的另一种视角。
                <br />
                命中是结果，xFG 描述这次机会。
              </p>
            </div>
            <div className="unavailable-metric">
              <span>球员引力</span>
              <span>
                本回合暂无数据 <span className="empty-dash">—</span>
              </span>
            </div>
            <button className="jump-button" onClick={onJump}>
              <RotateCcw size={16} />
              再看出手瞬间
              <span>
                {timecode(clip.release)} <ArrowRight size={15} />
              </span>
            </button>
            <button className="inspector-source" onClick={onSource}>
              <ShieldCheck size={13} />
              已关联官方事件 #{clip.eventId}
              <ArrowUpRight size={14} />
            </button>
          </>
        ) : (
          <div className="facts-tab">
            <span className="insight-number">THE EVIDENCE</span>
            <h2>
              看见事实，
              <br />
              也看清边界。
            </h2>
            <dl>
              <div>
                <dt>官方事件</dt>
                <dd>#{clip.eventId}</dd>
              </div>
              <div>
                <dt>比赛时钟</dt>
                <dd>
                  Q{clip.period} · {clip.officialClock}
                </dd>
              </div>
              <div>
                <dt>画面时钟</dt>
                <dd>{clip.observedClock}</dd>
              </div>
              <div>
                <dt>视频出手约值</dt>
                <dd>{clip.release.toFixed(3)} s</dd>
              </div>
              <div>
                <dt>出手前</dt>
                <dd>{clip.scoreBefore}</dd>
              </div>
              <div>
                <dt>出手后</dt>
                <dd>{clip.scoreAfter}</dd>
              </div>
            </dl>
            <p>
              官方时钟与画面时钟分别保存。出手时间为视觉核对约值，尚未完成独立人工复核。
            </p>
            <button className="jump-button" onClick={onSource}>
              展开完整来源 <ArrowUpRight size={16} />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

function Archive({
  onOpenClip,
  onSource,
}: {
  onOpenClip: (id: string) => void;
  onSource: (shot: Shot) => void;
}) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState("all");
  const [player, setPlayer] = useState("all");
  const searchInput = useRef<HTMLInputElement>(null);
  const filtered = shots.filter(
    (s) =>
      (player === "all" || player === s.player_id) &&
      (result === "all" || s.made === (result === "made")) &&
      `${s.player_name} ${s.official_event_id} ${s.official_game_clock_text} ${s.inside_shot_description}`.includes(
        query.trim(),
      ),
  );
  return (
    <section className="archive" aria-label="投篮数据档案">
      <div className="archive-intro">
        <div>
          <h2>
            每一次出手，<span>都有据可查。</span>
          </h2>
          <p>两名球员 · 两场比赛 · 官方逐次投篮记录</p>
        </div>
        <div className="archive-count">
          <b>41</b>
          <span>条官方记录</span>
        </div>
      </div>
      <div className="archive-filters">
        <div className="search-field">
          <Search size={17} />
          <label className="sr-only" htmlFor="shot-search">
            搜索球员、事件或时钟
          </label>
          <input
            id="shot-search"
            ref={searchInput}
            placeholder="搜索球员、事件或时钟"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              className="clear-search"
              aria-label="清除搜索"
              onClick={() => {
                setQuery("");
                searchInput.current?.focus();
              }}
            >
              <X size={16} />
            </button>
          )}
        </div>
        <label>
          <span className="sr-only">球员筛选</span>
          <select value={player} onChange={(e) => setPlayer(e.target.value)}>
            <option value="all">全部球员</option>
            <option value="1641708">阿门·汤普森</option>
            <option value="1642843">库珀·弗拉格</option>
          </select>
        </label>
        <label>
          <span className="sr-only">投篮结果筛选</span>
          <select value={result} onChange={(e) => setResult(e.target.value)}>
            <option value="all">全部结果</option>
            <option value="made">命中</option>
            <option value="missed">未中</option>
          </select>
        </label>
        <span className="result-count" aria-live="polite">
          {filtered.length} 条结果
        </span>
      </div>
      <div
        className="table-scroll"
        tabIndex={0}
        role="region"
        aria-label="可横向滚动的投篮记录表"
      >
        <table>
          <thead>
            <tr>
              <th>球员 / 比赛</th>
              <th>事件</th>
              <th>比赛时钟</th>
              <th>出手方式</th>
              <th>结果</th>
              <th>xFG</th>
              <th>
                <span className="sr-only">操作</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.record_id}>
                <td>
                  <strong>{s.player_name}</strong>
                  <small>{s.game_id}</small>
                </td>
                <td className="mono">#{s.official_event_id}</td>
                <td className="mono">
                  Q{s.period} · {s.official_game_clock_text}
                </td>
                <td>{s.inside_shot_description}</td>
                <td>
                  <span className={s.made ? "result made" : "result"}>
                    {s.made ? "命中" : "未中"}
                  </span>
                </td>
                <td className="table-metric">
                  {s.official_xfg_percent}
                  <small>%</small>
                </td>
                <td>
                  {s.clip_id ? (
                    <button
                      className="table-action"
                      aria-label={`回看${s.player_name}事件 ${s.official_event_id}`}
                      onClick={() => onOpenClip(s.clip_id!)}
                    >
                      回看 <Play size={12} />
                    </button>
                  ) : (
                    <button
                      className="table-action subtle"
                      aria-label={`查看${s.player_name}事件 ${s.official_event_id}来源`}
                      onClick={() => onSource(s)}
                    >
                      来源 <ArrowUpRight size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="shot-cards" aria-label="投篮记录">
        {filtered.map((s) => (
          <article
            className={`shot-card ${s.clip_id ? "has-video" : ""}`}
            key={s.record_id}
          >
            <div className="shot-card-top">
              <div>
                <h3>{s.player_name}</h3>
                <span className="mono">
                  事件 #{s.official_event_id} · Q{s.period}{" "}
                  {s.official_game_clock_text}
                </span>
              </div>
              <span className={s.made ? "result made" : "result"}>
                {s.made ? "命中" : "未中"}
              </span>
            </div>
            <div className="shot-card-detail">
              <div>
                <span className="shot-card-label">出手方式</span>
                <p>{s.inside_shot_description}</p>
              </div>
              <div className="shot-card-xfg">
                <span className="shot-card-label">预期命中率 · xFG</span>
                <b>
                  {s.official_xfg_percent}
                  <small>%</small>
                </b>
              </div>
            </div>
            <div className="shot-card-bottom">
              <span className="mono">比赛 {s.game_id}</span>
              <button
                className={`table-action ${s.clip_id ? "" : "subtle"}`}
                aria-label={`${s.clip_id ? "回看" : "查看"}${s.player_name}事件 ${s.official_event_id}${s.clip_id ? "" : "来源"}`}
                onClick={() =>
                  s.clip_id ? onOpenClip(s.clip_id) : onSource(s)
                }
              >
                {s.clip_id ? (
                  <>
                    回看这一球 <Play size={14} />
                  </>
                ) : (
                  <>
                    查看来源 <ArrowUpRight size={14} />
                  </>
                )}
              </button>
            </div>
          </article>
        ))}
      </div>
      {!filtered.length && (
        <div className="empty-state">
          <Search size={30} />
          <h3>没有找到这次出手</h3>
          <p>试试球员姓名、事件编号，或清除筛选。</p>
          <button
            className="primary-button"
            onClick={() => {
              setQuery("");
              setResult("all");
              setPlayer("all");
              searchInput.current?.focus();
            }}
          >
            清除筛选
          </button>
        </div>
      )}
      <p className="archive-note">
        <Info size={14} />2 条记录已关联本地视频。其余 39
        条仅用于比赛检索，不代表视频识别结果。
      </p>
    </section>
  );
}

export default function App() {
  const [clip, setClip] = useState(clips[0]);
  const [view, setView] = useState<View>("review");
  const [dialog, setDialog] = useState<DialogState>(null);
  const [jumpSignal, setJumpSignal] = useState(0);
  const [jumpTime, setJumpTime] = useState<number | null>(null);
  const [toast, setToast] = useState("");
  const [noteState, setNoteState] = useState(readNotes);
  const [removedNote, setRemovedNote] = useState<ReviewNote | null>(null);
  const noteDraft = { clipId: clip.id, time: clip.release };
  const titles: Record<View, string> = {
    review: "把这一球，看明白。",
    analytics: "每次出手，都有线索。",
    archive: "数据，让细节有据。",
    notes: "你的视角，值得留下。",
  };
  const viewLabels: Record<View, string> = {
    review: "比赛回看",
    analytics: "投篮分析",
    archive: "公开数据",
    notes: "复盘笔记",
  };
  function saveNotes(next: ReviewNote[]) {
    let warning = noteState.warning;
    if (!warning) {
      try {
        localStorage.setItem(NOTE_KEY, JSON.stringify(next));
      } catch {
        warning = "浏览器存储不可用，本次笔记只保存在当前页面，请及时导出。";
      }
    }
    setNoteState({ notes: next, warning });
    return !warning;
  }
  function openClip(id: string, time?: number) {
    const next = clips.find((c) => c.id === id);
    if (!next) return;
    focusReview.current = true;
    setClip(next);
    setView("review");
    setJumpTime(time ?? null);
    setJumpSignal((n) => n + 1);
  }
  const focusReview = useRef(false);
  useEffect(() => {
    if (view !== "review" || !focusReview.current) return;
    focusReview.current = false;
    const target = document.getElementById("review-player");
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: "center", behavior: "instant" });
  }, [view, clip.id]);
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(""), 3600);
    return () => window.clearTimeout(id);
  }, [toast]);
  function chooseClip(next: Clip) {
    setClip(next);
    setView("review");
    setJumpSignal(0);
    setJumpTime(null);
  }
  function exportData() {
    if (view === "notes") {
      downloadJson(
        { schema: "courtside-personal-notes-v1", notes: noteState.notes },
        "courtside-notes.json",
      );
      setToast("已请求下载全部复盘笔记");
      return;
    }
    const content =
      view === "archive" || view === "analytics"
        ? {
            schema_status: "internal_public_shot_index_not_contest_schema",
            snapshot: "2026-10-09",
            shots,
          }
        : {
            schema_status: "internal_review_not_contest_schema",
            review:
              "AI visual crosscheck; independent human review not performed",
            clip,
          };
    downloadJson(
      content,
      view === "archive" || view === "analytics"
        ? "courtside-shot-archive.json"
        : `courtside-${clip.id}.json`,
    );
    setToast(
      view === "archive" || view === "analytics"
        ? "已请求下载全部 41 条投篮记录"
        : "已请求下载当前回合 JSON 数据",
    );
  }
  return (
    <>
      <a className="skip-link" href="#workspace">
        跳至主要内容
      </a>
      <header className="app-header">
        <a
          className="brand-link"
          href="#"
          aria-label="COURTSIDE 深度赛场首页"
          onClick={(e) => {
            e.preventDefault();
            setView("review");
          }}
        >
          <Brand />
        </a>
        <nav aria-label="主导航">
          <button
            aria-current={view === "review" ? "page" : undefined}
            className={view === "review" ? "active" : ""}
            onClick={() => setView("review")}
          >
            <Film size={15} />
            回合工作台
          </button>
          <button
            aria-current={view === "analytics" ? "page" : undefined}
            className={view === "analytics" ? "active" : ""}
            onClick={() => setView("analytics")}
          >
            <ChartNoAxesCombined size={15} />
            投篮分析
          </button>
          <button
            aria-current={view === "archive" ? "page" : undefined}
            className={view === "archive" ? "active" : ""}
            onClick={() => setView("archive")}
          >
            <Layers2 size={15} />
            数据档案<span className="nav-count">41</span>
          </button>
          <button
            aria-current={view === "notes" ? "page" : undefined}
            className={view === "notes" ? "active" : ""}
            onClick={() => setView("notes")}
          >
            <NotebookPen size={15} />
            复盘笔记
            {noteState.notes.length > 0 && (
              <span className="nav-count">{noteState.notes.length}</span>
            )}
          </button>
        </nav>
        <div className="header-actions">
          <span className="local-status">
            <span />
            本地演示
          </span>
          <button className="export-button" onClick={exportData}>
            <ArrowDownToLine size={16} />
            <span>导出数据</span>
          </button>
        </div>
      </header>
      <div className="app-body">
        <ClipRail
          selected={clip}
          onSelect={chooseClip}
          onSource={() => setDialog({ kind: "source" })}
        />
        <main id="workspace" className="workspace" tabIndex={-1}>
          <div className="workspace-heading">
            <div>
              <div className="breadcrumb">
                <span>深度赛场</span>
                <ChevronRight size={12} />
                <span>{viewLabels[view]}</span>
              </div>
              <h1>{titles[view]}</h1>
            </div>
            <div className="match-context">
              {view === "review" ? (
                <span className={`team-coin ${clip.team.toLowerCase()}`}>
                  {clip.team}
                </span>
              ) : (
                <span className="team-coin">
                  {view === "notes" ? (
                    <NotebookPen size={16} />
                  ) : (
                    <ChartNoAxesCombined size={16} />
                  )}
                </span>
              )}
              <span>
                <strong>
                  {view === "review"
                    ? clip.matchup
                    : view === "notes"
                      ? "本机笔记库"
                      : "2025–26 常规赛"}
                </strong>
                <small>
                  {view === "review"
                    ? `${clip.date} · 训练片段`
                    : view === "notes"
                      ? `${noteState.notes.length} 条个人观察 · 本地保存`
                      : "官方公开数据 · 2026.10.09 快照"}
                </small>
              </span>
            </div>
          </div>
          {view === "review" ? (
            <>
              <MatchStrip clip={clip} onAnalyze={() => setView("analytics")} />
              <div className="review-layout">
                <Player
                  key={clip.id}
                  clip={clip}
                  jumpSignal={jumpSignal}
                  jumpTime={jumpTime}
                  onSource={() => setDialog({ kind: "source" })}
                  onMark={(time) =>
                    setDialog({
                      kind: "note",
                      draft: { clipId: clip.id, time },
                    })
                  }
                />
                <Inspector
                  key={clip.id + "-inspector"}
                  clip={clip}
                  onJump={() => {
                    setJumpTime(null);
                    setJumpSignal((n) => n + 1);
                  }}
                  onSource={() => setDialog({ kind: "source" })}
                />
              </div>
              <ReviewModules
                clip={clip}
                notes={noteState.notes}
                onAnalyze={() => setView("analytics")}
                onNote={() => setDialog({ kind: "note", draft: noteDraft })}
                onNotes={() => setView("notes")}
              />
            </>
          ) : view === "analytics" ? (
            <Analytics
              initialClip={clip}
              onSource={(shot) => setDialog({ kind: "source", shot })}
              onOpenClip={openClip}
            />
          ) : view === "notes" ? (
            <NotesLibrary
              notes={noteState.notes}
              warning={noteState.warning}
              onCreate={() => setDialog({ kind: "note", draft: noteDraft })}
              onEdit={(note) =>
                setDialog({
                  kind: "note",
                  draft: { clipId: note.clipId, time: note.time },
                  note,
                })
              }
              onRemove={(note) => {
                saveNotes(noteState.notes.filter((n) => n.id !== note.id));
                setRemovedNote(note);
                setToast("笔记已移除，可撤销");
              }}
              onJump={(note) => openClip(note.clipId, note.time)}
            />
          ) : (
            <Archive
              onOpenClip={openClip}
              onSource={(shot) => setDialog({ kind: "source", shot })}
            />
          )}
          <footer className="workspace-footer">
            <span>
              <span className="footer-dot" />
              真实比赛画面 · 有来源的数据 · AI 辅助观察
            </span>
            <div>
              <button onClick={() => setDialog({ kind: "source" })}>
                来源说明 <ArrowUpRight size={12} />
              </button>
              <button
                onClick={() => setDialog({ kind: "help" })}
                aria-label="查看快捷键与使用说明"
              >
                <Keyboard size={15} />
                <span className="footer-help">快捷键</span>
              </button>
            </div>
          </footer>
        </main>
      </div>
      {dialog && (
        <Modal
          title={
            dialog.kind === "help"
              ? "让回看更顺手"
              : dialog.kind === "note"
                ? dialog.note
                  ? "编辑复盘笔记"
                  : "记录这个瞬间"
                : "数据与观察依据"
          }
          onClose={() => setDialog(null)}
        >
          {dialog.kind === "note" ? (
            <NoteComposer
              draft={dialog.draft}
              initial={dialog.note}
              onClose={() => setDialog(null)}
              onSave={(note) => {
                const persisted = saveNotes([
                  note,
                  ...noteState.notes.filter((n) => n.id !== note.id),
                ]);
                setDialog(null);
                setToast(
                  persisted
                    ? "笔记已保存到本机浏览器"
                    : "笔记暂存当前页面，请前往笔记库导出",
                );
              }}
            />
          ) : dialog.kind === "source" ? (
            <SourceContent
              clip={
                dialog.shot?.clip_id
                  ? (clips.find((c) => c.id === dialog.shot?.clip_id) ?? clip)
                  : clip
              }
              shot={dialog.shot}
            />
          ) : (
            <div className="help-content">
              <p>先点击或用 Tab 聚焦视频画面，再使用以下快捷键。</p>
              <dl>
                <div>
                  <dt>播放 / 暂停</dt>
                  <dd>
                    <kbd>Space</kbd> / <kbd>K</kbd>
                  </dd>
                </div>
                <div>
                  <dt>前进 / 后退一秒</dt>
                  <dd>
                    <kbd>←</kbd> <kbd>→</kbd>
                  </dd>
                </div>
                <div>
                  <dt>静音 / 开启原声</dt>
                  <dd>
                    <kbd>M</kbd>
                  </dd>
                </div>
                <div>
                  <dt>关闭弹窗</dt>
                  <dd>
                    <kbd>Esc</kbd>
                  </dd>
                </div>
              </dl>
              <p>
                <CircleHelp size={15} />
                点击关键时刻可定位对应画面；导出的是结构化数据，不是带标注的成片。
              </p>
            </div>
          )}
        </Modal>
      )}
      <div
        className={`toast ${toast ? "visible" : ""}`}
        role="status"
        aria-live="polite"
      >
        {toast && (
          <>
            <Check size={16} />
            {toast}
          </>
        )}
      </div>
      {removedNote && (
        <div className="undo-note" role="status">
          <span>已移除一条笔记</span>
          <button
            onClick={() => {
              saveNotes([
                removedNote,
                ...noteState.notes.filter((n) => n.id !== removedNote.id),
              ]);
              setRemovedNote(null);
              setToast("笔记已恢复");
            }}
          >
            <Undo2 size={15} />
            撤销
          </button>
          <button
            className="icon-button"
            aria-label="关闭撤销提示"
            onClick={() => setRemovedNote(null)}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </>
  );
}
