import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { Box, CheckCircle2, CircleAlert, Clock3, CloudUpload, GitBranch, Loader2, Rocket, Server } from "lucide-react";
import React, { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type DeploymentStatus = "pending" | "building" | "deploying" | "running" | "failed";

interface Deployment {
  id: string;
  name: string;
  sourceType: "git" | "upload" | "sample";
  sourceLabel: string;
  status: DeploymentStatus;
  imageTag: string | null;
  liveUrl: string | null;
  containerName: string | null;
  createdAt: string;
  updatedAt: string;
  error: string | null;
}

interface LogEntry {
  ts: string;
  stream: "system" | "stdout" | "stderr";
  line: string;
}

const apiBase = import.meta.env.VITE_API_BASE ?? "/api";
const eventsBase = import.meta.env.VITE_EVENTS_BASE ?? "/events";
const deploymentsKey = ["deployments"];

const queryClient = new QueryClient();

const rootRoute = createRootRoute({
  component: App
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: PipelinePage
});

const router = createRouter({ routeTree: rootRoute.addChildren([indexRoute]) });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <PipelinePage />
    </QueryClientProvider>
  );
}

function PipelinePage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isSubmitting, setSubmitting] = useState(false);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  const deploymentsQuery = useQuery({
    queryKey: deploymentsKey,
    queryFn: listDeployments
  });

  const deployments = deploymentsQuery.data ?? [];
  const selectedDeployment = useMemo(
    () => deployments.find((deployment) => deployment.id === selectedId) ?? deployments[0],
    [deployments, selectedId]
  );

  useEffect(() => {
    if (!selectedDeployment && deployments[0]) {
      setSelectedId(deployments[0].id);
    }
  }, [deployments, selectedDeployment]);

  useEffect(() => {
    if (!selectedDeployment) {
      setLogs([]);
      return;
    }

    setLogs([]);
    const events = new EventSource(`${eventsBase}/deployments/${selectedDeployment.id}/logs`);

    events.addEventListener("log", (event) => {
      const entry = JSON.parse((event as MessageEvent).data) as LogEntry;
      setLogs((current) => [...current, entry]);
    });

    events.addEventListener("deployment", (event) => {
      const deployment = JSON.parse((event as MessageEvent).data) as Deployment;
      queryClient.setQueryData<Deployment[]>(deploymentsKey, (current = []) => {
        const next = current.some((item) => item.id === deployment.id)
          ? current.map((item) => (item.id === deployment.id ? deployment : item))
          : [deployment, ...current];
        return next.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      });
    });

    events.onerror = () => {
      events.close();
    };

    return () => {
      events.close();
    };
  }, [queryClient, selectedDeployment?.id]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: "end" });
  }, [logs.length]);

  async function submitGit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const gitUrl = String(formData.get("gitUrl") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    if (!gitUrl) {
      return;
    }

    setSubmitting(true);
    try {
      const deployment = await createGitDeployment({ gitUrl, name });
      queryClient.setQueryData<Deployment[]>(deploymentsKey, (current = []) => [deployment, ...current]);
      setSelectedId(deployment.id);
      event.currentTarget.reset();
    } finally {
      setSubmitting(false);
    }
  }

  async function submitUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const input = form.elements.namedItem("projectFiles") as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (files.length === 0) {
      return;
    }

    const payload = new FormData();
    payload.set("name", String(formData.get("uploadName") ?? ""));
    for (const file of files) {
      payload.append("files", file);
      payload.append("relativePaths", file.webkitRelativePath || file.name);
    }

    setSubmitting(true);
    try {
      const deployment = await createUploadDeployment(payload);
      queryClient.setQueryData<Deployment[]>(deploymentsKey, (current = []) => [deployment, ...current]);
      setSelectedId(deployment.id);
      form.reset();
    } finally {
      setSubmitting(false);
    }
  }

  async function deploySample() {
    setSubmitting(true);
    try {
      const deployment = await createSampleDeployment();
      queryClient.setQueryData<Deployment[]>(deploymentsKey, (current = []) => [deployment, ...current]);
      setSelectedId(deployment.id);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="toolbar">
        <div>
          <p className="eyebrow">One pipeline</p>
          <h1>Brimble deployment runner</h1>
        </div>
        <div className="summary">
          <Metric label="Total" value={deployments.length} />
          <Metric label="Running" value={deployments.filter((item) => item.status === "running").length} />
          <Metric label="Failed" value={deployments.filter((item) => item.status === "failed").length} />
        </div>
      </section>

      <section className="workspace">
        <div className="create-panel">
          <div className="panel-heading">
            <Rocket size={18} />
            <h2>Create deployment</h2>
          </div>

          <form className="stack" onSubmit={submitGit}>
            <label>
              Git URL
              <input name="gitUrl" type="url" placeholder="https://github.com/user/app.git" />
            </label>
            <label>
              Name
              <input name="name" type="text" placeholder="optional" />
            </label>
            <button type="submit" disabled={isSubmitting}>
              <GitBranch size={16} />
              Deploy Git repo
            </button>
          </form>

          <div className="divider" />

          <form className="stack" onSubmit={submitUpload}>
            <label>
              Uploaded project
              <input ref={useDirectoryInput()} name="projectFiles" type="file" multiple />
            </label>
            <label>
              Name
              <input name="uploadName" type="text" placeholder="optional" />
            </label>
            <button type="submit" disabled={isSubmitting}>
              <CloudUpload size={16} />
              Deploy upload
            </button>
          </form>

          <button className="secondary-action" type="button" onClick={deploySample} disabled={isSubmitting}>
            <Box size={16} />
            Deploy bundled sample app
          </button>
        </div>

        <div className="deployments-panel">
          <div className="panel-heading">
            <Server size={18} />
            <h2>Deployments</h2>
          </div>

          {deploymentsQuery.isLoading ? (
            <div className="empty-state">Loading deployments...</div>
          ) : deployments.length === 0 ? (
            <div className="empty-state">No deployments yet.</div>
          ) : (
            <div className="deployment-list">
              {deployments.map((deployment) => (
                <button
                  className={`deployment-row ${selectedDeployment?.id === deployment.id ? "selected" : ""}`}
                  key={deployment.id}
                  type="button"
                  onClick={() => setSelectedId(deployment.id)}
                >
                  <div>
                    <strong>{deployment.name}</strong>
                    <span>{deployment.sourceLabel}</span>
                  </div>
                  <StatusBadge status={deployment.status} />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="details-panel">
          {selectedDeployment ? (
            <>
              <div className="detail-header">
                <div>
                  <h2>{selectedDeployment.name}</h2>
                  <p>{selectedDeployment.id}</p>
                </div>
                <StatusBadge status={selectedDeployment.status} />
              </div>

              <div className="facts">
                <Fact label="Image tag" value={selectedDeployment.imageTag ?? "not built yet"} />
                <Fact
                  label="Live URL"
                  value={
                    selectedDeployment.liveUrl ? (
                      <a href={selectedDeployment.liveUrl} target="_blank" rel="noreferrer">
                        {selectedDeployment.liveUrl}
                      </a>
                    ) : (
                      "not routed yet"
                    )
                  }
                />
                <Fact label="Container" value={selectedDeployment.containerName ?? "not started yet"} />
                <Fact label="Updated" value={new Date(selectedDeployment.updatedAt).toLocaleString()} />
              </div>

              {selectedDeployment.error ? <div className="error-banner">{selectedDeployment.error}</div> : null}

              <div className="logs">
                <div className="logs-heading">Live logs</div>
                <pre>
                  {logs.length === 0
                    ? "Waiting for log events..."
                    : logs.map((entry) => `[${entry.ts}] ${entry.stream.padEnd(6)} ${entry.line}`).join("\n")}
                  <div ref={logEndRef} />
                </pre>
              </div>
            </>
          ) : (
            <div className="empty-state">Choose a deployment to inspect logs and routes.</div>
          )}
        </div>
      </section>
    </main>
  );
}

function useDirectoryInput() {
  return (node: HTMLInputElement | null) => {
    if (node) {
      node.setAttribute("webkitdirectory", "");
      node.setAttribute("directory", "");
    }
  };
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="fact">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatusBadge({ status }: { status: DeploymentStatus }) {
  const icon = {
    pending: <Clock3 size={14} />,
    building: <Loader2 className="spin" size={14} />,
    deploying: <Loader2 className="spin" size={14} />,
    running: <CheckCircle2 size={14} />,
    failed: <CircleAlert size={14} />
  }[status];

  return <span className={`status ${status}`}>{icon}{status}</span>;
}

async function listDeployments(): Promise<Deployment[]> {
  const response = await fetch(`${apiBase}/deployments`);
  return parseResponse(response);
}

async function createGitDeployment(input: { gitUrl: string; name?: string }): Promise<Deployment> {
  const response = await fetch(`${apiBase}/deployments/git`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  return parseResponse(response);
}

async function createUploadDeployment(payload: FormData): Promise<Deployment> {
  const response = await fetch(`${apiBase}/deployments/upload`, {
    method: "POST",
    body: payload
  });
  return parseResponse(response);
}

async function createSampleDeployment(): Promise<Deployment> {
  const response = await fetch(`${apiBase}/deployments/sample`, { method: "POST" });
  return parseResponse(response);
}

async function parseResponse<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error ?? "Request failed");
  }
  return body as T;
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);

