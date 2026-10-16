---
title: "Mastra Playbook: Model Router, Providers & Platform"
slug: mastra/playbook/models-and-platform
section: Mastra
order: 130
related:
  - mastra/overview
  - mastra/playbook-index
  - mastra/workflows-and-steps
  - mastra/agents-and-models
---

<!-- manual -->

Scraped canonical Mastra documentation for **Mastra Playbook: Model Router, Providers & Platform** (24 upstream pages consolidated for NEO Pulse coding agents).

## Included Pages

- **Overview** (`docs/mastra-platform/overview` - source: `https://mastra.ai/docs/mastra-platform/overview.md`)
- **Deploy** (`docs/mastra-platform/deploy` - source: `https://mastra.ai/docs/mastra-platform/deploy.md`)
- **Environments** (`docs/mastra-platform/environments` - source: `https://mastra.ai/docs/mastra-platform/environments.md`)
- **System environment variables** (`docs/mastra-platform/system-environment-variables` - source: `https://mastra.ai/docs/mastra-platform/system-environment-variables.md`)
- **Regions** (`docs/mastra-platform/regions` - source: `https://mastra.ai/docs/mastra-platform/regions.md`)
- **Connect** (`docs/mastra-platform/connect/overview` - source: `https://mastra.ai/docs/mastra-platform/connect/overview.md`)
- **Providers** (`docs/mastra-platform/connect/providers` - source: `https://mastra.ai/docs/mastra-platform/connect/providers.md`)
- **Tools** (`docs/mastra-platform/connect/tools` - source: `https://mastra.ai/docs/mastra-platform/connect/tools.md`)
- **Channels** (`docs/mastra-platform/connect/channels` - source: `https://mastra.ai/docs/mastra-platform/connect/channels.md`)
- **Observability** (`docs/mastra-platform/observability` - source: `https://mastra.ai/docs/mastra-platform/observability.md`)
- **Alerts** (`docs/mastra-platform/alerts` - source: `https://mastra.ai/docs/mastra-platform/alerts.md`)
- **Trace Intelligence** (`docs/mastra-platform/trace-intelligence` - source: `https://mastra.ai/docs/mastra-platform/trace-intelligence.md`)
- **Studio** (`docs/mastra-platform/studio` - source: `https://mastra.ai/docs/mastra-platform/studio.md`)
- **Server** (`docs/mastra-platform/server` - source: `https://mastra.ai/docs/mastra-platform/server.md`)
- **GitHub integration** (`docs/mastra-platform/github` - source: `https://mastra.ai/docs/mastra-platform/github.md`)
- **Hosted databases** (`docs/mastra-platform/database` - source: `https://mastra.ai/docs/mastra-platform/database.md`)
- **Workspaces** (`docs/mastra-platform/workspaces` - source: `https://mastra.ai/docs/mastra-platform/workspaces.md`)
- **Configuration** (`docs/mastra-platform/configuration` - source: `https://mastra.ai/docs/mastra-platform/configuration.md`)
- **API Reference** (`docs/mastra-platform/api` - source: `https://mastra.ai/docs/mastra-platform/api.md`)
- **Overview** (`models` - source: `https://mastra.ai/models.md`)
- **Embeddings** (`models/embeddings` - source: `https://mastra.ai/models/embeddings.md`)
- **Environment Variables** (`models/environment-variables` - source: `https://mastra.ai/models/environment-variables.md`)
- **Gateways** (`models/gateways` - source: `https://mastra.ai/models/gateways.md`)
- **Providers** (`models/providers` - source: `https://mastra.ai/models/providers.md`)

---

## Source: Overview (`docs/mastra-platform/overview`)

Canonical URL: `https://mastra.ai/docs/mastra-platform/overview.md`

## Mastra platform

