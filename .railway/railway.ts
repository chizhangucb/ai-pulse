// AI Pulse on Railway (docs/deploy.md, "On Railway"): web, api, worker and Postgres, managed with
// `railway config plan` and `railway config apply`. Secrets are preserve(): they are entered in Railway and
// never written here.
import { defineRailway, github, image, preserve, project, service, volume } from "railway/iac";

// Each push to main deploys after its GitHub checks pass.
const source = github("chizhangucb/ai-pulse", { branch: "main", checkSuites: true });

const dockerfile = { builder: "DOCKERFILE", dockerfilePath: "Dockerfile" } as const;

export default defineRailway(() => {
  // A service, not postgres(): postgres() pins Railway's newest image and drops the variables and volume the
  // live database already has. The app image's pg_dump is 17, which refuses to back up a newer server.
  const dbData = volume("postgres-volume", { region: "sfo", sizeMB: 5000 });
  const db = service("Postgres", {
    source: image("ghcr.io/railwayapp-templates/postgres-ssl:17"),
    volumeMounts: { "/var/lib/postgresql/data": dbData },
    env: {
      DATABASE_URL: preserve(),
      PGDATA: preserve(),
      PGDATABASE: preserve(),
      PGHOST: preserve(),
      PGPASSWORD: preserve(),
      PGPORT: preserve(),
      PGUSER: preserve(),
      POSTGRES_DB: preserve(),
      POSTGRES_PASSWORD: preserve(),
      POSTGRES_USER: preserve(),
      SSL_CERT_DAYS: preserve(),
      RAILWAY_DEPLOYMENT_DRAINING_SECONDS: preserve(),
    },
  });
  const data = volume("api-volume", { region: "sfo", sizeMB: 5000 });

  // The settings .env.example gives, for both backend processes.
  const backend = {
    NODE_ENV: "production",
    DATABASE_URL: db.env.DATABASE_URL,
    AIHOT_DATA_DIR: "/data",
    // Whatever Railway holds, usually nothing: an empty release falls back to RAILWAY_GIT_COMMIT_SHA.
    AIHOT_RELEASE: preserve(),
    LLM_BASE_URL: "https://openrouter.ai/api/v1",
    LLM_MODEL: "anthropic/claude-haiku-5.5",
    LLM_EXTRA_JSON: '{"reasoning":{"enabled":false}}',
    LLM_VISION: "true",
    UNDERSTAND_MODEL: "or-claude-sonnet",
    COLLECT_ENABLED: "true",
    MODEL_CALLS_ENABLED: "true",
    FEISHU_CONTENT_PUSH_ENABLED: "false",
    FEISHU_INTERNAL_ENABLED: "false",
    INDEXNOW_SUBMIT_ENABLED: "false",
    LLM_API_KEY: preserve(),
    IMG_PROXY_SIGN_SECRET: preserve(),
    SITE_URL: preserve(),
  };

  // The only service with the volume, so it also runs the jobs that read or write /data.
  const api = service("api", {
    source,
    build: dockerfile,
    deploy: {
      startCommand: "node apps/api/src/main.ts",
      preDeployCommand: ["sh -c 'node scripts/migrate.ts && node scripts/seed.ts'"],
      healthcheckPath: "/api/health",
      healthcheckTimeout: 120,
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 10,
      // A volume keeps the old deploy from overlapping the new one; STOP_TIMEOUT_MS drains 30 s of it.
      drainingSeconds: 45,
    },
    volumeMounts: { "/data": data },
    env: {
      ...backend,
      // Every IPv4 and IPv6 address: Railway's private network can be IPv6 only.
      API_HOST: "::",
      API_PORT: "3001",
      PORT: "3001",
      STOP_TIMEOUT_MS: "30000",
      INGEST_RATE_LIMIT: "10",
      // Railway mounts the volume for root; the image otherwise runs as node.
      RAILWAY_RUN_UID: "0",
      ADMIN_PASSWORD: preserve(),
      SESSION_SECRET: preserve(),
      INGEST_TOKEN: preserve(),
    },
  });

  const worker = service("worker", {
    source,
    build: dockerfile,
    deploy: {
      startCommand: "node apps/worker/src/main.ts",
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 10,
      // Railway's longest stop window; the queue drains for STOP_TIMEOUT_MS, then fails the rest for retry.
      drainingSeconds: 300,
    },
    env: { ...backend, STOP_TIMEOUT_MS: "270000" },
  });

  const web = service("web", {
    source,
    build: dockerfile,
    deploy: {
      startCommand: "node apps/web/server.ts",
      healthcheckPath: "/api/health",
      healthcheckTimeout: 120,
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 10,
    },
    env: {
      NODE_ENV: "production",
      SITE_URL: preserve(),
      API_BASE_URL: "http://${{api.RAILWAY_PRIVATE_DOMAIN}}:3001",
      WEB_HOST: "0.0.0.0",
      WEB_PORT: "3000",
      PORT: "3000",
      // Railway's proxy adds the visitor's address to X-Forwarded-For.
      TRUST_PROXY: "true",
      AIHOT_RELEASE: preserve(),
    },
  });

  return project("ai-pulse", { resources: [dbData, db, data, api, worker, web] });
});
