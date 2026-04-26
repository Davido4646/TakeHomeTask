import type { Deployment } from "./types.js";

interface CaddyRoute {
  match?: Array<Record<string, unknown>>;
  handle: Array<Record<string, unknown>>;
  terminal?: boolean;
}

export class CaddyClient {
  constructor(
    private readonly adminUrl: string,
    private readonly deploymentPort: number
  ) {}

  async sync(deployments: Deployment[]): Promise<void> {
    const running = deployments.filter((deployment) => deployment.status === "running" && deployment.containerName);
    const routes = [
      ...running.map((deployment) => this.deploymentRoute(deployment)),
      ...this.staticRoutes()
    ];

    await this.waitUntilReady();
    const response = await fetch(`${this.adminUrl}/config/apps/http/servers/srv0/routes`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(routes)
    });

    if (!response.ok) {
      throw new Error(`Caddy route sync failed: ${response.status} ${await response.text()}`);
    }
  }

  private deploymentRoute(deployment: Deployment): CaddyRoute {
    const prefix = `/d/${deployment.id}`;
    return {
      match: [{ path: [prefix, `${prefix}/*`] }],
      handle: [
        {
          handler: "rewrite",
          strip_path_prefix: prefix
        },
        {
          handler: "reverse_proxy",
          upstreams: [{ dial: `${deployment.containerName}:${this.deploymentPort}` }]
        }
      ],
      terminal: true
    };
  }

  private staticRoutes(): CaddyRoute[] {
    return [
      {
        match: [{ path: ["/api/*"] }],
        handle: [{ handler: "reverse_proxy", upstreams: [{ dial: "api:4000" }] }],
        terminal: true
      },
      {
        match: [{ path: ["/events/*"] }],
        handle: [{ handler: "reverse_proxy", upstreams: [{ dial: "api:4000" }] }],
        terminal: true
      },
      {
        handle: [{ handler: "reverse_proxy", upstreams: [{ dial: "web:5173" }] }],
        terminal: true
      }
    ];
  }

  private async waitUntilReady(): Promise<void> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        const response = await fetch(`${this.adminUrl}/config/`);
        if (response.ok) {
          return;
        }
        lastError = new Error(`Caddy returned ${response.status}`);
      } catch (error) {
        lastError = error;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw lastError instanceof Error ? lastError : new Error("Caddy did not become ready");
  }
}