The [Mastra platform](https://projects.mastra.ai) provides three products for deploying, monitoring, and managing AI applications built with the Mastra framework:

- [**Observability**](https://mastra.ai/docs/mastra-platform/observability): The baseline product for every platform project, with searchable traces, logs, and metrics across Mastra projects and deploys
- [**Studio**](https://mastra.ai/docs/mastra-platform/studio): A hosted visual environment for testing agents and running workflows, with tools for inspecting traces. Starting with Studio also gives you Observability.
- [**Server**](https://mastra.ai/docs/mastra-platform/server): A production deployment target that runs your Mastra application as an API server. Starting with Server also gives you Observability.

Deploy with a single command, [`mastra deploy`](https://mastra.ai/docs/mastra-platform/deploy), or connect a GitHub repository for push-to-deploy. See the [GitHub integration](https://mastra.ai/docs/mastra-platform/github) for the repository-linked flow.

Each project can run multiple [**Environments**](https://mastra.ai/docs/mastra-platform/environments) (for example `production` and `staging`) and provision [**Hosted databases**](https://mastra.ai/docs/mastra-platform/database) from the CLI or project settings to persist application data. Each environment also gets a managed [**Workspace**](https://mastra.ai/docs/mastra-platform/workspaces) that gives agents a filesystem and sandbox with no manual configuration.

Organization-level [**Alerts**](https://mastra.ai/docs/mastra-platform/alerts) notify your team when deploys fail or running services stop. Alerts can cover every project or selected projects and environments, with notifications sent to Slack, email, or webhooks.

[**Connect**](https://mastra.ai/docs/mastra-platform/connect/overview) stores your accounts on providers like Linear, Slack, and GitHub, so agents can use them as tools and chat channels without you creating vendor apps or managing API keys.

[**Trace Intelligence**](https://mastra.ai/docs/mastra-platform/trace-intelligence) finds recurring goals, outcomes, behaviors, and sentiment across your agent traces. Trace Intelligence is available in private beta for selected projects.

### Get started

Choose the path that matches what you want to do:

- **Add hosted observability**: Use [Observability](https://mastra.ai/docs/mastra-platform/observability) to collect searchable traces, logs, and metrics across projects and deploys. Start here if you want monitoring without deploying Studio or Server first.
- **Deploy Studio**: Use [Studio](https://mastra.ai/docs/mastra-platform/studio) to host the visual development environment for your team. Start here if you want a shared UI for testing agents and running workflows, as well as inspecting traces.
- **Deploy Server**: Use [Server](https://mastra.ai/docs/mastra-platform/server) to run your Mastra application as a production API server. Start here when you’re ready to serve agents, tools, and workflows from the cloud.
- **Build a software factory:** Deploy [Mastra Factory](https://factory.mastra.ai) to Mastra platform and connect your repository to turn issues into plans, implementations, and reviewed pull requests.

### Key concepts

**Projects** are the shared parent entity across all products. A single project can include every product: Observability, Studio, and Server. Projects belong to an **Organization**, which is the multi-tenant container for your team.

Your Mastra application is built from three building blocks:

- [Agents](https://mastra.ai/docs/agents/overview): AI agents that can use tools and follow instructions while maintaining context
- [Tools](https://mastra.ai/docs/agents/tools): Callable functions and integrations available to your agents
- [Workflows](https://mastra.ai/docs/workflows/overview): Multi-step orchestration pipelines that coordinate agents and tools

### Going to production

Develop your project locally with [`mastra dev`](https://mastra.ai/reference/cli/mastra) and open [Studio](https://mastra.ai/docs/studio/overview) to test your agents, workflows, and tools in a visual environment.

Once you're ready to deploy your application to production, run [`mastra deploy`](https://mastra.ai/reference/cli/mastra) to push your application to the cloud.

Follow the [Deploy](https://mastra.ai/docs/mastra-platform/deploy) docs for step-by-step instructions.

If you host your Mastra application on your own infrastructure, you can still send observability data to Mastra platform using the [MastraPlatformExporter](https://mastra.ai/docs/mastra-platform/observability).

---

## Source: Deploy (`docs/mastra-platform/deploy`)

Canonical URL: `https://mastra.ai/docs/mastra-platform/deploy.md`

## Deploy to Mastra platform

[`mastra deploy`](https://mastra.ai/reference/cli/mastra) is the single command for releasing a Mastra application to the [Mastra platform](https://mastra.ai/docs/mastra-platform/overview).

One command builds your project and validates it before deploying, plus creates the platform project and environment on your first run, deploys, streams build logs, and prints your public URL once the deploy is serving traffic.

```bash
mastra deploy
```

> **Note:** This page covers the unified deploy flow. The earlier split commands, [`mastra server deploy`](https://mastra.ai/docs/mastra-platform/server) and [`mastra studio deploy`](https://mastra.ai/docs/mastra-platform/studio), still work but `mastra deploy` is the recommended path.

### Before you begin

You'll need a [Mastra application](https://mastra.ai/docs) and a [Mastra platform](https://projects.mastra.ai) account. If you're not authenticated, the CLI prompts you to log in on first use.

A local `.env` file is optional. Environment variables stored on the platform are used as-is at deploy time, and managed resources like [hosted databases](https://mastra.ai/docs/mastra-platform/database) inject their own variables. Pass `--env-file` only when you want to layer local values on top.

### Your first deploy

1. From your project directory, run:

   ```bash
   mastra deploy
   ```

   On the first run the CLI prompts you to create the platform project (named after your `package.json`) and the `production` environment. Accept the prompts, or pass `--yes` to accept defaults without confirmation.

2. The CLI runs a preflight check before every deploy. Storage that would fall back to a local file path (which doesn't survive on the platform's ephemeral filesystem) would normally block the deploy:

   ```text
   file:./mastra.db will be used at runtime because TURSO_DATABASE_URL is not set
   ```

   Instead of erroring out, the CLI offers to fix it inline for you:

   ```text
   Preflight needs TURSO_DATABASE_URL for the production environment. Create a managed turso database now and attach it? (Y/n)
   ```

   Accept the prompt, and provisioning takes a few seconds. The database's connection variables are injected into your deploys automatically, so you don't need to copy them into an `.env` file. If you decline the prompt or use a non-interactive shell (CI, `--yes`), the CLI falls back to printing the exact command for you to run.

   ```bash
   mastra env db create production --kind turso
   ```

   The environment slug (`production` above) matches the environment the CLI would have deployed to. The `mastra env db create` command requires an environment argument in non-interactive shells when the project has more than one environment.

   Preflight also catches database URLs that point at your local machine. A `.env` file with `DATABASE_URL=postgres://localhost:5432/myapp` works during development, but the deployed server can't reach your laptop. The CLI therefore warns and offers the same managed provisioning. When both Neon and Postgres are available for your organization, the CLI prompts you to pick between them (public serverless Neon, or VPC-isolated Postgres) instead of the usual yes/no. If you decline, the deploy continues with your value as-is; if you accept, the managed database's connection variables take precedence at deploy time while your local `.env` keeps working for development.

   > **Note:** If preflight reports a hard-coded local path instead (`Build contains a host-local storage URL`), it can't offer the inline fix. Guard the path with an environment variable first so the file is only used during local development:
   >
   > ```ts
   > new LibSQLStore({
   >   id: 'mastra-storage',
   >   // Uses the hosted database when deployed, a local file during development
   >   url: process.env.TURSO_DATABASE_URL ?? 'file:./mastra.db',
   >   authToken: process.env.TURSO_AUTH_TOKEN,
   > })
   > ```

   If the build statically finds `backgroundTasks.enabled: true`, the CLI decides whether to run background tasks on a dedicated worker service or in-process inside the API server container:

   - A dedicated worker service requires Redis for coordination. Without a usable `REDIS_URL` in the deploy env, background tasks run in-process.
   - With Redis available, the CLI uses a dedicated worker service when the environment already has one, when you pass `--yes`, or when the deploy runs headless. Otherwise it asks whether to provision one.
   - Pass `--workers dedicated` or `--workers in-process` to skip the decision. `--workers dedicated` fails if `REDIS_URL` is missing.
   - Dedicated worker services are rolling out gradually, so for organizations without access the CLI omits the worker manifest and background tasks run in-process, even with Redis and `--workers dedicated`.

   When a dedicated worker service is chosen, the deploy artifact includes a worker manifest, and Mastra Cloud provisions or updates the worker service from the same artifact.

   Removing `backgroundTasks` or setting `enabled: false` in a later deploy removes the manifest and spins down the existing worker service. Values that can't be determined statically are omitted from the manifest display, but the worker process still reads the complete configuration from your bundled code.

3. Run `mastra deploy` again. Preflight passes, the build uploads, and the CLI streams build logs until the deploy is live. Expect the full build and deploy to take between 30 seconds and a few minutes. The success message prints only when the new version is serving traffic.

4. Verify your deployment at the URL printed by the CLI. Append `/api/agents` to confirm it returns a JSON list of your agents.

   > **Warning:** Set up [authentication](https://mastra.ai/docs/auth/overview) before exposing your endpoints publicly.

Replacing the running server process during each deploy can interrupt agent turns that are still streaming when the new version goes live because Mastra Platform doesn't currently let you configure or rely on guaranteed extra time before termination. Don't rely on a raised `server.drainTimeout` for turns that may outlast the default drain window. Use [durable agents](https://mastra.ai/docs/harness/durable-agents) with persistent storage and cache when turns must survive a deploy, or handle an interrupted stream in the client. The available strategies are documented in [graceful shutdown and rolling deploys](https://mastra.ai/docs/deployment/mastra-server).

The first deploy writes a `.mastra-project.json` file linking your directory to the platform project. Commit it so later deploys, CI runs, and [`mastra env`](https://mastra.ai/docs/mastra-platform/environments) commands target the same project without extra flags.

### Deploy to another environment

`mastra deploy` targets the `production` environment by default. Pass `--env` to target a different one. If the environment doesn't exist yet, the CLI offers to create it:

```bash
mastra deploy --env staging
```

Each environment gets a separate URL and environment variables. It can also have its own [hosted database](https://mastra.ai/docs/mastra-platform/database).

See [Environments](https://mastra.ai/docs/mastra-platform/environments) for the full model.

### Choose a region

When a deploy creates an environment interactively, select the United States or Europe from the region prompt. To skip the prompt, pass `--region` with the `us` or `eu` shorthand:

```bash
mastra deploy --env production --region eu
```

The region is fixed when the environment is created. Databases attached to an environment are placed near that environment's region automatically, and observability data is routed to the ingest region that matches the environment's residency zone. See [Regions](https://mastra.ai/docs/mastra-platform/regions) for the full list of supported regions and database placement, along with observability co-location.

### Preflight checks

Preflight validates the built output before the deploy uploads and only flags issues in your own code:

- **Local storage paths**: A hard block. File-backed storage (for example `file:./mastra.db`) is lost on every deploy. Preflight passes when the path is guarded by an environment variable that's set locally or stored on the platform, including values provided by a managed database:

  ```ts
  import { LibSQLStore } from '@mastra/libsql'

  export const storage = new LibSQLStore({
    id: 'mastra-storage',
    // Uses the hosted database when deployed, a local file during development
    url: process.env.TURSO_DATABASE_URL ?? 'file:./mastra.db',
    authToken: process.env.TURSO_AUTH_TOKEN,
  })
  ```

- **Missing environment variables**: A warning for variables your code reads but no source provides. Variables referenced only by library code are excluded.

The recommended response to a preflight block is to fix the cause, usually by attaching a hosted database or storing the variable on the platform. `--skip-preflight` exists as an escape hatch but skips the checks that prevent broken deploys.

Run the checks without deploying:

```bash
mastra lint --preflight
```

`mastra lint` only sees your local env files. Variables stored on the platform or injected by managed databases aren't visible to it, so a deploy can pass preflight where lint still reports an error.

### Environment variables

Deploys resolve environment variables from three sources:

- **Managed variables**: Injected by platform resources like hosted databases (for example `TURSO_DATABASE_URL`). The platform defines these, and you can't edit them.
- **Stored variables**: Saved on the project or environment through the dashboard. Used as-is on every deploy with no local file needed.
- **Local env files**: Deployments layer an explicit `--env-file` or the ambient `.env` and `.env.local` files on top.

```bash
mastra deploy --env staging --env-file .env.staging
```

To change variables on a running service without a redeploy, update them in the dashboard and run [`mastra env restart`](https://mastra.ai/reference/cli/mastra).

### Private npm packages

Projects that depend on packages from a private registry install them during the deploy using the standard `NPM_TOKEN` contract.

1. Store a read-only registry token as `NPM_TOKEN` on the project or environment through the dashboard.

2. Commit a token-free `.npmrc` that points your scope at the registry and reads the token from the environment:

   ```ini
   @your-org:registry=https://npm.pkg.github.com
   //npm.pkg.github.com/:_authToken=${NPM_TOKEN}
   ```

   Keep the `${NPM_TOKEN}` reference literal. The package manager resolves it at install time, so the token itself is never written to your repository.

3. Deploy as usual:

   ```bash
   mastra deploy
   ```

In a monorepo, a `.npmrc` in your project directory takes precedence over one at the repository root.

`NPM_TOKEN` is available during dependency installation. Mastra redacts its value from the Mastra source-build logs that it streams. The generated Dockerfile receives it as a build argument. The runtime image stays free of the token. `NPM_TOKEN` is also injected into the running service as a regular environment variable, so treat it as a secret your application can read.

Projects without a private-registry `.npmrc` need no changes. When your `.npmrc` references `${NPM_TOKEN}`, set the variable or the dependency install fails.

### Project resolution

Every deploy resolves its target project in this order:

1. The `MASTRA_PROJECT_ID` environment variable
2. The `--project <name|slug|id>` flag
3. The `.mastra-project.json` file in the current directory

In CI, set `MASTRA_PROJECT_ID` and `MASTRA_API_TOKEN` and pass `--yes`:

```bash
mastra deploy --env production --yes
```

### Migrating from server and studio deploys

`mastra server deploy` and `mastra studio deploy` are deprecated. They'll be removed in the next major version. Once removed, both commands will fail and legacy-pipeline projects can't deploy a new build until they migrate.

Existing deployed services keep running. This only affects your ability to publish new deploys.

#### Who this affects

You are on the legacy pipeline if any of these are true:

- Your last deploy went out with `mastra server deploy` or `mastra studio deploy` and the deploy log printed a **Deprecated** banner.
- Your project's most recent successful deploy used `@mastra/core` older than `1.44`.
- Your organization hasn't been opted in to environment deploys.

The deploy log is the source of truth: the legacy pipeline prints a deprecation banner on every deploy.

#### Migrate

1. Upgrade `@mastra/core` in your project. The environment pipeline calls `setStudio` on the built artifact, which requires `@mastra/core` `>= 1.44`.

   **npm**:

   ```bash
   npm install @mastra/core@latest
   ```

   **pnpm**:

   ```bash
   pnpm add @mastra/core@latest
   ```

   **Yarn**:

   ```bash
   yarn add @mastra/core@latest
   ```

   **Bun**:

   ```bash
   bun add @mastra/core@latest
   ```

   If you are jumping several minor versions, paste the following into a coding agent (Claude Code, Cursor, etc.) to catch breaking changes in APIs you actually use:

   ```text
   Check whether this project is ready for the Mastra Platform environment pipeline.

   1. Find the installed version of `@mastra/core` (check package.json and the
      lockfile for the version that actually resolved, rather than only the range).
   2. If it's >= 1.44.0, tell me I'm good. No further action is needed.
   3. If it's < 1.44.0:
      a. Fetch the `@mastra/core` changelog from
         https://github.com/mastra-ai/mastra/blob/main/packages/core/CHANGELOG.md
         and read every entry between my installed version and the latest release.
      b. Scan my project (agents, workflows, tools, memory, storage, deployers,
         telemetry, anywhere `@mastra/core`, `@mastra/*`, or `mastra` is imported)
         and list every Mastra API surface I actually use.
      c. For each used API, cross-reference the changelog and produce a table of:
         API I use → breaking change → severity (breaks build / breaks runtime /
         behavior change / none).
      d. For each "breaks build" or "breaks runtime" row, implement the fix in my
         codebase. For "behavior change" rows, leave a comment at the call site
         explaining what changed so I can decide.
      e. Bump `@mastra/core` (and any `@mastra/*` peers) to the latest matching
         versions, then run typecheck and tests. Report anything still failing.
   4. Search my scripts, package.json, Dockerfiles, and CI config for
      `mastra server deploy` and `mastra studio deploy`. Replace each
      occurrence with `mastra deploy`. This is the unified command required
      by the environment pipeline.

   don't restructure my CI, provision new infra, or change my environment
   variable values. Change only the Mastra usage in my code and the deploy command
   itself.
   ```

2. Replace the split command in your scripts and CI with the unified command:

   ```diff
   - mastra server deploy
   - mastra studio deploy
   + mastra deploy
   ```

   `mastra deploy` builds once and deploys both the server and the Studio UI shell for the target environment. It's supported by every recent `mastra` CLI; otherwise, upgrade with `npm install -g mastra@latest`.

3. Deploy once. Your project is auto-adopted onto the environment pipeline and the `production` environment is created on first deploy. See [Environments](https://mastra.ai/docs/mastra-platform/environments) for the full model.

4. Move any project-level environment variables to the environment that needs them, in the dashboard under **Environments → \<env> → Variables**. See [Environment variables](https://mastra.ai/docs/mastra-platform/environments).

#### FAQ

**My deploy fails with `MASTRA_CORE_TOO_OLD`.** The environment pipeline requires `@mastra/core` `>= 1.44`. Upgrade `@mastra/core` and redeploy.

**My organization isn't opted in yet.** Contact support. Opt-in will be automatic before the next major version.

**Can I roll back?** Yes. Environments retain deploy history and you can redeploy any prior successful artifact from the dashboard.

### Related

- [Environments](https://mastra.ai/docs/mastra-platform/environments)
- [Regions](https://mastra.ai/docs/mastra-platform/regions)
- [Hosted databases](https://mastra.ai/docs/mastra-platform/database)
- [`mastra deploy` CLI reference](https://mastra.ai/reference/cli/mastra)
- [Configuration](https://mastra.ai/docs/mastra-platform/configuration)

---

## Source: Environments (`docs/mastra-platform/environments`)

Canonical URL: `https://mastra.ai/docs/mastra-platform/environments.md`

## Environments

Every platform project contains one or more environments.

An environment is an isolated deployment target with its own URL, environment variables, and deploy history. It can also have its own [hosted database](https://mastra.ai/docs/mastra-platform/database).

Use environments to run `production`, `staging`, and preview versions of the same codebase inside a single project.

Your first [`mastra deploy`](https://mastra.ai/docs/mastra-platform/deploy) creates the `production` environment. Create more with the CLI or by deploying to a name that doesn't exist yet.

### Create an environment

Create an environment explicitly:

```bash
mastra env create staging
```

Or let a deploy create it, which prompts for confirmation:

```bash
mastra deploy --env staging
```

`mastra env create` defaults to the `staging` type. Pass `--type` to set `staging` or `preview` explicitly, and `--region` to choose where the environment runs:

```bash
mastra env create eu-preview --type preview --region eu
```

Each project has a single `production` environment, created by your first deploy. The region is fixed at creation. Attached databases are placed near the environment automatically, while observability data goes to the ingest region for the matching residency zone. See [Regions](https://mastra.ai/docs/mastra-platform/regions) for supported regions and database placement, along with observability co-location. The number of environments per project depends on your plan.

### List environments

```bash
mastra env list
```

The output shows each environment's name, region, active deploy status, and the managed environment variables injected by attached databases. Pass `--json` for machine-readable output in CI.

All `mastra env` commands resolve their project from the `--project` flag, the `MASTRA_PROJECT_ID` environment variable, or the `.mastra-project.json` file written by your first deploy, in that order. Run them from your project directory and you never need to name the project.

### Environment variables

An environment resolves its variables from two scopes:

- **Managed variables**: Injected by attached [hosted databases](https://mastra.ai/docs/mastra-platform/database) (for example `TURSO_DATABASE_URL`) and by the platform itself. The platform defines these, and you can't edit them. See [System environment variables](https://mastra.ai/docs/mastra-platform/system-environment-variables) for the full list.
- **Environment-scoped variables**: Stored on each environment through the dashboard. When you apply one variable to several environments, each environment keeps its own copy. Use these for values that differ between environments, like API keys for staging and production services.

Environment-scoped variables are the stored variables described on the [Deploy](https://mastra.ai/docs/mastra-platform/deploy) page. A deploy of one environment uses only that environment's variables. Projects still on the [legacy pipeline](https://mastra.ai/docs/mastra-platform/deploy) store their variables on the project instead, and every deploy of that project uses them.

Variables are applied when a deploy starts. To apply changed variables to a running service without a full redeploy:

```bash
mastra env restart staging
```

To see the set an environment's deploys actually run with, with managed variables listed by name, pull them into a local env file. Each environment is pulled on its own. The file never mixes in another environment's values:

```bash
mastra env vars pull staging --output .env.staging
```

Managed variable values are injected at deploy time and never written to the file. They appear as name-only comments.

> **Note:** Environment variables don't override managed database variables. To point an environment at a different database, attach an [environment-scoped database](https://mastra.ai/docs/mastra-platform/database) instead.

### Deploy history

List deploys across all environments, or filter to one:

```bash
mastra env deploys
mastra env deploys staging
```

Each row shows the deploy status, environment, timestamp, and which deploy is currently active. A deploy transitions through **queued → uploading → building → deploying → running**, and the platform reports **running** only when the new version is serving traffic.

### Isolate an environment's data

Hosted databases are scoped to a single environment by default, so production and staging each read and write their own database:

```bash
mastra env db create production --kind turso --name my-project-production-db
mastra env db create staging --kind turso --name my-project-staging-db
```

If you'd rather share one database across every environment, attach it with `--shared` instead: `mastra env db create --kind turso --shared`.

Each environment can use one database per provider. An existing shared (`--shared`) database from the same provider creates a variable-name conflict with an environment-scoped database. Export any data you need to keep before running `mastra env db delete`, because this command destroys the shared provider database and its data. See [Hosted databases](https://mastra.ai/docs/mastra-platform/database) for the full scoping model.

### Delete an environment

```bash
mastra env delete staging
```

The CLI asks for confirmation before deleting. Deleting an environment removes its deploys and stored variables.

### Related

- [Deploy](https://mastra.ai/docs/mastra-platform/deploy)
- [Regions](https://mastra.ai/docs/mastra-platform/regions)
- [Hosted databases](https://mastra.ai/docs/mastra-platform/database)
- [`mastra env` CLI reference](https://mastra.ai/reference/cli/mastra)

---

## Source: System environment variables (`docs/mastra-platform/system-environment-variables`)

Canonical URL: `https://mastra.ai/docs/mastra-platform/system-environment-variables.md`

## System environment variables

Mastra platform injects a set of environment variables into every deploy. They hold the identity of the project and environment the code is running in, the region it runs in, and the credentials for any [hosted database](https://mastra.ai/docs/mastra-platform/database) attached to it.

You can read them like any other variable:

```ts
const environmentName = process.env.MASTRA_ENVIRONMENT_NAME
```

System variables are reserved. A variable you store with one of these names is kept on the project or environment record but never reaches the runtime, because the platform's value is applied last.

### Project and environment variables

Injected on every deploy.

| Variable                       | Value                                                                                                                            |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `MASTRA_PROJECT_ID`            | ID of the project being deployed                                                                                                 |
| `MASTRA_ENVIRONMENT_ID`        | ID of the environment. Stable across renames                                                                                     |
| `MASTRA_ENVIRONMENT_NAME`      | Name of the environment, such as `production`                                                                                    |
| `MASTRA_ENVIRONMENT_SLUG`      | Routing slug of the environment                                                                                                  |
| `MASTRA_PLATFORM_REGION`       | Region the environment runs in, `US` or `EU`                                                                                     |
| `MASTRA_PLATFORM_ACCESS_TOKEN` | Token the deploy uses to call platform APIs, including observability                                                             |
| `MASTRA_PLATFORM_BUCKET_NAME`  | Bucket backing the environment's [workspace](https://mastra.ai/docs/mastra-platform/workspaces). Set when workspaces are enabled |
| `MASTRA_WORKERS`               | Set to `false` on the main service when the project declares workers, so they run only in their own service                      |

### Managed database variables

Attaching a hosted database adds its connection variables to the environments the database covers. Names are fixed per provider.

| Provider | Variables                                |
| -------- | ---------------------------------------- |
| Turso    | `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` |
| Neon     | `DATABASE_URL`                           |
| Postgres | `DATABASE_URL`                           |

Values are resolved at deploy time and never stored in your project. An environment-scoped database replaces the values of a project-scoped database of the same provider for that environment.

### Precedence

A deploy resolves variables in this order, last one wins:

1. Variables you stored on the environment being deployed. Other environments' variables are never read. Projects still on the [legacy pipeline](https://mastra.ai/docs/mastra-platform/deploy) use the variables stored on the project instead.
2. Managed database variables for that environment.
3. Platform variables.

System values are applied last, so they win on a name collision. Your stored value stays on the record and keeps showing in the dashboard, but the running service never sees it. The Environment Variables page marks these rows with a warning icon so you can tell which of your values are being shadowed.

A database attached to a single environment shadows a project-wide database of the same provider, but only inside that environment. To point one environment at a different database, attach an [environment-scoped database](https://mastra.ai/docs/mastra-platform/database) rather than overwriting the connection variable by hand.

To see what an environment runs with, pull its variables into a local file:

```bash
mastra env vars pull staging --output .env.staging
```

Managed values aren't written to the file. They appear as name-only comments.

### Related

- [Environments](https://mastra.ai/docs/mastra-platform/environments)
- [Deploy](https://mastra.ai/docs/mastra-platform/deploy)
- [Hosted databases](https://mastra.ai/docs/mastra-platform/database)

---

## Source: Regions (`docs/mastra-platform/regions`)

Canonical URL: `https://mastra.ai/docs/mastra-platform/regions.md`

## Regions

A region controls where a platform environment runs, where its [hosted database](https://mastra.ai/docs/mastra-platform/database) is placed, and where its observability data is stored. The region is fixed when the environment is created and can't be changed later.

Mastra platform offers two residency zones today, `us` and `eu`, backed by specific compute regions on Railway. Databases and observability follow the environment's region automatically.

### Choose a region

Pass `--region` when creating or first deploying to an environment:

```bash
mastra deploy --env production --region eu
mastra env create staging --region us
```

Both `mastra deploy --region` and `mastra env create --region` accept either the `us` / `eu` shorthand or a canonical Railway region code from the table below. Shorthand is the recommended form.

The default when no region is passed is `us`, which resolves to `pdx` (Portland, Oregon).

### Available regions

The residency selector offers four Railway regions across two zones. `us` and `eu` shorthand resolve to the underlined default in each zone.

| Zone | Railway code    | Location                  |
| ---- | --------------- | ------------------------- |
| `us` | `pdx` (default) | Portland, Oregon          |
| `us` | `iad`           | Ashburn, Virginia         |
| `us` | `sfo`           | San Francisco, California |
| `eu` | `ams` (default) | Amsterdam, Netherlands    |

Pass a Railway code directly when you need to pin an environment to a specific data center. Passing `us` selects `pdx`, and passing `eu` selects `ams`.

> **Note:** Additional Railway regions exist in the deploy pipeline (for example Singapore, `sin`) but aren't offered in the residency selector yet, because hosted databases and observability don't have local placement outside the US and EU. Passing an unrecognized region falls back to the US default rather than pinning to it.

### Hosted database placement

When you attach an [environment-scoped database](https://mastra.ai/docs/mastra-platform/database), the platform picks the provider region closest to the environment. This is server-authoritative, so an explicit `--region` on `mastra env db create <env>` is ignored. The environment's region is the source of truth.

| Environment region | Turso region      | Postgres (Neon) region         |
| ------------------ | ----------------- | ------------------------------ |
| `pdx`              | `sjc` (San Jose)  | `aws-us-west-2` (Oregon)       |
| `iad`              | `iad` (Ashburn)   | `aws-us-east-1` (N. Virginia)  |
| `sfo`              | `sjc` (San Jose)  | `aws-us-west-2` (Oregon)       |
| `ams`              | `ams` (Amsterdam) | `aws-eu-central-1` (Frankfurt) |

Project-scoped databases (shared across environments) accept an explicit `--region` because they aren't bound to a single environment. Use a provider region ID for the flag, not the `us` / `eu` shorthand:

```bash
mastra env db create --kind turso --region fra
mastra env db create --kind neon --region aws-us-east-1
```

Turso offers 20+ regions and Postgres (Neon) is available across AWS and Azure regions in the US, EU, and APAC. See the [Turso regions list](https://docs.turso.tech/features/data-edge#locations) and [Neon regions list](https://neon.com/docs/introduction/regions) for the full set. Passing a code not offered by the provider fails at attach time with the provider's error.

### Observability co-location

Observability ingest runs in two regions today: **US** (Iowa, `us-central1`) and **EU** (Amsterdam). Every environment's traces, logs, and metrics are routed to the ingest region that matches its residency zone:

| Environment region                  | Observability region |
| ----------------------------------- | -------------------- |
| `pdx`, `iad`, `sfo`, `us` shorthand | US (Iowa)            |
| `ams`, `eu` shorthand               | EU (Amsterdam)       |

Railway and database providers offer more regions than observability ingest, so some combinations can't be fully co-located. Environments in the `us` zone always send telemetry to US ingest, while those in the `eu` zone use EU ingest. This routing applies even when the underlying Railway region is a city without a dedicated ingest endpoint. Data residency is preserved at the zone level. Telemetry from an `eu` environment never crosses into the US.

### Related

- [Deploy](https://mastra.ai/docs/mastra-platform/deploy)
- [Environments](https://mastra.ai/docs/mastra-platform/environments)
- [Hosted databases](https://mastra.ai/docs/mastra-platform/database)
- [Observability](https://mastra.ai/docs/mastra-platform/observability)

---

## Source: Connect (`docs/mastra-platform/connect/overview`)

Canonical URL: `https://mastra.ai/docs/mastra-platform/connect/overview.md`

## Connect

> **Public Beta:** Mastra Connect is free to use on Mastra platform while in beta.

Connect manages connections to services such as GitHub, Slack, and Linear in your [Mastra platform](https://mastra.ai/docs/mastra-platform/overview) project. The `@mastra/connect` package makes those connections available to your application as tools, channels, or credentials.

- **Tools** let agents call a provider's API. Connect supplies ready-made tools and sends their requests through a platform proxy that adds credentials and refreshes OAuth tokens. See [Tools](https://mastra.ai/docs/mastra-platform/connect/tools).
- **Channels** let people talk to agents through Slack, Telegram, or Discord. Connect supplies credentials to Mastra's channel providers. See [Channels](https://mastra.ai/docs/mastra-platform/connect/channels).
- **Raw credentials** let your code call a provider's SDK directly when the tools don't cover what you need. See [`credential()`](https://mastra.ai/reference/connect/credential).

### When to use Connect

Use Connect when you want to manage provider accounts on the platform rather than store credentials and handle OAuth token refresh in your application. You can add or replace connections without changing your agent code. Tool resolvers pick up connection changes as their caches refresh, without a redeploy.

Combine Connect tools and channels with your own [custom tools](https://mastra.ai/docs/agents/tools) and [self-managed channels](https://mastra.ai/docs/channels) in the same application. Connect requires a platform project, but your application can run locally or on your own infrastructure.

### How connections work

A **provider** defines the service and capabilities you can use. A **connection** authorizes an account on that provider. Connections belong to your organization and can be linked to multiple projects without authorizing again.

A project can have multiple connections for the same provider, such as accounts in different Slack workspaces. Give each connection a distinct display name to help agents choose the right account.

Providers don't all offer the same capabilities or authorization flow. Some use OAuth, others require an API key, and channel setup can require creating a bot or app in the vendor's console. See [Providers](https://mastra.ai/docs/mastra-platform/connect/providers) to choose the provider for your use case.

### Get started

You need a Mastra platform project and the [`mastra` CLI](https://mastra.ai/reference/cli/mastra), signed in with `mastra auth login`.

#### Install the package

**npm**:

```bash
npm install @mastra/connect
```

**pnpm**:

```bash
pnpm add @mastra/connect
```

**Yarn**:

```bash
yarn add @mastra/connect
```

**Bun**:

```bash
bun add @mastra/connect
```

#### Configure the environment

Your app authenticates to the platform with an access token. Create one for the app:

```bash
mastra auth tokens create my-app
```

Save it as `MASTRA_PLATFORM_ACCESS_TOKEN`, the name `@mastra/connect` reads. The CLI suggests `MASTRA_API_TOKEN`, which `@mastra/connect` ignores. Add the token and your project ID to the app's environment:

```bash
MASTRA_PLATFORM_ACCESS_TOKEN=your-token
MASTRA_PROJECT_ID=your-project-id
```

See [environment variables](https://mastra.ai/reference/connect/tools) for regions and the other optional variables.

#### Connect an account

Choose a provider from the [provider list](https://mastra.ai/docs/mastra-platform/connect/providers) and run `mastra connect add` with its ID. For example, to authorize a Linear account:

```bash
mastra connect add linear
```

Run the command from the directory containing your `.env` file. The CLI guides you through the provider's authorization flow. See the [`mastra connect` CLI reference](https://mastra.ai/reference/cli/mastra) for listing, naming, removing, and replacing connections.

#### Use the connection

Choose how your application uses the connected account:

- Pass [`tools()`](https://mastra.ai/docs/mastra-platform/connect/tools) to an agent's `tools` option to give it provider tools, alongside any tools you define yourself.
- Add the providers returned by [`channels()`](https://mastra.ai/docs/mastra-platform/connect/channels) to your Mastra configuration, then connect a channel to an agent in Studio.
- Call [`credential()`](https://mastra.ai/reference/connect/credential) with a connection ID to use its credential in your own code.

### Security model

For tool calls, the platform adds credentials to requests on the server. It records each proxied call so you can audit and count tool use, without logging tool arguments or results. Requests can only reach the provider's API hosts, including any allowed per-connection hosts such as a Supabase project URL.

Your code controls which tools an agent gets and which calls require approval. See [tool filtering](https://mastra.ai/docs/mastra-platform/connect/tools) for configuration.

#### Use a raw credential

Calling `credential()` returns a secret to your application. Requests you make with it bypass the platform proxy, including its host restrictions and call records. Don't log the credential or return it in agent output. The [credential reference](https://mastra.ai/reference/connect/credential) covers supported types and expiration handling.

---

## Source: Providers (`docs/mastra-platform/connect/providers`)

Canonical URL: `https://mastra.ai/docs/mastra-platform/connect/providers.md`

## Providers

A provider is a service you can connect to your project, identified by a provider ID such as `linear` or `google-mail`. Providers can supply [tools](https://mastra.ai/docs/mastra-platform/connect/tools), [channels](https://mastra.ai/docs/mastra-platform/connect/channels), or both.

### Provider directory

This directory covers the generated toolsets and channel setup documented here, rather than every provider in the platform catalog. Run [`mastra connect list`](https://mastra.ai/reference/cli/mastra) to see providers available to your project and their connection status.

| Provider ID       | Provider                                                                              | Gives you                                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `clerk`           | ![](https://cdn.simpleicons.org/clerk?viewbox=auto\&size=28) Clerk                    | [Tools](https://mastra.ai/reference/connect/providers)                                                                      |
| `discord`         | ![](https://cdn.simpleicons.org/discord?viewbox=auto\&size=28) Discord                | [Tools](https://mastra.ai/reference/connect/providers), [Channels](https://mastra.ai/docs/mastra-platform/connect/channels) |
| `fireflies`       | ![](https://app.nango.dev/images/template-logos/fireflies.svg) Fireflies.ai           | [Tools](https://mastra.ai/reference/connect/providers)                                                                      |
| `github`          | ![](https://cdn.simpleicons.org/github?viewbox=auto\&size=28) GitHub                  | [Tools](https://mastra.ai/reference/connect/providers)                                                                      |
| `google-calendar` | ![](https://cdn.simpleicons.org/googlecalendar?viewbox=auto\&size=28) Google Calendar | [Tools](https://mastra.ai/reference/connect/providers)                                                                      |
| `google-docs`     | ![](https://cdn.simpleicons.org/googledocs?viewbox=auto\&size=28) Google Docs         | [Tools](https://mastra.ai/reference/connect/providers)                                                                      |
| `google-drive`    | ![](https://cdn.simpleicons.org/googledrive?viewbox=auto\&size=28) Google Drive       | [Tools](https://mastra.ai/reference/connect/providers)                                                                      |
| `google-mail`     | ![](https://cdn.simpleicons.org/gmail?viewbox=auto\&size=28) Gmail                    | [Tools](https://mastra.ai/reference/connect/providers)                                                                      |
| `google-sheet`    | ![](https://cdn.simpleicons.org/googlesheets?viewbox=auto\&size=28) Google Sheets     | [Tools](https://mastra.ai/reference/connect/providers)                                                                      |
| `hubspot`         | ![](https://cdn.simpleicons.org/hubspot?viewbox=auto\&size=28) HubSpot                | [Tools](https://mastra.ai/reference/connect/providers)                                                                      |
| `incident-io`     | ![](https://app.nango.dev/images/template-logos/incident-io.svg) incident.io          | [Tools](https://mastra.ai/reference/connect/providers)                                                                      |
| `jira`            | ![](https://cdn.simpleicons.org/jira?viewbox=auto\&size=28) Jira                      | [Tools](https://mastra.ai/reference/connect/providers)                                                                      |
| `linear`          | ![](https://cdn.simpleicons.org/linear?viewbox=auto\&size=28) Linear                  | [Tools](https://mastra.ai/reference/connect/providers)                                                                      |
| `notion`          | ![](https://cdn.simpleicons.org/notion?viewbox=auto\&size=28) Notion                  | [Tools](https://mastra.ai/reference/connect/providers)                                                                      |
| `openai`          | ![](https://svgl.app/library/openai.svg) OpenAI                                       | [Tools](https://mastra.ai/reference/connect/providers)                                                                      |
| `posthog`         | ![](https://cdn.simpleicons.org/posthog?viewbox=auto\&size=28) PostHog                | [Tools](https://mastra.ai/reference/connect/providers)                                                                      |
| `resend`          | ![](https://cdn.simpleicons.org/resend?viewbox=auto\&size=28) Resend                  | [Tools](https://mastra.ai/reference/connect/providers)                                                                      |
| `slack`           | ![](https://svgl.app/library/slack.svg) Slack                                         | [Tools](https://mastra.ai/reference/connect/providers)                                                                      |
| `slack-channels`  | ![](https://svgl.app/library/slack.svg) Slack channels                                | [Channels](https://mastra.ai/docs/mastra-platform/connect/channels)                                                         |
| `snowflake`       | ![](https://cdn.simpleicons.org/snowflake?viewbox=auto\&size=28) Snowflake            | [Tools](https://mastra.ai/reference/connect/providers)                                                                      |
| `supabase`        | ![](https://cdn.simpleicons.org/supabase?viewbox=auto\&size=28) Supabase              | [Tools](https://mastra.ai/reference/connect/providers)                                                                      |
| `telegram`        | ![](https://cdn.simpleicons.org/telegram?viewbox=auto\&size=28) Telegram              | [Channels](https://mastra.ai/docs/mastra-platform/connect/channels)                                                         |
| `workos`          | ![](https://svgl.app/library/workos.svg) WorkOS                                       | [Tools](https://mastra.ai/reference/connect/providers)                                                                      |

Generated toolsets are included in `@mastra/connect`. Upgrading the package gives you toolsets added in newer releases, but provider availability depends on the platform catalog. The [provider toolsets reference](https://mastra.ai/reference/connect/providers) lists the generated tools.

### MCP providers

These providers serve their tools from a hosted Model Context Protocol (MCP) server. The tools come from the provider at runtime, so check each provider's MCP documentation for what it offers. See the [MCP tools reference](https://mastra.ai/reference/connect/tools) for tool naming and [Require approval for sensitive tools](https://mastra.ai/docs/mastra-platform/connect/tools) for approval setup.

| Provider ID     | Provider                                                                   | Provider MCP docs                                                      |
| --------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `attio-mcp`     | ![](https://app.nango.dev/images/template-logos/attio.svg) Attio           | [Attio MCP](https://docs.attio.com/mcp/overview)                       |
| `canva-mcp`     | ![](https://svgl.app/library/canva.svg) Canva                              | [Canva MCP](https://www.canva.dev/docs/apps/mcp/)                      |
| `clay-mcp`      | ![](https://app.nango.dev/images/template-logos/clay-mcp.svg) Clay         | [MCP in Clay](https://university.clay.com/docs/mcp-settings)           |
| `neon-mcp`      | ![](https://cdn.simpleicons.org/neon?viewbox=auto\&size=28) Neon           | [Neon MCP server](https://neon.com/docs/ai/neon-mcp-server)            |
| `render-mcp`    | ![](https://cdn.simpleicons.org/render?viewbox=auto\&size=28) Render       | [Render MCP server](https://render.com/docs/mcp-server)                |
| `robinhood-mcp` | ![](https://cdn.simpleicons.org/robinhood?viewbox=auto\&size=28) Robinhood | [Agentic Trading](https://robinhood.com/us/en/support/agentic-trading) |
| `sanity-mcp`    | ![](https://cdn.simpleicons.org/sanity?viewbox=auto\&size=28) Sanity       | [Sanity MCP server](https://www.sanity.io/docs/ai/mcp-server)          |

### Troubleshoot a connection

Most provider call failures come from the connection's credential or configuration. A `proxy_error` carries the provider's response in its `status` and `detail` properties.

- **Status `401`:** Check whether the credential has expired, been revoked, or been rotated. If it needs replacing, [reauthorize the connection](https://mastra.ai/reference/cli/mastra).
- **Status `403`:** Check the provider's response for missing scopes, resource-access restrictions, or account requirements. Grant only the access the agent needs. You can exclude unsupported operations with `allowTools`, but filtering tools doesn't change the credential's permissions.
- **No tools from a provider:** Run `mastra connect list` to check the project and connection status. Check provider selection and tool filters, and confirm that your installed `@mastra/connect` version includes the toolset. Connection changes follow the resolver's [caching behavior](https://mastra.ai/reference/connect/tools). Check app logs for `[@mastra/connect] Skipping` warnings when a connection can't be resolved.
- **Resend won't connect:** Use an API key with **Full access** permission. A **Sending access** key fails to connect because Mastra checks a new key by listing your domains, which sending access keys can't do.

See [errors](https://mastra.ai/reference/connect/tools) for every error code.

---

## Source: Tools (`docs/mastra-platform/connect/tools`)

Canonical URL: `https://mastra.ai/docs/mastra-platform/connect/tools.md`

## Tools

[`tools()`](https://mastra.ai/reference/connect/tools) gives an agent ready-made tools for providers connected to your project, such as `linear_list_issues` and `linear_create_issue` for Linear. Each call goes through the platform proxy, which adds the connection's credential before forwarding the request. You don't need to implement these tools or store provider credentials in your application.

Before you start, follow the [Connect setup](https://mastra.ai/docs/mastra-platform/connect/overview) to configure your project and connect a provider.

### Add tools to an agent

Pass `tools()` to the agent's `tools` option:

```typescript
import { Agent } from '@mastra/core/agent'
import { tools } from '@mastra/connect'

export const opsAgent = new Agent({
  id: 'ops',
  name: 'ops',
  instructions: 'You help the team track work in Linear and GitHub.',
  model: 'openai/gpt-5-mini',
  tools: tools(),
})
```

With no options, the agent gets tools for every connected provider with a supported toolset. The resolver picks up connection changes without a restart. See [the resolver reference](https://mastra.ai/reference/connect/tools) for caching, manual refresh, and passing tools to individual agent calls.

Some providers supply tools through a hosted [Model Context Protocol (MCP) server](https://mastra.ai/docs/mastra-platform/connect/providers). You use the same `tools()` API for these providers, but their tool names are discovered at runtime rather than included in the package.

### Combine with your own tools

To give an agent Connect tools alongside tools you define yourself, spread the resolver's result in a `tools` function. Your tools win when a key collides:

```typescript
import { Agent } from '@mastra/core/agent'
import { tools } from '@mastra/connect'
import { weatherTool } from '../tools/weather'

const connectTools = tools()

export const opsAgent = new Agent({
  id: 'ops',
  name: 'ops',
  instructions: 'You help the team track work in Linear and GitHub.',
  model: 'openai/gpt-5-mini',
  tools: async ctx => ({ ...(await connectTools(ctx)), weatherTool }),
})
```

### Limit available tools

Use `providers` to give an agent tools from selected providers rather than every connected account:

```typescript
tools({
  providers: ['linear', 'github'],
})
```

To restrict which actions an agent can take, configure an allowlist of tool keys for each provider:

```typescript
tools({
  providers: {
    linear: { allowTools: ['linear_list_issues', 'linear_create_issue'] },
  },
})
```

Find tool keys in the [provider toolsets reference](https://mastra.ai/reference/connect/providers). The [`tools()` reference](https://mastra.ai/reference/connect/tools) covers exclusion filters, wildcard patterns, shared policies, and validation behavior.

### Filter tools per request

The `providers` option selects which providers the resolver can load. To vary the available tools by request, use the agent's `tools` function with [request context](https://mastra.ai/docs/server/request-context):

```typescript
import { Agent } from '@mastra/core/agent'
import { tools } from '@mastra/connect'

const connectTools = tools({ providers: ['linear'] })
const viewerTools = new Set(['linear_list_issues'])

export const opsAgent = new Agent({
  id: 'ops',
  name: 'ops',
  instructions: 'You help the team track work in Linear.',
  model: 'openai/gpt-5-mini',
  tools: async ctx => {
    const all = await connectTools(ctx)

    if (ctx.requestContext?.get('role') === 'viewer') {
      return Object.fromEntries(Object.entries(all).filter(([key]) => viewerTools.has(key)))
    }
    return all
  },
})
```

This example gives viewers only `linear_list_issues` and gives other roles the resolved Linear tools. Set the role in trusted server-side code based on the authenticated user. The resolver caches its toolset, while the callback filters it for each request.

### Require approval for sensitive tools

Tools run without [human approval](https://mastra.ai/docs/agents/human-in-the-loop) by default. Set `requireApproval` to pause before selected tools execute:

```typescript
tools({
  providers: {
    linear: { requireApproval: ['linear_create_issue'] },
  },
})
```

Pass `requireApproval: true` to require approval for every tool from a provider. Approval works with both generated toolsets and MCP providers. Follow the [human-in-the-loop guide](https://mastra.ai/docs/agents/human-in-the-loop) to handle approval requests and resume execution.

### Choose between connections

If a project links two Slack workspaces, the agent chooses a workspace on each call. The same applies to any provider with more than one connection: the toolset gains a `<provider>__list_connections` tool, and every other tool takes a `connection_name` input. Give connections [names you can tell apart](https://mastra.ai/reference/cli/mastra).

To always use one connection, pin it:

```typescript
tools({
  providers: {
    slack: { connectionId: 'c_yourconnectionid' },
  },
})
```

---

## Source: Channels (`docs/mastra-platform/connect/channels`)

Canonical URL: `https://mastra.ai/docs/mastra-platform/connect/channels.md`

## Channels

[Channels](https://mastra.ai/docs/channels) let people talk to your agents from services such as Slack, Telegram, and Discord. Connect stores provider credentials on the platform and uses [`channels()`](https://mastra.ai/reference/connect/channels) to make those channels available in your Mastra application. It uses the same channel packages with platform-managed credentials, while vendor-side setup depends on the provider.

Before you start, follow the [Connect setup](https://mastra.ai/docs/mastra-platform/connect/overview) to install the package and configure your platform project.

### Add channels to Mastra

Pass `channels()` to the `Mastra` constructor:

```typescript
import { Mastra } from '@mastra/core'
import { channels } from '@mastra/connect'
import { assistant } from './agents/assistant'

export const mastra = new Mastra({
  agents: { assistant },
  channels: await channels(),
})
```

This registers the channel providers and their routes. After adding a provider connection, use Studio to connect that channel to an agent. These are separate steps: the platform connection supplies credentials, and the agent's channel installation lets people message that agent.

The channels available to your app are configured at startup, while their credentials resolve dynamically. See the [resolver reference](https://mastra.ai/reference/connect/channels) for route registration, connection refresh, and startup errors.

### Connect a provider

The following steps cover Slack, Discord, and Telegram. Start your Mastra application before completing the agent connection in Studio.

For webhook delivery and OAuth callbacks, your server needs a public URL reachable by the provider. Mastra platform supplies this URL. When hosting elsewhere, set `MASTRA_SERVER_URL` to your public server URL. Use a public HTTPS tunnel for local webhook development.

#### Slack

Slack channels use an **app configuration token**, which lets Mastra create a Slack app for each agent. This is different from the workspace authorization used by Slack API tools:

- `slack-channels` connects channel apps.
- `slack` provides [Slack tools](https://mastra.ai/docs/mastra-platform/connect/tools).

To use both, create a separate connection for each provider.

1. Open [Slack apps](https://api.slack.com/apps), then open **Your App Configuration Tokens**.
2. Generate an app configuration token for the workspace where the agent will run.
3. Run `mastra connect add slack-channels` and complete the authorization flow. The platform stores and rotates the configuration credential.
4. Connect the channel to an agent in Studio. Mastra creates a Slack app and returns an authorization URL. Open it, choose the workspace, and approve the bot scopes.

See the [default Slack manifest](https://mastra.ai/reference/channels/slack-provider) for the requested scopes and event subscriptions.

#### Discord

Create a Discord application and authorize it with a **bot token**, not a user OAuth token. The same `discord` connection can provide both a channel and Discord [tools](https://mastra.ai/docs/mastra-platform/connect/tools).

1. In the [Discord Developer Portal](https://discord.com/developers/applications), create an application.
2. Open **Bot**, add a bot, then select **Reset Token** and copy the bot token.
3. Under **Privileged Gateway Intents**, enable **Message Content Intent**.
4. Run `mastra connect add discord` and enter the bot token.
5. Connect the channel to an agent in Studio. If the bot isn't already in a server, open the generated authorization URL, choose the server, and approve the requested permissions.

Discord uses the Gateway for messages and the HTTP interactions route for slash commands and buttons. See [Discord permissions](https://mastra.ai/reference/connect/channels) for the scopes and permissions requested by the bot invite.

#### Telegram

Telegram uses a bot token from BotFather. Before connecting an agent, set `MASTRA_ENCRYPTION_KEY` on a persistent production server to encrypt the stored webhook secret. Without a key, the secret is stored unencrypted. Webhook mode also requires a public HTTPS server URL.

1. Open [BotFather](https://t.me/botfather), run `/newbot`, and follow the prompts.
2. Copy the bot token that BotFather returns.
3. Run `mastra connect add telegram` and enter the bot token.
4. Connect the channel to an agent in Studio. Mastra verifies the bot, creates a webhook secret, and registers the agent's public webhook URL with Telegram.

For local development without a public webhook URL, the [Telegram provider reference](https://mastra.ai/reference/channels/telegram-provider) describes polling mode.

### Configure available channels

Use `providers` to select the channels your app exposes:

```typescript
channels({ providers: ['slack', 'discord'] })
```

Pass an object to configure a provider or pin a specific connection:

```typescript
channels({
  providers: {
    discord: {
      providerOptions: { applicationId: process.env.DISCORD_APPLICATION_ID },
    },
    telegram: false,
    slack: { connectionId: 'sla_01ABC...' },
  },
})
```

The configuration key `slack` refers to the `slack-channels` connection. Credentials come from the platform connection, not `providerOptions`. See the [`channels()` reference](https://mastra.ai/reference/connect/channels) for selection behavior, aliases, reserved options, and validation errors.

### Combine with a self-managed channel

To use Connect for Slack and Discord while managing Telegram yourself, combine the providers in one resolver. Merge their routes too, so Mastra can register endpoints for both:

```typescript
import { Mastra } from '@mastra/core'
import { channels } from '@mastra/connect'
import { TelegramProvider } from '@mastra/telegram'
import { assistant } from './agents/assistant'

const connectChannels = await channels({ providers: ['slack', 'discord'] })
const telegram = new TelegramProvider()

export const mastra = new Mastra({
  agents: { assistant },
  channels: Object.assign(async () => ({ ...(await connectChannels()), telegram }), {
    getRoutes: () => [...connectChannels.getRoutes(), ...telegram.getRoutes()],
  }),
})
```

Telegram is excluded from the Connect selection in this example. Configure the self-managed provider's credentials as described in the [Telegram provider reference](https://mastra.ai/reference/channels/telegram-provider).

### Vary tools by channel

Channel messages include a `channel` entry in [request context](https://mastra.ai/docs/server/request-context). Use it to vary an agent's tools by conversation type, alongside your application's access checks:

```typescript
import { Agent } from '@mastra/core/agent'
import type { ChannelContext } from '@mastra/core/channels'
import { tools } from '@mastra/connect'

const connectTools = tools({ providers: ['linear'] })
const readTools = new Set(['linear_list_issues'])

export const assistant = new Agent({
  id: 'assistant',
  name: 'assistant',
  instructions: 'You help the team track work in Linear from Slack and Discord.',
  model: 'openai/gpt-5-mini',
  tools: async ctx => {
    const channel = ctx.requestContext?.get('channel') as ChannelContext | undefined
    const all = await connectTools(ctx)

    if (channel?.isDM && ctx.requestContext?.get('role') === 'operator') {
      return all
    }
    return Object.fromEntries(Object.entries(all).filter(([key]) => readTools.has(key)))
  },
})
```

Only direct messages from users your application identifies as operators receive the full resolved Linear toolset. Other requests get only `linear_list_issues`. Set `role` in trusted server-side code after verifying the sender's identity and permissions, rather than granting write access based on conversation type alone.

The channel context also includes the platform, channel and thread IDs, and sender identity. See the [channel context fields](https://mastra.ai/integrations/channels/slack) and [per-request tool filtering](https://mastra.ai/docs/mastra-platform/connect/tools).

---

## Source: Observability (`docs/mastra-platform/observability`)

Canonical URL: `https://mastra.ai/docs/mastra-platform/observability.md`

## Observability on Mastra platform

Mastra Platform Observability collects traces, logs, metrics, scores, and feedback from Mastra applications. Use it for hosted observability without deploying Studio or Server or configuring local observability storage.

### Quickstart

Choose the setup path that matches your project.

#### New project

Create a managed Mastra project and enable Mastra Platform Observability when prompted:

**npm**:

```bash
npm create mastra@latest
```

**pnpm**:

```bash
pnpm create mastra
```

**Yarn**:

```bash
yarn create mastra
```

**Bun**:

```bash
bunx create-mastra
```

The create command authenticates with Mastra Platform and creates an observability project. It then creates an access token and writes `MASTRA_PLATFORM_ACCESS_TOKEN` and `MASTRA_PROJECT_ID` to `.env`.

#### Existing project

If you're adding Mastra to an existing application, run `mastra init` and enable Mastra Observability when prompted:

**npm**:

```bash
npx mastra init
```

**pnpm**:

```bash
pnpm dlx mastra init
```

**Yarn**:

```bash
yarn dlx mastra init
```

**Bun**:

```bash
bun x mastra init
```

The init command lets you select an existing platform project or create one. It then creates an access token and writes the credentials to `.env`.

### Configure manually

Use manual configuration if you skipped platform setup or automatic provisioning failed.

1. In [Mastra Platform](https://projects.mastra.ai), create or open a project.
2. Create an access token for the project's organization.
3. Copy the project ID from the project page.
4. Add both values to `.env`:

```bash
MASTRA_PLATFORM_ACCESS_TOKEN=<your-platform-access-token>
MASTRA_PROJECT_ID=<your-project-id>
```

Register [`MastraPlatformExporter`](https://mastra.ai/reference/observability/tracing/exporters/mastra-platform-exporter) in your observability configuration:

```typescript
import { Mastra } from '@mastra/core/mastra'
import { MastraPlatformExporter, Observability } from '@mastra/observability'

export const mastra = new Mastra({
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'my-service',
        exporters: [new MastraPlatformExporter()],
      },
    },
  }),
})
```

The exporter reads the access token and project ID from the environment. Keep `serviceName` stable so you can distinguish applications and deployments when filtering observability data.

`MastraPlatformExporter` sends ended spans, logs, metrics, scores, and feedback. It buffers events and sends a batch when it reaches 1,000 events or has waited five seconds. Model chunk spans aren't exported.

> **Note:** `MastraPlatformExporter` replaced `CloudExporter`. `CloudExporter` remains available for backward compatibility but is deprecated. Use `MastraPlatformExporter` for new code.

#### Store data locally

Add `MastraStorageExporter` if you also want to persist observability data to your configured Mastra storage and inspect it in local Studio:

```typescript
import { Mastra } from '@mastra/core/mastra'
import { MastraPlatformExporter, MastraStorageExporter, Observability } from '@mastra/observability'

export const mastra = new Mastra({
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'my-service',
        exporters: [new MastraPlatformExporter(), new MastraStorageExporter()],
      },
    },
  }),
})
```

See [Mastra storage exporter](https://mastra.ai/docs/observability/integrations/exporters/mastra-storage) for storage requirements and configuration.

### View observability data

Open your project in [Mastra Platform](https://projects.mastra.ai) to inspect exported traces, logs, metrics, and scores. A Studio or Server deployment isn't required. Query exported feedback through the hosted feedback API described below.

Use a consistent `serviceName` to filter data from a specific application or deployment.

### Query observability data

Browse hosted traces from the terminal with the Mastra CLI:

**npm**:

```bash
npx mastra api trace list
```

**pnpm**:

```bash
pnpm dlx mastra api trace list
```

**Yarn**:

```bash
yarn dlx mastra api trace list
```

**Bun**:

```bash
bun x mastra api trace list
```

The CLI reads `MASTRA_PLATFORM_ACCESS_TOKEN` and `MASTRA_PROJECT_ID` from your project environment and targets the US observability endpoint by default. See [CLI target resolution](https://mastra.ai/reference/cli/mastra) for other authentication options and regional endpoints.

Use `mastra api trace query` to find completed traces by their fields or related spans. For example, find traces whose root span took more than five seconds:

```bash
npx mastra api trace query '{
  "timeRange": {
    "from": "2026-08-01T00:00:00.000Z",
    "to": "2026-08-08T00:00:00.000Z"
  },
  "where": {
    "op": "gt",
    "left": { "path": "durationMs" },
    "right": { "literal": 5000 }
  },
  "page": { "limit": 25 }
}'
```

Choose a time range containing your exported traces, up to 31 days. Results appear in `data.traces`.

Mastra Platform uses the same trace-query endpoints and request format as Mastra Server. Use the [Trace queries API reference](https://mastra.ai/reference/observability/tracing/trace-query) for HTTP requests, supported filters, pagination, polling, and field discovery.

You can query exported feedback over HTTP. See the [Feedback API](https://mastra.ai/docs/mastra-platform/api) for its current status, regional endpoints, authentication, project scoping, and supported query parameters such as `traceId` and `environment`.

You can query exported metrics over HTTP, with `MastraClient`, or with `mastra api metric`. See the [Metrics API](https://mastra.ai/docs/mastra-platform/api) for regional endpoints, authentication, project scoping, and supported endpoints.

### Import existing traces

Use `mastra traces import` to move existing trace history from a supported observability provider into an existing Mastra Platform project. The command reads and validates complete traces at the source, converts them into Mastra spans, then uses a shared workflow for preparation, upload, resume, and verification.

The import command currently supports Langfuse. Additional providers can use the same command workflow when their adapters are added.

| Provider | Command argument | Source requirement                                 |
| -------- | ---------------- | -------------------------------------------------- |
| Langfuse | `langfuse`       | Langfuse Cloud or self-hosted Langfuse v4 or later |

#### Prerequisites

Before starting an import, you need:

- A Mastra Platform project.
- Mastra Platform authentication through `mastra auth login`, or a `MASTRA_API_TOKEN` and `MASTRA_ORG_ID` for a headless environment.
- `MASTRA_PLATFORM_ACCESS_TOKEN` for upload and read-back when using an interactive login. A dry run doesn't require this token.
- Credentials for a supported source provider.
- Enough local disk space to temporarily store the prepared traces.

#### Configure the destination

For an interactive import, sign in and select the organization that owns the destination project:

```bash
npx mastra auth login
npx mastra auth orgs switch
```

Interactive login authorizes project discovery. Set the Platform access token used by the destination project before uploading or verifying traces:

```bash
MASTRA_PLATFORM_ACCESS_TOKEN=<mastra-platform-access-token>
```

If `mastra init` configured observability for the project, use the token it wrote to `.env`. Otherwise, create an access token in [Mastra Platform](https://projects.mastra.ai).

You can run `--dry-run` without this token because a dry run doesn't contact the collector or query API.

`--target-project` names the destination: the Mastra Platform project that receives the traces. Specify it with a project name, slug, or ID, or set `MASTRA_PROJECT_ID`:

```bash
npx mastra traces import langfuse --target-project my-mastra-project --dry-run
```

The `--target-project` flag takes precedence over `MASTRA_PROJECT_ID`. Without either value, the CLI uses the project linked in `.mastra-project.json`.

The source project isn't a command-line option. The provider credentials in `.env` select it, and the preparation summary names it before anything is uploaded.

For a headless environment, set the API token and organization ID. The command uses `MASTRA_API_TOKEN` for project discovery, upload, and read-back. Set the project ID or pass `--target-project`:

```bash
MASTRA_API_TOKEN=<mastra-api-token>
MASTRA_ORG_ID=<organization-id>
MASTRA_PROJECT_ID=<project-id>
```

#### Configure Langfuse

Langfuse API keys belong to one Langfuse project, so they also select the source project. Create [project API keys in Langfuse](https://langfuse.com/docs/api-and-data-platform/features/public-api), then add them to `.env` or `.env.local` in the directory where you run the command:

```bash
LANGFUSE_PUBLIC_KEY=<langfuse-public-key>
LANGFUSE_SECRET_KEY=<langfuse-secret-key>
```

Langfuse Cloud defaults to the EU region at `https://cloud.langfuse.com`. Set `LANGFUSE_BASE_URL` to the [regional host](https://langfuse.com/security/data-regions) for US, Japan, or HIPAA Cloud, or to the origin of a self-hosted instance:

```bash
LANGFUSE_BASE_URL=https://us.cloud.langfuse.com
```

#### Preview the import

Run a dry run before uploading:

```bash
npx mastra traces import langfuse --target-project my-mastra-project --dry-run
```

The dry run reads the source, prepares valid Mastra traces locally, and reports:

- The source Langfuse project by name and ID, and the destination Mastra Platform project.
- The fixed import window.
- Prepared and skipped trace and span counts.
- The size of the prepared local data.
- Provider warnings and skip reasons in `report.json`.

It doesn't upload traces. The command prints a `--resume` command that uploads the prepared data later without reading the source again.

#### Choose the import window

By default, the command selects the last 30 days, ending when the import starts. Use `--since` and `--until` to choose a smaller window:

```bash
npx mastra traces import langfuse \
  --target-project my-mastra-project \
  --since "$SINCE" \
  --until "$UNTIL" \
  --dry-run
```

Set `SINCE` and `UNTIL` to ISO 8601 dates or timestamps. The following rules apply:

- `--until` can't be in the future or outside the current 30-day Platform retention period.
- `--since` must be earlier than `--until` and inside the current retention period.
- The selected window can't exceed 30 days.
- If only `--until` is set, the default start is the later of 30 days before `--until` and the current retention boundary.

Commands written with the earlier `--from` and `--to` names still work.

Trace eligibility is based on the root observation's start time. The Langfuse adapter discovers roots in the selected window and then reads all currently available observations for each selected trace. It skips the complete trace if the available parent-child tree or timestamps are invalid.

#### Upload and verify

Run the command without `--dry-run` to upload the prepared traces:

```bash
npx mastra traces import langfuse --target-project my-mastra-project
```

The CLI displays the preparation summary and asks for confirmation before upload. Pass `--yes` to skip this prompt in an automated environment:

```bash
npx mastra traces import langfuse --target-project my-mastra-project --yes
```

The importer keeps every trace in one upload request and checkpoints progress only after Mastra Platform acknowledges the batch. Temporary source and destination failures use bounded retries.

After every prepared trace is acknowledged, the importer reads back a deterministic sample of up to 10 traces. It verifies span IDs, parent links, names, span types, event flags, timestamps, and whether an error is present. It doesn't read back or compare input, output, attributes, metadata, or tags.

If read-back isn't available yet or a sampled trace differs, the import pauses and keeps its prepared data. Resume the import to retry verification without uploading acknowledged traces again.

#### Resume an import

Use the exact command printed by the CLI when a dry run, cancellation, interruption, upload failure, or paused verification leaves an import unfinished:

```bash
npx mastra traces import langfuse \
  --resume 00000000-0000-0000-0000-000000000000 \
  --target-project my-mastra-project
```

A resumed import must use the original provider and destination project. Its saved date window can't be changed, so `--since`, `--until`, and `--dry-run` can't be combined with `--resume`.

Resume behavior depends on where the command stopped:

- An interrupted preparation reads and prepares the source again.
- An interrupted upload starts with the first unacknowledged trace.
- Paused verification retries read-back without re-uploading acknowledged traces.
- A completed import reports that it's already complete and retries any remaining local cleanup.

#### Local files and cleanup

Import state is stored under:

```text
~/.mastra/imports/traces/<target-project-id>/<import-id>/
```

| File            | Purpose                                                                     | Lifecycle                                                                                 |
| --------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `manifest.json` | Stores the source identity, date window, counts, and acknowledged progress. | Retained after completion.                                                                |
| `traces.jsonl`  | Stores one complete normalized trace per line.                              | Retained for dry runs and unfinished imports, then removed after successful verification. |
| `report.json`   | Stores counts, warnings, skip samples, and verification results.            | Retained after it's written.                                                              |

These files can contain trace content. Mastra creates the import directory and files with permissions restricted to the local user. Protect the machine and account that run the import.

#### Imported data and limits

For Langfuse imports:

- Observations become Mastra spans with their parent-child relationships and timestamps.
- Langfuse `AGENT`, `TOOL`, and `EVALUATOR` observations, and plain spans that carry OpenTelemetry GenAI attributes such as `gen_ai.operation.name: invoke_agent`, keep their primitive type and name. Mastra Platform shows them in the Primitive type and Primitive name columns and includes them in those filters, like native traces.
- Supported fields such as names, input, output, errors, model details, usage, cost, tags, and source context are mapped when present.
- Environments you set in Langfuse, such as `staging`, are kept. Langfuse's built-in `default` environment isn't copied. Those traces have no environment in Mastra, and Mastra Studio shows them for every environment.
- Destination trace and span IDs are deterministic. Original Langfuse IDs remain in span metadata for correlation.
- Unknown Langfuse observation types become generic spans and produce a warning instead of being silently discarded.
- Only trace observations are imported. Scores, feedback, datasets, attachments, and logs aren't imported.

The shared importer also applies these limits:

- Prepared local trace data is limited to 5 GiB per import. Use a smaller date window if an import reaches this limit.
- A complete trace must fit within the importer's 4 MiB upload payload limit. A larger trace is skipped and recorded with the `trace_too_large` reason.
- A trace is never split between upload requests.

Review `report.json` after a dry run or completed import to see exactly what was prepared, skipped, acknowledged, and verified.

See the [`mastra traces import` CLI reference](https://mastra.ai/reference/cli/mastra) for the complete option and environment-variable reference.

### Next steps

- 📹 [Mastra observability and Studio workshop](https://www.youtube.com/watch?v=dKO_a3RPra0)
- [Configure Mastra Platform](https://mastra.ai/docs/mastra-platform/configuration)
- [Learn about observability](https://mastra.ai/docs/observability/overview)
- [Configure `MastraPlatformExporter`](https://mastra.ai/reference/observability/tracing/exporters/mastra-platform-exporter)

---

## Source: Alerts (`docs/mastra-platform/alerts`)

Canonical URL: `https://mastra.ai/docs/mastra-platform/alerts.md`

## Alerts

Alerts notify your team when a deploy fails, a running service stops or stops responding, or organization usage crosses a plan threshold. You configure alerts at the organization level, then choose which projects and environments each alert covers.

Organization admins can create and manage alerts. Other organization roles have read-only access to the alert settings.

Open the [Mastra platform dashboard](https://projects.mastra.ai), go to your organization settings, then select **Alerts**. The page has three tabs:

- **Alerts** lists each alert with its scope, destinations, status, and enable or pause switch.
- **Destinations** lists the Slack channels, Discord channels, Microsoft Teams channels, email groups, webhook endpoints, PagerDuty services, and incident.io alert sources that can receive notifications.
- **Activity** shows incidents and the notification attempts associated with them.

### Add a destination

A destination defines where Mastra sends notifications. Add at least one destination before creating an alert.

| Destination         | Configuration                                                                                                                                        |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Slack**           | Connect a Slack workspace and select one or more channels. Mastra creates a separate destination for each selected channel.                          |
| **Discord**         | Enter a Discord channel webhook URL. See [Send alerts to Discord](#send-alerts-to-discord).                                                          |
| **Microsoft Teams** | Enter the URL of a Teams workflow that posts to a channel. See [Send alerts to Microsoft Teams](#send-alerts-to-microsoft-teams).                    |
| **Email**           | Select organization roles, individual members, or up to 10 email addresses. Role-based recipient groups update when organization membership changes. |
| **Webhook**         | Enter an HTTPS endpoint. Mastra signs each request and shows the signing secret once after the destination is created.                               |
| **PagerDuty**       | Enter the integration key of a PagerDuty Events API v2 integration. See [Send alerts to PagerDuty](#send-alerts-to-pagerduty).                       |
| **Incident.io**     | Enter the alert source config ID and token of an incident.io HTTP alert source. See [Send alerts to incident.io](#send-alerts-to-incidentio).        |

1. On the **Destinations** tab, select **Add destination**.

2. Select **Slack**, **Discord**, **Microsoft Teams**, **Email**, **Webhook**, **PagerDuty**, or **Incident.io**, then enter a name for the destination.

3. Configure the selected destination:

   - For Slack, connect or select a workspace and choose the channels that should receive alerts. The Mastra Alerts app joins public channels automatically. Invite `@Mastra Alerts` before selecting a private channel.
   - For Discord, enter the channel's webhook URL.
   - For Microsoft Teams, enter the workflow's webhook URL.
   - For email, choose **All organization members**, one or more roles, individual members, or external email addresses.
   - For a webhook, enter an endpoint that starts with `https://`.
   - For PagerDuty, enter the **Integration key**.
   - For incident.io, enter the **Alert source config ID** and **Token**.

4. Select **Create destination**. For a webhook destination, copy the signing secret before closing the page. The secret can't be shown again.

The destination form changes based on the selected type. Slack destinations require a workspace and at least one channel. Discord and Microsoft Teams destinations require a webhook URL. Email destinations require at least one recipient, which can be an organization role, a member, or an external address. Webhook destinations require an HTTPS endpoint. PagerDuty and incident.io destinations require the credentials from their integration. Every destination also requires a name that identifies it in alert configuration and activity history.

Use the destination's actions menu to send a test notification. You can also edit, pause, or delete a destination. Pausing a destination stops notifications without removing it from existing alerts.

For webhook destinations, **Rotate secret** replaces the current signing secret immediately. Update the receiving endpoint with the new secret before sending another alert.

Discord and Microsoft Teams webhook URLs contain their own credentials, so Mastra stores them encrypted and shows only the last four characters after the destination is created. To rotate the URL, edit the destination and paste a new one. Leaving the URL field blank keeps the stored URL.

### Create an alert

An alert combines triggers, scope, destinations, and repeat-alert pacing.

1. On the **Alerts** tab, select **Create Alert**.

2. Enter an alert name and leave **Enabled** on if the alert should start monitoring immediately.

3. Select one or more triggers:

   - **Deploy failed**: A build or deploy doesn't reach a running state.
   - **Service crashed**: A running service exhausts its restart policy and stops.
   - **Service out of memory**: A service is stopped after running out of memory.
   - **Service unreachable**: A deployed service fails 3 health checks in a row.
   - **Usage threshold crossed**: Organization usage crosses a plan threshold or reaches its limit. This trigger is organization-wide, so it requires the **All projects** scope.

4. Set the alert scope to **All projects** or **Specific projects**. When you select specific projects, you can narrow the scope to individual environments. Leaving the environment selection empty includes every environment in that project.

5. Select one or more destinations. You can add or edit a destination without leaving the alert setup.

6. Under **Repeat alerts**, choose how often Mastra can resend an alert for the same incident: every event, every 5 minutes, every 15 minutes, or every hour. The first notification, recovery notifications, and severity increases send immediately.

7. Select **Create Alert**.

The alert form groups these settings into **Name**, **Trigger**, **Scope**, and **Destinations**. The selected destinations and repeat interval apply to every trigger and project included in that alert.

### Manage alerts

The **Alerts** tab shows each alert's scope, destinations, and current state. Use the switch to pause or enable an alert.

Open an alert's actions menu to:

- **Edit** its triggers, scope, destinations, pacing, or name.
- **Test** every destination assigned to the alert.
- **Delete** the alert. Existing incidents and delivery history remain available.

### Review alert activity

The **Activity** tab groups each incident with its delivery attempts. An incident stays **Open** while the condition is active and changes to **Resolved** after the service or deploy recovers, except for usage threshold incidents, which don't resolve automatically.

Expand an incident to inspect the notification sent to each destination. Each incident row shows when the event occurred, the event type, its project or environment scope, and its current status. Nested delivery rows show the trigger, destination, and delivery status for each notification attempt. Delivery attempts can be **Scheduled**, **Sent**, **Suppressed**, **Retrying**, **Exhausted**, or **Config error**. Use the activity filter to show all activity, incidents only, or delivery attempts only.

### Send alerts to Discord

A Discord destination posts an embed to a channel through a Discord webhook. A triggered incident posts a red embed, and a recovery posts a separate green **Resolved** embed. Discord webhooks can't update earlier messages, so the resolved notice is a new message rather than an edit.

1. In Discord, open the channel that should receive alerts, then select **Edit Channel**, **Integrations**, **Webhooks**, and **New Webhook**. Copy the webhook URL. See [Intro to Webhooks](https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks) in the Discord documentation.

2. In Mastra, add a destination, select **Discord**, and paste the URL into **Webhook URL**. The URL must have the form `https://discord.com/api/webhooks/<id>/<token>`.

3. Send a test notification from the destination's actions menu.

The embed shows the event and project in its title, which links to the deployment logs, followed by the error excerpt and the environment, branch, and error code when the event includes them. If Discord rejects the webhook URL, the delivery shows **Config error**.

### Send alerts to Microsoft Teams

A Microsoft Teams destination posts an Adaptive Card to a channel through a Teams workflow. A triggered incident posts a red card, and a recovery posts a separate green **Resolved** card.

1. In Teams, open the channel that should receive alerts, select **More options** and then **Workflows**, and choose the template **Send webhook alerts to a channel**. Select the team and channel, create the workflow, then copy the workflow URL. See [Create incoming webhooks with Workflows](https://support.microsoft.com/en-us/office/create-incoming-webhooks-with-workflows-for-microsoft-teams-8ae491c7-0394-4861-ba59-055e33f75498) in the Microsoft documentation.

2. In Mastra, add a destination, select **Microsoft Teams**, and paste the URL into **Webhook URL**.

3. Send a test notification from the destination's actions menu.

Microsoft retired classic Office 365 connectors, so use a Teams workflow rather than the older **Incoming Webhook** connector. Mastra still accepts legacy `webhook.office.com` URLs for tenants that haven't migrated.

The card shows the event and project in its title, followed by the environment, branch, and error code when the event includes them, the error excerpt, and a button that opens the deployment logs. If Teams rejects the workflow URL, the delivery shows **Config error**.

### Send alerts to PagerDuty

A PagerDuty destination sends events to the PagerDuty Events API v2. Each Mastra incident opens one PagerDuty incident, and PagerDuty resolves it when the Mastra incident resolves.

1. In PagerDuty, open the service that should receive alerts. On its **Integrations** tab, add an **Events API V2** integration and copy its **Integration Key**. See [Services and integrations](https://support.pagerduty.com/main/docs/services-and-integrations) in the PagerDuty documentation.

2. In Mastra, add a destination, select **PagerDuty**, and paste the key into **Integration key**.

3. Send a test notification from the destination's actions menu. The test opens an incident with `info` severity in PagerDuty. Resolve it in PagerDuty.

Mastra maps its notifications to PagerDuty events as follows:

| PagerDuty field          | Value                                                                                              |
| ------------------------ | -------------------------------------------------------------------------------------------------- |
| `event_action`           | `trigger` for a new or repeated notification, `resolve` for a recovery                             |
| `dedup_key`              | The Mastra incident ID. Repeated notifications for the same incident update one PagerDuty incident |
| `payload.summary`        | A one-line description, for example `Deploy failed on support-agent (production): Build failed`    |
| `payload.severity`       | The Mastra severity: `critical`, `error`, `warning`, or `info`                                     |
| `payload.source`         | `mastra:<project>/<environment>`                                                                   |
| `payload.custom_details` | The event data described in [Webhook payload](#webhook-payload)                                    |

Changes made in PagerDuty, such as acknowledging or resolving an incident, don't update the Mastra incident. If PagerDuty rejects the integration key, the delivery shows **Config error**.

### Send alerts to incident.io

An incident.io destination sends alert events to an incident.io HTTP alert source. Each Mastra incident creates one alert in incident.io, and the alert resolves when the Mastra incident resolves.

1. In incident.io, create an HTTP alert source with the **Default** source type. Mastra sends events in the incident.io alert event format, so a custom transform isn't needed. See [Create an alert event](https://docs.incident.io/api-reference/alert-events-v2/create) in the incident.io documentation.

2. Copy the alert source config ID and the bearer token from the source's authorization header. The ID is the last segment of the alert events URL, `https://api.incident.io/v2/alert_events/http/<alert-source-config-id>`.

3. In Mastra, add a destination and select **Incident.io**. Paste the ID, or the full alert events URL, into **Alert source config ID**, and the token into **Token**.

4. Send a test notification from the destination's actions menu. The test creates a firing alert in incident.io.

Mastra sends these fields to incident.io:

| incident.io field   | Value                                                                                   |
| ------------------- | --------------------------------------------------------------------------------------- |
| `status`            | `firing` for a new or repeated notification, `resolved` for a recovery                  |
| `deduplication_key` | The Mastra incident ID                                                                  |
| `title`             | A one-line description of the event                                                     |
| `description`       | The error message, when the event has one                                               |
| `metadata`          | The event data plus `source`, `event_type`, `severity`, `project_id`, and `environment` |

Use the `metadata` fields in alert attributes and routing rules. Changes made in incident.io don't update the Mastra incident, and if incident.io rejects the token or alert source ID, the delivery shows **Config error**.

### Receive webhook notifications

A webhook destination receives an HTTP `POST` request with a JSON body for each notification. Use a webhook to connect a tool that Mastra doesn't integrate with directly.

#### Webhook payload

The following example shows a failed deploy:

```json
{
  "id": "deploy.failed:dep_8c2f1a:triggered",
  "version": "2026-09-01",
  "type": "deploy.failed",
  "createdAt": "2026-09-24T14:03:11.000Z",
  "fingerprint": "deploy.failed|prj_41d9e2|server|production",
  "severity": "error",
  "status": "triggered",
  "summary": "Deploy failed on support-agent (production): Build failed",
  "source": "mastra",
  "data": {
    "deployId": "dep_8c2f1a",
    "projectName": "support-agent",
    "gitBranch": "main",
    "error": "Build failed",
    "errorCode": "BUILD_FAILED",
    "errorCategory": "build",
    "deployUrl": "https://projects.mastra.ai/..."
  },
  "links": []
}
```

| Field         | Description                                                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `id`          | Notification ID. Stays the same when Mastra retries the same notification                                                            |
| `version`     | Payload version. The current version is `2026-09-01`                                                                                 |
| `type`        | Event type. See the table below                                                                                                      |
| `createdAt`   | ISO 8601 time when the event occurred                                                                                                |
| `fingerprint` | Identifies the incident the notification belongs to. Notifications for the same failing deploy target or service share a fingerprint |
| `severity`    | `critical`, `error`, `warning`, or `info`. These values match PagerDuty severities                                                   |
| `status`      | `triggered` for a new or repeated notification, `resolved` when the incident recovers                                                |
| `summary`     | One-line description of the event                                                                                                    |
| `source`      | Always `mastra`                                                                                                                      |
| `data`        | Event-specific details. Fields vary by event type                                                                                    |
| `links`       | Related links, each with `href` and `text`. Can be empty                                                                             |

The `type` field has one of these values:

| Type                      | Trigger                     | Common `data` fields                                                                       |
| ------------------------- | --------------------------- | ------------------------------------------------------------------------------------------ |
| `deploy.failed`           | **Deploy failed**           | `deployId`, `projectName`, `gitBranch`, `error`, `errorCode`, `errorCategory`, `deployUrl` |
| `service.crashed`         | **Service crashed**         | Same as `deploy.failed`                                                                    |
| `service.oom`             | **Service out of memory**   | Same as `deploy.failed`                                                                    |
| `service.unreachable`     | **Service unreachable**     | `projectName`, `probeUrl`, `error`, `consecutiveFailures`                                  |
| `billing.usage_threshold` | **Usage threshold crossed** | `featureId`, `featureLabel`, `thresholdDisplay`, `error`                                   |

Crash, out-of-memory, and unreachable events for the same service share a fingerprint, so one outage produces one incident. Usage threshold incidents don't send a `resolved` notification.

Test notifications use `type: "deploy.failed"`, `severity: "info"`, and include `"test": true` in `data`.

#### Request headers

| Header                     | Value                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| `content-type`             | `application/json`                                                                         |
| `user-agent`               | `Mastra-Alerts/1.0`                                                                        |
| `x-mastra-signature`       | Signature of the request body. See [Verify webhook signatures](#verify-webhook-signatures) |
| `x-mastra-idempotency-key` | Same value as the payload `id`                                                             |

#### Verify webhook signatures

Verify the signature before you trust a request. The `x-mastra-signature` header has this format:

```text
t=1790258591,v1=5f0c9d3e...
```

`t` is the Unix time in seconds when Mastra signed the request. `v1` is a hex-encoded HMAC-SHA256 of the string `<t>.<raw request body>`, using the destination's signing secret as the key.

To verify a request:

1. Read the raw request body before parsing it as JSON. Parsing and serializing the body again can change it.
2. Compute the HMAC of `<t>.<raw body>` and compare it with `v1` using a constant-time comparison.
3. Reject requests where `t` is more than a few minutes old to prevent replayed requests.

**Node.js**:

```typescript
import { createHmac, timingSafeEqual } from 'node:crypto'

const TOLERANCE_SECONDS = 300

export function verifyMastraSignature(
  rawBody: string,
  signatureHeader: string,
  signingSecret: string,
): boolean {
  const parts = new Map(signatureHeader.split(',').map(part => part.split('=') as [string, string]))
  const timestamp = Number(parts.get('t'))
  const signature = parts.get('v1')
  if (!Number.isInteger(timestamp) || !signature || !/^[0-9a-f]{64}$/.test(signature)) return false
  if (Math.abs(Date.now() / 1000 - timestamp) > TOLERANCE_SECONDS) return false

  const expected = createHmac('sha256', signingSecret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex')
  const expectedBytes = Buffer.from(expected, 'hex')
  const signatureBytes = Buffer.from(signature, 'hex')
  return (
    expectedBytes.length === signatureBytes.length && timingSafeEqual(expectedBytes, signatureBytes)
  )
}
```

**Python**:

```python
import hashlib
import hmac
import time

TOLERANCE_SECONDS = 300

def verify_mastra_signature(raw_body: bytes, signature_header: str, signing_secret: str) -> bool:
    parts = dict(part.partition("=")[::2] for part in signature_header.split(","))
    try:
        timestamp = int(parts["t"])
        signature = parts["v1"]
    except (KeyError, ValueError):
        return False
    if abs(time.time() - timestamp) > TOLERANCE_SECONDS:
        return False

    expected = hmac.new(
        signing_secret.encode(),
        f"{timestamp}.".encode() + raw_body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)
```

Return a `401` status for a request that fails verification. After you rotate a destination's secret, requests are signed with the new secret immediately.

#### Retries and duplicate notifications

Mastra treats any `2xx` response as delivered and doesn't retry it. Persist or durably enqueue the notification before responding, and return a `5xx` response if that step fails so Mastra retries the delivery. Respond within 10 seconds and process the notification after responding if the work takes longer. Mastra doesn't follow redirects.

When a request fails, Mastra retries based on the response:

- **`4xx` response:** Mastra stops and marks the delivery **Config error**. Fix the endpoint, then use **Test** on the destination to confirm it works.
- **`5xx` response, timeout, or network error:** Mastra retries twice within a few seconds. If those requests also fail, the delivery shows **Retrying** and Mastra tries again after about 30 seconds, doubling the wait each time up to 15 minutes. After 6 failed attempts, the delivery shows **Exhausted**.

Discord, Microsoft Teams, PagerDuty, and incident.io destinations follow the same schedule. For those destinations, Mastra also retries `408` and `429` responses.

Retries can deliver the same notification more than once. Store the `x-mastra-idempotency-key` value of each processed request and skip requests with a key you've already seen. Use `fingerprint` to group notifications that belong to the same incident.

---

## Source: Trace Intelligence (`docs/mastra-platform/trace-intelligence`)

Canonical URL: `https://mastra.ai/docs/mastra-platform/trace-intelligence.md`

## Trace Intelligence on Mastra platform

Trace Intelligence finds recurring patterns across your agent's interactions. It analyzes traces captured by Mastra Observability and produces trace signals for four built-in dimensions plus any custom signals enabled for the project. It then clusters similar trace signals into themes.

Use Trace Intelligence to investigate questions such as:

- What are users trying to accomplish?
- Which goals tend to succeed, remain unresolved, or become blocked?
- Which agent behaviors appear in successful and unsuccessful interactions?
- How does user sentiment relate to goals and outcomes?

> **Private beta:** Trace Intelligence is available by invitation for selected Mastra platform projects.

### Get access

1. Submit the [Trace Intelligence private beta form](https://mastra.ai/trace-intelligence) to request access.
2. Confirm that [Mastra platform Observability](https://mastra.ai/docs/mastra-platform/observability) is enabled and that completed agent traces appear under **Traces**.
3. Requires at least `@mastra/core@1.53.0` and `mastra@1.20.2`. Upgrade your project then deploy or redeploy Studio for the enrolled project. Local Studio and server-only deployments aren't supported during the private beta.
4. Open the deployed Studio and select **Intelligence** in the sidebar.
5. Send representative traffic to your agent and allow time for analysis.

Once Mastra enrolls the project, you don't need to change your agent definition or calls.

#### When data is available

Trace Intelligence needs enough processed traces from one agent to identify recurring patterns. Initial themes are usually available after at least **100 completed traces** from that agent have been processed.

The trace count under **Traces** can reach 100 before Trace Intelligence is ready because the analysis pipeline runs asynchronously. Processing can take several minutes after the threshold is reached. Traces that can't be analyzed don't contribute. As a result, 100 is a minimum rather than an exact UI trigger.

Trace Intelligence updates automatically as more traces arrive. Studio needs themes for at least two trace signal types before it can display the relationship flow.

Use representative traffic. A small set of repeated test prompts can produce unrepresentative results, such as one broad theme or mostly Noise.

### Understand the analysis

Each analyzable completed trace produces four built-in trace signals, along with any custom signals enabled for the project:

| Trace signal  | Meaning                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------ |
| **Goal**      | What the user is trying to achieve or have completed.                                                  |
| **Outcome**   | The final completed, partial, blocked, failed, unresolved, or unclear state.                           |
| **Behavior**  | Observable agent actions and patterns, including tool use, omissions, retries, failures, and recovery. |
| **Sentiment** | The user's emotional state or attitude.                                                                |

Themes are clusters generated from similar trace signals. Clustering happens independently for each trace signal type. One trace can belong to a separate theme in every dimension: Goal, Outcome, Behavior, and Sentiment.

#### Themes and relationships

The flow chart connects themes in adjacent trace signal columns:

- A **node** represents a theme. Its count is the number of distinct traces assigned to that theme in the selected snapshot.
- A **ribbon** connects traces assigned to themes in both adjacent columns. Its width represents the shared trace count.
- Hover over or focus a node or ribbon to isolate its relationships.

The flow shows association, not causation or execution order. For example, a ribbon between a Goal and an Outcome means that both themes occurred in the same traces. It doesn't show that the goal caused the outcome.

#### Other and Noise

Each node shows its trace count: the number of distinct traces assigned to that theme in the selected snapshot. A theme's details also state its share, for example "28 of 70 traces in this snapshot (40%)".

Studio shows the most common themes for each trace signal type. It may combine smaller themes into **Other** to preserve totals without overcrowding the chart.

**Noise** contains summaries that didn't consistently match a recurring theme in the selected snapshot. It doesn't necessarily indicate an error or a low-quality interaction. Noise can include rare requests and emerging patterns. It can also contain ambiguous interactions or unrelated cases. A large Noise share can indicate highly varied traffic or insufficient data for stable themes.

#### Snapshots

A snapshot is a moving analysis window over a set of traces. Snapshots can overlap, so don't add their trace counts together. Compare a theme's trace count and its share of the snapshot together because traffic volume can change between windows.

A theme can persist, disappear, split, merge, or return across snapshots. Treat theme names and descriptions as generated summaries, not fixed taxonomies.

### Use the Trace Intelligence page

1. Open **Intelligence** to see the entity index. Search or sort the index, then select an entity to open its analysis.
2. Select a theme in the flow to open its details and filter every column to traces containing that theme.
3. The details panel shows the theme's description, its share of the snapshot, paged example summaries, and a trend of its trace count over time.
4. Select **Clear filter** to restore the complete flow.

Entities appear while their signals are still collecting or processing. The index shows each entity's analyzed trace count, ready and enabled signal counts, lifecycle status, and last update.

#### Configure a custom signal

Organization admins can configure custom signals without leaving Intelligence:

1. Return to the entity index and select **Signal settings**.
2. Select **Create signal**, provide a stable signal name, display label, description, and signal instructions, then save it. Definitions and their versions are shared across the organization.
3. Enable the signal under **Current project**. Project enablement affects only the current project and applies to newly processed traces.
4. Open an entity from the index and follow its signal status as it moves from collecting to processing and ready.

You can edit a custom signal's label, description, or instructions. Instruction changes create a new version and apply only to new traces. You can also archive definitions that should no longer be available or restore archived definitions later.

You can also:

- Select **Noise** in the flow to inspect its share and generated example summaries.
- Drag the column headers above the chart to reorder the trace signal columns and see a different relationship perspective.
- Use the timeline to select a snapshot, or select **Play** to watch themes change over time.
- Switch to **Compare** to see which themes grew, shrank, entered the range, or left the range between two points in time, or **Lifelines** to follow each theme's share across the whole selected range.

Filtering the flow by a theme is unavailable for snapshots with more than 2,000 traces. Selecting a theme still opens its details there without filtering the flow.

### Troubleshooting

#### Intelligence isn't in the sidebar

Confirm that Mastra enrolled the correct project, that you use the beta-compatible Mastra version, and that you redeployed Studio because the private beta doesn't support local Studio.

#### An agent is missing

Confirm that its completed traces are listed under **Traces** and that the project is enrolled. Trace Intelligence lists an entity after signal generation begins, before its first themes are ready. If it recently reached 100 traces, allow time for asynchronous processing.

#### The relationship flow is unavailable

The flow requires themes for at least two trace signal types. Continue sending representative traffic and allow processing to finish.

#### Most summaries are Noise

Collect more representative traffic and compare a later snapshot. Varied or rare interactions are harder to group, while repeated test prompts can produce an unrepresentative distribution.

### Private-beta limitations

- Trace Intelligence is available only for enrolled projects in deployed Studio.
- Initial analysis requires at least 100 processed traces per agent. Some agents may require more.
- Results depend on the diversity and quality of captured traces.
- Trace signal summaries, theme labels, clustering, thresholds, and UI behavior can change during the beta.

When reporting feedback, include the organization ID, project ID, agent ID, selected snapshot, and the theme or Noise examples that illustrate the issue.

### Related

- [Observability on Mastra platform](https://mastra.ai/docs/mastra-platform/observability)
- [Studio on Mastra platform](https://mastra.ai/docs/mastra-platform/studio)

---

## Source: Studio (`docs/mastra-platform/studio`)

Canonical URL: `https://mastra.ai/docs/mastra-platform/studio.md`

## Studio on Mastra platform

Studio on Mastra platform is a hosted visual workspace for testing agents and running workflows, plus inspecting traces. Use it when you want to share Studio with your team without hosting the Studio UI yourself.

You can deploy Studio from the CLI as shown below, or link a GitHub repository for push-to-deploy. See the [GitHub integration](https://mastra.ai/docs/mastra-platform/github) for the repository-linked flow.

### Quickstart

1. Follow the [get started guide](https://mastra.ai/docs) to create your first Mastra project.

2. Install the `mastra` CLI globally:

   **npm**:

   ```bash
   npm install -g mastra
   ```

   **pnpm**:

   ```bash
   pnpm add -g mastra
   ```

   **Yarn**:

   ```bash
   yarn global add mastra
   ```

   **Bun**:

   ```bash
   bun add --global mastra
   ```

3. Deploy Studio with a single command:

   ```bash
   mastra deploy
   ```

   On a successful deploy, the CLI outputs the URL of your deployed Studio instance.

On your first deploy, the CLI prompts you to create a new project or select an existing one. It then creates a `.mastra-project.json` file in your project directory. This file links your local project to a platform project. It contains the `projectId`, `projectName`, and `organizationId`. Commit this file to your repository so CI/CD knows which project to deploy to.

### How deploy works

The `mastra deploy` command builds your project and compiles `src/mastra/` into `.mastra/output`. It packages that output as an artifact ZIP, then uploads and deploys it to a cloud sandbox.

A deploy transitions through **queued → uploading → starting → running** or **failed** if something goes wrong. If a sandbox is already running for your project, the platform updates it in place with no downtime. Otherwise, it creates a fresh sandbox. Your instance URL is assigned per project slug and remains stable across deploys.

See the [`mastra deploy` CLI reference](https://mastra.ai/reference/cli/mastra) for the full list of flags and CI/CD usage.

### Authentication

By default, every Studio deploy on Mastra platform is protected by platform auth. Members of your platform organization sign in with their platform account, and no one else can access the deployed Studio. You don't need to configure anything to get this behavior.

Platform auth applies to the Studio UI only. Your server's API routes are governed by your own [`server.auth`](https://mastra.ai/docs/studio/auth) configuration, or remain open if you haven't set one.

#### Roles and permissions

Platform auth maps your organization roles to Studio permissions:

| Platform role | Studio permissions |
| ------------- | ------------------ |
| `admin`       | Full access (`*`)  |
| `member`      | Read and execute   |
| `viewer`      | Read-only          |

To customize this mapping, set `roleMapping` on `studio.rbac` in your Mastra configuration. When present, your mapping replaces the platform defaults. See [Role-based access control](https://mastra.ai/docs/studio/auth) for the permission format.

#### Bring your own auth

To use your own auth provider for the deployed Studio instead of platform auth, set an environment variable on the project:

```bash
MASTRA_PLATFORM_STUDIO_AUTH=disabled
```

Add it to the env file you deploy with, or store it on the project through the dashboard, then redeploy. With platform auth disabled, the deploy leaves your auth and RBAC configuration untouched. Your own provider drives the Studio login flow, exactly like a self-hosted deploy. `studio.auth` protects the Studio UI, while `server.auth` protects your API routes. Studio requests fall back to `server.auth` when `studio.auth` isn't set.

> **Warning:** Disabling platform auth turns off platform account logins. If you disable it without configuring your own auth provider, the deployed Studio and all API routes are publicly accessible.

If you keep platform auth enabled and also configure your own `studio.auth`, both providers validate tokens, but the login screen only offers the platform sign-in flow. To sign in through your own provider, disable platform auth.

### Environment files

A local env file is optional. When a `.env` or `.env.*` file is present in the project directory, the deploy bundles its environment variables.

When multiple env files are present, the CLI prompts you to pick one. To select non-interactively, pass `--env-file`:

```bash
mastra deploy --env-file .env.production --yes
```

To run the same codebase across `production` and `staging`, use [`mastra deploy --env`](https://mastra.ai/docs/mastra-platform/deploy). See [Environments](https://mastra.ai/docs/mastra-platform/environments) for the full model.

### Create a new project non-interactively

On its first run, `mastra deploy` can create a project. When `--project <name>` doesn't match an existing project, the CLI treats the value as a new project name and creates it after confirmation. Add `--yes` to make this flow fully scriptable:

```bash
mastra deploy --project "my-new-project" --yes
```

Use this from CI or AI coding agents instead of `mastra studio projects create`, which is interactive only.

### Self-host Studio

To deploy Studio on your own infrastructure, see [Studio deployment](https://mastra.ai/docs/studio/deployment).

### Related

- [`mastra deploy`](https://mastra.ai/reference/cli/mastra)

---

## Source: Server (`docs/mastra-platform/server`)

Canonical URL: `https://mastra.ai/docs/mastra-platform/server.md`

## Server on Mastra platform

Server on Mastra platform is a production deployment target that runs your Mastra application as an API server. Use it when you want the platform to build, deploy, host, and manage your Mastra server.

You get a stable API endpoint with environment variable management and custom domain support, plus deploy history out of the box.

> **Note:** Server deploy provisions hosted storage automatically. If you override storage with [LibSQLStore](https://mastra.ai/integrations/databases/libsql) and a file URL, switch to a remotely hosted database because Mastra platform uses an ephemeral filesystem.

### Quickstart

1. Follow the [get started guide](https://mastra.ai/docs) to create your first Mastra project.

2. Install the `mastra` CLI globally:

   **npm**:

   ```bash
   npm install -g mastra
   ```

   **pnpm**:

   ```bash
   pnpm add -g mastra
   ```

   **Yarn**:

   ```bash
   yarn global add mastra
   ```

   **Bun**:

   ```bash
   bun add --global mastra
   ```

3. Deploy your project:

   ```bash
   mastra deploy
   ```

   If you're not already authenticated, the CLI prompts you to log in. It stores your credentials locally and any subsequent CLI commands use these credentials.

   The command runs `mastra build` and uploads its artifact, then builds and deploys a Docker image. On first deploy, the CLI creates a `.mastra-project.json` file linking your local project to the platform. Commit this file so subsequent deploys and CI/CD target the same project.

   > **Note:** Environment variables from `.env`, `.env.local`, and `.env.production` are included automatically. On the first deploy, these seed the project if no env vars are set yet. After that, manage env vars through the web dashboard. Review and sanitize these files before first deploy to avoid uploading development-only or personal secrets.

   See the [CLI reference](https://mastra.ai/reference/cli/mastra) for the full list of flags.

4. Verify your deployment at the URL printed by the CLI. Append `/api/agents` to confirm it returns a JSON list of your agents.

   > **Warning:** Set up [authentication](https://mastra.ai/docs/auth/overview) before exposing your endpoints publicly.

### Deploy lifecycle

Each project runs one build at a time as its deploy transitions through **queued → uploading → building → deploying → running** (or **failed**, **cancelled**, **crashed**, or **stopped**). When multiple deploys queue up, the latest proceeds and the rest are cancelled. Builds running longer than 15 minutes are automatically failed. The first deploy provisions infrastructure and seeds environment variables from your local `.env`. Your server URL remains stable across deploys.

### Idle behavior

Server on Mastra platform can sleep a service after a period of inactivity to save resources. Inactivity is measured by outbound network traffic. A service is considered idle only after roughly 10 minutes with no outbound packets. Any recurring outbound traffic resets this timer and keeps the service awake.

A server that never sleeps usually has a background task or a long-lived connection sending traffic on a timer. Check for the following common causes.

#### Persistent database connections

A database client that stays open keeps the connection alive even when the server is idle. Many drivers also run a background health check that pings the database on an interval, which counts as outbound traffic. For example, a MongoDB client that's never closed keeps a monitoring socket open and sends a heartbeat about every 10 seconds.

Connection pool settings that drain idle connections aren't enough on their own, because the driver's monitoring connection stays open and keeps pinging. To let the server sleep, close the client after a period of inactivity and reconnect on the next request.

> **Note:** Closing the client adds a short reconnect delay to the first request after the server wakes. If your workload can't tolerate that delay, keep the connection open and don't rely on idle sleep.

#### Scheduled tasks and timers

A `setInterval`, cron job, or polling loop that makes network calls keeps the server awake. If you need scheduled work, run it as a separate service or use an external scheduler that wakes the server with a request.

#### External pings and keep-alive checks

An uptime monitor, health check, or keep-alive ping that hits the server on an interval resets the idle timer. Remove these checks or increase their interval beyond the idle window if you want the server to sleep.

#### Observability exporters

An exporter that streams traces, logs, or metrics to a remote endpoint sends outbound traffic. Confirm the exporter batches and stops sending when the server is idle, rather than flushing on a fixed interval.

#### Long-lived streams

An open server-sent events (SSE) stream, WebSocket, or other long-lived connection holds traffic open until it closes. A streaming response that stays subscribed in the background keeps the connection active. Confirm streams close when the client disconnects and that no stream stays open while the server is otherwise idle.

#### Chat integrations

Some chat integrations hold a persistent connection and send a regular heartbeat, which keeps the server awake. For example, a Slack app in Socket Mode opens a WebSocket and pings about every 30 seconds, and a Discord bot keeps its gateway WebSocket open with a heartbeat on a timer. Both the open socket and the heartbeat prevent idle.

If you want the server to sleep, receive events over HTTP webhooks instead of a persistent connection where the integration supports it. Slack apps, for example, can use the Events API with a request URL instead of Socket Mode. If your app needs a persistent connection, keep the service running with the **Persistent Server add-on** described below.

#### Inspect active connections

To find what keeps the server awake, inspect the process's active handles during idle periods. A handle that remains after all requests finish is the cause to investigate. Open sockets point to a persistent connection that needs to close, and active timers point to a `setInterval` or self-rescheduling `setTimeout`.

Drop the following helper into your app, then watch the log after traffic stops. Anything still listed once the server is idle is keeping it awake:

```typescript
export function logActiveHandles() {
  // process._getActiveHandles is undocumented but useful for diagnosis.
  const handles = (process as any)._getActiveHandles() as Array<any>

  const summary = handles.map(handle => {
    const type = handle?.constructor?.name ?? typeof handle
    if (type === 'Socket') {
      return `Socket -> ${handle.remoteAddress}:${handle.remotePort}`
    }
    return type
  })

  console.log(`[idle] ${handles.length} active handles:`, summary)
}

// Log every 30 seconds so you can see what persists while the server is idle.
setInterval(logActiveHandles, 30_000).unref()
```

Call `unref()` on the diagnostic interval so the helper itself doesn't keep the server awake.

#### Keep a service running

Some applications actually need the connections or tasks described above, such as a persistent database connection for low first-request latency, a background scheduler, or a long-lived stream. If your app requires any of these, don't force the service to sleep. Use the **Persistent Server add-on** to keep the service running continuously instead.

With the **Persistent Server add-on** enabled, the service stays awake even with no traffic, so persistent connections, scheduled tasks, and open streams keep working without being interrupted by idle sleep.

### CI/CD

Automate deployments from GitHub Actions, GitLab CI, or any CI provider. After your first interactive deploy, CI/CD needs two things: an API token and the `.mastra-project.json` file committed to your repository.

> **Tip:** If your code lives on GitHub, the [GitHub integration](https://mastra.ai/docs/mastra-platform/github) gives you push-to-deploy without writing a workflow file. Use the CLI-based CI/CD flow below when you need GitLab, another CI provider, or custom build steps before deploy.

#### Create an API token

1. Run the following command locally:

   ```bash
   mastra auth tokens create ci-deploy
   ```

   The CLI prints the token once. Copy it immediately because it can't be retrieved again.

2. Add the token as a secret in your CI provider. In GitHub Actions, go to **Settings → Secrets and variables → Actions** and create the `MASTRA_API_TOKEN` secret.

3. Ensure your `.mastra-project.json` file is committed to the repository. The CLI reads the `organizationId` and `projectId` from this file to target the correct project during CI deploys.

#### The `--yes` flag

Pass `--yes` (or `-y`) to skip all confirmation prompts. Without it, the CLI waits for interactive input and your CI job hangs.

```bash
mastra deploy --yes
```

#### GitHub Actions

The following workflow deploys on every push to `main`:

```yaml
name: Deploy to Mastra platform

on:
  push:
    branches: [main]
    paths: ['src/mastra/**']

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - name: Install dependencies
        run: npm install
      - name: Deploy to Mastra platform
        run: npx mastra deploy --yes
        env:
          MASTRA_API_TOKEN: ${{ secrets.MASTRA_API_TOKEN }}
```

Adjust the `paths` filter and `working-directory` if your Mastra project is in a subdirectory (e.g. a monorepo).

#### GitLab CI

The following pipeline deploys on pushes to `main`:

```yaml
deploy:
  image: node:22
  stage: deploy
  only:
    - main
  before_script:
    - npm install
  script:
    - npx mastra deploy --yes
```

Add `MASTRA_API_TOKEN` as a CI/CD variable in **Settings → CI/CD → Variables**.

#### Other CI providers

Any CI system that runs Node.js and shell commands works with Mastra:

1. Install dependencies.
2. Set `MASTRA_API_TOKEN` as an environment variable.
3. Run `mastra deploy --yes`.

#### Verify the deploy

After the workflow completes, verify the deployment by hitting the health endpoint:

```bash
curl -f https://<your-project>.server.mastra.cloud/health
```

Or check the agents endpoint, which returns a JSON list of your agents:

```bash
curl -f https://<your-project>.server.mastra.cloud/api/agents
```

The following example adds a verification step to a GitHub Actions workflow:

```yaml
- name: Verify deployment
  run: |
    sleep 30
    curl -f https://<your-project>.server.mastra.cloud/health
```

#### Override project config with environment variables

The CLI reads `organizationId` and `projectId` from `.mastra-project.json` by default. To override these values (e.g. deploying to a different project from the same repository), set the following environment variables:

| Variable            | Description                                                |
| ------------------- | ---------------------------------------------------------- |
| `MASTRA_ORG_ID`     | Overrides the organization ID from `.mastra-project.json`. |
| `MASTRA_PROJECT_ID` | Overrides the project ID from `.mastra-project.json`.      |

### Related

- [`mastra deploy`](https://mastra.ai/reference/cli/mastra)
- [`mastra server pause`](https://mastra.ai/reference/cli/mastra)
- [`mastra server restart`](https://mastra.ai/reference/cli/mastra)
- [`mastra auth tokens`](https://mastra.ai/reference/cli/mastra)

---

## Source: GitHub integration (`docs/mastra-platform/github`)

Canonical URL: `https://mastra.ai/docs/mastra-platform/github.md`

## GitHub integration on Mastra platform

The GitHub integration links a Mastra platform project to a GitHub repository. When you push changes to your repository Studio and Server will automatically be deployed.

> **Note:** The integration only works with repositories hosted on GitHub.com. Self-hosted GitHub Enterprise instances aren't currently supported.

After a repository is linked, the platform:

- Builds and deploys Studio and Server on every push to the configured branches.
- Provisions managed databases and the Gateway API key for projects created from a template.
- Surfaces commit, branch, and pull request context on each deploy.
- Reports build status back to GitHub as check runs and to the project dashboard with live status badges and inline logs.

### When to use the GitHub integration

Choose the GitHub integration when you want one of the following:

- Push-to-deploy from `main` or any other branch, including separate branches for Studio and Server.
- A managed onboarding flow that scaffolds a project from a Mastra template, including a fresh repository, managed database, and gateway API key.
- Pull-request and commit context inside the platform dashboard for triage.

The CLI flow (`mastra studio deploy` and `mastra server deploy`) is still available for ad-hoc deploys and CI providers other than GitHub. See [Studio](https://mastra.ai/docs/mastra-platform/studio) and [Server](https://mastra.ai/docs/mastra-platform/server) for the CLI-only path.

### Install the Mastra GitHub App

The integration is powered by the Mastra GitHub App.

The App reads repository contents and listens for `push` events on the configured branches. It writes deploy status back as check runs.

1. In the [Mastra platform dashboard](https://projects.mastra.ai), open your organization settings. The page includes a **GitHub App** section.

2. Select **Install GitHub App** and choose the GitHub account or organization to install on.

   If you don't own the GitHub organization, GitHub creates a pending **installation request** that an admin must approve. The dashboard tracks pending requests alongside completed installations.

3. Select the repositories the App can access. You can scope to specific repositories or grant access to all repositories on the account.

   You can revoke or change repository access at any time from GitHub's App settings.

> **Note:** If GitHub later updates the App's required permissions, the dashboard surfaces an **outdated permissions** warning with an approval link. Repository operations return a `403` until an admin re-approves.

#### Pending installation requests

When a non-admin requests the App on an organization, the request stays pending until an organization admin approves it on GitHub.com. The dashboard:

- Lists pending requests next to active installations.
- Lets the same user request access to multiple GitHub accounts at once.
- Reconciles pending state against GitHub when you open the page, removing requests an admin has declined or the requester has withdrawn.

To cancel a pending request, select **Cancel** next to it in the dashboard.

### Create a project from a template

Templates are the fastest way to get started. The platform creates a new repository from a Mastra template and links it to a fresh project. It then provisions any managed databases declared by the template and runs the first deploy.

1. In the dashboard, select **Create project** and choose **Start from a template**.

2. Pick a template and select the GitHub account that owns the new repository. Name the repository and choose whether it should be private.

3. Configure the template's managed database requirements. Templates can declare required databases (such as Turso or Neon) and you pick the provider and region per requirement.

4. Add any template-specific environment variables (for example, AI provider API keys). The platform seeds `MASTRA_GATEWAY_API_KEY` and `MASTRA_PLATFORM_ACCESS_TOKEN` automatically so that template code that talks to the Gateway works on the first deploy.

5. Select **Create project**. The platform creates the repository with a `.mastra-project.json` config file, provisions its managed databases, then triggers the initial Studio and Server deploys.

The initial deploy waits for managed databases to finish provisioning before it starts, so the template's first build sees the database connection environment variables.

### Link an existing repository

Use this flow when you already have a Mastra project in a GitHub repository.

1. In the dashboard, select **Create project** and choose **Connect an existing repository**, or open an existing project and select **Link repository** from the project settings.

2. Pick an installation, then choose the repository. Repository search works across every repository the App has access to on that installation.

3. Choose the Studio and Server deploy branches. Both targets default to the repository's default branch, and they can share a branch or use different branches.

   You can disable Studio or Server for the project. The manual **Deploy from GitHub** drawer selects both targets by default when both are configured.

4. Select **Link repository**. The platform validates that the repository doesn't already have a `.mastra-project.json` file pointing at a different project. If it does, the dashboard warns you and offers an **Overwrite** option that replaces the file on link.

After linking, the next push to the configured branch triggers a deploy.

#### `.mastra-project.json` conflicts

The platform writes a `.mastra-project.json` file into every linked repository to identify the project. When you link a repository that already has one of these files, the dashboard checks its contents before submitting:

- **Missing**: The platform creates the file on link.
- **Matching**: The file already points at the project you're linking, so no change is needed.
- **Conflicting**: The file points at a different project. You can cancel or explicitly overwrite the file.

See [Configuration](https://mastra.ai/docs/mastra-platform/configuration) for the file's schema.

### Push-to-deploy

After a repository is linked, every push to a configured branch triggers a deploy:

- A push to the **Studio branch** triggers a Studio deploy.
- A push to the **Server branch** triggers a Server deploy.
- If both targets share a branch, one push triggers both deploys in parallel.

Each deploy carries the commit SHA, branch, and (when available) the pull request number that introduced the commit. Builds run inside the platform and report status back to GitHub as check runs on the commit.

Only one build per deploy target runs at a time. If a new push arrives while a build is in progress, the platform cancels older queued builds for that same target and runs the latest. Studio and Server builds are tracked independently, so they can run in parallel when both targets are configured.

#### Manual GitHub deploys

You can also trigger a deploy from the dashboard without pushing. Open the project and select **Deploy from GitHub**. Choose the target (Studio, Server, or both) together with a branch, then submit. The platform runs the deploy against the head commit of that branch and records the trigger as a **GitHub Workflow** deploy.

### Track deploys

After a project is created from a template or linked to a repository, the **Setup** page shows one row per deploy target. Each row:

- Displays a live status badge that polls the deploy until it finishes.
- Links to the deploy detail page via the deploy ID.
- Exposes a **Show logs** toggle that streams build and runtime logs inline. Server logs poll every three seconds while the deploy is active.

### Permissions and revocation

To stop deploys from a repository, do one of the following:

- **Unlink the repository** from the project in **Project settings → Repository**. The project keeps its history and you can re-link a different repository later.
- **Remove repository access** for the Mastra GitHub App on GitHub.com. Existing deploys keep running, but no new push triggers a deploy.
- **Uninstall the GitHub App** from the GitHub account. This removes access to every repository on that account.

If GitHub revokes or rotates the App's installation token, repository reads return a `github_app_permissions_outdated` error and the dashboard prompts an admin to re-approve permissions.

### Related

- [Mastra platform overview](https://mastra.ai/docs/mastra-platform/overview)
- [Studio on Mastra platform](https://mastra.ai/docs/mastra-platform/studio)
- [Server on Mastra platform](https://mastra.ai/docs/mastra-platform/server)
- [Configuration](https://mastra.ai/docs/mastra-platform/configuration)

---

## Source: Hosted databases (`docs/mastra-platform/database`)

Canonical URL: `https://mastra.ai/docs/mastra-platform/database.md`

## Hosted databases

Provision a fully managed database from the CLI or your [platform](https://mastra.ai/docs/mastra-platform/overview) project settings and attach it to your project. Mastra creates it with your provider and stores credentials securely, plus injects connection details as runtime environment variables when the database is ready, so there are no connection strings to copy or configure.

```bash
mastra env db create --kind turso
```

### When to use hosted databases

Use a hosted database when your project needs durable storage that's managed by the platform, including:

- **Agent memory**: Persist conversation history and working memory, plus semantic recall across sessions.
- **Application data**: Store and retrieve relational or structured data your project needs at runtime.
- **Vector search**: Store embeddings for Retrieval-Augmented Generation and semantic search.

### Providers

Hosted databases are available through three providers today: Turso, Neon, and Postgres, with MongoDB coming soon. Pick one when you attach a database, then wire its injected variables into the matching Mastra storage adapter in your code.

Each provider injects a fixed set of variable names, for example, a single `DATABASE_URL` for both Neon and Postgres and separate `TURSO_*` variables for Turso. Those names must be unique within each environment, so a single environment can use at most one database per variable name. Because Neon and Postgres both inject `DATABASE_URL`, they're mutually exclusive within the same environment. Turso can be attached alongside either one.

For most agent-focused projects, **Turso** is the simplest starting point. It provides a lightweight, SQLite-compatible engine well suited to agent memory, conversation history, and per-tenant isolation. Choose **Neon** when you want a public, serverless Postgres you can reach from your laptop, other services, or a migration tool. Choose **Postgres** when your workload needs to stay on your deployment's private network: it runs alongside your server and is only reachable from it. **MongoDB** (_coming soon_) will add document storage and built-in vector search for workloads that don't map cleanly to SQL.

| Provider     | Engine                             | Network       | Best for                                                                 |
| ------------ | ---------------------------------- | ------------- | ------------------------------------------------------------------------ |
| **Turso**    | LibSQL, SQLite-compatible          | Public        | Agent memory, per-tenant isolation                                       |
| **Neon**     | Serverless Postgres with branching | Public        | Relational workloads reachable from outside your deployment              |
| **Postgres** | Managed PostgreSQL                 | VPC (private) | Relational workloads that must stay on your deployment's private network |
| **MongoDB**  | Document and vector search         | _TBD_         | Document storage, vector search (_coming soon_)                          |

### Database scope

A database is attached at one of two scopes:

- **Environment scope**: The default. Attached to a single environment so data stays isolated between environments (for example separate production and staging databases). When your project has one environment, `mastra env db create` picks it automatically; with several, the CLI prompts you to select one.
- **Project scope**: One database shared by all of the project's [environments](https://mastra.ai/docs/mastra-platform/environments). Opt in with `--shared`. Its variables are injected into every deploy.

The scope is set when you attach the database and shown in `mastra env db list`.

The scopes can't overlap for the same provider. Because a project-scoped database already injects its variables into every environment, attaching an environment-scoped database of the same provider is rejected with a variable name conflict. To move from a shared database to per-environment databases, delete the project-scoped database first, then attach one database per environment. Deleting a database destroys it with the provider along with all of its data, export anything you need to keep before switching scopes. Environment-scoped databases on different environments never conflict, each deploy only receives the variables for its own environment.

### Attach with the CLI

You don't have to run this command up front. If your project needs a hosted database but doesn't have one yet, `mastra deploy` offers to attach one for you when the deploy preflight check runs. Say yes and the deploy continues without leaving the CLI. When both Neon and Postgres are available for your organization and the missing variable is `DATABASE_URL`, the prompt lets you choose which one to provision.

Alternatively, create and attach a database ahead of time. The CLI polls until it's ready, which takes a few seconds:

```bash
# Scoped to a single environment (the CLI picks the only one, or prompts if there are several)
mastra env db create --kind turso

# Scoped to a specific environment
mastra env db create staging --kind turso

# Shared by all environments
mastra env db create --kind turso --shared
```

Supported kinds are `turso`, `neon` (public serverless Postgres), and `postgres` (VPC-isolated Postgres). Useful flags:

- `--shared`: Attach a project-scoped database shared by every environment. Can't be combined with an environment argument.
- `--name <name>`: Database name. Defaults to a name derived from the project slug.
- `--region <region>`: Provider region ID for project-scoped databases (for example `fra`). Environment-scoped databases are placed near the environment's region automatically, and an explicit `--region` is ignored.
- `--no-wait`: Return immediately instead of polling. Check progress later with `mastra env db show`.
- `--json`: Machine-readable output. When the project has multiple environments, `--json` requires an environment argument or `--shared` (no interactive prompt).

Inspect and manage attached databases:

```bash
mastra env db list
mastra env db show <database>
mastra env db delete <database>
```

`mastra env db list` shows each database's kind, status, scope, and injected variable names. `mastra env db show` prints connection instructions with secret values masked. Pass `--show-secrets` to reveal them. `mastra env db delete` permanently deletes the database and all of its data with the provider. Creating and deleting databases requires the admin role in your organization.

### Attach from project settings

1. Open your project in the [platform](https://mastra.ai/docs/mastra-platform/overview) and go to **Project Settings**.

2. Open the **Database** section, then select **Add database**.

3. Select a **provider** (Turso, Neon, or Postgres). You can switch providers before attaching.

4. Configure the database:

   - **Name**: A label for the database within your project.
   - **Region**: Where the database is hosted. Select the region closest to your users. Turso defaults to `sjc` (San Jose) and is available in 20+ locations worldwide. Neon defaults to `aws-us-west-2` and is available across AWS and Azure regions in the US, EU, and APAC. Postgres runs on the same private network as your deployment. Its region follows the environment's Railway region (US, EU, or APAC).

5. Select **Attach database**. Provisioning runs in the background. The database starts in a `provisioning` state and moves to `ready` once the provider finishes setup. Connection details are injected into your project as server runtime environment variables automatically.

Databases attached from project settings are project-scoped. Use the [CLI](#attach-with-the-cli) to attach an environment-scoped database.

### Connect from your code

Check the database status in **Project Settings → Database**. An attached database shows `provisioning` while setup runs in the background. Once it's `ready`, the platform has injected its connection details as managed environment variables.

Open a `ready` database to view those variables and a code snippet. Use the variables to configure a Mastra storage adapter, as shown below.

#### Turso (LibSQL)

Turso exposes two environment variables: `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`. The following example connects a [LibSQLStore](https://mastra.ai/integrations/databases/libsql) using those variables.

```ts
import { LibSQLStore } from '@mastra/libsql'

export const storage = new LibSQLStore({
  id: 'mastra-storage',
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
})
```

Install the adapter:

**npm**:

```bash
npm install @mastra/libsql@latest
```

**pnpm**:

```bash
pnpm add @mastra/libsql@latest
```

**Yarn**:

```bash
yarn add @mastra/libsql@latest
```

**Bun**:

```bash
bun add @mastra/libsql@latest
```

#### Neon and Postgres

Neon (public serverless) and Postgres (VPC-isolated) both expose a single `DATABASE_URL` connection string, so the same [PostgresStore](https://mastra.ai/integrations/databases/postgresql) code works for either. An environment can have one or the other, not both.

```ts
import { PostgresStore } from '@mastra/pg'

export const storage = new PostgresStore({
  connectionString: process.env.DATABASE_URL!,
})
```

Install the adapter:

**npm**:

```bash
npm install @mastra/pg@latest
```

**pnpm**:

```bash
pnpm add @mastra/pg@latest
```

**Yarn**:

```bash
yarn add @mastra/pg@latest
```

**Bun**:

```bash
bun add @mastra/pg@latest
```

The VPC-isolated Postgres is only reachable from the deployed server, so local development can't connect to it directly. Point `DATABASE_URL` at a local Postgres (or a Neon branch) during development, then let the platform inject the managed value at deploy time.

Pass the `storage` instance to your `Mastra` configuration so agents, memory, and workflows can use it:

```ts
import { Mastra } from '@mastra/core'
import { storage } from './storage'

export const mastra = new Mastra({
  storage,
})
```

### Environment variables

Each provider injects a fixed set of managed environment variables. These are available to your project at runtime when the database is `ready`. You don't define them yourself.

| Provider | Variables                                |
| -------- | ---------------------------------------- |
| Turso    | `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` |
| Neon     | `DATABASE_URL`                           |
| Postgres | `DATABASE_URL`                           |

> **Warning:** Treat connection credentials as secrets. The auth token (`TURSO_AUTH_TOKEN`) and the Postgres connection string (`DATABASE_URL`) grant full access to your data. The platform masks them by default and only reveals them on request.

### Manage a database

- **View connection details**: Open a `ready` database in your project settings to see its environment variables and a copy-pasteable code snippet.
- **Delete**: Removing a database from a project deletes it with the provider and clears its injected environment variables. This is irreversible, so ensure you no longer need the data.

---

## Source: Workspaces (`docs/mastra-platform/workspaces`)

Canonical URL: `https://mastra.ai/docs/mastra-platform/workspaces.md`

## Workspaces

A workspace is a set of runtime resources the Mastra platform provisions and hands to your agents at deploy time. Each environment gets its own workspace so `production` and `staging` stay isolated.

Every workspace exposes two capabilities:

- One **bucket** for filesystem storage, wrapped by [`PlatformFilesystem`](https://mastra.ai/reference/workspace/platform-filesystem). The bucket is a durable, environment-scoped store agents read from and write to across runs.
- A pool of **on-demand sandboxes** for command execution, wrapped by [`PlatformSandbox`](https://mastra.ai/reference/workspace/platform-sandbox). Each `PlatformSandbox` instance provisions its own remote sandbox on `start()` and destroys it on `destroy()`. Agents typically spin up many sandboxes per session, use them for a task, and let them go.

Workspaces are scoped to a single [environment](https://mastra.ai/docs/mastra-platform/environments), so `production` and `staging` don't share buckets or sandbox pools. The platform manages provisioning, authentication, and idle cleanup.

### When workspaces are provisioned

New projects have workspaces enabled by default. When you create an environment, the platform provisions a bucket for it automatically. The sandbox base image is warmed in the background so the first `PlatformSandbox` call starts quickly.

Existing projects that haven't opted in show an **Enable workspaces** action in the Workspaces tab. Enabling provisions a bucket for every environment on the project.

If provisioning fails for an environment, for example while the sandbox provider is under load, the Workspaces tab shows the failure and offers a retry. The environment itself is still created. Only the workspace is unavailable until you retry.

### Use the workspace from your code

Install the provider package:

**npm**:

```bash
npm install @mastra/platform-workspace
```

**pnpm**:

```bash
pnpm add @mastra/platform-workspace
```

**Yarn**:

```bash
yarn add @mastra/platform-workspace
```

**Bun**:

```bash
bun add @mastra/platform-workspace
```

Compose the providers into a workspace and register it with Mastra:

```typescript
import { Workspace } from '@mastra/core/workspace'
import { PlatformFilesystem, PlatformSandbox } from '@mastra/platform-workspace'

export const workspace = new Workspace({
  filesystem: new PlatformFilesystem(),
  sandbox: new PlatformSandbox(),
})
```

```typescript
import { Mastra } from '@mastra/core'
import { workspace } from './workspace'

export const mastra = new Mastra({
  workspace,
})
```

`PlatformFilesystem` and `PlatformSandbox` read their configuration from environment variables, so you don't pass any options on the platform. The platform injects them at deploy time. See [Environment variables](#environment-variables).

### One bucket, many sandboxes

`PlatformFilesystem` and `PlatformSandbox` have different lifecycles, which matters when you design agents.

**`PlatformFilesystem` is a long-lived handle to the environment's bucket.** All requests and agents that use this provider read and write the same object storage. Anything an agent writes is visible on the next request unless you explicitly delete it.

**`PlatformSandbox` is a client for provisioning ephemeral sandboxes.** Each `PlatformSandbox` instance owns one remote sandbox:

- `start()` provisions a fresh sandbox (or reattaches when you passed `sandboxId`).
- `executeCommand()` runs commands against it.
- `stop()` releases this process's lease without touching the remote sandbox. The VM keeps running under the environment's idle policy, and a later `start()` with the same `id` or `sandboxId` reattaches to it.
- `destroy()` releases the VM. On Railway, it also deletes the recovery checkpoint associated with a caller-supplied recovery `id`. On E2B, it only kills the VM, and any snapshot you captured remains yours to manage.

A statically configured `PlatformSandbox` is shared across every request and agent using that configuration rather than creating separate sandboxes for requests or memory threads. `PlatformFilesystem` is also a separate provider: configuring both providers doesn't mount the environment bucket inside the sandbox.

When your agent needs another isolated environment, for example a per-task sandbox, a per-user tenant, or a background job that shouldn't touch shared shell state, construct another `PlatformSandbox`:

```typescript
import { PlatformSandbox } from '@mastra/platform-workspace'

export async function runInFreshSandbox(command: string) {
  const sandbox = new PlatformSandbox()
  await sandbox.start()
  try {
    return await sandbox.executeCommand(command)
  } finally {
    await sandbox.destroy()
  }
}
```

Or clone a configured sandbox as the template for a fleet. The clones inherit credentials, environment, network isolation, and defaults without repeating them:

```typescript
const template = new PlatformSandbox({ networkIsolation: 'PRIVATE' })

const perProjectSandbox = template.clone({ id: `project-${projectId}` })
await perProjectSandbox.start()
```

See [`PlatformSandbox` reference](https://mastra.ai/reference/workspace/platform-sandbox) for the full lifecycle, checkpoint recovery, reattachment, and clone options.

### Environment variables

Every deploy that runs on a platform environment with a workspace receives these variables automatically:

| Variable                       | Contents                                                                                                                                        |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `MASTRA_PLATFORM_ACCESS_TOKEN` | Platform-issued JSON Web Token (JWT) the workspace providers use to authenticate. The token is scoped to the deploy's organization and project. |
| `MASTRA_PROJECT_ID`            | Project the deploy belongs to.                                                                                                                  |
| `MASTRA_ENVIRONMENT_ID`        | Environment the deploy belongs to. Selects which sandbox pool the platform uses.                                                                |
| `MASTRA_PLATFORM_BUCKET_NAME`  | Bucket name attached to the environment. Selects which bucket `PlatformFilesystem` reads and writes.                                            |

These names are reserved. If your project sets any of them explicitly, the platform-managed values take precedence.

### Local development

Reuse the same providers locally by putting the four variables in your `.env` file. Get the project, environment, and bucket values from your project's **Workspaces** tab. For `MASTRA_PLATFORM_ACCESS_TOKEN`, create an `sk_` API token on your organization's settings page under **API Tokens**. Platform deploys use an injected JWT instead.

```bash
MASTRA_PLATFORM_ACCESS_TOKEN=sk_your-api-token
MASTRA_PROJECT_ID=your-project-id
MASTRA_ENVIRONMENT_ID=your-environment-id
MASTRA_PLATFORM_BUCKET_NAME=your-bucket-name
```

`PlatformFilesystem` and `PlatformSandbox` behave the same locally as on the platform, they connect to the same bucket and sandbox pool for that environment. Use a `staging` or `preview` environment's variables for local runs if you want to keep production data isolated.

For a purely offline loop that never touches the platform, swap the providers for [`LocalFilesystem`](https://mastra.ai/reference/workspace/local-filesystem) and [`LocalSandbox`](https://mastra.ai/reference/workspace/local-sandbox) in a local build.

### Inspect the workspace

The Workspaces tab in your platform project shows, per environment:

- Bucket status and its contents, with upload, download, and delete actions.
- Recent sandbox sessions with their command, exit code, and duration.
- Provisioning failures with a **Retry** action.

### See also

- [`PlatformFilesystem`](https://mastra.ai/reference/workspace/platform-filesystem): reference for the filesystem provider.
- [`PlatformSandbox`](https://mastra.ai/reference/workspace/platform-sandbox): reference for the sandbox provider, including checkpoint recovery and cloning.
- [Environments](https://mastra.ai/docs/mastra-platform/environments): how environments scope workspaces, variables, and databases.

---

## Source: Configuration (`docs/mastra-platform/configuration`)

Canonical URL: `https://mastra.ai/docs/mastra-platform/configuration.md`

## Configuration

When you deploy to the Mastra platform, the CLI generates a `.mastra-project.json` config file and resolves environment variables from the platform and, optionally, your local `.env` files.

This page explains both mechanisms.

### Project config

The `.mastra-project.json` file is auto-generated on your first [`mastra deploy`](https://mastra.ai/docs/mastra-platform/deploy). It links your local project to a platform project. The [GitHub integration](https://mastra.ai/docs/mastra-platform/github) writes the same file into linked repositories.

Commit it to your version control so that subsequent deploys (including from CI) target the correct project.

Your file will look something like this:

```json
{
  "projectId": "06daaac4-89b1-40f0-9e3f-0993e039a627",
  "projectName": "my-project",
  "organizationId": "org_01KNA5YSP52SX4M6YVSXC2MAHP"
}
```

| Field          | Description                                                                                          |
| -------------- | ---------------------------------------------------------------------------------------------------- |
| projectId      | UUID for the project. Assigned when the project is created.                                          |
| projectName    | Human-readable project name. Used as a display label in the dashboard and CLI output.                |
| organizationId | The organization that owns the project. All deploys, API keys, and resources are scoped to this org. |

### Environment variables

A local env file is optional. [`mastra deploy`](https://mastra.ai/docs/mastra-platform/deploy) resolves variables from three sources:

- **Managed variables**: Injected by platform resources like [hosted databases](https://mastra.ai/docs/mastra-platform/database). The platform defines these, and you can't edit them.
- **Stored variables**: Saved on the project or environment through the dashboard. Used as-is on every deploy with no local file needed.
- **Local env files**: Deployments layer one local env file on top: the `--env-file` you pass, `.env.<environment>` when you deploy with `--env`, or the only `.env*` file in the project. If several exist, the CLI asks you to choose one. Variables from different local files aren't merged.

To pin the deploy to a specific env file instead of relying on the default selection, pass `--env-file`:

```bash
mastra deploy --env-file .env.production --yes
```

Review and sanitize local env files before deploying to avoid uploading development-only or personal secrets.

#### Observability

The following environment variables configure the Observability product on the Mastra platform.

| Variable                                 | Description                                                                                                                                                                                                                                                             |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MASTRA_PLATFORM_ACCESS_TOKEN`           | Org-scoped access token. The CLI writes this during observability provisioning and uses it for platform authentication.                                                                                                                                                 |
| `MASTRA_PROJECT_ID`                      | UUID of the platform project. `MastraPlatformExporter` uses it to link observability data to the platform project. Studio and Server deploys read the project ID from `.mastra-project.json`.                                                                           |
| `MASTRA_PLATFORM_OBSERVABILITY_ENDPOINT` | Optional observability endpoint override for `MastraPlatformExporter` and Studio. Set it to your region's collector, for example `https://observability.eu.mastra.ai`, when your project isn't in the default US region. Defaults to `https://observability.mastra.ai`. |
| `MASTRA_ORG_ID`                          | Overrides the active organization for CLI commands. You can also set it with the `--org` flag on supported commands.                                                                                                                                                    |

`MastraPlatformExporter` reads `MASTRA_PLATFORM_ACCESS_TOKEN` to authenticate platform export.

### Multiple environments

A single project runs the same codebase across multiple [environments](https://mastra.ai/docs/mastra-platform/environments), such as `production` and `staging`. Each environment has its own URL and its own stored variables, plus its own deploy history. One `.mastra-project.json` file covers all of them:

```bash
mastra deploy --env production --yes
mastra deploy --env staging --env-file .env.staging --yes
```

> **Note:** Earlier platform versions required one project per environment. Environments replace that pattern, so keep one project and deploy to environments instead.

---

## Source: API Reference (`docs/mastra-platform/api`)

Canonical URL: `https://mastra.ai/docs/mastra-platform/api.md`

## API reference

### Members API

The root URL for the endpoints below is: `/v1/org/members`

| Method | Endpoint           | Description          |
| ------ | ------------------ | -------------------- |
| GET    | `/`                | List members         |
| POST   | `/invitations`     | Send an invitation   |
| GET    | `/invitations`     | List invitations     |
| DELETE | `/invitations/:id` | Revoke an invitation |
| PATCH  | `/:id`             | Update member role   |
| DELETE | `/:id`             | Remove a member      |

### API tokens

The root URL for the endpoints below is: `/v1/auth/tokens`

| Method | Endpoint | Description         |
| ------ | -------- | ------------------- |
| POST   | `/`      | Create an API token |
| GET    | `/`      | List API tokens     |
| DELETE | `/:id`   | Delete an API token |

### Studio API

The root URL for the endpoints below is: `/v1/studio`

| Method | Endpoint                       | Description                    |
| ------ | ------------------------------ | ------------------------------ |
| GET    | `/projects`                    | List studio projects           |
| POST   | `/projects`                    | Create a project               |
| GET    | `/projects/:id`                | Get project detail and deploys |
| DELETE | `/projects/:id`                | Delete a project               |
| POST   | `/deploys`                     | Create a deploy                |
| POST   | `/deploys/:id/upload-complete` | Confirm artifact upload        |
| GET    | `/deploys/:id`                 | Get deploy status              |
| GET    | `/deploys/:id/logs`            | Get deploy logs                |
| GET    | `/deploys/:id/logs/stream`     | Stream deploy logs (SSE)       |

### Server API

The root URL for the endpoints below is: `/v1/server`

| Method | Endpoint                       | Description                           |
| ------ | ------------------------------ | ------------------------------------- |
| GET    | `/projects`                    | List server projects                  |
| POST   | `/projects`                    | Create a project                      |
| GET    | `/projects/:id`                | Get project detail                    |
| DELETE | `/projects/:id`                | Delete a project                      |
| PUT    | `/projects/:id/env`            | Set environment variables             |
| GET    | `/projects/:id/env`            | Get environment variables             |
| POST   | `/projects/:id/env/restart`    | Restart after env change              |
| GET    | `/projects/:id/domains`        | List domains                          |
| POST   | `/projects/:id/domains`        | Add a custom domain                   |
| GET    | `/projects/:id/runtime-logs`   | Get runtime logs                      |
| POST   | `/projects/:id/redeploy`       | Trigger redeploy                      |
| POST   | `/projects/:id/always-on`      | Enable always-on                      |
| DELETE | `/projects/:id/always-on`      | Disable always-on                     |
| POST   | `/deploys`                     | Create a deploy                       |
| POST   | `/deploys/:id/upload-complete` | Confirm artifact upload               |
| GET    | `/deploys/:id`                 | Get deploy status                     |
| GET    | `/deploys/:id/logs`            | Get deploy logs                       |
| POST   | `/deploys/:id/cancel`          | Cancel a queued or in-progress deploy |
| DELETE | `/deploys/:id`                 | Stop a running deploy                 |

### Gateway API

The root URL for the endpoints below is: `/v1/gateway`

| Method | Endpoint                                                      | Description                                 |
| ------ | ------------------------------------------------------------- | ------------------------------------------- |
| GET    | `/projects`                                                   | List gateway projects                       |
| GET    | `/projects/:id`                                               | Get project detail                          |
| PATCH  | `/projects/:id`                                               | Update project settings                     |
| DELETE | `/projects/:id`                                               | Delete a project                            |
| POST   | `/projects/provision`                                         | Provision a new gateway project             |
| GET    | `/projects/:id/keys`                                          | List API keys                               |
| POST   | `/projects/:id/keys`                                          | Create an API key                           |
| DELETE | `/projects/:id/keys/:keyId`                                   | Revoke an API key                           |
| GET    | `/projects/:id/keys/:keyId/bindings`                          | List key-level provider bindings            |
| POST   | `/projects/:id/keys/:keyId/bindings`                          | Add a key-level provider binding (BYOK)     |
| DELETE | `/projects/:id/keys/:keyId/bindings/:provider`                | Remove a key-level binding                  |
| GET    | `/projects/:id/bindings`                                      | List project-level provider bindings        |
| POST   | `/projects/:id/bindings`                                      | Add a project-level provider binding (BYOK) |
| DELETE | `/projects/:id/bindings/:provider`                            | Remove a project-level binding              |
| GET    | `/projects/:id/usage/has-activity`                            | Check whether project has any requests      |
| GET    | `/projects/:id/usage/activity`                                | Get aggregated usage activity               |
| GET    | `/projects/:id/usage/memory-activity`                         | Get memory-token totals over a time range   |
| GET    | `/projects/:id/usage/logs`                                    | Get request logs                            |
| GET    | `/projects/:id/usage/logs/facets`                             | Get log filter facets                       |
| GET    | `/projects/:id/usage/logs/:requestId`                         | Get specific request detail                 |
| GET    | `/projects/:id/memory/threads`                                | List threads (dashboard)                    |
| POST   | `/projects/:id/memory/threads`                                | Create a thread (dashboard)                 |
| GET    | `/projects/:id/memory/threads/:threadId`                      | Get thread (dashboard)                      |
| PATCH  | `/projects/:id/memory/threads/:threadId`                      | Update thread (dashboard)                   |
| DELETE | `/projects/:id/memory/threads/:threadId`                      | Delete thread (dashboard)                   |
| POST   | `/projects/:id/memory/threads/:threadId/clone`                | Clone thread (dashboard)                    |
| GET    | `/projects/:id/memory/threads/:threadId/messages`             | List messages (dashboard)                   |
| POST   | `/projects/:id/memory/threads/:threadId/messages`             | Save messages (dashboard)                   |
| DELETE | `/projects/:id/memory/threads/:threadId/messages`             | Delete messages (dashboard)                 |
| GET    | `/projects/:id/memory/threads/:threadId/observations/history` | Observation history (dashboard)             |
| GET    | `/models`                                                     | List available models                       |

### Feedback API

The Feedback API lists and analyzes feedback exported to Mastra Platform Observability. Because the API is unversioned, backwards compatibility isn't guaranteed. Rate limits, retention, and ingestion-to-query freshness aren't published contracts.

The endpoints share their query parameters, request bodies, and response types with the Mastra runtime feedback routes. See the [feedback reference](https://mastra.ai/reference/observability/feedback) for the full contract, including [list query parameters](https://mastra.ai/reference/observability/feedback) and [`FeedbackFilter`](https://mastra.ai/reference/observability/feedback).

Use the root URL for your environment's data-residency region:

| Region         | Root URL                                               |
| -------------- | ------------------------------------------------------ |
| United States  | `https://observability.mastra.ai/api/observability`    |
| European Union | `https://observability.eu.mastra.ai/api/observability` |

Telemetry stays in its residency region. Querying the other region returns no records for the environment. See [Observability co-location](https://mastra.ai/docs/mastra-platform/regions) for the environment-to-region mapping.

#### Authentication and project scope

Every request requires a platform access token. Create one in [Mastra Platform](https://projects.mastra.ai), or use the token written to `.env` during Platform setup.

Include `X-Mastra-Project-Id` to limit results to one project. If you omit it, the query covers feedback in every project available to the token's organization.

```bash
curl -sS "https://observability.mastra.ai/api/observability/feedback?page=0&perPage=20&feedbackType=rating" \
  -H "Authorization: Bearer $MASTRA_PLATFORM_ACCESS_TOKEN" \
  -H "X-Mastra-Project-Id: $MASTRA_PROJECT_ID" | jq
```

Use an organization-scoped Platform access token. Gateway inference keys such as `mk_*` keys aren't accepted. Queries remain constrained to the token's organization even when you supply a project ID.

#### Endpoints

| Method | Endpoint                | Description                  |
| ------ | ----------------------- | ---------------------------- |
| GET    | `/feedback`             | List feedback records        |
| POST   | `/feedback/aggregate`   | Return one aggregate value   |
| POST   | `/feedback/breakdown`   | Group feedback by dimensions |
| POST   | `/feedback/timeseries`  | Bucket feedback by interval  |
| POST   | `/feedback/percentiles` | Return percentile series     |

The list endpoint takes every [`FeedbackFilter`](https://mastra.ai/reference/observability/feedback) field as a query parameter with the same name, for example `traceId`, `spanId`, `feedbackType`, `feedbackSource`, `environment`, `entityName`, `experimentId`, or `tags`. Repeat a parameter for multiple values, such as `feedbackType=rating&feedbackType=thumbs`.

```bash
curl -sS "https://observability.mastra.ai/api/observability/feedback?traceId=trace-123&environment=production" \
  -H "Authorization: Bearer $MASTRA_PLATFORM_ACCESS_TOKEN" \
  -H "X-Mastra-Project-Id: $MASTRA_PROJECT_ID" | jq
```

| Parameter            | Description                                                       |
| -------------------- | ----------------------------------------------------------------- |
| `page`, `perPage`    | Zero-indexed page and page size (1 to 100). Default `0` and `10`. |
| `field`, `direction` | Sort by `timestamp` in `ASC` or `DESC` order. Default `DESC`.     |
| `mode=delta`         | Switch from paging to incremental delta polling.                  |
| `after`              | Delta cursor from the previous delta response. Delta mode only.   |
| `limit`              | Maximum updates per delta poll (1 to 100). Delta mode only.       |

Responses contain a `feedback` array and page or delta metadata. See [list query parameters](https://mastra.ai/reference/observability/feedback) in the feedback reference for the full parameter contract, including JSON-encoded object filters such as `timestamp`.

Analytics endpoints accept the same JSON request shapes and return types as the [feedback reference](https://mastra.ai/reference/observability/feedback). Analytics operate only on numeric feedback values.

```bash
curl -sS "https://observability.mastra.ai/api/observability/feedback/aggregate" \
  -X POST \
  -H "Authorization: Bearer $MASTRA_PLATFORM_ACCESS_TOKEN" \
  -H "X-Mastra-Project-Id: $MASTRA_PROJECT_ID" \
  -H "Content-Type: application/json" \
  --data '{"feedbackType":"rating","feedbackSource":"user","aggregation":"avg"}' | jq
```

The API returns `401` for invalid credentials, `403` for organization authorization failures, and `400` for malformed query arguments or JSON bodies.

Hosted observability doesn't provide a feedback creation route. Export feedback from the application as described in [Export feedback to Mastra Platform](https://mastra.ai/docs/observability/feedback).

### Metrics API

The Metrics API queries metrics exported to Mastra Platform Observability. Because the API is unversioned, backwards compatibility isn't guaranteed. Rate limits, retention, and ingestion-to-query freshness aren't published contracts.

The endpoints share their query parameters, request bodies, and response types with the Mastra runtime metric routes. See the [metric queries reference](https://mastra.ai/reference/observability/metrics/queries) for the full contract, including [shared filters](https://mastra.ai/reference/observability/metrics/queries), [analytics methods](https://mastra.ai/reference/observability/metrics/queries), and [metric discovery](https://mastra.ai/reference/observability/metrics/queries).

Use the root URL for your environment's data-residency region:

| Region         | Root URL                                               |
| -------------- | ------------------------------------------------------ |
| United States  | `https://observability.mastra.ai/api/observability`    |
| European Union | `https://observability.eu.mastra.ai/api/observability` |

Telemetry stays in its residency region. Querying the other region returns no records for the environment. See [Observability co-location](https://mastra.ai/docs/mastra-platform/regions) for the environment-to-region mapping.

#### Authentication and project scope

Every request requires a platform access token. Create one in [Mastra Platform](https://projects.mastra.ai), or use the token written to `.env` during Platform setup.

Include `X-Mastra-Project-Id` to limit results to one project. If you omit it, the query covers metrics in every project available to the token's organization.

```bash
curl -sS "https://observability.mastra.ai/api/observability/discovery/metric-names?prefix=mastra_model_" \
  -H "Authorization: Bearer $MASTRA_PLATFORM_ACCESS_TOKEN" \
  -H "X-Mastra-Project-Id: $MASTRA_PROJECT_ID" | jq
```

Use an organization-scoped Platform access token. Gateway inference keys such as `mk_*` keys aren't accepted. Queries remain constrained to the token's organization even when you supply a project ID.

#### Endpoints

| Method | Endpoint                         | Description                             |
| ------ | -------------------------------- | --------------------------------------- |
| GET    | `/metrics`                       | List raw metric records                 |
| POST   | `/metrics/aggregate`             | Return one aggregate value              |
| POST   | `/metrics/breakdown`             | Group metrics by dimensions             |
| POST   | `/metrics/timeseries`            | Bucket metrics by interval              |
| POST   | `/metrics/percentiles`           | Return percentile series for one metric |
| GET    | `/discovery/metric-names`        | List metric names                       |
| GET    | `/discovery/metric-label-keys`   | List label keys for a metric            |
| GET    | `/discovery/metric-label-values` | List values for a metric label key      |

The list and discovery endpoints take their arguments as query parameters. See [`listMetrics(args)`](https://mastra.ai/reference/observability/metrics/queries) and [metric discovery](https://mastra.ai/reference/observability/metrics/queries) in the metric queries reference for the parameters each one accepts.

Analytics endpoints accept the same JSON request bodies and return types as the [metric queries reference](https://mastra.ai/reference/observability/metrics/queries), including `name`, `aggregation`, `filters`, `groupBy`, `interval`, `percentiles`, `comparePeriod`, `limit`, `orderDirection`, and `distinctColumn`.

```bash
curl -sS "https://observability.mastra.ai/api/observability/metrics/aggregate" \
  -X POST \
  -H "Authorization: Bearer $MASTRA_PLATFORM_ACCESS_TOKEN" \
  -H "X-Mastra-Project-Id: $MASTRA_PROJECT_ID" \
  -H "Content-Type: application/json" \
  --data '{"name":["mastra_model_total_input_tokens","mastra_model_total_output_tokens"],"aggregation":"sum","filters":{"timestamp":{"start":"2026-09-13T00:00:00Z","end":"2026-10-13T00:00:00Z"}},"comparePeriod":"previous_period"}' | jq
```

`filters.timestamp` is optional. If you omit `start` and `end`, the query covers all retained data. `comparePeriod` requires both `start` and `end`. Without them, the previous-period fields are `null`.

The API returns `401` for invalid credentials, `403` for organization authorization failures, and `400` for malformed query arguments or JSON bodies.

##### `MastraClient`

`MastraClient` from `@mastra/client-js` exposes the analytics and discovery methods. Set `baseUrl` to the region's host without the `/api/observability` path:

```typescript
import { MastraClient } from '@mastra/client-js'

const mastraClient = new MastraClient({
  baseUrl: 'https://observability.mastra.ai',
  headers: {
    Authorization: `Bearer ${process.env.MASTRA_PLATFORM_ACCESS_TOKEN}`,
    'X-Mastra-Project-Id': process.env.MASTRA_PROJECT_ID!,
  },
})

const result = await mastraClient.getMetricAggregate({
  name: ['mastra_model_total_input_tokens', 'mastra_model_total_output_tokens'],
  aggregation: 'sum',
})
```

##### CLI

The [`mastra api metric`](https://mastra.ai/reference/cli/mastra) commands target the United States endpoint by default. Pass `--url` to query the European Union region:

```bash
mastra api --url https://observability.eu.mastra.ai metric aggregate '<json>'
```

### Gateway proxy endpoints

Visit the [Gateway documentation](https://gateway.mastra.ai/docs) for more details.

---

## Source: Overview (`models`)

Canonical URL: `https://mastra.ai/models.md`

## Model Providers

Mastra provides a unified interface for working with LLMs across multiple providers, giving you access to 8232 models from 218 providers through a single API.

### Features

- **One API for any model**: Access any model without having to install and manage additional provider dependencies.

- **Access the newest AI**: Use new models the moment they're released, no matter which provider they come from. Avoid vendor lock-in with Mastra's provider-agnostic interface.

- [**Mix and match models**](#mix-and-match-models): Use different models for different tasks. For example, run GPT-5-mini for large-context processing, then switch to Claude Opus 4.6 for reasoning tasks.

- [**Model fallbacks**](#model-fallbacks): If a provider experiences an outage, Mastra can automatically switch to another provider at the application level, minimizing latency compared to API gateways.

### Basic usage

Whether you're using OpenAI, Anthropic, Google, or a gateway like OpenRouter, specify the model as `"provider/model-name"` and Mastra handles the rest.

Mastra reads the relevant environment variable (e.g. `ANTHROPIC_API_KEY`) and routes requests to the provider. If an API key is missing, you'll get a clear runtime error showing exactly which variable to set.

**OpenAI**:

```typescript
import { Agent } from "@mastra/core/agent";

const agent = new Agent({
  id: "my-agent",
  name: "My Agent",
  instructions: "You are a helpful assistant",
  model: "openai/gpt-5.6-sol"
})
```

**Anthropic**:

```typescript
import { Agent } from "@mastra/core/agent";

const agent = new Agent({
  id: "my-agent",
  name: "My Agent",
  instructions: "You are a helpful assistant",
  model: "anthropic/claude-sonnet-4-6"
})
```

**Google Gemini**:

```typescript
import { Agent } from "@mastra/core/agent";

const agent = new Agent({
  id: "my-agent",
  name: "My Agent",
  instructions: "You are a helpful assistant",
  model: "google/gemini-2.5-flash"
})
```

**xAI**:

```typescript
import { Agent } from "@mastra/core/agent";

const agent = new Agent({
  id: "my-agent",
  name: "My Agent",
  instructions: "You are a helpful assistant",
  model: "xai/grok-4.3"
})
```

**OpenRouter**:

```typescript
import { Agent } from "@mastra/core/agent";

const agent = new Agent({
  id: "my-agent",
  name: "My Agent",
  instructions: "You are a helpful assistant",
  model: "openrouter/anthropic/claude-haiku-4.5"
})
```

### Model directory

Browse the directory of available models using the navigation on the left, or explore below.

- [Gateways](https://mastra.ai/models/gateways)
- [Providers](https://mastra.ai/models/providers)

You can also discover models directly in your editor. Mastra provides full autocomplete for the `model` field - just start typing, and your IDE will show available options.

Alternatively, browse and test models in [Studio](https://mastra.ai/docs/studio/overview) UI.

> **Note:** In development, we auto-refresh your local model list every hour, ensuring your TypeScript autocomplete and Studio stay up-to-date with the latest models. To disable, set `MASTRA_AUTO_REFRESH_PROVIDERS=false`. Auto-refresh is disabled by default in production.

### Mix and match models

Some models are faster but less capable, while others offer larger context windows or stronger reasoning skills. Use different models from the same provider, or mix and match across providers to fit each task.

```typescript
import { Agent } from "@mastra/core/agent";

// Use a cost-effective model for document processing
const documentProcessor = new Agent({
  id: "document-processor",
  name: "Document Processor",
  instructions: "Extract and summarize key information from documents",
  model: "openai/gpt-5.6-sol"
})

// Use a powerful reasoning model for complex analysis
const reasoningAgent = new Agent({
  id: "reasoning-agent",
  name: "Reasoning Agent",
  instructions: "Analyze data and provide strategic recommendations",
  model: "anthropic/claude-opus-4-7"
})
```

### Dynamic model selection

Since models are just strings, you can select them dynamically based on [request context](https://mastra.ai/docs/server/request-context), variables, or any other logic.

```typescript
const agent = new Agent({
  id: "dynamic-assistant",
  name: "Dynamic Assistant",
  model: ({ requestContext }) => {
    const provider = requestContext.get("provider-id");
    const model = requestContext.get("model-id");
    return `${provider}/${model}`;
  },
});
```

This enables powerful patterns:

- A/B testing - Compare model performance in production.
- User-selectable models - Let users choose their preferred model in your app.
- Multi-tenant applications - Each customer can bring their own API keys and model preferences.

### Provider-specific options

Different model providers expose their own configuration options. With OpenAI, you might adjust the `reasoningEffort`. With Anthropic, you might tune `cacheControl`. Mastra lets you set these specific `providerOptions` either at the agent level or per message.

```typescript
// Agent level (apply to all future messages)
const planner = new Agent({
  id: "planner",
  name: "Planner",
  instructions: {
    role: "system",
    content: "You are a helpful assistant.",
    providerOptions: {
      openai: { reasoningEffort: "low" }
    }
  },
  model: "openai/gpt-5.6-sol",
});

const lowEffort =
  await planner.generate("Plan a simple 3 item dinner menu");

// Message level (apply only to this message)
const highEffort = await planner.generate([
  {
    role: "user",
    content: "Plan a simple 3 item dinner menu for a celiac",
    providerOptions: {
      openai: { reasoningEffort: "high" }
    }
  }
]);
```

### Custom headers

If you need to specify custom headers, such as an organization ID or other provider-specific fields, use this syntax.

```typescript
const agent = new Agent({
  id: "custom-agent",
  name: "Custom Agent",
  model: {
    id: "openai/gpt-5.6-sol",
    apiKey: process.env.OPENAI_API_KEY,
    headers: {
      "OpenAI-Organization": "org-abc123"
    }
  }
});
```

> **Note:** Configuration differs by provider. See the provider pages in the left navigation for details on custom headers.

### Model fallbacks

Relying on a single model creates a single point of failure for your application. Model fallbacks provide automatic failover between models and providers. If the primary model becomes unavailable, requests are retried against the next configured fallback until one succeeds.

```typescript
import { Agent } from '@mastra/core/agent';

const agent = new Agent({
  id: 'resilient-assistant',
  name: 'Resilient Assistant',
  instructions: 'You are a helpful assistant.',
  model: [
    {
      model: "openai/gpt-5.6-sol",
      maxRetries: 3,
    },
    {
      model: "anthropic/claude-sonnet-4-6",
      maxRetries: 2,
    },
    {
      model: "google/gemini-2.5-pro",
      maxRetries: 2,
    },
  ],
});
```

Mastra tries your primary model first. If it encounters a 500 error, rate limit, or timeout, it automatically switches to your first fallback. If that fails too, it moves to the next. Each model gets its own retry count before moving on.

Your users never experience the disruption - the response comes back with the same format, just from a different model. The error context is preserved as the system moves through your fallback chain, ensuring clean error propagation while maintaining streaming compatibility.

#### Per-model settings

Each fallback entry can carry its own `modelSettings`, `providerOptions`, and `headers`  -  useful when models in the chain need different temperatures or provider-specific knobs to produce comparable output.

```typescript
import { Agent } from '@mastra/core/agent';

const agent = new Agent({
  id: 'tuned-resilient',
  name: 'Tuned Resilient Agent',
  instructions: 'You are a helpful assistant.',
  model: [
    {
      model: 'google/gemini-2.5-flash',
      maxRetries: 2,
      modelSettings: { temperature: 0.3 },
      providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } },
    },
    {
      model: 'openai/gpt-5-mini',
      maxRetries: 2,
      modelSettings: { temperature: 0.7 },
      providerOptions: { openai: { reasoningEffort: 'low' } },
    },
  ],
});
```

**Precedence:**

- `modelSettings` and `providerOptions`: per-fallback entry overrides call-time options, which override agent `defaultOptions`. `modelSettings` shallow-merges by key. `providerOptions` deep-merges recursively, so nested provider config (e.g. `google.thinkingConfig`) preserves sibling keys across layers.
- `headers`: call-time `modelSettings.headers` overrides per-fallback `headers`, which overrides headers extracted from model-router models. Runtime headers (tracing, auth, tenancy) intentionally take precedence over model-level headers.

Each field also accepts a function of `requestContext`, matching how dynamic models are resolved.

### Use local models with Mastra

Mastra also supports local models like `gpt-oss`, `Qwen3`, `DeepSeek` and many more that you run on your own hardware. The application running your local model needs to provide an OpenAI-compatible API server for Mastra to connect to. We recommend using [LMStudio](https://lmstudio.ai/) (see [Running the LMStudio server](https://lmstudio.ai/docs/developer/core/server)).

For custom OpenAI-compatible endpoints, `id` is the routing form that Mastra sends through the model router.

Use `provider/model` when the remote behaves like a direct provider and expects a bare model name such as `llama3.2`.

Use `gateway/provider/model` when the remote behaves like a model gateway and the upstream model namespace includes the provider, such as `mastra/google/gemini-2.5-flash` or `openrouter/google/gemini-2.5-flash`.

For the `url` it's **important** that you use the base URL of the OpenAI-compatible endpoint with Mastra's `model` setting and not the individual chat endpoints.

```typescript
import { Agent } from "@mastra/core/agent";

const agent = new Agent({
  id: "my-agent",
  name: "My Agent",
  instructions: "You are a helpful assistant",
  model: {
    id: "custom/my-qwen3-model",
    url: "http://your-custom-openai-compatible-endpoint.com/v1"
  }
})
```

If the remote behaves like a model gateway, include the gateway prefix in `id`:

```typescript
import { Agent } from "@mastra/core/agent";

const agent = new Agent({
  id: "my-agent",
  name: "My Agent",
  instructions: "You are a helpful assistant",
  model: {
    id: "mastra/google/gemini-2.5-flash",
    url: "http://your-custom-openai-compatible-endpoint.com/v1"
  }
})
```

#### Example: LMStudio

After starting the LMStudio server, the local server is available at `http://localhost:1234` and it provides endpoints like `/v1/models`, `/v1/chat/completions`, etc. The `url` will be `http://localhost:1234/v1`. For the `id` you can use (`lmstudio/${modelId}`) which will be displayed in the LMStudio interface.

```typescript
import { Agent } from "@mastra/core/agent";

const agent = new Agent({
  id: "my-agent",
  name: "My Agent",
  instructions: "You are a helpful assistant",
  model: {
    id: "lmstudio/qwen/qwen3-30b-a3b-2507",
    url: "http://localhost:1234/v1"
  }
})
```

#### Select the OpenAI Responses API

Custom `url` endpoints use the OpenAI Chat Completions API by default. If your endpoint exposes the OpenAI Responses API (`/v1/responses`)  -  for example to combine function tools with reasoning models on gateways that require it  -  set `api: "responses"`.

```typescript
import { Agent } from "@mastra/core/agent";

const agent = new Agent({
  id: "my-agent",
  name: "My Agent",
  instructions: "You are a helpful assistant",
  model: {
    id: "custom/my-model",
    url: "http://your-custom-openai-compatible-endpoint.com/v1",
    api: "responses"
  }
})
```

When `api` is omitted it defaults to `"chat"`, so existing configurations are unchanged. Provider options are read from the `openai` namespace for the Responses API, whereas the Chat Completions path reads the `openai-compatible` namespace.

### Use AI SDK with Mastra

Mastra supports AI SDK provider modules, should you need to use them directly.

```typescript
import { groq } from '@ai-sdk/groq';
import { Agent } from "@mastra/core/agent";

const agent = new Agent({
  id: "my-agent",
  name: "My Agent",
  model: groq('gemma2-9b-it')
})
```

You can use an AI SDK model (e.g. `groq('gemma2-9b-it')`) anywhere that accepts a `"provider/model"` string, including within model router fallbacks and [scorers](https://mastra.ai/docs/evals/overview).

### All providers

Every provider below works with the model router as `provider/model`. Read the provider page for its environment variable, setup, and model list.

- [OpenAI](https://mastra.ai/models/providers/openai)
- [Anthropic](https://mastra.ai/models/providers/anthropic)
- [Google](https://mastra.ai/models/providers/google)
- [DeepSeek](https://mastra.ai/models/providers/deepseek)
- [Groq](https://mastra.ai/models/providers/groq)
- [Mistral](https://mastra.ai/models/providers/mistral)
- [xAI](https://mastra.ai/models/providers/xai)
- [302.AI](https://mastra.ai/models/providers/302ai)
- [Abacus](https://mastra.ai/models/providers/abacus)
- [abliteration.ai](https://mastra.ai/models/providers/abliteration-ai)
- [above.dev](https://mastra.ai/models/providers/above)
- [AgentRouter](https://mastra.ai/models/providers/agentrouter)
- [Agnes AI](https://mastra.ai/models/providers/agnes)
- [AI-ROUTER](https://mastra.ai/models/providers/ai-router)
- [AI/ML API](https://mastra.ai/models/providers/aimlapi)
- [ai&](https://mastra.ai/models/providers/aiand)
- [AI21 Labs](https://mastra.ai/models/providers/ai21)
- [ainetcafe](https://mastra.ai/models/providers/ainetcafe)
- [Aixy](https://mastra.ai/models/providers/aixy)
- [AKI.IO](https://mastra.ai/models/providers/aki-io)
- [Alibaba](https://mastra.ai/models/providers/alibaba)
- [Alibaba (China)](https://mastra.ai/models/providers/alibaba-cn)
- [Alibaba Coding Plan](https://mastra.ai/models/providers/alibaba-coding-plan)
- [Alibaba Coding Plan (China)](https://mastra.ai/models/providers/alibaba-coding-plan-cn)
- [Alibaba Token Plan](https://mastra.ai/models/providers/alibaba-token-plan)
- [Alibaba Token Plan (China)](https://mastra.ai/models/providers/alibaba-token-plan-cn)
- [Ambient](https://mastra.ai/models/providers/ambient)
- [AMD](https://mastra.ai/models/providers/amd)
- [AnyAPI](https://mastra.ai/models/providers/anyapi)
- [Arcee](https://mastra.ai/models/providers/arcee)
- [Atomic Chat](https://mastra.ai/models/providers/atomic-chat)
- [Auriko](https://mastra.ai/models/providers/auriko)
- [Bailing](https://mastra.ai/models/providers/bailing)
- [Baseten](https://mastra.ai/models/providers/baseten)
- [Bee by HEOSSI](https://mastra.ai/models/providers/bee)
- [Berget.AI](https://mastra.ai/models/providers/berget)
- [Blue Claw](https://mastra.ai/models/providers/blueclaw)
- [Bothub](https://mastra.ai/models/providers/bothub)
- [Boundless](https://mastra.ai/models/providers/boundless)
- [Cerebras](https://mastra.ai/models/providers/cerebras)
- [Charm Hyper](https://mastra.ai/models/providers/hyper)
- [Chutes](https://mastra.ai/models/providers/chutes)
- [Clarifai](https://mastra.ai/models/providers/clarifai)
- [Claudinio](https://mastra.ai/models/providers/claudinio)
- [ClinePass](https://mastra.ai/models/providers/cline-pass)
- [CloudFerro Sherlock](https://mastra.ai/models/providers/cloudferro-sherlock)
- [Cloudflare Workers AI](https://mastra.ai/models/providers/cloudflare-workers-ai)
- [CoralBricks](https://mastra.ai/models/providers/coralbricks)
- [CoreWeave](https://mastra.ai/models/providers/wandb)
- [Cortecs](https://mastra.ai/models/providers/cortecs)
- [CrofAI](https://mastra.ai/models/providers/crof)
- [CrossModel](https://mastra.ai/models/providers/crossmodel)
- [Crusoe](https://mastra.ai/models/providers/crusoe)
- [D.Run (China)](https://mastra.ai/models/providers/drun)
- [DaoXE](https://mastra.ai/models/providers/daoxe)
- [Databricks](https://mastra.ai/models/providers/databricks)
- [Deep Infra](https://mastra.ai/models/providers/deepinfra)
- [DevPass (LLM Gateway)](https://mastra.ai/models/providers/llmgateway)
- [DigitalOcean](https://mastra.ai/models/providers/digitalocean)
- [DInference](https://mastra.ai/models/providers/dinference)
- [EBCloud](https://mastra.ai/models/providers/ebcloud)
- [Echo](https://mastra.ai/models/providers/echo)
- [Eden AI](https://mastra.ai/models/providers/edenai)
- [EmpirioLabs AI](https://mastra.ai/models/providers/empiriolabs)
- [engy](https://mastra.ai/models/providers/engy)
- [evroc](https://mastra.ai/models/providers/evroc)
- [FastRouter](https://mastra.ai/models/providers/fastrouter)
- [Fireworks AI](https://mastra.ai/models/providers/fireworks-ai)
- [FreeModel](https://mastra.ai/models/providers/freemodel)
- [Friendli](https://mastra.ai/models/providers/friendli)
- [FrogBot](https://mastra.ai/models/providers/frogbot)
- [GMI Cloud](https://mastra.ai/models/providers/gmicloud)
- [GreenPT](https://mastra.ai/models/providers/greenpt)
- [Helicone](https://mastra.ai/models/providers/helicone)
- [Hetzner](https://mastra.ai/models/providers/hetzner)
- [HPC-AI](https://mastra.ai/models/providers/hpc-ai)
- [Hugging Face](https://mastra.ai/models/providers/huggingface)
- [iFlow](https://mastra.ai/models/providers/iflowcn)
- [Impossibl](https://mastra.ai/models/providers/impossibl)
- [Inception](https://mastra.ai/models/providers/inception)
- [Inceptron](https://mastra.ai/models/providers/inceptron)
- [Inco](https://mastra.ai/models/providers/inco)
- [Infer by Flow7](https://mastra.ai/models/providers/infer)
- [Inference](https://mastra.ai/models/providers/inference)
- [InferX](https://mastra.ai/models/providers/inferx)
- [Infomaniak](https://mastra.ai/models/providers/infomaniak)
- [IO.NET](https://mastra.ai/models/providers/io-net)
- [IteraCompute](https://mastra.ai/models/providers/iteracompute)
- [Jalapeno Cloud](https://mastra.ai/models/providers/jalapeno)
- [Jiekou.AI](https://mastra.ai/models/providers/jiekou)
- [Kenari](https://mastra.ai/models/providers/kenari)
- [Kilo Gateway](https://mastra.ai/models/providers/kilo)
- [Kimi For Coding (kimi.ai)](https://mastra.ai/models/providers/kimi-code-plan-global)
- [Kimi For Coding (kimi.com)](https://mastra.ai/models/providers/kimi-code-plan-cn)
- [klokintegration.se](https://mastra.ai/models/providers/klokintegration)
- [Kosmik Compute](https://mastra.ai/models/providers/kosmik)
- [KUAE Cloud Coding Plan](https://mastra.ai/models/providers/kuae-cloud-coding-plan)
- [Lilac](https://mastra.ai/models/providers/lilac)
- [Llama](https://mastra.ai/models/providers/llama)
- [LLM Gateway](https://mastra.ai/models/providers/llmgateway-providers)
- [LLM Tech](https://mastra.ai/models/providers/llmtech)
- [LLMTR](https://mastra.ai/models/providers/llmtr)
- [LMStudio](https://mastra.ai/models/providers/lmstudio)
- [LongCat](https://mastra.ai/models/providers/longcat)
- [LowRouter](https://mastra.ai/models/providers/lowrouter)
- [LucidQuery](https://mastra.ai/models/providers/lucidquery)
- [Lynkr](https://mastra.ai/models/providers/lynkr)
- [Meganova](https://mastra.ai/models/providers/meganova)
- [Melious](https://mastra.ai/models/providers/melious)
- [Meta](https://mastra.ai/models/providers/meta)
- [MiniMax (minimax.cn)](https://mastra.ai/models/providers/minimax-cn)
- [MiniMax (minimax.io)](https://mastra.ai/models/providers/minimax)
- [MiniMax Token Plan (minimax.cn)](https://mastra.ai/models/providers/minimax-cn-coding-plan)
- [MiniMax Token Plan (minimax.io)](https://mastra.ai/models/providers/minimax-coding-plan)
- [Mixlayer](https://mastra.ai/models/providers/mixlayer)
- [Moark](https://mastra.ai/models/providers/moark)
- [Modal](https://mastra.ai/models/providers/modal)
- [Model Oracle AI](https://mastra.ai/models/providers/model-oracle-ai)
- [Modelis](https://mastra.ai/models/providers/modelis)
- [ModelScope](https://mastra.ai/models/providers/modelscope)
- [Moonshot AI](https://mastra.ai/models/providers/moonshotai)
- [Moonshot AI (China)](https://mastra.ai/models/providers/moonshotai-cn)
- [Morph](https://mastra.ai/models/providers/morph)
- [NaN](https://mastra.ai/models/providers/nan)
- [NanoGPT](https://mastra.ai/models/providers/nano-gpt)
- [NEAR AI Cloud](https://mastra.ai/models/providers/nearai)
- [Nebius Token Factory](https://mastra.ai/models/providers/nebius)
- [NeoSmith](https://mastra.ai/models/providers/neosmith)
- [Neuralwatt](https://mastra.ai/models/providers/neuralwatt)
- [Nova](https://mastra.ai/models/providers/nova)
- [Novita AI](https://mastra.ai/models/providers/novita-ai)
- [Nvidia](https://mastra.ai/models/providers/nvidia)
- [OCI Generative AI](https://mastra.ai/models/providers/oci)
- [Ofox](https://mastra.ai/models/providers/ofox)
- [Ollama Cloud](https://mastra.ai/models/providers/ollama-cloud)
- [OpenCode](https://mastra.ai/models/providers/opencode)
- [OpenCode Go](https://mastra.ai/models/providers/opencode-go)
- [OpenReason](https://mastra.ai/models/providers/openreason)
- [Opper](https://mastra.ai/models/providers/opper)
- [OrcaRouter](https://mastra.ai/models/providers/orcarouter)
- [OVHcloud AI Endpoints](https://mastra.ai/models/providers/ovhcloud)
- [Pareto Inference](https://mastra.ai/models/providers/pareto)
- [Pendra](https://mastra.ai/models/providers/pendra)
- [Perplexity](https://mastra.ai/models/providers/perplexity)
- [Perplexity Agent](https://mastra.ai/models/providers/perplexity-agent)
- [Pioneer](https://mastra.ai/models/providers/pioneer)
- [Poe](https://mastra.ai/models/providers/poe)
- [Poolside](https://mastra.ai/models/providers/poolside)
- [Prime Inference](https://mastra.ai/models/providers/prime)
- [Privatemode AI](https://mastra.ai/models/providers/privatemode-ai)
- [QiHang](https://mastra.ai/models/providers/qihang-ai)
- [Qiniu](https://mastra.ai/models/providers/qiniu-ai)
- [Regolo AI](https://mastra.ai/models/providers/regolo-ai)
- [Requesty](https://mastra.ai/models/providers/requesty)
- [routing.run](https://mastra.ai/models/providers/routing-run)
- [RunInfra](https://mastra.ai/models/providers/runinfra)
- [Sakana AI](https://mastra.ai/models/providers/sakana)
- [SambaNova](https://mastra.ai/models/providers/sambanova)
- [Sarvam AI](https://mastra.ai/models/providers/sarvam)
- [Scaleway](https://mastra.ai/models/providers/scaleway)
- [SCNet Token Plan](https://mastra.ai/models/providers/scnet-token-plan)
- [SCX.ai](https://mastra.ai/models/providers/scx-ai)
- [SenseNova (China)](https://mastra.ai/models/providers/sensenova)
- [SiliconFlow](https://mastra.ai/models/providers/siliconflow)
- [SiliconFlow (China)](https://mastra.ai/models/providers/siliconflow-cn)
- [Snowflake Cortex](https://mastra.ai/models/providers/snowflake-cortex)
- [STACKIT](https://mastra.ai/models/providers/stackit)
- [Standard Compute](https://mastra.ai/models/providers/standardcompute)
- [StepFun (China)](https://mastra.ai/models/providers/stepfun)
- [StepFun (Global)](https://mastra.ai/models/providers/stepfun-ai)
- [StepFun Step Plan (China)](https://mastra.ai/models/providers/stepfun-step-plan)
- [StepFun Step Plan (Global)](https://mastra.ai/models/providers/stepfun-ai-step-plan)
- [Subconscious](https://mastra.ai/models/providers/subconscious)
- [submodel](https://mastra.ai/models/providers/submodel)
- [Synthetic](https://mastra.ai/models/providers/synthetic)
- [Tempr Gateway](https://mastra.ai/models/providers/tempr)
- [Tencent Coding Plan (China)](https://mastra.ai/models/providers/tencent-coding-plan)
- [Tencent Token Plan](https://mastra.ai/models/providers/tencent-token-plan)
- [Tencent TokenHub](https://mastra.ai/models/providers/tencent-tokenhub)
- [TensorX](https://mastra.ai/models/providers/tensorx)
- [The Grid AI](https://mastra.ai/models/providers/the-grid-ai)
- [Thinking Machines](https://mastra.ai/models/providers/thinkingmachines)
- [Tinfoil](https://mastra.ai/models/providers/tinfoil)
- [Together AI](https://mastra.ai/models/providers/togetherai)
- [TokenGo](https://mastra.ai/models/providers/tokengo)
- [TokenRouter](https://mastra.ai/models/providers/tokenrouter)
- [TrustedRouter](https://mastra.ai/models/providers/trustedrouter)
- [Umans AI](https://mastra.ai/models/providers/umans-ai)
- [Umans AI Coding Plan](https://mastra.ai/models/providers/umans-ai-coding-plan)
- [UnoRouter](https://mastra.ai/models/providers/unorouter)
- [Upstage](https://mastra.ai/models/providers/upstage)
- [Vancine](https://mastra.ai/models/providers/vancine)
- [Vispark](https://mastra.ai/models/providers/vispark)
- [Vivgrid](https://mastra.ai/models/providers/vivgrid)
- [Volcengine Ark](https://mastra.ai/models/providers/volcengine)
- [Volcengine Ark Coding Plan](https://mastra.ai/models/providers/volcengine-coding-plan)
- [Vultr](https://mastra.ai/models/providers/vultr)
- [Wafer](https://mastra.ai/models/providers/wafer.ai)
- [Wallaby](https://mastra.ai/models/providers/wallaby)
- [Xiaomi](https://mastra.ai/models/providers/xiaomi)
- [Xiaomi Token Plan (China)](https://mastra.ai/models/providers/xiaomi-token-plan-cn)
- [Xiaomi Token Plan (Europe)](https://mastra.ai/models/providers/xiaomi-token-plan-ams)
- [Xiaomi Token Plan (Singapore)](https://mastra.ai/models/providers/xiaomi-token-plan-sgp)
- [Xpersona](https://mastra.ai/models/providers/xpersona)
- [Z.AI](https://mastra.ai/models/providers/zai)
- [Z.AI Coding Plan](https://mastra.ai/models/providers/zai-coding-plan)
- [Zeldoc](https://mastra.ai/models/providers/zeldoc)
- [Zenifra](https://mastra.ai/models/providers/zenifra)
- [ZenMux](https://mastra.ai/models/providers/zenmux)
- [Zhipu AI](https://mastra.ai/models/providers/zhipuai)
- [Zhipu AI Coding Plan](https://mastra.ai/models/providers/zhipuai-coding-plan)

---

## Source: Embeddings (`models/embeddings`)

Canonical URL: `https://mastra.ai/models/embeddings.md`

## Embedding models

Mastra's model router supports embedding models using the same `provider/model` string format as language models. This provides a unified interface for both chat and embedding models with TypeScript autocomplete support.

### Quickstart

```typescript
import { ModelRouterEmbeddingModel } from '@mastra/core/llm'
import { embedMany } from 'ai'

// Generate embeddings
const { embeddings } = await embedMany({
  model: new ModelRouterEmbeddingModel('openai/text-embedding-3-small'),
  values: ['Hello world', 'Semantic search is powerful'],
})
```

### Supported models

#### OpenAI

- `text-embedding-3-small` - 1536 dimensions, 8191 max tokens
- `text-embedding-3-large` - 3072 dimensions, 8191 max tokens
- `text-embedding-ada-002` - 1536 dimensions, 8191 max tokens

```typescript
const embedder = new ModelRouterEmbeddingModel('openai/text-embedding-3-small')
```

#### Google

- `gemini-embedding-001` - 768 dimensions, 2048 max tokens

```typescript
const embedder = new ModelRouterEmbeddingModel('google/gemini-embedding-001')
```

#### VoyageAI

VoyageAI provides specialized embedding models optimized for retrieval tasks. These models are available as standalone packages:

**npm**:

```bash
npm install @mastra/voyageai
```

**pnpm**:

```bash
pnpm add @mastra/voyageai
```

**Yarn**:

```bash
yarn add @mastra/voyageai
```

**Bun**:

```bash
bun add @mastra/voyageai
```

**Available models:**

- `voyage-4-large` - 1024 dimensions (default), supports 256-2048 dimensions, best general-purpose and multilingual retrieval quality (120k max tokens per batch)
- `voyage-4` - 1024 dimensions (default), supports 256-2048 dimensions, optimized for general-purpose and multilingual retrieval (320k max tokens per batch)
- `voyage-4-lite` - 1024 dimensions (default), supports 256-2048 dimensions, optimized for latency and cost (1M max tokens per batch)
- `voyage-code-3` - 1024 dimensions (default), supports 256-2048 dimensions, optimized for code retrieval
- `voyage-finance-2` - 1024 dimensions, optimized for finance retrieval and RAG
- `voyage-law-2` - 1024 dimensions, optimized for legal retrieval and RAG (16k context)
- `voyage-3-large` - 1024 dimensions (default), supports 256-2048 dimensions (previous generation)
- `voyage-3.5` - 1024 dimensions (default), supports 256-2048 dimensions (previous generation)
- `voyage-3.5-lite` - 1024 dimensions (default), supports 256-2048 dimensions, optimized for latency and cost (previous generation)
- `voyage-multimodal-3.5` - 1024 dimensions, supports text + images

```typescript
import { voyage, voyageEmbedding } from '@mastra/voyageai'

// Use default model (voyage-3.5)
const { embeddings } = await voyage.doEmbed({
  values: ['Hello world'],
})

// Use specific model (voyage-3-large)
const largeEmbeddings = await voyage.large.doEmbed({
  values: ['More complex content'],
})

// Custom configuration
const customModel = voyageEmbedding({
  model: 'voyage-3.5',
  inputType: 'query', // or 'document'
  outputDimension: 512, // 256, 512, 1024, or 2048
  baseUrl: 'https://ai.mongodb.com/v1', // Optional: custom endpoint (e.g. MongoDB-hosted Voyage)
})

const { embeddings: customEmbeddings } = await customModel.doEmbed({
  values: ['Custom configuration example'],
})
```

**VoyageAI with MongoDB:**

VoyageAI works seamlessly with MongoDB Atlas Vector Search:

```typescript
import { voyage } from '@mastra/voyageai'
import { MongoDBVector } from '@mastra/mongodb'

const mongoVector = new MongoDBVector({
  id: 'mongodb-vector',
  uri: process.env.MONGODB_URI,
  dbName: process.env.MONGODB_DB_NAME,
})

// Create index matching VoyageAI dimensions
await mongoVector.createIndex({
  indexName: 'documents',
  dimension: 1024, // voyage-3.5 default
})

// Generate and store embeddings
const { embeddings } = await voyage.doEmbed({
  values: chunks.map(chunk => chunk.text),
})

await mongoVector.upsert({
  indexName: 'documents',
  vectors: embeddings,
  metadata: chunks.map(chunk => ({ text: chunk.text })),
})
```

**Multimodal embeddings (text + images):**

```typescript
import { voyage } from '@mastra/voyageai'

const { embeddings } = await voyage.multimodal.doEmbed({
  values: [
    {
      content: [
        { type: 'text', text: 'Product description' },
        { type: 'image_url', image_url: 'https://example.com/image.jpg' },
      ],
    },
  ],
})
```

For more details, see the [MongoDB + VoyageAI integration guide](https://mastra.ai/reference/vectors/mongodb).

### Authentication

The model router automatically detects API keys from environment variables:

- **OpenAI**: `OPENAI_API_KEY`
- **Google**: `GOOGLE_API_KEY` (falls back to `GOOGLE_GENERATIVE_AI_API_KEY`)
- **VoyageAI**: `VOYAGE_API_KEY`

```bash
# .env
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...
VOYAGE_API_KEY=pa-...
```

### Custom Providers

You can use any OpenAI-compatible embedding endpoint with a custom URL:

```typescript
import { ModelRouterEmbeddingModel } from '@mastra/core/llm'

const embedder = new ModelRouterEmbeddingModel({
  providerId: 'ollama',
  modelId: 'nomic-embed-text',
  url: 'http://localhost:11434/v1',
  apiKey: 'not-needed', // Some providers don't require API keys
})
```

### Usage with Memory

The embedding model router integrates seamlessly with Mastra's memory system:

```typescript
import { Memory } from '@mastra/memory'
import { Agent } from '@mastra/core/agent'
import { ModelRouterEmbeddingModel } from '@mastra/core/llm'

const agent = new Agent({
  id: 'my-agent',
  name: 'my-agent',
  instructions: 'You are a helpful assistant',
  model: 'openai/gpt-5.1',
  memory: new Memory({
    embedder: new ModelRouterEmbeddingModel('openai/text-embedding-3-small'),
  }),
})
```

> **Note:** The `embedder` field accepts:
>
> - `EmbeddingModelId` (string with autocomplete)
> - `EmbeddingModel<string>` (AI SDK v1)
> - `EmbeddingModelV2<string>` (AI SDK v2)

### Usage with RAG

Use embedding models for document chunking and retrieval:

```typescript
import { ModelRouterEmbeddingModel } from '@mastra/core/llm'
import { embedMany } from 'ai'

// Embed document chunks
const { embeddings } = await embedMany({
  model: new ModelRouterEmbeddingModel('openai/text-embedding-3-small'),
  values: chunks.map(chunk => chunk.text),
})

// Store embeddings in your vector database
await vectorStore.upsert(
  chunks.map((chunk, i) => ({
    id: chunk.id,
    vector: embeddings[i],
    metadata: chunk.metadata,
  })),
)
```

### TypeScript Support

The model router provides full TypeScript autocomplete for embedding model IDs:

```typescript
import type { EmbeddingModelId } from '@mastra/core/llm'

// Type-safe embedding model selection
const modelId: EmbeddingModelId = 'openai/text-embedding-3-small'
//                                  ^ Autocomplete shows all supported models

const embedder = new ModelRouterEmbeddingModel(modelId)
```

### Error handling

The model router validates provider and model IDs at construction time:

```typescript
try {
  const embedder = new ModelRouterEmbeddingModel('invalid/model')
} catch (error) {
  console.error(error.message)
  // "Unknown provider: invalid. Available providers: openai, google"
}
```

Missing API keys are also caught early:

```typescript
try {
  const embedder = new ModelRouterEmbeddingModel('openai/text-embedding-3-small')
  // Throws if OPENAI_API_KEY is not set
} catch (error) {
  console.error(error.message)
  // "API key not found for provider openai. Set OPENAI_API_KEY environment variable."
}
```

### Next Steps

- [Memory & Semantic Recall](https://mastra.ai/docs/memory/semantic-recall): Use embeddings for agent memory
- [RAG & Chunking](https://mastra.ai/reference/rag/chunking-and-embedding): Build retrieval-augmented generation systems
- [Vector Databases](https://mastra.ai/reference/rag/vector-databases): Store and query embeddings

---

## Source: Environment Variables (`models/environment-variables`)

Canonical URL: `https://mastra.ai/models/environment-variables.md`

## Environment variables

List of required environment variables for each model provider and gateway supported by Mastra's [model router](https://mastra.ai/models).

| Name                                                                                         | Model prefix               | Environment variables                                                                                 |
| -------------------------------------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------- |
| [302.AI](https://mastra.ai/models/providers/302ai)                                           | `302ai/*`                  | `302AI_API_KEY`                                                                                       |
| [Abacus](https://mastra.ai/models/providers/abacus)                                          | `abacus/*`                 | `ABACUS_API_KEY`                                                                                      |
| [abliteration.ai](https://mastra.ai/models/providers/abliteration-ai)                        | `abliteration-ai/*`        | `ABLIT_KEY`                                                                                           |
| [above.dev](https://mastra.ai/models/providers/above)                                        | `above/*`                  | `ABOVE_API_KEY`                                                                                       |
| [AgentRouter](https://mastra.ai/models/providers/agentrouter)                                | `agentrouter/*`            | `AGENTROUTER_API_KEY`                                                                                 |
| [Agnes AI](https://mastra.ai/models/providers/agnes)                                         | `agnes/*`                  | `AGNES_API_KEY`                                                                                       |
| [AI-ROUTER](https://mastra.ai/models/providers/ai-router)                                    | `ai-router/*`              | `AI_ROUTER_API_KEY`                                                                                   |
| [AI/ML API](https://mastra.ai/models/providers/aimlapi)                                      | `aimlapi/*`                | `AIMLAPI_API_KEY`                                                                                     |
| [ai&](https://mastra.ai/models/providers/aiand)                                              | `aiand/*`                  | `AIAND_API_KEY`                                                                                       |
| [AI21 Labs](https://mastra.ai/models/providers/ai21)                                         | `ai21/*`                   | `AI21_API_KEY`                                                                                        |
| [ainetcafe](https://mastra.ai/models/providers/ainetcafe)                                    | `ainetcafe/*`              | `AINETCAFE_API_KEY`                                                                                   |
| [Aixy](https://mastra.ai/models/providers/aixy)                                              | `aixy/*`                   | `AIXY_API_KEY`                                                                                        |
| [AKI.IO](https://mastra.ai/models/providers/aki-io)                                          | `aki-io/*`                 | `AKI_IO_API_KEY`                                                                                      |
| [Alibaba](https://mastra.ai/models/providers/alibaba)                                        | `alibaba/*`                | `DASHSCOPE_API_KEY`                                                                                   |
| [Alibaba (China)](https://mastra.ai/models/providers/alibaba-cn)                             | `alibaba-cn/*`             | `DASHSCOPE_API_KEY`                                                                                   |
| [Alibaba Coding Plan](https://mastra.ai/models/providers/alibaba-coding-plan)                | `alibaba-coding-plan/*`    | `ALIBABA_CODING_PLAN_API_KEY`                                                                         |
| [Alibaba Coding Plan (China)](https://mastra.ai/models/providers/alibaba-coding-plan-cn)     | `alibaba-coding-plan-cn/*` | `ALIBABA_CODING_PLAN_API_KEY`                                                                         |
| [Alibaba Token Plan](https://mastra.ai/models/providers/alibaba-token-plan)                  | `alibaba-token-plan/*`     | `ALIBABA_TOKEN_PLAN_API_KEY`                                                                          |
| [Alibaba Token Plan (China)](https://mastra.ai/models/providers/alibaba-token-plan-cn)       | `alibaba-token-plan-cn/*`  | `ALIBABA_TOKEN_PLAN_API_KEY`                                                                          |
| [Ambient](https://mastra.ai/models/providers/ambient)                                        | `ambient/*`                | `AMBIENT_API_KEY`                                                                                     |
| [AMD](https://mastra.ai/models/providers/amd)                                                | `amd/*`                    | `AMD_API_KEY`                                                                                         |
| [Anthropic](https://mastra.ai/models/providers/anthropic)                                    | `anthropic/*`              | `ANTHROPIC_API_KEY`                                                                                   |
| [AnyAPI](https://mastra.ai/models/providers/anyapi)                                          | `anyapi/*`                 | `ANYAPI_API_KEY`                                                                                      |
| [Arcee](https://mastra.ai/models/providers/arcee)                                            | `arcee/*`                  | `ARCEE_API_KEY`                                                                                       |
| [Atomic Chat](https://mastra.ai/models/providers/atomic-chat)                                | `atomic-chat/*`            | `ATOMIC_CHAT_API_KEY`                                                                                 |
| [Auriko](https://mastra.ai/models/providers/auriko)                                          | `auriko/*`                 | `AURIKO_API_KEY`                                                                                      |
| [Bailing](https://mastra.ai/models/providers/bailing)                                        | `bailing/*`                | `BAILING_API_TOKEN`                                                                                   |
| [Baseten](https://mastra.ai/models/providers/baseten)                                        | `baseten/*`                | `BASETEN_API_KEY`                                                                                     |
| [Bee by HEOSSI](https://mastra.ai/models/providers/bee)                                      | `bee/*`                    | `BEE_API_KEY`                                                                                         |
| [Berget.AI](https://mastra.ai/models/providers/berget)                                       | `berget/*`                 | `BERGET_API_KEY`                                                                                      |
| [Blue Claw](https://mastra.ai/models/providers/blueclaw)                                     | `blueclaw/*`               | `BLUECLAW_API_KEY`                                                                                    |
| [Bothub](https://mastra.ai/models/providers/bothub)                                          | `bothub/*`                 | `BOTHUB_API_KEY`                                                                                      |
| [Boundless](https://mastra.ai/models/providers/boundless)                                    | `boundless/*`              | `BOUNDLESS_API_KEY`                                                                                   |
| [Cerebras](https://mastra.ai/models/providers/cerebras)                                      | `cerebras/*`               | `CEREBRAS_API_KEY`                                                                                    |
| [Charm Hyper](https://mastra.ai/models/providers/hyper)                                      | `hyper/*`                  | `HYPER_API_KEY`                                                                                       |
| [Chutes](https://mastra.ai/models/providers/chutes)                                          | `chutes/*`                 | `CHUTES_API_KEY`                                                                                      |
| [Clarifai](https://mastra.ai/models/providers/clarifai)                                      | `clarifai/*`               | `CLARIFAI_PAT`                                                                                        |
| [Claudinio](https://mastra.ai/models/providers/claudinio)                                    | `claudinio/*`              | `CLAUDINIO_API_KEY`                                                                                   |
| [ClinePass](https://mastra.ai/models/providers/cline-pass)                                   | `cline-pass/*`             | `CLINE_API_KEY`                                                                                       |
| [CloudFerro Sherlock](https://mastra.ai/models/providers/cloudferro-sherlock)                | `cloudferro-sherlock/*`    | `CLOUDFERRO_SHERLOCK_API_KEY`                                                                         |
| [Cloudflare Workers AI](https://mastra.ai/models/providers/cloudflare-workers-ai)            | `cloudflare-workers-ai/*`  | `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_KEY`                                                         |
| [CoralBricks](https://mastra.ai/models/providers/coralbricks)                                | `coralbricks/*`            | `CORAL_API_KEY`                                                                                       |
| [CoreWeave](https://mastra.ai/models/providers/wandb)                                        | `wandb/*`                  | `WANDB_API_KEY`                                                                                       |
| [Cortecs](https://mastra.ai/models/providers/cortecs)                                        | `cortecs/*`                | `CORTECS_API_KEY`                                                                                     |
| [CrofAI](https://mastra.ai/models/providers/crof)                                            | `crof/*`                   | `CROF_API_KEY`                                                                                        |
| [CrossModel](https://mastra.ai/models/providers/crossmodel)                                  | `crossmodel/*`             | `CROSSMODEL_API_KEY`                                                                                  |
| [Crusoe](https://mastra.ai/models/providers/crusoe)                                          | `crusoe/*`                 | `CRUSOE_API_KEY`                                                                                      |
| [D.Run (China)](https://mastra.ai/models/providers/drun)                                     | `drun/*`                   | `DRUN_API_KEY`                                                                                        |
| [DaoXE](https://mastra.ai/models/providers/daoxe)                                            | `daoxe/*`                  | `DAOXE_API_KEY`                                                                                       |
| [Databricks](https://mastra.ai/models/providers/databricks)                                  | `databricks/*`             | `DATABRICKS_HOST`, `DATABRICKS_TOKEN`                                                                 |
| [Deep Infra](https://mastra.ai/models/providers/deepinfra)                                   | `deepinfra/*`              | `DEEPINFRA_API_KEY`                                                                                   |
| [DeepSeek](https://mastra.ai/models/providers/deepseek)                                      | `deepseek/*`               | `DEEPSEEK_API_KEY`                                                                                    |
| [DevPass (LLM Gateway)](https://mastra.ai/models/providers/llmgateway)                       | `llmgateway/*`             | `LLMGATEWAY_API_KEY`                                                                                  |
| [DigitalOcean](https://mastra.ai/models/providers/digitalocean)                              | `digitalocean/*`           | `DIGITALOCEAN_ACCESS_TOKEN`                                                                           |
| [DInference](https://mastra.ai/models/providers/dinference)                                  | `dinference/*`             | `DINFERENCE_API_KEY`                                                                                  |
| [EBCloud](https://mastra.ai/models/providers/ebcloud)                                        | `ebcloud/*`                | `EBCLOUD_API_KEY`                                                                                     |
| [Echo](https://mastra.ai/models/providers/echo)                                              | `echo/*`                   | `ECHO_API_KEY`                                                                                        |
| [Eden AI](https://mastra.ai/models/providers/edenai)                                         | `edenai/*`                 | `EDENAI_API_KEY`                                                                                      |
| [EmpirioLabs AI](https://mastra.ai/models/providers/empiriolabs)                             | `empiriolabs/*`            | `EMPIRIOLABS_API_KEY`                                                                                 |
| [engy](https://mastra.ai/models/providers/engy)                                              | `engy/*`                   | `ENGY_API_KEY`                                                                                        |
| [evroc](https://mastra.ai/models/providers/evroc)                                            | `evroc/*`                  | `EVROC_API_KEY`                                                                                       |
| [FastRouter](https://mastra.ai/models/providers/fastrouter)                                  | `fastrouter/*`             | `FASTROUTER_API_KEY`                                                                                  |
| [Fireworks AI](https://mastra.ai/models/providers/fireworks-ai)                              | `fireworks-ai/*`           | `FIREWORKS_API_KEY`                                                                                   |
| [FreeModel](https://mastra.ai/models/providers/freemodel)                                    | `freemodel/*`              | `FREEMODEL_API_KEY`                                                                                   |
| [Friendli](https://mastra.ai/models/providers/friendli)                                      | `friendli/*`               | `FRIENDLI_TOKEN`                                                                                      |
| [FrogBot](https://mastra.ai/models/providers/frogbot)                                        | `frogbot/*`                | `FROGBOT_API_KEY`                                                                                     |
| [GMI Cloud](https://mastra.ai/models/providers/gmicloud)                                     | `gmicloud/*`               | `GMICLOUD_API_KEY`                                                                                    |
| [Google](https://mastra.ai/models/providers/google)                                          | `google/*`                 | `GOOGLE_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`                                                      |
| [GreenPT](https://mastra.ai/models/providers/greenpt)                                        | `greenpt/*`                | `GREENPT_API_KEY`                                                                                     |
| [Groq](https://mastra.ai/models/providers/groq)                                              | `groq/*`                   | `GROQ_API_KEY`                                                                                        |
| [Helicone](https://mastra.ai/models/providers/helicone)                                      | `helicone/*`               | `HELICONE_API_KEY`                                                                                    |
| [Hetzner](https://mastra.ai/models/providers/hetzner)                                        | `hetzner/*`                | `HETZNER_API_KEY`                                                                                     |
| [HPC-AI](https://mastra.ai/models/providers/hpc-ai)                                          | `hpc-ai/*`                 | `HPC_AI_API_KEY`                                                                                      |
| [Hugging Face](https://mastra.ai/models/providers/huggingface)                               | `huggingface/*`            | `HF_TOKEN`                                                                                            |
| [iFlow](https://mastra.ai/models/providers/iflowcn)                                          | `iflowcn/*`                | `IFLOW_API_KEY`                                                                                       |
| [Impossibl](https://mastra.ai/models/providers/impossibl)                                    | `impossibl/*`              | `IMPOSSIBL_API_KEY`                                                                                   |
| [Inception](https://mastra.ai/models/providers/inception)                                    | `inception/*`              | `INCEPTION_API_KEY`                                                                                   |
| [Inceptron](https://mastra.ai/models/providers/inceptron)                                    | `inceptron/*`              | `INCEPTRON_API_KEY`                                                                                   |
| [Inco](https://mastra.ai/models/providers/inco)                                              | `inco/*`                   | `INCO_API_KEY`                                                                                        |
| [Infer by Flow7](https://mastra.ai/models/providers/infer)                                   | `infer/*`                  | `INFER_API_KEY`                                                                                       |
| [Inference](https://mastra.ai/models/providers/inference)                                    | `inference/*`              | `INFERENCE_API_KEY`                                                                                   |
| [InferX](https://mastra.ai/models/providers/inferx)                                          | `inferx/*`                 | `INFERX_API_KEY`                                                                                      |
| [Infomaniak](https://mastra.ai/models/providers/infomaniak)                                  | `infomaniak/*`             | `INFOMANIAK_PRODUCT_ID`, `INFOMANIAK_API_KEY`                                                         |
| [IO.NET](https://mastra.ai/models/providers/io-net)                                          | `io-net/*`                 | `IOINTELLIGENCE_API_KEY`                                                                              |
| [IteraCompute](https://mastra.ai/models/providers/iteracompute)                              | `iteracompute/*`           | `ITERACOMPUTE_API_KEY`                                                                                |
| [Jalapeno Cloud](https://mastra.ai/models/providers/jalapeno)                                | `jalapeno/*`               | `JALAPENO_API_KEY`                                                                                    |
| [Jiekou.AI](https://mastra.ai/models/providers/jiekou)                                       | `jiekou/*`                 | `JIEKOU_API_KEY`                                                                                      |
| [Kenari](https://mastra.ai/models/providers/kenari)                                          | `kenari/*`                 | `KENARI_API_KEY`                                                                                      |
| [Kilo Gateway](https://mastra.ai/models/providers/kilo)                                      | `kilo/*`                   | `KILO_API_KEY`                                                                                        |
| [Kimi For Coding (kimi.ai)](https://mastra.ai/models/providers/kimi-code-plan-global)        | `kimi-code-plan-global/*`  | `KIMI_API_KEY`                                                                                        |
| [Kimi For Coding (kimi.com)](https://mastra.ai/models/providers/kimi-code-plan-cn)           | `kimi-code-plan-cn/*`      | `KIMI_API_KEY`                                                                                        |
| [klokintegration.se](https://mastra.ai/models/providers/klokintegration)                     | `klokintegration/*`        | `KLOKINTEGRATION_API_KEY`                                                                             |
| [Kosmik Compute](https://mastra.ai/models/providers/kosmik)                                  | `kosmik/*`                 | `KOSMIK_API_KEY`                                                                                      |
| [KUAE Cloud Coding Plan](https://mastra.ai/models/providers/kuae-cloud-coding-plan)          | `kuae-cloud-coding-plan/*` | `KUAE_API_KEY`                                                                                        |
| [Lilac](https://mastra.ai/models/providers/lilac)                                            | `lilac/*`                  | `LILAC_API_KEY`                                                                                       |
| [Llama](https://mastra.ai/models/providers/llama)                                            | `llama/*`                  | `LLAMA_API_KEY`                                                                                       |
| [LLM Gateway](https://mastra.ai/models/providers/llmgateway-providers)                       | `llmgateway-providers/*`   | `LLMGATEWAY_API_KEY`                                                                                  |
| [LLM Tech](https://mastra.ai/models/providers/llmtech)                                       | `llmtech/*`                | `LLMTECH_API_KEY`                                                                                     |
| [LLMTR](https://mastra.ai/models/providers/llmtr)                                            | `llmtr/*`                  | `LLMTR_API_KEY`                                                                                       |
| [LMStudio](https://mastra.ai/models/providers/lmstudio)                                      | `lmstudio/*`               | `LMSTUDIO_API_KEY`                                                                                    |
| [LongCat](https://mastra.ai/models/providers/longcat)                                        | `longcat/*`                | `LONGCAT_API_KEY`                                                                                     |
| [LowRouter](https://mastra.ai/models/providers/lowrouter)                                    | `lowrouter/*`              | `LOWROUTER_API_KEY`                                                                                   |
| [LucidQuery](https://mastra.ai/models/providers/lucidquery)                                  | `lucidquery/*`             | `LUCIDQUERY_API_KEY`                                                                                  |
| [Lynkr](https://mastra.ai/models/providers/lynkr)                                            | `lynkr/*`                  | `LYNKR_API_KEY`                                                                                       |
| [Meganova](https://mastra.ai/models/providers/meganova)                                      | `meganova/*`               | `MEGANOVA_API_KEY`                                                                                    |
| [Melious](https://mastra.ai/models/providers/melious)                                        | `melious/*`                | `MELIOUS_API_KEY`                                                                                     |
| [Meta](https://mastra.ai/models/providers/meta)                                              | `meta/*`                   | `META_MODEL_API_KEY`                                                                                  |
| [MiniMax (minimax.cn)](https://mastra.ai/models/providers/minimax-cn)                        | `minimax-cn/*`             | `MINIMAX_API_KEY`                                                                                     |
| [MiniMax (minimax.io)](https://mastra.ai/models/providers/minimax)                           | `minimax/*`                | `MINIMAX_API_KEY`                                                                                     |
| [MiniMax Token Plan (minimax.cn)](https://mastra.ai/models/providers/minimax-cn-coding-plan) | `minimax-cn-coding-plan/*` | `MINIMAX_API_KEY`                                                                                     |
| [MiniMax Token Plan (minimax.io)](https://mastra.ai/models/providers/minimax-coding-plan)    | `minimax-coding-plan/*`    | `MINIMAX_API_KEY`                                                                                     |
| [Mistral](https://mastra.ai/models/providers/mistral)                                        | `mistral/*`                | `MISTRAL_API_KEY`                                                                                     |
| [Mixlayer](https://mastra.ai/models/providers/mixlayer)                                      | `mixlayer/*`               | `MIXLAYER_API_KEY`                                                                                    |
| [Moark](https://mastra.ai/models/providers/moark)                                            | `moark/*`                  | `MOARK_API_KEY`                                                                                       |
| [Modal](https://mastra.ai/models/providers/modal)                                            | `modal/*`                  | `MODAL_PROXY_TOKEN`                                                                                   |
| [Model Oracle AI](https://mastra.ai/models/providers/model-oracle-ai)                        | `model-oracle-ai/*`        | `MODEL_ORACLE_API_KEY`                                                                                |
| [Modelis](https://mastra.ai/models/providers/modelis)                                        | `modelis/*`                | `MODELIS_API_KEY`                                                                                     |
| [ModelScope](https://mastra.ai/models/providers/modelscope)                                  | `modelscope/*`             | `MODELSCOPE_API_KEY`                                                                                  |
| [Moonshot AI](https://mastra.ai/models/providers/moonshotai)                                 | `moonshotai/*`             | `MOONSHOT_API_KEY`                                                                                    |
| [Moonshot AI (China)](https://mastra.ai/models/providers/moonshotai-cn)                      | `moonshotai-cn/*`          | `MOONSHOT_API_KEY`                                                                                    |
| [Morph](https://mastra.ai/models/providers/morph)                                            | `morph/*`                  | `MORPH_API_KEY`                                                                                       |
| [NaN](https://mastra.ai/models/providers/nan)                                                | `nan/*`                    | `NAN_API_KEY`                                                                                         |
| [NanoGPT](https://mastra.ai/models/providers/nano-gpt)                                       | `nano-gpt/*`               | `NANO_GPT_API_KEY`                                                                                    |
| [NEAR AI Cloud](https://mastra.ai/models/providers/nearai)                                   | `nearai/*`                 | `NEARAI_API_KEY`                                                                                      |
| [Nebius Token Factory](https://mastra.ai/models/providers/nebius)                            | `nebius/*`                 | `NEBIUS_API_KEY`                                                                                      |
| [NeoSmith](https://mastra.ai/models/providers/neosmith)                                      | `neosmith/*`               | `NEOSMITH_API_KEY`                                                                                    |
| [Neuralwatt](https://mastra.ai/models/providers/neuralwatt)                                  | `neuralwatt/*`             | `NEURALWATT_API_KEY`                                                                                  |
| [Nova](https://mastra.ai/models/providers/nova)                                              | `nova/*`                   | `NOVA_API_KEY`                                                                                        |
| [Novita AI](https://mastra.ai/models/providers/novita-ai)                                    | `novita-ai/*`              | `NOVITA_API_KEY`                                                                                      |
| [Nvidia](https://mastra.ai/models/providers/nvidia)                                          | `nvidia/*`                 | `NVIDIA_API_KEY`                                                                                      |
| [OCI Generative AI](https://mastra.ai/models/providers/oci)                                  | `oci/*`                    | `OCI_GENAI_API_KEY`                                                                                   |
| [Ofox](https://mastra.ai/models/providers/ofox)                                              | `ofox/*`                   | `OFOX_API_KEY`                                                                                        |
| [Ollama Cloud](https://mastra.ai/models/providers/ollama-cloud)                              | `ollama-cloud/*`           | `OLLAMA_API_KEY`                                                                                      |
| [OpenAI](https://mastra.ai/models/providers/openai)                                          | `openai/*`                 | `OPENAI_API_KEY`                                                                                      |
| [OpenCode](https://mastra.ai/models/providers/opencode)                                      | `opencode/*`               | `OPENCODE_API_KEY`                                                                                    |
| [OpenCode Go](https://mastra.ai/models/providers/opencode-go)                                | `opencode-go/*`            | `OPENCODE_API_KEY`                                                                                    |
| [OpenReason](https://mastra.ai/models/providers/openreason)                                  | `openreason/*`             | `OPENREASON_API_KEY`                                                                                  |
| [Opper](https://mastra.ai/models/providers/opper)                                            | `opper/*`                  | `OPPER_API_KEY`                                                                                       |
| [OrcaRouter](https://mastra.ai/models/providers/orcarouter)                                  | `orcarouter/*`             | `ORCAROUTER_API_KEY`                                                                                  |
| [OVHcloud AI Endpoints](https://mastra.ai/models/providers/ovhcloud)                         | `ovhcloud/*`               | `OVHCLOUD_API_KEY`                                                                                    |
| [Pareto Inference](https://mastra.ai/models/providers/pareto)                                | `pareto/*`                 | `PARETO_API_KEY`                                                                                      |
| [Pendra](https://mastra.ai/models/providers/pendra)                                          | `pendra/*`                 | `PENDRA_API_KEY`                                                                                      |
| [Perplexity](https://mastra.ai/models/providers/perplexity)                                  | `perplexity/*`             | `PERPLEXITY_API_KEY`                                                                                  |
| [Perplexity Agent](https://mastra.ai/models/providers/perplexity-agent)                      | `perplexity-agent/*`       | `PERPLEXITY_API_KEY`                                                                                  |
| [Pioneer](https://mastra.ai/models/providers/pioneer)                                        | `pioneer/*`                | `PIONEER_API_KEY`                                                                                     |
| [Poe](https://mastra.ai/models/providers/poe)                                                | `poe/*`                    | `POE_API_KEY`                                                                                         |
| [Poolside](https://mastra.ai/models/providers/poolside)                                      | `poolside/*`               | `POOLSIDE_API_KEY`                                                                                    |
| [Prime Inference](https://mastra.ai/models/providers/prime)                                  | `prime/*`                  | `PRIME_API_KEY`                                                                                       |
| [Privatemode AI](https://mastra.ai/models/providers/privatemode-ai)                          | `privatemode-ai/*`         | `PRIVATEMODE_API_KEY`                                                                                 |
| [QiHang](https://mastra.ai/models/providers/qihang-ai)                                       | `qihang-ai/*`              | `QIHANG_API_KEY`                                                                                      |
| [Qiniu](https://mastra.ai/models/providers/qiniu-ai)                                         | `qiniu-ai/*`               | `QINIU_API_KEY`                                                                                       |
| [Regolo AI](https://mastra.ai/models/providers/regolo-ai)                                    | `regolo-ai/*`              | `REGOLO_API_KEY`                                                                                      |
| [Requesty](https://mastra.ai/models/providers/requesty)                                      | `requesty/*`               | `REQUESTY_API_KEY`                                                                                    |
| [routing.run](https://mastra.ai/models/providers/routing-run)                                | `routing-run/*`            | `ROUTING_RUN_API_KEY`                                                                                 |
| [RunInfra](https://mastra.ai/models/providers/runinfra)                                      | `runinfra/*`               | `RUNINFRA_GATEWAY_KEY`                                                                                |
| [Sakana AI](https://mastra.ai/models/providers/sakana)                                       | `sakana/*`                 | `SAKANA_API_KEY`                                                                                      |
| [SambaNova](https://mastra.ai/models/providers/sambanova)                                    | `sambanova/*`              | `SAMBANOVA_API_KEY`                                                                                   |
| [Sarvam AI](https://mastra.ai/models/providers/sarvam)                                       | `sarvam/*`                 | `SARVAM_API_KEY`                                                                                      |
| [Scaleway](https://mastra.ai/models/providers/scaleway)                                      | `scaleway/*`               | `SCALEWAY_API_KEY`                                                                                    |
| [SCNet Token Plan](https://mastra.ai/models/providers/scnet-token-plan)                      | `scnet-token-plan/*`       | `SCNET_API_KEY`                                                                                       |
| [SCX.ai](https://mastra.ai/models/providers/scx-ai)                                          | `scx-ai/*`                 | `SCX_API_KEY`                                                                                         |
| [SenseNova (China)](https://mastra.ai/models/providers/sensenova)                            | `sensenova/*`              | `SENSENOVA_API_KEY`                                                                                   |
| [SiliconFlow](https://mastra.ai/models/providers/siliconflow)                                | `siliconflow/*`            | `SILICONFLOW_API_KEY`                                                                                 |
| [SiliconFlow (China)](https://mastra.ai/models/providers/siliconflow-cn)                     | `siliconflow-cn/*`         | `SILICONFLOW_CN_API_KEY`                                                                              |
| [Snowflake Cortex](https://mastra.ai/models/providers/snowflake-cortex)                      | `snowflake-cortex/*`       | `SNOWFLAKE_ACCOUNT`, `SNOWFLAKE_CORTEX_PAT`                                                           |
| [STACKIT](https://mastra.ai/models/providers/stackit)                                        | `stackit/*`                | `STACKIT_API_KEY`                                                                                     |
| [Standard Compute](https://mastra.ai/models/providers/standardcompute)                       | `standardcompute/*`        | `STANDARDCOMPUTE_API_KEY`                                                                             |
| [StepFun (China)](https://mastra.ai/models/providers/stepfun)                                | `stepfun/*`                | `STEPFUN_API_KEY`                                                                                     |
| [StepFun (Global)](https://mastra.ai/models/providers/stepfun-ai)                            | `stepfun-ai/*`             | `STEPFUN_API_KEY`                                                                                     |
| [StepFun Step Plan (China)](https://mastra.ai/models/providers/stepfun-step-plan)            | `stepfun-step-plan/*`      | `STEPFUN_API_KEY`                                                                                     |
| [StepFun Step Plan (Global)](https://mastra.ai/models/providers/stepfun-ai-step-plan)        | `stepfun-ai-step-plan/*`   | `STEPFUN_API_KEY`                                                                                     |
| [Subconscious](https://mastra.ai/models/providers/subconscious)                              | `subconscious/*`           | `SUBCONSCIOUS_API_KEY`                                                                                |
| [submodel](https://mastra.ai/models/providers/submodel)                                      | `submodel/*`               | `SUBMODEL_INSTAGEN_ACCESS_KEY`                                                                        |
| [Synthetic](https://mastra.ai/models/providers/synthetic)                                    | `synthetic/*`              | `SYNTHETIC_API_KEY`                                                                                   |
| [Tempr Gateway](https://mastra.ai/models/providers/tempr)                                    | `tempr/*`                  | `TEMPR_API_KEY`                                                                                       |
| [Tencent Coding Plan (China)](https://mastra.ai/models/providers/tencent-coding-plan)        | `tencent-coding-plan/*`    | `TENCENT_CODING_PLAN_API_KEY`                                                                         |
| [Tencent Token Plan](https://mastra.ai/models/providers/tencent-token-plan)                  | `tencent-token-plan/*`     | `TENCENT_TOKEN_PLAN_API_KEY`                                                                          |
| [Tencent TokenHub](https://mastra.ai/models/providers/tencent-tokenhub)                      | `tencent-tokenhub/*`       | `TENCENT_TOKENHUB_API_KEY`                                                                            |
| [TensorX](https://mastra.ai/models/providers/tensorx)                                        | `tensorx/*`                | `TENSORX_API_KEY`                                                                                     |
| [The Grid AI](https://mastra.ai/models/providers/the-grid-ai)                                | `the-grid-ai/*`            | `THEGRID_API_KEY`                                                                                     |
| [Thinking Machines](https://mastra.ai/models/providers/thinkingmachines)                     | `thinkingmachines/*`       | `TINKER_API_KEY`                                                                                      |
| [Tinfoil](https://mastra.ai/models/providers/tinfoil)                                        | `tinfoil/*`                | `TINFOIL_API_KEY`                                                                                     |
| [Together AI](https://mastra.ai/models/providers/togetherai)                                 | `togetherai/*`             | `TOGETHER_API_KEY`                                                                                    |
| [TokenGo](https://mastra.ai/models/providers/tokengo)                                        | `tokengo/*`                | `TOKENGO_API_KEY`                                                                                     |
| [TokenRouter](https://mastra.ai/models/providers/tokenrouter)                                | `tokenrouter/*`            | `TOKENROUTER_API_KEY`                                                                                 |
| [TrustedRouter](https://mastra.ai/models/providers/trustedrouter)                            | `trustedrouter/*`          | `TRUSTEDROUTER_API_KEY`                                                                               |
| [Umans AI](https://mastra.ai/models/providers/umans-ai)                                      | `umans-ai/*`               | `UMANS_AI_API_KEY`                                                                                    |
| [Umans AI Coding Plan](https://mastra.ai/models/providers/umans-ai-coding-plan)              | `umans-ai-coding-plan/*`   | `UMANS_AI_CODING_PLAN_API_KEY`                                                                        |
| [UnoRouter](https://mastra.ai/models/providers/unorouter)                                    | `unorouter/*`              | `UNOROUTER_API_KEY`                                                                                   |
| [Upstage](https://mastra.ai/models/providers/upstage)                                        | `upstage/*`                | `UPSTAGE_API_KEY`                                                                                     |
| [Vancine](https://mastra.ai/models/providers/vancine)                                        | `vancine/*`                | `VANCINE_API_KEY`                                                                                     |
| [Vispark](https://mastra.ai/models/providers/vispark)                                        | `vispark/*`                | `VISPARK_LAB_API_KEY`                                                                                 |
| [Vivgrid](https://mastra.ai/models/providers/vivgrid)                                        | `vivgrid/*`                | `VIVGRID_API_KEY`                                                                                     |
| [Volcengine Ark](https://mastra.ai/models/providers/volcengine)                              | `volcengine/*`             | `ARK_API_KEY`                                                                                         |
| [Volcengine Ark Coding Plan](https://mastra.ai/models/providers/volcengine-coding-plan)      | `volcengine-coding-plan/*` | `ARK_CODING_PLAN_API_KEY`                                                                             |
| [Vultr](https://mastra.ai/models/providers/vultr)                                            | `vultr/*`                  | `VULTR_API_KEY`                                                                                       |
| [Wafer](https://mastra.ai/models/providers/wafer.ai)                                         | `wafer.ai/*`               | `WAFER_API_KEY`                                                                                       |
| [Wallaby](https://mastra.ai/models/providers/wallaby)                                        | `wallaby/*`                | `WALLABY_API_KEY`                                                                                     |
| [xAI](https://mastra.ai/models/providers/xai)                                                | `xai/*`                    | `XAI_API_KEY`                                                                                         |
| [Xiaomi](https://mastra.ai/models/providers/xiaomi)                                          | `xiaomi/*`                 | `XIAOMI_API_KEY`                                                                                      |
| [Xiaomi Token Plan (China)](https://mastra.ai/models/providers/xiaomi-token-plan-cn)         | `xiaomi-token-plan-cn/*`   | `XIAOMI_API_KEY`                                                                                      |
| [Xiaomi Token Plan (Europe)](https://mastra.ai/models/providers/xiaomi-token-plan-ams)       | `xiaomi-token-plan-ams/*`  | `XIAOMI_API_KEY`                                                                                      |
| [Xiaomi Token Plan (Singapore)](https://mastra.ai/models/providers/xiaomi-token-plan-sgp)    | `xiaomi-token-plan-sgp/*`  | `XIAOMI_API_KEY`                                                                                      |
| [Xpersona](https://mastra.ai/models/providers/xpersona)                                      | `xpersona/*`               | `XPERSONA_API_KEY`                                                                                    |
| [Z.AI](https://mastra.ai/models/providers/zai)                                               | `zai/*`                    | `ZHIPU_API_KEY`                                                                                       |
| [Z.AI Coding Plan](https://mastra.ai/models/providers/zai-coding-plan)                       | `zai-coding-plan/*`        | `ZHIPU_API_KEY`                                                                                       |
| [Zeldoc](https://mastra.ai/models/providers/zeldoc)                                          | `zeldoc/*`                 | `ZELDOC_API_KEY`                                                                                      |
| [Zenifra](https://mastra.ai/models/providers/zenifra)                                        | `zenifra/*`                | `ZENIFRA_AI_KEY`                                                                                      |
| [ZenMux](https://mastra.ai/models/providers/zenmux)                                          | `zenmux/*`                 | `ZENMUX_API_KEY`                                                                                      |
| [Zhipu AI](https://mastra.ai/models/providers/zhipuai)                                       | `zhipuai/*`                | `ZHIPU_API_KEY`                                                                                       |
| [Zhipu AI Coding Plan](https://mastra.ai/models/providers/zhipuai-coding-plan)               | `zhipuai-coding-plan/*`    | `ZHIPU_API_KEY`                                                                                       |
| [Azure OpenAI](https://mastra.ai/models/gateways/azure-openai) (Gateway)                     | `azure-openai/*`           | `AZURE_API_KEY`, `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_SUBSCRIPTION_ID` |
| [Mastra](https://mastra.ai/models/gateways/mastra) (Gateway)                                 | `mastra/*`                 | `MASTRA_GATEWAY_API_KEY`                                                                              |
| [Merge Gateway](https://mastra.ai/models/gateways/merge-gateway) (Gateway)                   | `merge-gateway/*`          | `MERGE_GATEWAY_API_KEY`                                                                               |
| [Neon](https://mastra.ai/models/gateways/neon) (Gateway)                                     | `neon/*`                   | `NEON_AI_GATEWAY_BASE_URL`, `NEON_AI_GATEWAY_TOKEN`                                                   |
| [Netlify](https://mastra.ai/models/gateways/netlify) (Gateway)                               | `netlify/*`                | `NETLIFY_TOKEN`, `NETLIFY_SITE_ID`                                                                    |
| [OpenRouter](https://mastra.ai/models/gateways/openrouter) (Gateway)                         | `openrouter/*`             | `OPENROUTER_API_KEY`                                                                                  |
| [Vercel](https://mastra.ai/models/gateways/vercel) (Gateway)                                 | `vercel/*`                 | `AI_GATEWAY_API_KEY`                                                                                  |

---

## Source: Gateways (`models/gateways`)

Canonical URL: `https://mastra.ai/models/gateways.md`

## Gateway Providers

Gateway providers aggregate multiple model providers and add features like caching, rate limiting, analytics, and automatic failover. Use gateways when you need observability, cost management, or simplified multi-provider access.

### Custom gateways

Create custom gateways for private LLM deployments or specialized provider integrations. See [Custom Gateways](https://mastra.ai/models/gateways/custom-gateways) for implementation details.

### Built-in gateways

- [Azure OpenAI](https://mastra.ai/models/gateways/azure-openai)
- [Mastra](https://mastra.ai/models/gateways/mastra)
- [Merge Gateway](https://mastra.ai/models/gateways/merge-gateway)
- [Neon](https://mastra.ai/models/gateways/neon)
- [Netlify](https://mastra.ai/models/gateways/netlify)
- [OpenRouter](https://mastra.ai/models/gateways/openrouter)
- [Vercel](https://mastra.ai/models/gateways/vercel)

---

## Source: Providers (`models/providers`)

Canonical URL: `https://mastra.ai/models/providers.md`

## Model Providers

Direct access to individual AI model providers. Each provider offers unique models with specific capabilities and pricing.

- [OpenAI](https://mastra.ai/models/providers/openai)
- [Anthropic](https://mastra.ai/models/providers/anthropic)
- [Google](https://mastra.ai/models/providers/google)
- [DeepSeek](https://mastra.ai/models/providers/deepseek)
- [Groq](https://mastra.ai/models/providers/groq)
- [Mistral](https://mastra.ai/models/providers/mistral)
- [xAI](https://mastra.ai/models/providers/xai)
- [302.AI](https://mastra.ai/models/providers/302ai)
- [Abacus](https://mastra.ai/models/providers/abacus)
- [abliteration.ai](https://mastra.ai/models/providers/abliteration-ai)
- [above.dev](https://mastra.ai/models/providers/above)
- [AgentRouter](https://mastra.ai/models/providers/agentrouter)
- [Agnes AI](https://mastra.ai/models/providers/agnes)
- [AI-ROUTER](https://mastra.ai/models/providers/ai-router)
- [AI/ML API](https://mastra.ai/models/providers/aimlapi)
- [ai&](https://mastra.ai/models/providers/aiand)
- [AI21 Labs](https://mastra.ai/models/providers/ai21)
- [ainetcafe](https://mastra.ai/models/providers/ainetcafe)
- [Aixy](https://mastra.ai/models/providers/aixy)
- [AKI.IO](https://mastra.ai/models/providers/aki-io)
- [Alibaba](https://mastra.ai/models/providers/alibaba)
- [Alibaba (China)](https://mastra.ai/models/providers/alibaba-cn)
- [Alibaba Coding Plan](https://mastra.ai/models/providers/alibaba-coding-plan)
- [Alibaba Coding Plan (China)](https://mastra.ai/models/providers/alibaba-coding-plan-cn)
- [Alibaba Token Plan](https://mastra.ai/models/providers/alibaba-token-plan)
- [Alibaba Token Plan (China)](https://mastra.ai/models/providers/alibaba-token-plan-cn)
- [Ambient](https://mastra.ai/models/providers/ambient)
- [AMD](https://mastra.ai/models/providers/amd)
- [AnyAPI](https://mastra.ai/models/providers/anyapi)
- [Arcee](https://mastra.ai/models/providers/arcee)
- [Atomic Chat](https://mastra.ai/models/providers/atomic-chat)
- [Auriko](https://mastra.ai/models/providers/auriko)
- [Bailing](https://mastra.ai/models/providers/bailing)
- [Baseten](https://mastra.ai/models/providers/baseten)
- [Bee by HEOSSI](https://mastra.ai/models/providers/bee)
- [Berget.AI](https://mastra.ai/models/providers/berget)
- [Blue Claw](https://mastra.ai/models/providers/blueclaw)
- [Bothub](https://mastra.ai/models/providers/bothub)
- [Boundless](https://mastra.ai/models/providers/boundless)
- [Cerebras](https://mastra.ai/models/providers/cerebras)
- [Charm Hyper](https://mastra.ai/models/providers/hyper)
- [Chutes](https://mastra.ai/models/providers/chutes)
- [Clarifai](https://mastra.ai/models/providers/clarifai)
- [Claudinio](https://mastra.ai/models/providers/claudinio)
- [ClinePass](https://mastra.ai/models/providers/cline-pass)
- [CloudFerro Sherlock](https://mastra.ai/models/providers/cloudferro-sherlock)
- [Cloudflare Workers AI](https://mastra.ai/models/providers/cloudflare-workers-ai)
- [CoralBricks](https://mastra.ai/models/providers/coralbricks)
- [CoreWeave](https://mastra.ai/models/providers/wandb)
- [Cortecs](https://mastra.ai/models/providers/cortecs)
- [CrofAI](https://mastra.ai/models/providers/crof)
- [CrossModel](https://mastra.ai/models/providers/crossmodel)
- [Crusoe](https://mastra.ai/models/providers/crusoe)
- [D.Run (China)](https://mastra.ai/models/providers/drun)
- [DaoXE](https://mastra.ai/models/providers/daoxe)
- [Databricks](https://mastra.ai/models/providers/databricks)
- [Deep Infra](https://mastra.ai/models/providers/deepinfra)
- [DevPass (LLM Gateway)](https://mastra.ai/models/providers/llmgateway)
- [DigitalOcean](https://mastra.ai/models/providers/digitalocean)
- [DInference](https://mastra.ai/models/providers/dinference)
- [EBCloud](https://mastra.ai/models/providers/ebcloud)
- [Echo](https://mastra.ai/models/providers/echo)
- [Eden AI](https://mastra.ai/models/providers/edenai)
- [EmpirioLabs AI](https://mastra.ai/models/providers/empiriolabs)
- [engy](https://mastra.ai/models/providers/engy)
- [evroc](https://mastra.ai/models/providers/evroc)
- [FastRouter](https://mastra.ai/models/providers/fastrouter)
- [Fireworks AI](https://mastra.ai/models/providers/fireworks-ai)
- [FreeModel](https://mastra.ai/models/providers/freemodel)
- [Friendli](https://mastra.ai/models/providers/friendli)
- [FrogBot](https://mastra.ai/models/providers/frogbot)
- [GMI Cloud](https://mastra.ai/models/providers/gmicloud)
- [GreenPT](https://mastra.ai/models/providers/greenpt)
- [Helicone](https://mastra.ai/models/providers/helicone)
- [Hetzner](https://mastra.ai/models/providers/hetzner)
- [HPC-AI](https://mastra.ai/models/providers/hpc-ai)
- [Hugging Face](https://mastra.ai/models/providers/huggingface)
- [iFlow](https://mastra.ai/models/providers/iflowcn)
- [Impossibl](https://mastra.ai/models/providers/impossibl)
- [Inception](https://mastra.ai/models/providers/inception)
- [Inceptron](https://mastra.ai/models/providers/inceptron)
- [Inco](https://mastra.ai/models/providers/inco)
- [Infer by Flow7](https://mastra.ai/models/providers/infer)
- [Inference](https://mastra.ai/models/providers/inference)
- [InferX](https://mastra.ai/models/providers/inferx)
- [Infomaniak](https://mastra.ai/models/providers/infomaniak)
- [IO.NET](https://mastra.ai/models/providers/io-net)
- [IteraCompute](https://mastra.ai/models/providers/iteracompute)
- [Jalapeno Cloud](https://mastra.ai/models/providers/jalapeno)
- [Jiekou.AI](https://mastra.ai/models/providers/jiekou)
- [Kenari](https://mastra.ai/models/providers/kenari)
- [Kilo Gateway](https://mastra.ai/models/providers/kilo)
- [Kimi For Coding (kimi.ai)](https://mastra.ai/models/providers/kimi-code-plan-global)
- [Kimi For Coding (kimi.com)](https://mastra.ai/models/providers/kimi-code-plan-cn)
- [klokintegration.se](https://mastra.ai/models/providers/klokintegration)
- [Kosmik Compute](https://mastra.ai/models/providers/kosmik)
- [KUAE Cloud Coding Plan](https://mastra.ai/models/providers/kuae-cloud-coding-plan)
- [Lilac](https://mastra.ai/models/providers/lilac)
- [Llama](https://mastra.ai/models/providers/llama)
- [LLM Gateway](https://mastra.ai/models/providers/llmgateway-providers)
- [LLM Tech](https://mastra.ai/models/providers/llmtech)
- [LLMTR](https://mastra.ai/models/providers/llmtr)
- [LMStudio](https://mastra.ai/models/providers/lmstudio)
- [LongCat](https://mastra.ai/models/providers/longcat)
- [LowRouter](https://mastra.ai/models/providers/lowrouter)
- [LucidQuery](https://mastra.ai/models/providers/lucidquery)
- [Lynkr](https://mastra.ai/models/providers/lynkr)
- [Meganova](https://mastra.ai/models/providers/meganova)
- [Melious](https://mastra.ai/models/providers/melious)
- [Meta](https://mastra.ai/models/providers/meta)
- [MiniMax (minimax.cn)](https://mastra.ai/models/providers/minimax-cn)
- [MiniMax (minimax.io)](https://mastra.ai/models/providers/minimax)
- [MiniMax Token Plan (minimax.cn)](https://mastra.ai/models/providers/minimax-cn-coding-plan)
- [MiniMax Token Plan (minimax.io)](https://mastra.ai/models/providers/minimax-coding-plan)
- [Mixlayer](https://mastra.ai/models/providers/mixlayer)
- [Moark](https://mastra.ai/models/providers/moark)
- [Modal](https://mastra.ai/models/providers/modal)
- [Model Oracle AI](https://mastra.ai/models/providers/model-oracle-ai)
- [Modelis](https://mastra.ai/models/providers/modelis)
- [ModelScope](https://mastra.ai/models/providers/modelscope)
- [Moonshot AI](https://mastra.ai/models/providers/moonshotai)
- [Moonshot AI (China)](https://mastra.ai/models/providers/moonshotai-cn)
- [Morph](https://mastra.ai/models/providers/morph)
- [NaN](https://mastra.ai/models/providers/nan)
- [NanoGPT](https://mastra.ai/models/providers/nano-gpt)
- [NEAR AI Cloud](https://mastra.ai/models/providers/nearai)
- [Nebius Token Factory](https://mastra.ai/models/providers/nebius)
- [NeoSmith](https://mastra.ai/models/providers/neosmith)
- [Neuralwatt](https://mastra.ai/models/providers/neuralwatt)
- [Nova](https://mastra.ai/models/providers/nova)
- [Novita AI](https://mastra.ai/models/providers/novita-ai)
- [Nvidia](https://mastra.ai/models/providers/nvidia)
- [OCI Generative AI](https://mastra.ai/models/providers/oci)
- [Ofox](https://mastra.ai/models/providers/ofox)
- [Ollama Cloud](https://mastra.ai/models/providers/ollama-cloud)
- [OpenCode](https://mastra.ai/models/providers/opencode)
- [OpenCode Go](https://mastra.ai/models/providers/opencode-go)
- [OpenReason](https://mastra.ai/models/providers/openreason)
- [Opper](https://mastra.ai/models/providers/opper)
- [OrcaRouter](https://mastra.ai/models/providers/orcarouter)
- [OVHcloud AI Endpoints](https://mastra.ai/models/providers/ovhcloud)
- [Pareto Inference](https://mastra.ai/models/providers/pareto)
- [Pendra](https://mastra.ai/models/providers/pendra)
- [Perplexity](https://mastra.ai/models/providers/perplexity)
- [Perplexity Agent](https://mastra.ai/models/providers/perplexity-agent)
- [Pioneer](https://mastra.ai/models/providers/pioneer)
- [Poe](https://mastra.ai/models/providers/poe)
- [Poolside](https://mastra.ai/models/providers/poolside)
- [Prime Inference](https://mastra.ai/models/providers/prime)
- [Privatemode AI](https://mastra.ai/models/providers/privatemode-ai)
- [QiHang](https://mastra.ai/models/providers/qihang-ai)
- [Qiniu](https://mastra.ai/models/providers/qiniu-ai)
- [Regolo AI](https://mastra.ai/models/providers/regolo-ai)
- [Requesty](https://mastra.ai/models/providers/requesty)
- [routing.run](https://mastra.ai/models/providers/routing-run)
- [RunInfra](https://mastra.ai/models/providers/runinfra)
- [Sakana AI](https://mastra.ai/models/providers/sakana)
- [SambaNova](https://mastra.ai/models/providers/sambanova)
- [Sarvam AI](https://mastra.ai/models/providers/sarvam)
- [Scaleway](https://mastra.ai/models/providers/scaleway)
- [SCNet Token Plan](https://mastra.ai/models/providers/scnet-token-plan)
- [SCX.ai](https://mastra.ai/models/providers/scx-ai)
- [SenseNova (China)](https://mastra.ai/models/providers/sensenova)
- [SiliconFlow](https://mastra.ai/models/providers/siliconflow)
- [SiliconFlow (China)](https://mastra.ai/models/providers/siliconflow-cn)
- [Snowflake Cortex](https://mastra.ai/models/providers/snowflake-cortex)
- [STACKIT](https://mastra.ai/models/providers/stackit)
- [Standard Compute](https://mastra.ai/models/providers/standardcompute)
- [StepFun (China)](https://mastra.ai/models/providers/stepfun)
- [StepFun (Global)](https://mastra.ai/models/providers/stepfun-ai)
- [StepFun Step Plan (China)](https://mastra.ai/models/providers/stepfun-step-plan)
- [StepFun Step Plan (Global)](https://mastra.ai/models/providers/stepfun-ai-step-plan)
- [Subconscious](https://mastra.ai/models/providers/subconscious)
- [submodel](https://mastra.ai/models/providers/submodel)
- [Synthetic](https://mastra.ai/models/providers/synthetic)
- [Tempr Gateway](https://mastra.ai/models/providers/tempr)
- [Tencent Coding Plan (China)](https://mastra.ai/models/providers/tencent-coding-plan)
- [Tencent Token Plan](https://mastra.ai/models/providers/tencent-token-plan)
- [Tencent TokenHub](https://mastra.ai/models/providers/tencent-tokenhub)
- [TensorX](https://mastra.ai/models/providers/tensorx)
- [The Grid AI](https://mastra.ai/models/providers/the-grid-ai)
- [Thinking Machines](https://mastra.ai/models/providers/thinkingmachines)
- [Tinfoil](https://mastra.ai/models/providers/tinfoil)
- [Together AI](https://mastra.ai/models/providers/togetherai)
- [TokenGo](https://mastra.ai/models/providers/tokengo)
- [TokenRouter](https://mastra.ai/models/providers/tokenrouter)
- [TrustedRouter](https://mastra.ai/models/providers/trustedrouter)
- [Umans AI](https://mastra.ai/models/providers/umans-ai)
- [Umans AI Coding Plan](https://mastra.ai/models/providers/umans-ai-coding-plan)
- [UnoRouter](https://mastra.ai/models/providers/unorouter)
- [Upstage](https://mastra.ai/models/providers/upstage)
- [Vancine](https://mastra.ai/models/providers/vancine)
- [Vispark](https://mastra.ai/models/providers/vispark)
- [Vivgrid](https://mastra.ai/models/providers/vivgrid)
- [Volcengine Ark](https://mastra.ai/models/providers/volcengine)
- [Volcengine Ark Coding Plan](https://mastra.ai/models/providers/volcengine-coding-plan)
- [Vultr](https://mastra.ai/models/providers/vultr)
- [Wafer](https://mastra.ai/models/providers/wafer.ai)
- [Wallaby](https://mastra.ai/models/providers/wallaby)
- [Xiaomi](https://mastra.ai/models/providers/xiaomi)
- [Xiaomi Token Plan (China)](https://mastra.ai/models/providers/xiaomi-token-plan-cn)
- [Xiaomi Token Plan (Europe)](https://mastra.ai/models/providers/xiaomi-token-plan-ams)
- [Xiaomi Token Plan (Singapore)](https://mastra.ai/models/providers/xiaomi-token-plan-sgp)
- [Xpersona](https://mastra.ai/models/providers/xpersona)
- [Z.AI](https://mastra.ai/models/providers/zai)
- [Z.AI Coding Plan](https://mastra.ai/models/providers/zai-coding-plan)
- [Zeldoc](https://mastra.ai/models/providers/zeldoc)
- [Zenifra](https://mastra.ai/models/providers/zenifra)
- [ZenMux](https://mastra.ai/models/providers/zenmux)
- [Zhipu AI](https://mastra.ai/models/providers/zhipuai)
- [Zhipu AI Coding Plan](https://mastra.ai/models/providers/zhipuai-coding-plan)
