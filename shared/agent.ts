export const REQUEST_SCHEMA = "courtside.agent.request.v1";
export type AgentRequest = {
  schemaVersion: typeof REQUEST_SCHEMA;
  clipId: string;
  executionMode?: "fixture" | "bedrock";
  outputMode?: "analysis" | "film";
};
export type StageId =
  "material" | "frames" | "analysis" | "validation" | "render" | "package";
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
  schemaVersion: "courtside.agent.result.v1";
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
