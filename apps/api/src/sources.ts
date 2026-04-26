import type { Express } from "express";
import { cp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { runCommand } from "./process.js";
import type { LogHub } from "./logs.js";

export function deploymentSourceDir(dataDir: string, deploymentId: string): string {
  return path.join(dataDir, "sources", deploymentId, "source");
}

export async function prepareGitSource(
  deploymentId: string,
  dataDir: string,
  gitUrl: string,
  logHub: LogHub
): Promise<string> {
  const sourceDir = deploymentSourceDir(dataDir, deploymentId);
  await mkdir(path.dirname(sourceDir), { recursive: true });
  await runCommand(deploymentId, logHub, "git", ["clone", "--depth=1", gitUrl, sourceDir]);
  return sourceDir;
}

export async function prepareSampleSource(deploymentId: string, dataDir: string, sampleDir: string): Promise<string> {
  const sourceDir = deploymentSourceDir(dataDir, deploymentId);
  await mkdir(path.dirname(sourceDir), { recursive: true });
  await cp(sampleDir, sourceDir, { recursive: true });
  return sourceDir;
}

export async function prepareUploadSource(
  deploymentId: string,
  dataDir: string,
  files: Express.Multer.File[],
  relativePaths: string | string[] | undefined
): Promise<string> {
  const sourceDir = deploymentSourceDir(dataDir, deploymentId);
  await mkdir(sourceDir, { recursive: true });

  const paths = Array.isArray(relativePaths) ? relativePaths : relativePaths ? [relativePaths] : [];
  if (files.length === 0 || files.length !== paths.length) {
    throw new Error("Upload must include files and matching relativePaths fields");
  }

  for (const [index, file] of files.entries()) {
    const safeRelativePath = sanitizeRelativePath(paths[index]);
    const destination = path.join(sourceDir, safeRelativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, file.buffer);
  }

  return sourceDir;
}

function sanitizeRelativePath(value: string): string {
  const normalized = path.posix.normalize(value.replaceAll("\\", "/"));
  if (normalized.startsWith("../") || normalized === ".." || path.posix.isAbsolute(normalized)) {
    throw new Error(`Unsafe upload path: ${value}`);
  }
  return normalized;
}

