import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BookmarkPlus,
  Crosshair,
  NotebookPen,
  Play,
  Save,
  Trash2,
} from "lucide-react";
import { clips, shots, timecode, downloadJson } from "./data";
import type { Clip, Shot } from "./data";
import { byPeriod, percent, summarizeShots } from "./analytics";
import { ClipComparison } from "./EvidenceStudio";

export interface ReviewNote {
  id: string;
  clipId: string;
  time: number;
  text: string;
  tag: string;
  createdAt: string;
}
export interface NoteDraft {
  clipId: string;
  time: number;
}
// Keep notes for retired samples in their existing storage key, untouched.
export const NOTE_KEY = "courtside-review-notes-durant-v1";
export const noteTags = ["出手选择", "进攻细节", "防守观察", "待核对"];

export function readNotes(): { notes: ReviewNote[]; warning: string } {
  try {
    const raw = localStorage.getItem(NOTE_KEY);
    if (!raw) return { notes: [], warning: "" };
    const value: unknown = JSON.parse(raw);
    if (
      !Array.isArray(value) ||
      !value.every(
        (n) =>
          n &&
          typeof n.id === "string" &&
          typeof n.text === "string" &&
          typeof n.createdAt === "string" &&
          noteTags.includes(n.tag) &&
          clips.some(
            (c) =>
              c.id === n.clipId &&
              Number.isFinite(n.time) &&
              n.time >= 0 &&
              n.time <= c.duration,
          ),
      )
    ) {
      return {
        notes: [],
        warning:
          "原有笔记格式无法读取。请先备份浏览器存储；本次修改只保存在当前页面。",
      };
    }
    return { notes: value as ReviewNote[], warning: "" };
  } catch {
    return {
      notes: [],
      warning: "浏览器存储不可用，本次笔记只保存在当前页面，请及时导出。",
    };
  }
}

export function MatchStrip({
  clip,
  onAnalyze,
}: {
  clip: Clip;
  onAnalyze: () => void;
}) {
  const sample = summarizeShots(
    shots.filter(
      (s) => s.game_id === clip.gameId && s.player_name === clip.player,
    ),
  );
  return (
    <section className="match-strip" aria-label="回合概览">
      <div className="match-score">
        <span className="section-kicker">POSSESSION / 回合概览</span>
        <strong>
          {clip.scoreBefore}
          <ArrowRight size={17} />
          {clip.scoreAfter}
        </strong>
      </div>
      <div>
        <span>官方记账</span>
        <strong>
          Q{clip.period}
          <small>{clip.officialClock}</small>
        </strong>
      </div>
      <div>
        <span>本次出手 xFG</span>
        <strong>
          {clip.xfg}
          <small>%</small>
        </strong>
      </div>
      <button onClick={onAnalyze}>
        <span>成片关联出手</span>
        <strong>
          {sample.made}
          <small>/ {sample.attempts} 命中</small>
          <ArrowUpRight size={17} />
        </strong>
      </button>
    </section>
  );
}

