import { spawn } from "node:child_process";
import type { LogHub } from "./logs.js";

interface RunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export function runCommand(
  deploymentId: string,
  logHub: LogHub,
  command: string,
  args: string[],
  options: RunOptions = {}
): Promise<void> {
  return new Promise((resolve, reject) => {
    void logHub.append(deploymentId, "system", `$ ${command} ${args.join(" ")}`);

    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "pipe"]
    });

    child.stdout.on("data", (chunk: Buffer) => {
      for (const line of chunk.toString("utf8").split(/\r?\n/)) {
        void logHub.append(deploymentId, "stdout", line);
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      for (const line of chunk.toString("utf8").split(/\r?\n/)) {
        void logHub.append(deploymentId, "stderr", line);
      }
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code}`));
      }
    });
  });
}

