# Brimble Take-Home Deployment Pipeline

This project is my take-home deployment pipeline for Brimble. My main focus with it was to build a simple but useful deployment runner for containerised apps, where a user can deploy from a Git URL, upload a project, or run the bundled sample app without needing to manually write deployment steps.

The UI handles the deployment request, the API builds the app with Railpack, starts the generated Docker image, and then updates Caddy so the deployed app can be reached through one local ingress. Overall, my goal here was to show how I would approach building a small internal platform that improves deployment speed, gives clear feedback to the user, and keeps the system understandable enough to maintain.

## Quick Start

Before running the project, you need:

- Docker with Compose
- A Docker daemon that supports BuildKit
- Internet access for the first image build, because the API image installs Railpack and npm dependencies

To start everything, run:

```bash
docker compose up --build
```

Then open the UI here:

```text
http://localhost:8080
```

The fastest way to test the full flow is to click **Deploy bundled sample app**. This copies `sample-app/`, runs `railpack build`, starts the image on the Compose network, and then routes it through Caddy at:

```text
http://localhost:8080/d/<deployment-id>/
```

## What I Included

- `apps/web`: this is the Vite, React, TanStack Router, and TanStack Query frontend.
- `apps/api`: this is the TypeScript API that manages deployment state, source preparation, Railpack builds, Docker runtime calls, Caddy route sync, and SSE log streaming.
- `infra/caddy/caddy.json`: this is the starting Caddy config. Caddy fronts the UI, API, SSE endpoint, and deployed apps.
- `sample-app`: this is a small Node app with no Dockerfile, so the Railpack flow can be tested properly.

## API Shape

I kept the API small and clear for this task:

- `GET /api/deployments`: lists deployments.
- `POST /api/deployments/git`: creates a deployment from `{ "gitUrl": "...", "name": "optional" }`.
- `POST /api/deployments/upload`: accepts a multipart upload with `files` and matching `relativePaths` fields.
- `POST /api/deployments/sample`: deploys the bundled sample app.
- `GET /events/deployments/:id/logs`: opens an SSE stream. The API sends saved JSONL logs first, then sends live build and deployment events.

The deployment states are intentionally simple:

```text
pending -> building -> deploying -> running
                         \-> failed
```

## Pipeline Design

The API container mounts `/var/run/docker.sock` so it can communicate with the local Docker daemon. For each deployment, this is what happens:

1. It prepares the source from Git, upload, or `sample-app`.
2. It runs `railpack build --name <image-tag> --progress plain <source-dir>`.
3. It starts the image with `docker run --network brimble-takehome_platform -e PORT=3000`.
4. It updates Caddy's route list through the Caddy admin API.
5. It streams stdout, stderr, and system events to the browser through SSE, while also writing them to `/data/logs/*.jsonl`.

I used the Railpack CLI because for this scoped task it is the most direct way to turn a source folder into a local runnable image. If I was building this into a bigger production platform, I would split the build process more carefully by using `railpack prepare` to capture the build plan and metadata, then BuildKit with the Railpack frontend for better cache control, scheduling, and isolation.

## Environment Defaults

The Compose file sets these defaults for the API:

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATA_DIR` | `/data` | persisted deployments, copied sources, and JSONL logs |
| `SAMPLE_APP_DIR` | `/sample-app` | read-only bundled app mount |
| `CADDY_ADMIN_URL` | `http://caddy:2019` | internal Caddy admin API |
| `DOCKER_NETWORK` | `brimble-takehome_platform` | network used by deployed containers |
| `PUBLIC_BASE_URL` | `http://localhost:8080` | live URL prefix shown in the UI |
| `DEPLOYMENT_PORT` | `3000` | port passed into deployed apps |

## Tradeoffs

For state, I used a small JSON file instead of SQLite. For this task, that keeps the project easy to read and run without adding another service. If the platform had concurrent deployment queues, users, or more audit needs, I would move this into SQLite or Postgres.

The API also talks directly to the Docker socket. That is okay for a local take-home project, but in production I would separate this behind a worker boundary and add stronger sandboxing, quotas, and source isolation.

Caddy routes are regenerated as one route list. This keeps the implementation simple, but for a larger system I would improve it with a reconciliation loop, route ownership metadata, health checks, and safer updates.

Uploads are handled in memory by Multer and capped at 30 MB per file. In a production version, I would stream uploads to disk or object storage and validate uploaded projects more carefully.

## What I Would Add With Another Weekend

If I had more time, my main focus would be to improve reliability, speed, and the deployment experience. I would add:

- Deployment queues and limits for concurrent Railpack builds.
- Rollback and redeploy support by keeping previous image tags per deployment.
- Container health checks before switching Caddy routes.
- BuildKit cache volumes and cache keys by repository.
- SQLite-backed state and a small integration test suite around status transitions and SSE replay.
- Graceful cleanup for older containers after a new route is healthy.

In addition to all I have said above, I would also improve the user-facing parts by making logs easier to scan, showing clearer failure messages, and giving better progress information during build and deploy steps.

## Brimble Deploy Feedback

This section still needs my real Brimble deployment link and honest feedback after deploying it on Brimble:

```text
Brimble deploy: <your Brimble URL>

Feedback:
I deployed <what you deployed>. The smooth parts were ...
The friction points were ...
The UI or product changes I would make are ...
```

## Time Spent

Initial implementation: roughly 5-7 hours.