export function Analytics({
  initialClip,
  onSource,
  onOpenClip,
}: {
  initialClip: Clip;
  onSource: (shot: Shot) => void;
  onOpenClip: (id: string) => void;
}) {
  const [clipId, setClipId] = useState(initialClip.id);
  const [period, setPeriod] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [analysisMode, setAnalysisMode] = useState<"sample" | "compare">(
    "sample",
  );
  const clip = clips.find((c) => c.id === clipId) ?? clips[0];
  const records = shots
    .filter((s) => s.game_id === clip.gameId && s.player_name === clip.player)
    .sort((a, b) => a.official_event_id - b.official_event_id);
  const visible = records.filter((s) => !period || s.period === period);
  const summary = summarizeShots(visible);
  const periods = byPeriod(records);
  const selected =
    visible.find((s) => s.record_id === selectedId) ??
    visible.find((s) => s.clip_id) ??
    visible[0];
  const types = [...new Set(visible.map((s) => s.inside_shot_description))]
    .map((name) => ({
      name,
      ...summarizeShots(
        visible.filter((s) => s.inside_shot_description === name),
      ),
    }))
    .sort((a, b) => b.attempts - a.attempts);
  return (
    <section className="analytics-view" aria-label="投篮分析">
      <div className="analysis-mode" aria-label="分析方式">
        <button
          aria-pressed={analysisMode === "sample"}
          onClick={() => setAnalysisMode("sample")}
        >
          样本分析
        </button>
        {clips.length > 1 && (
          <button
            aria-pressed={analysisMode === "compare"}
            onClick={() => setAnalysisMode("compare")}
          >
            两回合对照
          </button>
        )}
      </div>
      {analysisMode === "compare" ? (
        <ClipComparison onOpenClip={onOpenClip} />
      ) : (
        <>
          <div className="analysis-toolbar">
            <div className="player-segments" aria-label="分析球员">
              {clips.map((c) => (
                <button
                  key={c.id}
                  aria-pressed={c.id === clipId}
                  onClick={() => {
                    setClipId(c.id);
                    setPeriod(0);
                    setSelectedId(null);
                  }}
                >
                  <span>{c.team}</span>
                  {c.player}
                </button>
              ))}
            </div>
            <label className="period-filter">
              比赛节次
              <select
                value={period}
                onChange={(e) => {
                  setPeriod(Number(e.target.value));
                  setSelectedId(null);
                }}
              >
                <option value={0}>成片样本</option>
                {periods.map((p) => (
                  <option key={p.period} value={p.period}>
                    第 {p.period} 节
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="analysis-context">
            {clip.matchup} · {clip.date} ·{" "}
            {period ? `第 ${period} 节` : "成片内"}
            关联出手记录
          </p>
          <div className="analysis-kpis">
            <div>
              <span>收录出手</span>
              <strong>
                {summary.attempts}
                <small>次</small>
              </strong>
            </div>
            <div>
              <span>实际命中</span>
              <strong>
                {summary.made}
                <small>球</small>
              </strong>
            </div>
            <div>
              <span>样本命中率</span>
              <strong>{percent(summary.fieldGoalPercent)}</strong>
            </div>
            <div>
              <span>平均预期命中率</span>
              <strong>{percent(summary.meanXfg)}</strong>
            </div>
          </div>
          <div className="analysis-grid">
            <section className="studio-panel shot-distribution">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">EVERY ATTEMPT</span>
                  <h2>逐次出手，一眼看清。</h2>
                </div>
                <span className="chart-legend">
                  <i />
                  命中 <i />
                  未中
                </span>
              </div>
              <p>横轴按官方事件排序，柱高表示本次 xFG。点选查看记录。</p>
              <div className="shot-plot">
                <span className="plot-top">100% xFG</span>
                <div
                  className="shot-bars"
                  style={{ minWidth: Math.max(280, visible.length * 28) }}
                >
                  {visible.map((s) => (
                    <button
                      className={`shot-bar ${s.made ? "made" : "missed"} ${selected?.record_id === s.record_id ? "selected" : ""}`}
                      key={s.record_id}
                      aria-label={`事件 ${s.official_event_id}，${s.made ? "命中" : "未中"}，xFG ${s.official_xfg_percent}%`}
                      aria-pressed={selected?.record_id === s.record_id}
                      onClick={() => setSelectedId(s.record_id)}
                    >
                      <i style={{ height: `${s.official_xfg_percent}%` }}>
                        <span>{s.made ? "●" : "○"}</span>
                      </i>
                    </button>
                  ))}
                </div>
                <span className="plot-bottom">0%</span>
              </div>
              <div className="plot-axis">
                <span>较早出手</span>
                <span>{visible.length} 次记录</span>
                <span>较晚出手</span>
              </div>
              {selected && (
                <div className="selected-shot" aria-live="polite">
                  <Crosshair size={21} />
                  <div>
                    <strong>
                      #{selected.official_event_id} · Q{selected.period}{" "}
                      {selected.official_game_clock_text}
                    </strong>
                    <span>
                      {selected.inside_shot_description} ·{" "}
                      {selected.made ? "命中" : "未中"}
                    </span>
                  </div>
                  <b>
                    {selected.official_xfg_percent}
                    <small>% xFG</small>
                  </b>
                  <button
                    className="mint-button"
                    onClick={() =>
                      selected.clip_id
                        ? onOpenClip(selected.clip_id)
                        : onSource(selected)
                    }
                  >
                    {selected.clip_id ? "回看片段" : "查看来源"}
                    <ArrowUpRight size={15} />
                  </button>
                </div>
              )}
            </section>
            <section className="studio-panel quarter-panel">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">QUARTER BY QUARTER</span>
                  <h2>分节表现</h2>
                </div>
              </div>
              <p>当前成片样本 · 命中 / 出手</p>
              <div className="quarter-list">
                {periods.map((p) => (
                  <button
                    key={p.period}
                    className={period === p.period ? "active" : ""}
                    aria-pressed={period === p.period}
                    onClick={() => {
                      setPeriod(period === p.period ? 0 : p.period);
                      setSelectedId(null);
                    }}
                  >
                    <b>Q{p.period}</b>
                    <span>
                      <i style={{ width: `${p.fieldGoalPercent ?? 0}%` }} />
                    </span>
                    <strong>
                      {p.made}
                      <small>/{p.attempts}</small>
                    </strong>
                    <ArrowRight size={14} />
                  </button>
                ))}
              </div>
              <div className="analysis-footnote">
                点击节次可筛选左侧记录。命中率与平均 xFG
                是不同统计，样本差异不用于判定模型效果。
              </div>
            </section>
            <section className="studio-panel type-panel">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">SHOT SELECTION</span>
                  <h2>出手方式分布</h2>
                </div>
                <span>{types.length} 种方式</span>
              </div>
              <div className="shot-types">
                {types.map((t) => (
                  <div key={t.name}>
                    <span>{t.name}</span>
                    <i>
                      <b
                        style={{
                          width: `${(t.attempts / Math.max(1, summary.attempts)) * 100}%`,
                        }}
                      />
                    </i>
                    <strong>
                      {t.made}/{t.attempts}
                    </strong>
                    <small>平均 xFG {percent(t.meanXfg)}</small>
                  </div>
                ))}
              </div>
            </section>
          </div>
          <p className="studio-footnote">
            数据来自已收录的官方逐次记录，仅代表当前成片关联的出手；未生成球场坐标、引力或轨迹数据。
          </p>
        </>
      )}
    </section>
  );
}

export function NoteComposer({
  draft,
  initial,
  onSave,
  onClose,
}: {
  draft: NoteDraft;
  initial?: ReviewNote;
  onSave: (note: ReviewNote) => void;
  onClose: () => void;
}) {
  const clip = clips.find((c) => c.id === draft.clipId) ?? clips[0];
  const [text, setText] = useState(initial?.text ?? "");
  const [tag, setTag] = useState(initial?.tag ?? noteTags[0]);
  return (
    <form
      className="note-composer"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim())
          onSave({
            id: initial?.id ?? crypto.randomUUID(),
            clipId: clip.id,
            time: Math.max(0, Math.min(clip.duration, draft.time)),
            text: text.trim(),
            tag,
            createdAt: initial?.createdAt ?? new Date().toISOString(),
          });
      }}
    >
      <div className="note-context">
        <img src={`${import.meta.env.BASE_URL}${clip.poster}`} alt="" />
        <div>
          <strong>{clip.player}</strong>
          <span>
            {timecode(draft.time)} · {clip.shotDescription}
          </span>
        </div>
      </div>
      <label htmlFor="note-text">
        你的观察 <span>{text.length}/600</span>
      </label>
      <textarea
        id="note-text"
        maxLength={600}
        rows={5}
        placeholder="例如：起跳前的运球节奏，怎样影响了这次出手？"
        value={text}
        onChange={(e) => setText(e.target.value)}
        required
        autoFocus
      />
      <fieldset>
        <legend>为笔记分类</legend>
        <div className="note-tags">
          {noteTags.map((item) => (
            <label key={item}>
              <input
                type="radio"
                name="note-tag"
                value={item}
                checked={tag === item}
                onChange={() => setTag(item)}
              />
              <span>{item}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <p>个人复盘笔记 · 保存在当前浏览器，不会上传。</p>
      <div className="composer-actions">
        <button type="button" className="quiet-button" onClick={onClose}>
          取消
        </button>
        <button type="submit" className="mint-button" disabled={!text.trim()}>
          <Save size={16} />
          保存笔记
        </button>
      </div>
    </form>
  );
}

export function NotesLibrary({
  notes,
  warning,
  onCreate,
  onEdit,
  onRemove,
  onJump,
}: {
  notes: ReviewNote[];
  warning: string;
  onCreate: () => void;
  onEdit: (note: ReviewNote) => void;
  onRemove: (note: ReviewNote) => void;
  onJump: (note: ReviewNote) => void;
}) {
  const [filter, setFilter] = useState("全部");
  const visible = notes.filter((n) => filter === "全部" || n.tag === filter);
  return (
    <section className="notes-library" aria-label="复盘笔记">
      <div className="notes-hero">
        <div>
          <span className="section-kicker">OBSERVE. REPLAY. UNDERSTAND.</span>
          <h2>
            让每一次回看，
            <br />
            <em>多一个自己的发现。</em>
          </h2>
          <p>关联视频时间点，记录你的判断。下次复盘，从这里继续。</p>
        </div>
        <button className="mint-button" onClick={onCreate}>
          <BookmarkPlus size={18} />
          新建笔记
        </button>
      </div>
      {warning && (
        <p className="storage-warning" role="status">
          {warning}
        </p>
      )}
      <div className="notes-toolbar">
        <div className="note-filter">
          {["全部", ...noteTags].map((tag) => (
            <button
              key={tag}
              aria-pressed={filter === tag}
              onClick={() => setFilter(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
        <button
          className="quiet-button"
          disabled={!notes.length}
          onClick={() =>
            downloadJson(
              { schema: "courtside-personal-notes-v1", notes },
              "courtside-notes.json",
            )
          }
        >
          导出笔记 ({notes.length}) <ArrowUpRight size={15} />
        </button>
      </div>
      {visible.length ? (
        <div className="note-grid">
          {visible.map((note) => {
            const clip = clips.find((c) => c.id === note.clipId)!;
            return (
              <article className="saved-note" key={note.id}>
                <div className="saved-note-heading">
                  <span>{note.tag}</span>
                  <button
                    className="icon-button"
                    aria-label={`删除笔记：${note.text.slice(0, 20)}`}
                    onClick={() => onRemove(note)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <p>{note.text}</p>
                <div className="saved-note-context">
                  <img
                    src={`${import.meta.env.BASE_URL}${clip.poster}`}
                    alt=""
                  />
                  <div>
                    <strong>{clip.player}</strong>
                    <span>
                      {timecode(note.time)} · {clip.date}
                    </span>
                  </div>
                </div>
                <div className="saved-note-actions">
                  <button className="panel-link" onClick={() => onJump(note)}>
                    <Play size={14} />
                    回到这一刻
                  </button>
                  <button className="quiet-button" onClick={() => onEdit(note)}>
                    编辑 <NotebookPen size={14} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="notes-empty">
          <NotebookPen size={34} />
          <h3>
            {notes.length
              ? "这个分类还没有笔记"
              : "你的第一条观察，从这里开始。"}
          </h3>
          <p>
            {notes.length
              ? "选择其他分类，或新建一条笔记。"
              : "在播放器中标记当前时刻，或记录已经定位的出手瞬间。"}
          </p>
          <button className="mint-button" onClick={onCreate}>
            写下第一条 <ArrowRight size={16} />
          </button>
        </div>
      )}
    </section>
  );
}
