export class AgentError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
export function publicError(error: unknown) {
  return error instanceof AgentError
    ? { code: error.code, message: error.message }
    : {
        code: "INTERNAL_ERROR",
        message: "本地任务失败，请检查服务日志后重试。",
      };
}
