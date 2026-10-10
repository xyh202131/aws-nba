import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, writeFile, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type {
  AgentRequest,
  AgentResult,
  Job,
  StageId,
} from "../shared/agent.ts";
import type { Config } from "./config.ts";
import { AgentError, publicError } from "./errors.ts";
import { runPipeline } from "./pipeline.ts";

type Runner = typeof runPipeline;
export const STAGES: StageId[] = [
  "material",
  "frames",
  "analysis",
  "validation",
  "render",
  "package",
];
export class JobManager {
  readonly jobs = new Map<string, Job>();
  readonly config: Config;
  private runner: Runner;
  private tail: Promise<void> = Promise.resolve();
  private persistenceFailed = false;
  constructor(config: Config, runner: Runner = runPipeline) {
    this.config = config;
    this.runner = runner;
  }
  get busy() {
    return [...this.jobs.values()].some(
      (j) => j.status === "queued" || j.status === "running",
    );
  }
  async initialize() {
    const folder = resolve(this.config.dataDir, "jobs");
    await mkdir(folder, { recursive: true });
    for (const filename of await readdir(folder)) {
      if (!/^[a-f0-9-]{36}\.json$/.test(filename)) continue;
      const job = JSON.parse(
        await readFile(resolve(folder, filename), "utf8"),
      ) as Job;
      if (
        `${job.id}.json` !== filename ||
        !Array.isArray(job.stages) ||
        !["queued", "running", "completed", "failed"].includes(job.status)
      )
        throw new AgentError(
          "STORE_CORRUPT",
          "任务记录损坏，请保留文件并检查。",
          500,
        );
      if (job.status === "running" || job.status === "queued") {
        job.status = "failed";
        job.error = {
          code: "PROCESS_INTERRUPTED",
          message: "上次服务中断，任务未自动重跑。可手动重新创建。",
        };
        job.stages.forEach((s) => {
          if (s.status === "running") s.status = "failed";
        });
        await this.save(job);
      }
      this.jobs.set(job.id, job);
    }
  }
  private async save(job: Job) {
    job.updatedAt = new Date().toISOString();
    const path = resolve(this.config.dataDir, "jobs", `${job.id}.json`);
    try {
      await writeFile(`${path}.tmp`, JSON.stringify(job, null, 2), "utf8");
      for (let attempt = 0; ; attempt++) {
        try {
          await rename(`${path}.tmp`, path);
          break;
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          // Windows scanners can briefly hold an otherwise writable destination.
          if (
            process.platform !== "win32" ||
            !["EPERM", "EACCES", "EBUSY"].includes(code ?? "") ||
            attempt >= 4
          )
            throw error;
          await delay(25 * 2 ** attempt);
        }
      }
    } catch (error) {
      console.error(
        `AGENT_STORE_ERROR ${(error as NodeJS.ErrnoException).code ?? "UNKNOWN"}`,
      );
      throw new AgentError(
        "STORE_WRITE_FAILED",
        "任务文件写入失败，请检查磁盘空间及文件占用。",
        500,
      );
    }
  }
  list() {
    return [...this.jobs.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 20);
  }
  get(id: string) {
    const job = this.jobs.get(id);
    if (!job) throw new AgentError("JOB_NOT_FOUND", "任务不存在。", 404);
    return job;
  }
  async create(request: AgentRequest): Promise<Job> {
    if (this.persistenceFailed)
      throw new AgentError(
        "STORE_UNAVAILABLE",
        "任务存储不可用，请检查磁盘后重启服务。",
        503,
      );
    if (this.jobs.size >= 200)
      throw new AgentError(
        "STORE_LIMIT",
        "本地任务达到 200 条，请先归档任务目录。",
        429,
      );
    if (
      [...this.jobs.values()].filter(
        (j) => j.status === "queued" || j.status === "running",
      ).length >= 4
    )
      throw new AgentError(
        "QUEUE_FULL",
        "本地任务队列已满，请等待已有任务完成。",
        429,
      );
    const now = new Date().toISOString();
    const job: Job = {
      id: randomUUID(),
      request,
      createdAt: now,
      updatedAt: now,
      status: "queued",
      stages: (request.trackingMode === "required"
        ? (["material", "tracking", "binding", ...STAGES.slice(1)] as StageId[])
        : STAGES
      ).map((id) => ({ id, status: "pending" })),
    };
    // Reserve before awaiting persistence so concurrent submissions cannot bypass capacity limits.
    this.jobs.set(job.id, job);
    try {
      await this.save(job);
    } catch (error) {
      this.jobs.delete(job.id);
      throw error;
    }
    this.tail = this.tail
      .then(() => this.execute(job))
      .catch(() => {
        this.persistenceFailed = true;
        console.error(
          "AGENT_STORE_WRITE_FAILED: check the local task directory and disk space.",
        );
      });
    return job;
  }
  private async execute(job: Job) {
    try {
      job.status = "running";
      await this.save(job);
      const result: AgentResult = await this.runner(
        job.request,
        job.id,
        this.config,
        async (id) => {
          if (process.env.AGENT_RUNTIME_CONTAINER === "true") console.log(JSON.stringify({ event: "job_stage", jobId: job.id, stage: id }));
          job.stages.forEach((s) => {
            if (s.status === "running") s.status = "completed";
            if (s.id === id) s.status = "running";
          });
          await this.save(job);
        },
        async (invocation) => {
          if (process.env.AGENT_RUNTIME_CONTAINER === "true") console.log(JSON.stringify({ event: "model_invocation_recorded", jobId: job.id, status: invocation.status }));
          job.invocation = invocation;
          await this.save(job);
        },
      );
      const completed: Job = {
        ...job,
        result,
        status: "completed",
        stages: job.stages.map((s) => ({ ...s, status: "completed" })),
      };
      await this.save(completed);
      Object.assign(job, completed);
    } catch (error) {
      delete job.result;
      job.status = "failed";
      job.error = publicError(error);
      job.stages.forEach((s) => {
        if (s.status === "running") s.status = "failed";
      });
      console.error(`AGENT_JOB_FAILED ${job.id} ${job.error.code}`);
      await this.save(job);
    }
  }
  async settled() {
    await this.tail;
  }
}
