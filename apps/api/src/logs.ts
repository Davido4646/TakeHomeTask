import type { Response } from "express";
import { createReadStream } from "node:fs";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import type { Deployment, LogEntry } from "./types.js";

type Client = Response;

export class LogHub {
  private readonly clients = new Map<string, Set<Client>>();

  constructor(private readonly logDir: string) {}

  async append(deploymentId: string, stream: LogEntry["stream"], line: string): Promise<void> {
    if (!line.trim()) {
      return;
    }

    const entry: LogEntry = {
      ts: new Date().toISOString(),
      stream,
      line
    };

    await mkdir(this.logDir, { recursive: true });
    await appendFile(this.logPath(deploymentId), `${JSON.stringify(entry)}\n`);
    this.broadcast(deploymentId, "log", entry);
  }

  broadcastDeployment(deployment: Deployment): void {
    this.broadcast(deployment.id, "deployment", deployment);
  }

  async stream(deploymentId: string, response: Response, deployment?: Deployment): Promise<void> {
    response.setHeader("Content-Type", "text/event-stream");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.flushHeaders();

    if (deployment) {
      this.writeEvent(response, "deployment", deployment);
    }

    await this.replay(deploymentId, response);

    const bucket = this.clients.get(deploymentId) ?? new Set<Client>();
    bucket.add(response);
    this.clients.set(deploymentId, bucket);

    const heartbeat = setInterval(() => {
      response.write(": heartbeat\n\n");
    }, 15000);

    response.on("close", () => {
      clearInterval(heartbeat);
      bucket.delete(response);
      if (bucket.size === 0) {
        this.clients.delete(deploymentId);
      }
    });
  }

  private async replay(deploymentId: string, response: Response): Promise<void> {
    const file = this.logPath(deploymentId);
    try {
      const reader = readline.createInterface({
        input: createReadStream(file, { encoding: "utf8" }),
        crlfDelay: Infinity
      });

      for await (const line of reader) {
        if (line.trim()) {
          this.writeEvent(response, "log", JSON.parse(line) as LogEntry);
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  private broadcast(deploymentId: string, event: string, payload: unknown): void {
    const clients = this.clients.get(deploymentId);
    if (!clients) {
      return;
    }

    for (const client of clients) {
      this.writeEvent(client, event, payload);
    }
  }

  private writeEvent(response: Response, event: string, payload: unknown): void {
    response.write(`event: ${event}\n`);
    response.write(`data: ${JSON.stringify(payload)}\n\n`);
  }

  private logPath(deploymentId: string): string {
    return path.join(this.logDir, `${deploymentId}.jsonl`);
  }
}

