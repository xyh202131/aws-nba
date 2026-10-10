import type { TrackingArtifact } from "./tracking.ts";
export const REQUEST_SCHEMA = "courtside.agent.request.v1";
export const REQUEST_SCHEMA_V2 = "courtside.agent.request.v2";
export type AgentRequest = {
  schemaVersion: typeof REQUEST_SCHEMA | typeof REQUEST_SCHEMA_V2;
  clipId: string;
  executionMode?: "fixture" | "bedrock";
  outputMode?: "analysis" | "film";
  trackingMode?: "none" | "required";
  reuseNarrationJobId?: string;
};
export type StageId =
  | "material"
  | "tracking"
  | "binding"
  | "frames"
  | "analysis"
  | "validation"
  | "render"
  | "package";
export type AgentFrame = {
  id: string;
  requestedTime: number;
  time: number;
  sha256: string;
  image: string;
};
export type AgentObservation = {
  text: string;
  time: number;
  evidenceIds: string[];
};
export type MatchEvent = {
  id: string;
  videoTimeSeconds: number | null;
  playerName: string;
  description: string;
  xfgPercent: number | null;
  sourceUrl: string | null;
  recordId: string;
};
export type MatchData = {
  schemaVersion: "courtside.match-data.v1";
  source: "existing_catalog" | "uploaded";
  events: MatchEvent[];
  warnings: string[];
};
export type NarrationCue = AgentObservation & {
  start: number;
  end: number;
  narration: string;
  dataEventIds: string[];
};
export type FilmArtifact = {
  title: string;
  duration: number;
  video: string;
  captions: string;
  timeline: string;
  sha256: string;
  bytes: number;
  voice: "Microsoft Huihui Desktop";
  cues: NarrationCue[];
  data: MatchData;
  tracking?: TrackingArtifact;
  narrationSource?: { provider: "fixture" | "bedrock"; reuseJobId?: string };
};
export type AgentUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  modelCalls: number;
  estimatedUsd: number | null;
};
export type ModelInvocation = {
  modelId: string;
  status: "started" | "received" | "failed";
  startedAt: string;
  elapsedMs: number | null;
  latencyMs: number | null;
  stopReason: string | null;
  rawText: string;
  rawTextTruncated: boolean;
  usage: AgentUsage;
  errorCode?: string;
  failureName?: string;
  transportCode?: string;
};
export type AgentResult = {
  schemaVersion: "courtside.agent.result.v1" | "courtside.agent.result.v2";
  clipId: string;
  provider: "fixture" | "bedrock";
  modelId: string | null;
  reviewStatus: "fixture_replay" | "needs_review";
  observation: AgentObservation;
  interpretation: string | null;
  official: {
    recordId: string;
    xfgPercent: number;
    sourceUrl: string;
    origin: "existing_catalog";
  } | null;
  media: {
    originalSha256: string;
    previewSha256: string;
    analyzedAsset: "preview" | "upload";
  };
  frames: AgentFrame[];
  usage: AgentUsage;
  boundaries: string[];
  film?: FilmArtifact;
  tracking?: TrackingArtifact;
};
export type Job = {
  id: string;
  request: AgentRequest;
  status: "queued" | "running" | "completed" | "failed";
  createdAt: string;
  updatedAt: string;
  stages: {
    id: StageId;
    status: "pending" | "running" | "completed" | "failed";
  }[];
  result?: AgentResult;
  invocation?: ModelInvocation;
  error?: { code: string; message: string };
};
export type AgentHealth = {
  status: "Healthy" | "HealthyBusy";
  provider: "fixture" | "bedrock";
  paidCallsEnabled: boolean;
  region: string;
  modelId: string | null;
  officialProtocol: "not_configured";
};
