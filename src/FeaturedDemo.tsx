import { useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  FileText,
  Play,
  Volume2,
} from "lucide-react";
import narration from "./data/demo-narration.json";
import { timecode } from "./data";

const media = "https://d31azeixbvzmqd.cloudfront.net/demo/durant-v1";
const assets = `${import.meta.env.BASE_URL}demo/durant-v1`;

/** Published, reviewed demonstration film, separate from newly generated jobs. */
export function FeaturedDemo() {
  const video = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);
  const [muted, setMuted] = useState(true);
  const [error, setError] = useState(false);
  const active = narration.find((cue) => time >= cue.start && time < cue.end);
  async function listen() {
    if (!video.current) return;
    video.current.muted = false;
    setMuted(false);
    try {
      await video.current.play();
    } catch {
      /* Native play controls remain available. */
    }
  }
  function seek(seconds: number) {
    if (!video.current) return;
    video.current.currentTime = seconds;
    setTime(seconds);
  }
  return (
    <section className="featured-demo" aria-labelledby="demo-title">
      <div className="demo-main">
        <div className="demo-heading">
          <div>
            <span className="eyebrow">TEAM11 / FEATURED FILM</span>
            <h2 id="demo-title">杜兰特这一球，21.3% 的精彩。</h2>
          </div>
          <span className="demo-ready">内置成片 · 1080p / 60 fps</span>
        </div>
        <div className="demo-screen">
          <video
            ref={video}
            src={`${media}/final-video.mp4`}
            poster={`${assets}/poster.jpg`}
            controls
            autoPlay
            muted={muted}
            playsInline
            preload="metadata"
            aria-label="Team11 内置演示：杜兰特中文解说与数据可视化成片"
            onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
            onSeeked={(event) => setTime(event.currentTarget.currentTime)}
            onVolumeChange={(event) => setMuted(event.currentTarget.muted)}
            onError={() => setError(true)}
            onLoadedData={() => setError(false)}
          >
            <track
              kind="subtitles"
              src={`${assets}/captions.vtt`}
              srcLang="zh"
              label="中文解说"
            />
          </video>
          <span className="demo-team-mark">Team11</span>
        </div>
        {error && (
          <p role="alert">
            视频加载遇到网络问题。
            <button
              onClick={() => {
                setError(false);
                video.current?.load();
              }}
            >
              重新加载
            </button>{" "}
            或 <a href={`${media}/final-video.mp4`}>直接打开 MP4</a>。
          </p>
        )}
        <div className="demo-playback-bar">
          <button className="demo-listen" onClick={() => void listen()}>
            <Volume2 size={17} />
            {muted ? "开启中文解说" : "播放中文解说"}
          </button>
          <span>28 秒 · 中文配音 · 画面字幕 · 官方数据图形</span>
        </div>
        <div className="demo-downloads">
          <a href={`${media}/final-video.mp4`} download="Team11-courtside.mp4">
            <ArrowDownToLine size={16} />
            下载完整作品
          </a>
          <a
            href={`${media}/supporting-files.zip`}
            download="Team11-courtside-support.zip"
          >
            <ArrowDownToLine size={16} />
            下载配套文件
          </a>
          <a href="/readme">
            <FileText size={16} />
            作品 README
            <ArrowUpRight size={14} />
          </a>
        </div>
      </div>
      <aside className="demo-story" aria-label="内置演示解说与数据">
        <span className="eyebrow">ONE PLAY, WITH EVIDENCE</span>
        <h3>听解说，也看依据。</h3>
        <p className="demo-context">
          火箭客场对独行侠
          <br />
          凯文·杜兰特 · 第一节 05:38
        </p>
        <div className="demo-facts">
          <div>
            <span>本次出手 xFG</span>
            <strong>
              21.3<small>%</small>
            </strong>
          </div>
          <div>
            <span>命中后比分</span>
            <strong>
              19<small> : </small>9
            </strong>
          </div>
        </div>
        <p className="demo-fact-note">
          官方事件 #88：突破漂移跳投打板命中
          <br />
          事件 #89：戴维斯投篮犯规
        </p>
        <div className="demo-current">
          <span>当前解说 · {timecode(time)}</span>
          <p>
            {active?.text ??
              (time >= 27.124
                ? "回看完整回合，读懂数据背后的比赛。"
                : "点击下方解说段落，定位对应画面。")}
          </p>
        </div>
        <div className="demo-cues" aria-label="解说时间轴">
          {narration.map((cue) => (
            <button
              key={cue.id}
              aria-current={cue === active ? "true" : undefined}
              onClick={() => seek(cue.start)}
            >
              <time>{timecode(cue.start)}</time>
              <span>{cue.text}</span>
              <Play size={12} />
            </button>
          ))}
        </div>
        <a
          className="demo-evidence-link"
          href={`${assets}/matched-play.json`}
          download="matched-play.json"
        >
          查看回合数据与来源
          <ArrowUpRight size={14} />
        </a>
      </aside>
    </section>
  );
}
