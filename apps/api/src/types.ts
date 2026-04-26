export type DeploymentStatus = "pending" | "building" | "deploying" | "running" | "failed";

export interface Deployment {
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

export interface LogEntry {
  ts: string;
  stream: "system" | "stdout" | "stderr";
  line: string;
}

