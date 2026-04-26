import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Deployment, DeploymentStatus } from "./types.js";

interface StateFile {
  deployments: Deployment[];
}

export class DeploymentStore {
  private state: StateFile = { deployments: [] };
  private ready: Promise<void>;

  constructor(
    private readonly dataDir: string,
    private readonly filePath = path.join(dataDir, "deployments.json")
  ) {
    this.ready = this.load();
  }

  async all(): Promise<Deployment[]> {
    await this.ready;
    return [...this.state.deployments].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async get(id: string): Promise<Deployment | undefined> {
    await this.ready;
    return this.state.deployments.find((deployment) => deployment.id === id);
  }

  async create(input: Omit<Deployment, "createdAt" | "updatedAt" | "status" | "error">): Promise<Deployment> {
    await this.ready;
    const now = new Date().toISOString();
    const deployment: Deployment = {
      ...input,
      status: "pending",
      error: null,
      createdAt: now,
      updatedAt: now
    };

    this.state.deployments.unshift(deployment);
    await this.save();
    return deployment;
  }

  async update(
    id: string,
    patch: Partial<Pick<Deployment, "status" | "imageTag" | "liveUrl" | "containerName" | "error">>
  ): Promise<Deployment> {
    await this.ready;
    const deployment = this.state.deployments.find((item) => item.id === id);
    if (!deployment) {
      throw new Error(`Deployment ${id} was not found`);
    }

    Object.assign(deployment, patch, { updatedAt: new Date().toISOString() });
    await this.save();
    return deployment;
  }

  async byStatus(status: DeploymentStatus): Promise<Deployment[]> {
    await this.ready;
    return this.state.deployments.filter((deployment) => deployment.status === status);
  }

  private async load(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    try {
      const raw = await readFile(this.filePath, "utf8");
      this.state = JSON.parse(raw) as StateFile;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        throw error;
      }
      await this.save();
    }
  }

  private async save(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    const tempFile = `${this.filePath}.tmp`;
    await writeFile(tempFile, JSON.stringify(this.state, null, 2));
    await rename(tempFile, this.filePath);
  }
}

