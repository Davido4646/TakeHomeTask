import express from "express";
import multer from "multer";
import path from "node:path";
import { CaddyClient } from "./caddy.js";
import { config } from "./config.js";
import { LogHub } from "./logs.js";
import { Pipeline } from "./pipeline.js";
import { DeploymentStore } from "./store.js";
import { prepareGitSource, prepareSampleSource, prepareUploadSource } from "./sources.js";

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024, files: 200 } });
const store = new DeploymentStore(config.dataDir);
const logHub = new LogHub(path.join(config.dataDir, "logs"));
const caddy = new CaddyClient(config.caddyAdminUrl, config.deploymentPort);
const pipeline = new Pipeline(store, logHub, caddy);

app.use(express.json());

app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
});

app.get("/api/deployments", async (_request, response, next) => {
  try {
    response.json(await store.all());
  } catch (error) {
    next(error);
  }
});

app.post("/api/deployments/git", async (request, response, next) => {
  try {
    const gitUrl = String(request.body.gitUrl ?? "").trim();
    if (!gitUrl) {
      response.status(400).json({ error: "gitUrl is required" });
      return;
    }

    const id = pipeline.newId();
    const deployment = await store.create({
      id,
      name: request.body.name?.trim() || repoNameFromUrl(gitUrl) || `git-${id}`,
      sourceType: "git",
      sourceLabel: gitUrl,
      imageTag: null,
      liveUrl: null,
      containerName: null
    });

    void (async () => {
      const sourceDir = await prepareGitSource(id, config.dataDir, gitUrl, logHub);
      await pipeline.run(id, sourceDir);
    })().catch(async (error) => {
      const message = error instanceof Error ? error.message : String(error);
      const failed = await store.update(id, { status: "failed", error: message });
      logHub.broadcastDeployment(failed);
      await logHub.append(id, "system", `Deployment failed: ${message}`);
    });

    response.status(202).json(deployment);
  } catch (error) {
    next(error);
  }
});

app.post("/api/deployments/upload", upload.array("files"), async (request, response, next) => {
  try {
    const files = (request.files ?? []) as Express.Multer.File[];
    const id = pipeline.newId();
    const deployment = await store.create({
      id,
      name: String(request.body.name ?? "").trim() || `upload-${id}`,
      sourceType: "upload",
      sourceLabel: `${files.length} uploaded files`,
      imageTag: null,
      liveUrl: null,
      containerName: null
    });

    void (async () => {
      const sourceDir = await prepareUploadSource(id, config.dataDir, files, request.body.relativePaths);
      await logHub.append(id, "system", `Received ${files.length} uploaded files`);
      await pipeline.run(id, sourceDir);
    })().catch(async (error) => {
      const message = error instanceof Error ? error.message : String(error);
      const failed = await store.update(id, { status: "failed", error: message });
      logHub.broadcastDeployment(failed);
      await logHub.append(id, "system", `Deployment failed: ${message}`);
    });

    response.status(202).json(deployment);
  } catch (error) {
    next(error);
  }
});

app.post("/api/deployments/sample", async (_request, response, next) => {
  try {
    const id = pipeline.newId();
    const deployment = await store.create({
      id,
      name: `sample-${id}`,
      sourceType: "sample",
      sourceLabel: "repo sample-app",
      imageTag: null,
      liveUrl: null,
      containerName: null
    });

    void (async () => {
      const sourceDir = await prepareSampleSource(id, config.dataDir, config.sampleAppDir);
      await logHub.append(id, "system", "Copied sample app from the repository");
      await pipeline.run(id, sourceDir);
    })().catch(async (error) => {
      const message = error instanceof Error ? error.message : String(error);
      const failed = await store.update(id, { status: "failed", error: message });
      logHub.broadcastDeployment(failed);
      await logHub.append(id, "system", `Deployment failed: ${message}`);
    });

    response.status(202).json(deployment);
  } catch (error) {
    next(error);
  }
});

app.get("/events/deployments/:id/logs", async (request, response, next) => {
  try {
    const deployment = await store.get(request.params.id);
    if (!deployment) {
      response.status(404).json({ error: "Deployment not found" });
      return;
    }
    await logHub.stream(request.params.id, response, deployment);
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : String(error);
  response.status(500).json({ error: message });
});

app.listen(config.port, async () => {
  console.log(`API listening on ${config.port}`);
  try {
    await pipeline.syncCaddy();
    console.log("Caddy routes synced");
  } catch (error) {
    console.error("Initial Caddy sync failed", error);
  }
});

function repoNameFromUrl(gitUrl: string): string | null {
  const match = gitUrl.match(/\/([^/]+?)(?:\.git)?$/);
  return match?.[1] ?? null;
}

