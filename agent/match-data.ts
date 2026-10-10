import type { MatchData, MatchEvent } from "../shared/agent.ts";
import { AgentError } from "./errors.ts";

const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
function text(v: unknown, fallback = "", max = 180) {
  if (v === undefined || v === null) return fallback;
  if (typeof v !== "string" && typeof v !== "number")
    throw new AgentError("INVALID_DATA", "数据文本字段类型不正确。");
  const result = String(v).trim();
  if (result.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(result))
    throw new AgentError("INVALID_DATA", "数据文本过长或含控制字符。");
  return result;
}
function number(v: unknown, min: number, max: number): number | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max)
    throw new AgentError("INVALID_DATA", "数据数值或单位不符合要求。");
  return v;
}
function url(v: unknown) {
  if (!v) return null;
  const s = text(v, "", 1000);
  try {
    if (!["https:", "http:"].includes(new URL(s).protocol)) throw new Error();
  } catch {
    throw new AgentError("INVALID_DATA", "来源链接必须为 HTTP(S)。");
  }
  return s;
}

/** Explicit adapters preserve time units. An official game clock is never a video timestamp. */
export function normalizeMatchData(
  value: unknown,
  duration?: number,
  dataClipId?: string,
): MatchData {
  const root = object(value);
  let rows: unknown[];
  let format: "canonical" | "normalized" | "nba" | "draft";
  if (
    root.schemaVersion === "courtside.match-data.v1" &&
    Array.isArray(root.events)
  ) {
    rows = root.events;
    format = "canonical";
  } else if (Array.isArray(root.shots) || Array.isArray(value)) {
    rows = (Array.isArray(value) ? value : root.shots) as unknown[];
    format = "normalized";
  } else if (
    Array.isArray(object(root.data).shotList) ||
    Array.isArray(root.shotList)
  ) {
    rows = (object(root.data).shotList ?? root.shotList) as unknown[];
    format = "nba";
  } else if (Array.isArray(root.clips)) {
    const candidates = root.clips
      .map(object)
      .filter((c) => !dataClipId || c.clip_id === dataClipId);
    if (candidates.length !== 1)
      throw new AgentError(
        "DATA_CLIP_REQUIRED",
        "此数据含多个视频，请用单个 clip 的 events 或选择对应数据 clipId。",
      );
    rows = candidates[0]!.events as unknown[];
    format = "draft";
  } else {
    throw new AgentError(
      "UNSUPPORTED_DATA",
      "支持 match-data.v1、投篮记录数组 / shots、NBA shotList 或内部 clip-events JSON。请按模板保留指标单位和视频秒数。",
    );
  }
  if (!Array.isArray(rows) || !rows.length || rows.length > 200)
    throw new AgentError("INVALID_DATA", "一次接受 1–200 条数据记录。");
  const events: MatchEvent[] = rows.map((v, i) => {
    const r = object(v);
    if (!Object.keys(r).length)
      throw new AgentError("INVALID_DATA", "每条数据必须为对象。");
    if (!(r.id ?? r.event_id ?? r.record_id ?? r.eventId))
      throw new AgentError("INVALID_DATA", "每条事件必须提供明确的记录 ID。");
    const metrics = Array.isArray(r.official_metrics)
      ? r.official_metrics.map(object)
      : [];
    const metric = metrics.find(
      (m) => m.metric_name === "expected_field_goal_probability",
    );
    const ratio =
      format === "nba"
        ? r.value
        : format === "draft"
          ? metric?.value
          : undefined;
    const xfg =
      ratio === undefined
        ? number(r.xfgPercent ?? r.official_xfg_percent, 0, 100)
        : number(ratio, 0, 1);
    const milliseconds =
      format === "draft" ? number(r.video_time_ms, 0, 900_000) : null;
    const time =
      format === "draft"
        ? milliseconds === null
          ? null
          : milliseconds / 1000
        : number(r.videoTimeSeconds ?? r.video_time_seconds, 0, 900);
    if (duration !== undefined && time !== null && time >= duration)
      throw new AgentError(
        "DATA_TIME_OUT_OF_RANGE",
        "数据时间超出视频范围；比赛计时不能当作视频秒数。",
      );
    const recordId = text(
      r.recordId ?? r.record_id ?? r.event_id ?? r.eventId,
      `record-${i + 1}`,
      128,
    );
    return {
      id: text(r.id ?? r.event_id ?? r.record_id ?? r.eventId, recordId, 128),
      recordId,
      videoTimeSeconds: time,
      playerName: text(
        r.playerName ?? r.player_name,
        format === "nba"
          ? text(object(root.data).playerFirstName) +
              text(object(root.data).playerLastName)
          : "",
      ),
      description: text(
        r.description ??
          r.inside_shot_description ??
          r.shotDesc ??
          r.observation,
        "比赛事件",
      ),
      xfgPercent:
        xfg === null
          ? null
          : ratio === undefined
            ? xfg
            : Number((xfg * 100).toFixed(4)),
      sourceUrl: url(r.sourceUrl ?? r.source_url),
    };
  });
  if (
    new Set(events.map((e) => e.id)).size !== events.length ||
    events.some((e) => !e.id)
  )
    throw new AgentError("INVALID_DATA", "记录 ID 必须非空且唯一。");
  const untimed = events.filter((e) => e.videoTimeSeconds === null).length;
  return {
    schemaVersion: "courtside.match-data.v1",
    source: "uploaded",
    events,
    warnings: [
      "上传数据的真实性尚未独立核验。",
      ...(untimed
        ? [`${untimed} 条记录没有视频时间；仅作为档案保留，不叠加到比赛画面。`]
        : []),
    ],
  };
}

export function alignMatchData(
  data: MatchData,
  alignments: unknown,
  duration: number,
): MatchData {
  if (alignments === undefined) return data;
  if (!Array.isArray(alignments) || alignments.length > 200)
    throw new AgentError("INVALID_ALIGNMENT", "时间对应关系必须为数组。");
  const times = new Map<string, number>();
  for (const value of alignments) {
    const row = object(value);
    const id = text(row.eventId, "", 128);
    const time = number(row.videoTimeSeconds, 0, duration);
    if (
      !data.events.some((e) => e.id === id) ||
      times.has(id) ||
      time === null ||
      time >= duration
    )
      throw new AgentError(
        "INVALID_ALIGNMENT",
        "时间对应关系包含未知、重复记录或越界秒数。",
      );
    times.set(id, time);
  }
  const events = data.events.map((e) => ({
    ...e,
    videoTimeSeconds: times.get(e.id) ?? e.videoTimeSeconds,
  }));
  const untimed = events.filter((e) => e.videoTimeSeconds === null).length;
  return {
    ...data,
    events,
    warnings: [
      "上传数据的真实性尚未独立核验。",
      ...(untimed ? [`${untimed} 条记录未对齐，不叠加到画面。`] : []),
    ],
  };
}

export const DATA_TEMPLATE = {
  schemaVersion: "courtside.match-data.v1",
  events: [
    {
      id: "shot-1",
      videoTimeSeconds: 18.0347,
      playerName: "阿门·汤普森",
      description: "急停跳投",
      xfgPercent: 44.5,
      recordId: "0022500491-396",
      sourceUrl: "https://china.nba.cn/inside-the-game",
    },
  ],
};
