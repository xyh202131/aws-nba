import play from "../public/demo/durant-v1/matched-play.json";

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
// The public catalogue contains only the supplied finished film. Historical
// training fixtures remain separate in data/clips.json for the Agent pipeline.
const demoId = "durant-final-v1";
const recordId = `${play.gameId}:${play.player.id}:${play.eventId}`;
export const clips: Clip[] = [
  {
    id: demoId,
    player: play.player.name,
    englishName: "KEVIN DURANT",
    jersey: String(play.player.jersey),
    team: "HOU",
    opponent: "DAL",
    matchup: "HOU vs DAL",
    date: play.dateBeijing.replaceAll("-", "."),
    duration: 28,
    title: "突破打板，打成二加一",
    observation: "杜兰特突破后打板命中，戴维斯投篮犯规，比分变为火箭 19:9。",
    shotDescription: play.shot.shotDesc,
    period: play.period,
    officialClock: play.gameClock,
    observedClock: play.gameClock,
    release: 17.000333,
    // The supporting data gives a shot-airborne anchor, not a release-frame interval.
    releaseInterval: [],
    xfg: play.xfgPercent,
    gameId: play.gameId,
    eventId: play.eventId,
    recordId,
    scoreBefore: "HOU 17–9 DAL",
    scoreAfter: "HOU 19–9 DAL",
    video:
      "https://d31azeixbvzmqd.cloudfront.net/demo/durant-v1/final-video.mp4",
    poster: "demo/durant-v1/poster.jpg",
    moments: [
      {
        label: "突破启动",
        time: 15.5,
        image: "demo/durant-v1/moment-drive.jpg",
      },
      {
        label: "出手定位",
        time: 17.000333,
        image: "demo/durant-v1/moment-shot.jpg",
      },
      {
        label: "比分确认",
        time: 21.5,
        image: "demo/durant-v1/moment-result.jpg",
      },
    ],
    sourceUrl: "https://www.nba.com/game/hou-vs-dal-0022500491/play-by-play",
    sourceSha256:
      "ab23aa2a1e99109167ad5c20fbf9b6f1260c517f70f64a7a33a053449493a992",
  },
];
export const shots: Shot[] = [
  {
    record_id: recordId,
    game_id: play.gameId,
    player_id: play.player.id,
    player_name: play.player.name,
    official_event_id: play.eventId,
    period: play.period,
    official_game_clock_text: play.gameClock,
    made: play.shot.success === 1,
    points_scored: 2,
    official_xfg_percent: play.xfgPercent,
    inside_shot_description: play.shot.shotDesc,
    clip_id: demoId,
  },
];
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
