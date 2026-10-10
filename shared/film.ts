import type { MatchData } from "./agent.ts";

/** One metric card at a time; Web and encoded video share exactly these intervals. */
export function dataOverlays(data: MatchData, duration: number) {
  const timed = data.events
    .filter((e) => e.videoTimeSeconds !== null)
    .sort((a, b) => a.videoTimeSeconds! - b.videoTimeSeconds!);
  return timed
    .map((event, i) => ({
      event,
      start: Math.max(0, event.videoTimeSeconds! - 1.5),
      end: Math.min(
        duration,
        event.videoTimeSeconds! + 3.5,
        timed[i + 1]
          ? Math.max(0, timed[i + 1]!.videoTimeSeconds! - 1.5)
          : duration,
      ),
    }))
    .filter((o) => o.end > o.start);
}
