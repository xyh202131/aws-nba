import type { Clip } from "./data";

export const REVIEW_SCHEMA = "internal_review_not_contest_schema";
export const MAX_REVIEW_BYTES = 256 * 1024;

export function momentAt(clip: Clip, time: number) {
  return clip.moments.reduce(
    (active, moment, index) => (time + 1 / 30 >= moment.time ? index : active),
    0,
  );
}

export function evidenceFor(clip: Clip) {
  return [
    {
      id: "E01",
      title: "动作上下文",
      label: "画面观察",
      time: clip.moments[0].time,
      summary:
        "回看出手前的动作衔接。此处保留画面，不将跑位解释为已证实的战术因果。",
      source: "本地视频 · 出手前关键帧",
      detail: `距出手约 ${(clip.release - clip.moments[0].time).toFixed(2)} 秒`,
    },
    {
      id: "E02",
      title: "出手定位",
      label: "视觉核对",
      time: clip.release,
      summary: clip.observation,
      source: "视频关键帧 · AI 辅助核对",
      detail: `视频 ${clip.release.toFixed(3)} s · 画面时钟 ${clip.observedClock}`,
    },
    {
      id: "E03",
      title: "结果与记账",
      label: "官方记录",
      time: clip.moments[2].time,
      summary: `${clip.shotDescription}，两分命中。${clip.scoreBefore} → ${clip.scoreAfter}。`,
      source: `NBA 官方事件 #${clip.eventId} · 结果关键帧`,
      detail: `Q${clip.period} ${clip.officialClock} · 本次 xFG ${clip.xfg}%`,
    },
  ];
}

export function interpretationFor(clip: Clip, mode: string) {
  if (mode === "technical")
    return {
      title: "把画面时间，与官方记账分开。",
      body: `本片出手定位约 ${clip.release.toFixed(3)} 秒，出手附近画面时钟为 ${clip.observedClock}；官方事件 #${clip.eventId} 记账于 Q${clip.period} ${clip.officialClock}。本次 xFG 为 ${clip.xfg}%，描述出手机会，不是视觉核对置信度。`,
      footer: "出手定位尚未经过独立人工复核；两种比赛时钟不用于换算视频时间。",
      refs: [1, 2],
    };
  if (mode === "review")
    return {
      title: "把结论，变成下一次回看的问题。",
      body: `${clip.player}的${clip.shotDescription}命中了。回看出手前的动作衔接，再对照出手与结果：哪些细节是画面能直接支持的？哪些判断还需要其他视角或追踪数据？`,
      footer:
        "复盘提问不等同于已证实的战术结论，可将自己的观察写入时间点笔记。",
      refs: [0, 1, 2],
    };
  return {
    title: clip.title,
    body: `${clip.player}，${clip.observation}官方记录为两分命中，本次出手的预期命中率为 ${clip.xfg}%。把出手前、出手和结果连起来看，可以更清楚地理解这个回合。`,
    footer: "解读整理自已收录画面与记录，没有新增模型推理。",
    refs: [0, 1, 2],
  };
}

export interface IntakeCheck {
  name: string;
  passed: boolean;
  detail: string;
}
export interface IntakeResult {
  status: "ready" | "invalid" | "unsupported" | "conflict";
  title: string;
  checks: IntakeCheck[];
  clipId?: string;
}
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// Imported text can select a verified local clip, but never replace its facts or media URL.
export function inspectReview(text: string, catalog: Clip[]): IntakeResult {
  const checks: IntakeCheck[] = [];
  if (new TextEncoder().encode(text).length > MAX_REVIEW_BYTES)
    return {
      status: "invalid",
      title: "文件超过 256 KiB 限制",
      checks,
    };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return {
      status: "invalid",
      title: "JSON 无法解析，请检查括号、引号与逗号",
      checks,
    };
  }
  checks.push({
    name: "读取 JSON",
    passed: true,
    detail: "文本可解析；仅在当前浏览器处理",
  });
  if (
    !isRecord(value) ||
    value.schema_status !== REVIEW_SCHEMA ||
    !isRecord(value.clip)
  )
    return {
      status: "unsupported",
      title: "这不是本站的回合资料格式",
      checks: [
        ...checks,
        {
          name: "识别格式",
          passed: false,
          detail:
            "请使用回合工作台导出的 JSON；追踪数据、笔记与投篮档案格式不适用。",
        },
      ],
    };
  checks.push({
    name: "识别格式",
    passed: true,
    detail: "COURTSIDE 回合资料；不是赛事提交协议",
  });
  const incoming = value.clip;
  const clip = catalog.find((c) => c.id === incoming.id);
  if (!clip)
    return {
      status: "unsupported",
      title: "该回合尚未收录",
      checks: [
        ...checks,
        {
          name: "关联素材",
          passed: false,
          detail: "当前没有可核对的本地视频与官方事件，未导入该回合。",
        },
      ],
    };
  // All fields used as facts, identities, timestamps or media paths must match the local snapshot.
  const fields: (keyof Clip)[] = [
    "gameId",
    "eventId",
    "recordId",
    "player",
    "englishName",
    "jersey",
    "team",
    "opponent",
    "matchup",
    "date",
    "shotDescription",
    "observation",
    "title",
    "xfg",
    "period",
    "officialClock",
    "observedClock",
    "release",
    "duration",
    "scoreBefore",
    "scoreAfter",
    "sourceUrl",
    "sourceSha256",
    "video",
    "poster",
  ];
  const conflicts = fields.filter((field) => incoming[field] !== clip[field]);
  const momentsMatch =
    Array.isArray(incoming.moments) &&
    incoming.moments.length === clip.moments.length &&
    incoming.moments.every(
      (m, i) =>
        isRecord(m) &&
        m.label === clip.moments[i].label &&
        m.time === clip.moments[i].time &&
        m.image === clip.moments[i].image,
    );
  const intervalMatches =
    Array.isArray(incoming.releaseInterval) &&
    incoming.releaseInterval.length === clip.releaseInterval.length &&
    incoming.releaseInterval.every((t, i) => t === clip.releaseInterval[i]);
  if (!momentsMatch) conflicts.push("moments");
  if (!intervalMatches) conflicts.push("releaseInterval");
  checks.push({
    name: "对照本地证据",
    passed: conflicts.length === 0,
    detail: conflicts.length
      ? `字段不一致或缺失：${conflicts.join("、")}`
      : `已匹配 ${clip.player} · 事件 #${clip.eventId} · 3 个关键时刻`,
  });
  return conflicts.length
    ? { status: "conflict", title: "资料与当前快照有冲突", checks }
    : {
        status: "ready",
        title: "核验通过，可以打开回合",
        checks,
        clipId: clip.id,
      };
}

export function reviewPayload(clip: Clip) {
  return {
    schema_status: REVIEW_SCHEMA,
    review: "AI visual crosscheck; independent human review not performed",
    clip,
  };
}
