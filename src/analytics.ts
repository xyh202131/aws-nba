import type { Shot } from "./data";

export function summarizeShots(records: Shot[]) {
  const attempts = records.length;
  const made = records.filter((shot) => shot.made).length;
  return {
    attempts,
    made,
    points: records.reduce((sum, shot) => sum + shot.points_scored, 0),
    fieldGoalPercent: attempts ? (made / attempts) * 100 : null,
    meanXfg: attempts
      ? records.reduce((sum, shot) => sum + shot.official_xfg_percent, 0) /
        attempts
      : null,
  };
}

export function byPeriod(records: Shot[]) {
  return [...new Set(records.map((shot) => shot.period))]
    .sort((a, b) => a - b)
    .map((period) => ({
      period,
      ...summarizeShots(records.filter((shot) => shot.period === period)),
    }));
}

export const percent = (value: number | null) =>
  value === null ? "—" : `${value.toFixed(1)}%`;
