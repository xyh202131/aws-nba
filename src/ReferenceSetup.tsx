import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ChartColumn,
  Check,
  ChevronRight,
  Crosshair,
  FileJson,
  Film,
  Info,
  MapPin,
  MoveUpRight,
  Upload,
  Users,
} from "lucide-react";
import type { Clip } from "./data";
import type { MatchData } from "../shared/agent";

type Perspective = "shot" | "space" | "context";

export function DataReadiness({
  clip,
  data,
  upload,
  tracking,
}: {
  clip: Clip;
  data: MatchData | null;
  upload: boolean;
  tracking: boolean;
}) {
  const [perspective, setPerspective] = useState<Perspective>("shot");
  const ready = !upload || data !== null;
  const hasXfg = upload
    ? !!data?.events.some((event) => event.xfgPercent !== null)
    : true;
  const xfg = upload
    ? data?.events.find((event) => event.xfgPercent !== null)?.xfgPercent
    : clip.xfg;
  const rows: Record<
    Perspective,
    { name: string; detail: string; source: string; status: string }[]
  > = {
    shot: [
      {
        name: "出手方式",
        detail: "从比赛事件理解这一次出手。",
        source: "比赛事件数据",
        status: ready ? "已关联" : "待导入",
      },
      {
        name: "球员标签",
        detail: "姓名来自关联记录，匿名追踪编号保持独立。",
        source: "官方记录 / 上传数据",
        status: ready ? "已关联" : "待导入",
      },
      {
        name: "预期命中率",
        detail: "按事件呈现 xFG，与真实命中结果分别记录。",
        source: upload ? "上传数据 · 待核验" : "NBA 官方逐次出手",
        status: hasXfg ? "已关联" : "待匹配",
      },
    ],
    space: [
      {
        name: "人物框与短轨迹",
        detail: "镜头内连续定位，帮助回看球员移动。",
        source: "预训练视觉模型",
        status: tracking ? "本次开启" : "可在右侧开启",
      },
      {
        name: "空档与空间热力",
        detail: "取得球场标定与可靠位置后再呈现。",
        source: "球场坐标与时序证据",
        status: "待接入",
      },
      {
        name: "防守收缩",
        detail: "需要确认防守角色与跨帧移动方向。",
        source: "时序位置与角色识别",
        status: "待接入",
      },
    ],
    context: [
      {
        name: "比赛事件",
        detail: "节次、出手方式与事件来源集中管理。",
        source: "官方记录 / 上传数据",
        status: ready ? "已关联" : "待导入",
      },
      {
        name: "视频时间对齐",
        detail: "以播放器秒数定位，比赛时钟保留原意。",
        source: "人工对齐 / 已核验样片",
        status: upload ? "读取 JSON 后填写" : "已对齐",
      },
      {
        name: "胜负影响率",
        detail: "保留指标入口，等待可核验的数据来源。",
        source: "待接入来源",
        status: "待接入",
      },
    ],
  };
  return (
    <section className="reference-data" aria-labelledby="reference-data-title">
      <div className="reference-section-title">
        <div>
          <span className="reference-step">01 / DATA</span>
          <h2 id="reference-data-title">让数据服务于讲述</h2>
        </div>
        <span className="reference-badge">
          <FileJson size={13} />
          {upload ? "自有数据" : "已核验样片"}
        </span>
      </div>
      <p className="reference-intro">
        根据输入自动匹配可用指标，保留每个数字的来源。
      </p>
      <div className="reference-core-heading">
        <h3>核心指标</h3>
        <span>{hasXfg ? "1" : "0"} / 3 已具备来源</span>
      </div>
      <div className="reference-metric-grid">
        <article className={`reference-metric ${hasXfg ? "available" : ""}`}>
          <Crosshair size={29} />
          <span className="reference-metric-status">
            {hasXfg ? (
              <>
                <Check size={12} />
                已关联
              </>
            ) : (
              "待匹配"
            )}
          </span>
          <h4>预期命中率</h4>
          <strong>{hasXfg ? `${xfg}%` : "—"}</strong>
          <small>
            {upload ? "上传数据 · 来源待核验" : "NBA 官方逐次投篮记录"}
          </small>
        </article>
        <article className="reference-metric">
          <Users size={29} />
          <span className="reference-metric-status pending">待接入</span>
          <h4>球员引力</h4>
          <strong>—</strong>
          <small>需要有来源的空间与防守数据</small>
        </article>
        <article className="reference-metric">
          <ChartColumn size={29} />
          <span className="reference-metric-status pending">待接入</span>
          <h4>胜负影响率</h4>
          <strong>—</strong>
          <small>需要可核验的比赛影响指标</small>
        </article>
      </div>
      <div className="reference-core-note">
        <Info size={14} />
        当前作品使用已匹配数据，缺失指标保留待接入状态。
      </div>
      <div className="reference-purpose-heading">
        <h3>按讲述视角查看数据</h3>
        <span>数据能力与来源</span>
      </div>
      <div className="reference-perspectives" aria-label="讲述视角">
        {(
          [
            ["shot", "解释出手", Crosshair],
            ["space", "解释空间", MapPin],
            ["context", "交代比赛形势", ChartColumn],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            aria-pressed={perspective === key}
            className={perspective === key ? "selected" : ""}
            onClick={() => setPerspective(key)}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
      </div>
      <div className="reference-data-rows" key={perspective}>
        {rows[perspective].map((row, i) => (
          <article key={row.name}>
            <span className="reference-row-number">0{i + 1}</span>
            <div>
              <h4>{row.name}</h4>
              <p>{row.detail}</p>
            </div>
            <div className="reference-row-source">
              <small>数据来源</small>
              <span>{row.source}</span>
            </div>
            <span
              className={`reference-row-status ${row.status === "待接入" ? "pending" : ""}`}
            >
              {row.status}
              <ChevronRight size={14} />
            </span>
          </article>
        ))}
      </div>
      <div className="reference-color-key">
        <span>
          <MoveUpRight size={17} />
          跑位
        </span>
        <span>
          <i />
          空档
        </span>
        <span>
          <ArrowRight size={17} />
          收缩
        </span>
        <small>可视化语义 · 有可靠证据后显示</small>
      </div>
    </section>
  );
}

export function VideoIntake({
  upload,
  clip,
  file,
  onFile,
  disabled,
}: {
  upload: boolean;
  clip: Clip;
  file: File | null;
  onFile: (file: File | null) => void;
  disabled: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!file) {
      setUrl("");
      return;
    }
    const local = URL.createObjectURL(file);
    setUrl(local);
    return () => URL.revokeObjectURL(local);
  }, [file]);
  const source = upload
    ? url
    : clip.video.startsWith("https://")
      ? clip.video
      : `${import.meta.env.BASE_URL}${clip.video}`;
  return (
    <div className="reference-video-intake">
      <div className="reference-video-title">
        <h3>比赛视频</h3>
        <span>{upload ? "本地导入" : "示例素材"}</span>
      </div>
      {source ? (
        <div className="reference-video-preview">
          <video
            key={source}
            src={source}
            poster={
              !upload ? `${import.meta.env.BASE_URL}${clip.poster}` : undefined
            }
            controls
            preload="metadata"
            aria-label="输入比赛视频预览"
          />
          <div>
            <Film size={15} />
            <span>
              {upload ? file?.name : `${clip.player} · ${clip.shotDescription}`}
            </span>
            {upload && (
              <button
                type="button"
                disabled={disabled}
                onClick={() => input.current?.click()}
              >
                更换
              </button>
            )}
          </div>
        </div>
      ) : (
        <div
          className={`reference-dropzone ${dragging ? "dragging" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            if (!disabled) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            if (!disabled) onFile(event.dataTransfer.files[0] ?? null);
          }}
        >
          <span className="reference-file-icon">
            <Film size={34} />
          </span>
          <strong>把真实比赛带进来</strong>
          <p>拖入视频，或从本机选择文件</p>
          <button
            type="button"
            disabled={disabled}
            onClick={() => input.current?.click()}
          >
            <Upload size={16} />
            选择视频
          </button>
          <small>MP4 / MOV / MKV / WEBM</small>
        </div>
      )}
      <input
        ref={input}
        className="sr-only"
        type="file"
        aria-label="真实比赛视频"
        accept="video/*,.mp4,.mov,.mkv,.webm"
        disabled={disabled}
        onChange={(event) => onFile(event.target.files?.[0] ?? null)}
      />
      <p className="reference-upload-limit">
        5–900 秒 · 最大 512 MB · 建议先选择一个完整回合
      </p>
    </div>
  );
}
