export const REQUEST_SCHEMA = "courtside.agent.request.v1";
export type AgentRequest = {
  schemaVersion: typeof REQUEST_SCHEMA;
  clipId: string;
};
export type StageId =
  "material" | "frames" | "analysis" | "validation" | "package";
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
  };
  media: {
    originalSha256: string;
    previewSha256: string;
    analyzedAsset: "preview";
  };
  frames: AgentFrame[];
  usage: { inputTokens: number; outputTokens: number; modelCalls: number };
  boundaries: string[];
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
  error?: { code: string; message: string };
};
export type AgentHealth = {
  status: "Healthy" | "HealthyBusy";
  provider: "fixture" | "bedrock";
  paidCallsEnabled: boolean;
  region: string;
  officialProtocol: "not_configured";
};
