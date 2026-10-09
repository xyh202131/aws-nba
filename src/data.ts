import records from "./data/shots.json";
import clipsData from "./data/clips.json";

export interface Moment {
  label: string;
  time: number;
  image: string;
}
export interface Clip {
  id: string;
  player: string;
  englishName: string;
  jersey: string;
  team: string;
  opponent: string;
  matchup: string;
  date: string;
  duration: number;
  title: string;
  observation: string;
  shotDescription: string;
  period: number;
  officialClock: string;
  observedClock: string;
  release: number;
  releaseInterval: number[];
  xfg: number;
  gameId: string;
  eventId: number;
  recordId: string;
  scoreBefore: string;
  scoreAfter: string;
  video: string;
  poster: string;
  moments: Moment[];
  sourceUrl: string;
  sourceSha256: string;
}
export interface Shot {
  record_id: string;
  game_id: string;
  player_id: string;
  player_name: string;
  official_event_id: number;
  period: number;
  official_game_clock_text: string;
  made: boolean;
  points_scored: number;
  official_xfg_percent: number;
  inside_shot_description: string;
  clip_id: string | null;
}
export const clips: Clip[] = clipsData;
export const shots: Shot[] = records;
export const timecode = (seconds: number) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
export function downloadJson(value: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], {
      type: "application/json;charset=utf-8",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
