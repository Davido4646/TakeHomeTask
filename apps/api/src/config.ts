export const config = {
  port: Number(process.env.PORT ?? 4000),
  dataDir: process.env.DATA_DIR ?? "./data",
  sampleAppDir: process.env.SAMPLE_APP_DIR ?? "../../sample-app",
  caddyAdminUrl: process.env.CADDY_ADMIN_URL ?? "http://localhost:2019",
  dockerNetwork: process.env.DOCKER_NETWORK ?? "brimble-takehome_platform",
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "http://localhost:8080",
  deploymentPort: Number(process.env.DEPLOYMENT_PORT ?? 3000)
};

