import { AgentError } from "./errors.ts";

// Keep the organizer's protocol outside the internal pipeline. Implement only against its real example.
export function adaptOfficialRequest(_input: unknown): never {
  throw new AgentError(
    "OFFICIAL_PROTOCOL_NOT_CONFIGURED",
    "尚未获得官方输入/输出样例与超时约束，赛事适配层未启用。",
    501,
  );
}
