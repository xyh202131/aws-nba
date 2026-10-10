import { useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleHelp,
  FileJson,
  GitCompareArrows,
  Link2,
  Play,
  ScanLine,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import { clips, shots, timecode, downloadJson } from "./data";
import type { Clip } from "./data";
import {
  evidenceFor,
  interpretationFor,
  inspectReview,
  MAX_REVIEW_BYTES,
  reviewPayload,
} from "./review";
import type { IntakeResult } from "./review";
import { percent, summarizeShots } from "./analytics";

export function EventTimeline({
  clip,
  time,
  active,
  onSeek,
}: {
  clip: Clip;
  time: number;
  active: number;
  onSeek: (time: number) => void;
}) {
  return (
    <section className="event-timeline" aria-label="回合时间轴">
      <div className="evidence-section-heading">
        <div>
          <span className="section-kicker">THE SEQUENCE</span>
          <h2>回合时间轴</h2>
        </div>
        <span>
          视频时间 · {timecode(time)} / {timecode(clip.duration)}
        </span>
      </div>
      <div className="event-track" aria-label="关键时刻定位">
        <span
          className="event-progress"
          style={{ width: `${Math.min(100, (time / clip.duration) * 100)}%` }}
        />
        <i
          className="event-playhead"
          style={{ left: `${Math.min(100, (time / clip.duration) * 100)}%` }}
        />
        {clip.moments.map((moment, index) => (
          <button
            key={moment.label}
            style={{ left: `${(moment.time / clip.duration) * 100}%` }}
            onClick={() => onSeek(moment.time)}
            aria-label={`定位到${moment.label} ${timecode(moment.time)}`}
            aria-pressed={active === index}
          >
            <span>{index + 1}</span>
          </button>
        ))}
      </div>
      <div className="event-track-labels">
        <span>00:00</span>
        <span>按视频时间定位 · 连线仅表示先后顺序</span>
        <span>{timecode(clip.duration)}</span>
      </div>
      <div className="event-frames">
        {clip.moments.map((moment, index) => (
          <button
            key={moment.label}
            aria-pressed={active === index}
            onClick={() => onSeek(moment.time)}
            className={active === index ? "active" : ""}
          >
            <img
              src={`${import.meta.env.BASE_URL}${moment.image}`}
              alt={`${clip.player} · ${moment.label}`}
              width="1280"
              height="720"
            />
            <span className="event-frame-top">
              <b>E0{index + 1}</b>
              <span>{timecode(moment.time)}</span>
            </span>
            <span className="event-frame-title">
              {moment.label}
              <ArrowUpRight size={14} />
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function Interpretation({
  clip,
  onSeek,
  onNote,
}: {
  clip: Clip;
  onSeek: (time: number) => void;
  onNote: () => void;
}) {
  const [mode, setMode] = useState("plain");
  const copy = interpretationFor(clip, mode);
  const modes = [
    { id: "plain", label: "通俗解读" },
    { id: "technical", label: "技术视角" },
    { id: "review", label: "复盘提问" },
  ];
  return (
    <section className="interpretation-panel" aria-label="分层回合解读">
      <div className="evidence-section-heading">
        <div>
          <span className="section-kicker">ONE PLAY, THREE LENSES</span>
          <h2>同一回合，不同视角。</h2>
        </div>
        <span className="evidence-origin">
          <Link2 size={13} />
          关联证据
        </span>
      </div>
      <div
        className="lens-tabs"
        role="tablist"
        aria-label="解读视角"
        onKeyDown={(event) => {
          const index = modes.findIndex((m) => m.id === mode);
          const next =
            event.key === "ArrowRight"
              ? (index + 1) % 3
              : event.key === "ArrowLeft"
                ? (index + 2) % 3
                : event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? 2
                    : -1;
          if (next < 0) return;
          event.preventDefault();
          setMode(modes[next].id);
          document.getElementById(`lens-${modes[next].id}`)?.focus();
        }}
      >
        {modes.map((item) => (
          <button
            id={`lens-${item.id}`}
            key={item.id}
            role="tab"
            aria-selected={mode === item.id}
            aria-controls="lens-content"
            tabIndex={mode === item.id ? 0 : -1}
            onClick={() => setMode(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div
        id="lens-content"
        role="tabpanel"
        aria-labelledby={`lens-${mode}`}
        className="lens-content"
      >
        <h3>{copy.title}</h3>
        <p>{copy.body}</p>
        <div className="evidence-citations">
          {copy.refs.map((index) => (
            <button
              key={index}
              onClick={() => onSeek(clip.moments[index].time)}
            >
              <span>E0{index + 1}</span>
              {clip.moments[index].label}
              <ArrowUpRight size={13} />
            </button>
          ))}
        </div>
        <small>{copy.footer}</small>
        {mode === "review" && (
          <button className="panel-link" onClick={onNote}>
            记录出手瞬间的观察 <ArrowRight size={15} />
          </button>
        )}
      </div>
    </section>
  );
}

export function EvidenceInspector({
  clip,
  active,
  onSeek,
  onSource,
}: {
  clip: Clip;
  active: number;
  onSeek: (time: number) => void;
  onSource: () => void;
}) {
  const evidence = evidenceFor(clip);
  return (
    <aside className="evidence-inspector" aria-label="回合证据链">
      <div className="evidence-inspector-title">
        <span>
          <Link2 size={16} />
          回合证据链
        </span>
        <b>03</b>
      </div>
      <div className="evidence-intro">
        <span className="section-kicker">FROM FRAME TO FACT</span>
        <h2>
          这次出手，
          <br />
          依据是什么？
        </h2>
        <p>画面观察与官方记录分别标明。点击节点，回到对应画面。</p>
      </div>
      <ol className="evidence-chain">
        {evidence.map((item, index) => (
          <li key={item.id} className={active === index ? "active" : ""}>
            <button
              onClick={() => onSeek(item.time)}
              aria-pressed={active === index}
            >
              <span className="evidence-node-id">{item.id}</span>
              <span>
                <strong>{item.title}</strong>
                <small>{item.label}</small>
              </span>
              <time>{timecode(item.time)}</time>
            </button>
            {active === index && (
              <div className="evidence-node-detail">
                <p>{item.summary}</p>
                <strong>{item.detail}</strong>
                <span>
                  <Link2 size={12} />
                  {item.source}
                </span>
              </div>
            )}
            {index < 2 && (
              <span className="evidence-connector">
                时间先后 <ChevronRight size={11} />
              </span>
            )}
          </li>
        ))}
      </ol>
      <div className="evidence-xfg">
        <div>
          <span>本次出手 xFG</span>
          <button
            className="info-button"
            onClick={onSource}
            aria-label="了解预期命中率"
          >
            <CircleHelp size={15} />
          </button>
        </div>
        <strong>
          {clip.xfg}
          <small>%</small>
        </strong>
        <span>NBA 官方逐次记录 · 非因果置信度</span>
      </div>
      <details className="evidence-boundaries">
        <summary>还有哪些不能下结论？</summary>
        <p>
          未提供球员轨迹、速度、距离和引力数据，因此不判断“谁吸引了防守”或协防与空位之间的因果关系。视觉核对尚未经过独立人工复核。
        </p>
      </details>
      <button className="evidence-source-button" onClick={onSource}>
        <ShieldCheck size={15} />
        完整来源与时钟说明
        <ArrowUpRight size={15} />
      </button>
    </aside>
  );
}

export function ClipComparison({
  onOpenClip,
}: {
  onOpenClip: (id: string) => void;
}) {
  const [phase, setPhase] = useState(1);
  if (clips.length < 2) return null;
  const difference = Number((clips[1].xfg - clips[0].xfg).toFixed(1));
  return (
    <section className="comparison-view" aria-label="回合对照">
      <div className="comparison-intro">
        <div>
          <span className="section-kicker">SIDE BY SIDE</span>
          <h2>相同阶段，看看两种终结。</h2>
          <p>
            按出手阶段对照关键帧。两次进攻来自不同比赛，不作为控制变量实验。
          </p>
        </div>
        <GitCompareArrows size={30} />
      </div>
      <div className="comparison-phases" aria-label="对照阶段">
        {["出手之前", "出手瞬间", "结果确认"].map((label, index) => (
          <button
            key={label}
            aria-pressed={phase === index}
            onClick={() => setPhase(index)}
          >
            <span>0{index + 1}</span>
            {label}
          </button>
        ))}
      </div>
      <div className="comparison-cards">
        {clips.map((clip, index) => {
          const moment = clip.moments[phase];
          const offset = moment.time - clip.release;
          const sample = summarizeShots(
            shots.filter(
              (s) => s.game_id === clip.gameId && s.player_name === clip.player,
            ),
          );
          return (
            <article key={clip.id} className="comparison-card">
              <div className="comparison-card-heading">
                <b>{index ? "B" : "A"}</b>
                <span>
                  <strong>{clip.player}</strong>
                  <small>
                    {clip.matchup} · {clip.date}
                  </small>
                </span>
              </div>
              <div className="comparison-image">
                <img
                  src={`${import.meta.env.BASE_URL}${moment.image}`}
                  width="1280"
                  height="720"
                  alt={`${clip.player} · ${moment.label}`}
                />
                <span>
                  {timecode(moment.time)} ·{" "}
                  {phase === 1
                    ? "出手定位"
                    : `${offset < 0 ? "出手前" : "出手后"} ${Math.abs(offset).toFixed(2)} s`}
                </span>
              </div>
              <dl className="comparison-facts">
                <div>
                  <dt>出手方式</dt>
                  <dd>{clip.shotDescription}</dd>
                </div>
                <div>
                  <dt>官方结果</dt>
                  <dd>两分命中</dd>
                </div>
                <div>
                  <dt>本次 xFG</dt>
                  <dd>{clip.xfg}%</dd>
                </div>
                <div>
                  <dt>该球员本场样本</dt>
                  <dd>
                    {sample.made}/{sample.attempts}
                    <small> · {percent(sample.fieldGoalPercent)}</small>
                  </dd>
                </div>
                <div>
                  <dt>官方记账</dt>
                  <dd>
                    Q{clip.period} · {clip.officialClock}
                  </dd>
                </div>
              </dl>
              <button
                className="panel-link"
                onClick={() => onOpenClip(clip.id)}
              >
                打开完整回合
                <Play size={14} />
              </button>
            </article>
          );
        })}
      </div>
      <div className="comparison-conclusion">
        <ScanLine size={22} />
        <div>
          <strong>本次 xFG 相差 {Math.abs(difference)} 个百分点。</strong>
          <p>
            {clips[1].player}这次出手的官方 xFG
            更高；单次记录无法说明谁更优秀，也无法证明某种动作导致了更好的机会。
          </p>
        </div>
      </div>
    </section>
  );
}

export function MaterialReadiness({ onImport }: { onImport: () => void }) {
  return (
    <section className="material-readiness" aria-label="材料与接入状态">
      <div className="material-title">
        <FileJson size={23} />
        <div>
          <strong>先有材料，再有解释。</strong>
          <span>每个能力都对应可核对的输入。</span>
        </div>
        <button className="mint-button" onClick={onImport}>
          <Upload size={15} />
          核验回合 JSON
        </button>
      </div>
      <div className="material-statuses">
        <span>
          <Check size={14} />
          {clips.length} 段成片可回看
        </span>
        <span>
          <Check size={14} />
          {shots.length} 条官方出手记录
        </span>
        <span className="pending">
          <span>—</span>追踪坐标未提供
        </span>
      </div>
    </section>
  );
}

export function ReviewIntake({ onOpen }: { onOpen: (id: string) => void }) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<IntakeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  function edit(value: string) {
    generation.current++;
    setText(value);
    setFileName("");
    setResult(null);
  }
  return (
    <div className="review-intake">
      <p className="intake-intro">
        导入本站导出的回合资料，核对事件、时间和来源，再打开已收录回合。文件只在浏览器内读取。
      </p>
      <div hidden={result?.status === "ready"}>
        <div className="intake-drop">
          <FileJson size={28} />
          <strong>
            {loading ? "正在读取文件…" : fileName || "选择回合 JSON 文件"}
          </strong>
          <span>不超过 256 KiB · 不上传云端</span>
          <input
            ref={input}
            type="file"
            accept=".json,application/json"
            aria-label="选择回合 JSON 文件"
            disabled={loading}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const token = ++generation.current;
              setFileName(file.name);
              setResult(null);
              setText("");
              if (file.size > MAX_REVIEW_BYTES) {
                setResult({
                  status: "invalid",
                  title: "文件超过 256 KiB 限制",
                  checks: [],
                });
                event.target.value = "";
                return;
              }
              setLoading(true);
              try {
                const contents = await file.text();
                if (generation.current === token) {
                  setText(contents);
                  setResult(inspectReview(contents, clips));
                }
              } catch {
                if (generation.current === token)
                  setResult({
                    status: "invalid",
                    title: "文件读取失败，请重新选择文件",
                    checks: [],
                  });
              } finally {
                if (generation.current === token) setLoading(false);
                if (input.current) input.current.value = "";
              }
            }}
          />
        </div>
        <label className="intake-text-label" htmlFor="review-json">
          或粘贴回合 JSON <span>{text.length.toLocaleString()} 字符</span>
        </label>
        <textarea
          id="review-json"
          value={text}
          maxLength={MAX_REVIEW_BYTES}
          disabled={loading}
          onChange={(event) => edit(event.target.value)}
          placeholder='{"schema_status":"internal_review_not_contest_schema","clip":{…}}'
          rows={5}
          spellCheck={false}
        />
        <div className="intake-actions">
          <button
            className="quiet-button"
            disabled={loading}
            onClick={() =>
              downloadJson(
                reviewPayload(clips[0]),
                "courtside-review-example.json",
              )
            }
          >
            下载已有回合示例
            <ArrowUpRight size={14} />
          </button>
          <button
            className="mint-button"
            disabled={!text.trim() || loading}
            onClick={() => setResult(inspectReview(text, clips))}
          >
            <ShieldCheck size={15} />
            核验资料
          </button>
        </div>
        <p className="intake-limits">
          当前接入的是回合资料核验。新视频、追踪 JSON
          与自动事件检测尚未接入，不会生成模拟分析结果。
        </p>
      </div>
      {result?.status === "ready" && (
        <div className="intake-receipt">
          <FileJson size={23} />
          <div>
            <strong>
              {clips.find((clip) => clip.id === result.clipId)?.player} ·
              回合资料
            </strong>
            <span>{fileName || "已核验粘贴的 JSON"}</span>
          </div>
          <button className="quiet-button" onClick={() => setResult(null)}>
            修改输入
          </button>
        </div>
      )}
      {result && (
        <section
          className={`intake-result ${result.status === "ready" ? "ready" : "issue"}`}
          aria-live="polite"
        >
          <div className="intake-result-heading">
            {result.status === "ready" ? (
              <ShieldCheck size={22} />
            ) : (
              <CircleHelp size={22} />
            )}
            <h3>{result.title}</h3>
          </div>
          <ol>
            {result.checks.map((check) => (
              <li key={check.name}>
                {check.passed ? <Check size={16} /> : <X size={16} />}
                <div>
                  <strong>{check.name}</strong>
                  <span>{check.detail}</span>
                </div>
              </li>
            ))}
          </ol>
          {result.clipId && (
            <p>
              已关联本地视频、3
              个关键时刻与官方事件。保留本地核对数据；不会覆盖资料或运行模型。
            </p>
          )}
          <div className="intake-result-actions">
            <button
              className="quiet-button"
              onClick={() =>
                downloadJson(
                  { schema: "courtside-intake-report-v1", ...result },
                  "courtside-intake-report.json",
                )
              }
            >
              导出核验报告
            </button>
            {result.clipId && (
              <button
                className="mint-button"
                onClick={() => onOpen(result.clipId!)}
              >
                打开已收录回合
                <ArrowRight size={15} />
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
