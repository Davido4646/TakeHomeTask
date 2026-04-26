import { randomUUID } from "node:crypto";
import path from "node:path";
import { config } from "./config.js";
import type { DeploymentStore } from "./store.js";
import type { LogHub } from "./logs.js";
import { runCommand } from "./process.js";
import type { CaddyClient } from "./caddy.js";

export class Pipeline {
  constructor(
    private readonly store: DeploymentStore,
    private readonly logHub: LogHub,
    private readonly caddy: CaddyClient
  ) {}

  async run(deploymentId: string, sourceDir: string): Promise<void> {
    const imageTag = `brimble-takehome:${deploymentId}-${Date.now()}`;
    const containerName = `brimble-${deploymentId}`;

    try {
      await this.transition(deploymentId, { status: "building", imageTag });
      await this.logHub.append(deploymentId, "system", `Building ${path.basename(sourceDir)} with Railpack`);
      await runCommand(deploymentId, this.logHub, "railpack", [
        "build",
        "--name",
        imageTag,
        "--progress",
        "plain",
        sourceDir
      ]);

      await this.transition(deploymentId, { status: "deploying", containerName });
      await this.logHub.append(deploymentId, "system", `Starting ${containerName} on Docker network ${config.dockerNetwork}`);
      await runCommand(deploymentId, this.logHub, "docker", ["rm", "-f", containerName]).catch(() => undefined);
      await runCommand(deploymentId, this.logHub, "docker", [
        "run",
        "-d",
        "--name",
        containerName,
        "--network",
        config.dockerNetwork,
        "--label",
        "brimble.takehome=true",
        "-e",
        `PORT=${config.deploymentPort}`,
        imageTag
      ]);

      const liveUrl = `${config.publicBaseUrl}/d/${deploymentId}/`;
      await this.transition(deploymentId, { status: "running", liveUrl });
      await this.syncCaddy();
      await this.logHub.append(deploymentId, "system", `Deployment is running at ${liveUrl}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.transition(deploymentId, { status: "failed", error: message });
      await this.logHub.append(deploymentId, "system", `Deployment failed: ${message}`);
    }
  }

  async syncCaddy(): Promise<void> {
    const deployments = await this.store.all();
    await this.caddy.sync(deployments);
  }

  newId(): string {
    return randomUUID().slice(0, 8);
  }

  private async transition(
    deploymentId: string,
    patch: Parameters<DeploymentStore["update"]>[1]
  ): Promise<void> {
    const deployment = await this.store.update(deploymentId, patch);
    this.logHub.broadcastDeployment(deployment);
  }
}

