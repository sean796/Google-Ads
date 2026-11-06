import crypto from "node:crypto";
import { getPool } from "../db/pool.mjs";
import { ensureTenant, auditLog, mapSiteRow, mapGroupRow, SITE_WITH_STATS_SQL } from "../db/tenants.mjs";
import { sendJson } from "../lib/http.mjs";
import { triggerServiceDeploy, deleteService } from "../render-client.mjs";
import { createJob } from "./jobs.mjs";
import { handleSiteUsersRoute, handleBulkUsersRoute } from "./site-users.mjs";
import { handleSiteActivityRoute } from "./site-activity.mjs";

const ENVIRONMENTS = new Set(["production", "staging", "development"]);
const ENV_SUFFIX = { production: "", staging: "-stg", development: "-dev" };

function slugify(input) {
  return String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

async function loadGroups(pool, tenantId) {
  const [groups, sites, tags, groupTags] = await Promise.all([
    pool.query(`SELECT * FROM hosted_site_groups WHERE tenant_id = $1 ORDER BY name ASC`, [tenantId]),
    pool.query(
      `${SITE_WITH_STATS_SQL} WHERE s.tenant_id = $1
       ORDER BY CASE s.environment WHEN 'production' THEN 0 WHEN 'staging' THEN 1 ELSE 2 END, s.display_name ASC`,
      [tenantId],
    ),
    pool.query(`SELECT id, name FROM hosted_tags WHERE tenant_id = $1 ORDER BY name ASC`, [tenantId]),
    pool.query(
      `SELECT gt.group_id, t.id, t.name FROM hosted_group_tags gt
       JOIN hosted_tags t ON t.id = gt.tag_id WHERE t.tenant_id = $1 ORDER BY t.name ASC`,
      [tenantId],
    ),
  ]);
  const envsByGroup = new Map();
  for (const row of sites.rows) {
    const list = envsByGroup.get(row.group_id) ?? [];
    list.push(mapSiteRow(row));
    envsByGroup.set(row.group_id, list);
  }
  const tagsByGroup = new Map();
  for (const row of groupTags.rows) {
    const list = tagsByGroup.get(row.group_id) ?? [];
    list.push({ id: row.id, name: row.name });
    tagsByGroup.set(row.group_id, list);
  }
  return {
    groups: groups.rows.map((g) => mapGroupRow(g, envsByGroup.get(g.id) ?? [], tagsByGroup.get(g.id) ?? [])),
    tags: tags.rows,
  };
}

async function loadSite(pool, tenantId, siteId) {
  const result = await pool.query(`${SITE_WITH_STATS_SQL} WHERE s.id = $1 AND s.tenant_id = $2`, [siteId, tenantId]);
  return result.rows[0] ?? null;
}

function requireWrite(res, auth) {
  if (auth.hostingWrite) return true;
  sendJson(res, 403, { ok: false, error: "Hosting admin required." });
  return false;
}

export async function handleSitesRoute(req, res, subpath, method, body, auth) {
  const parts = subpath.split("/").filter(Boolean);
  const pool = getPool();
  const tenantId = await ensureTenant(auth.teamId);

  if (parts.length === 0 && method === "GET") {
    const data = await loadGroups(pool, tenantId);
    sendJson(res, 200, { ok: true, ...data });
    return;
  }

  if (parts.length === 0 && method === "POST") {
    if (!requireWrite(res, auth)) return;
    const environment = String(body.environment || "production").trim();
    if (!ENVIRONMENTS.has(environment)) {
      sendJson(res, 400, { ok: false, error: "environment must be production, staging, or development." });
      return;
    }
    const primaryDomain = String(body.primaryDomain || "")
      .trim()
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "");
    const region = String(body.region || process.env.NEO_HOST_DEFAULT_REGION || "ohio").trim();

    let group;
    if (body.groupId) {
      const found = await pool.query(`SELECT * FROM hosted_site_groups WHERE id = $1 AND tenant_id = $2`, [
        String(body.groupId),
        tenantId,
      ]);
      group = found.rows[0];
      if (!group) {
        sendJson(res, 404, { ok: false, error: "Site group not found." });
        return;
      }
      const dup = await pool.query(`SELECT id FROM hosted_sites WHERE group_id = $1 AND environment = $2`, [
        group.id,
        environment,
      ]);
      if (dup.rows[0]) {
        sendJson(res, 409, { ok: false, error: `This site already has a ${environment} environment.` });
        return;
      }
    } else {
      const name = String(body.name || "").trim();
      if (!name) {
        sendJson(res, 400, { ok: false, error: "name is required." });
        return;
      }
      const inserted = await pool.query(
        `INSERT INTO hosted_site_groups (tenant_id, name) VALUES ($1, $2)
         ON CONFLICT (tenant_id, name) DO NOTHING RETURNING *`,
        [tenantId, name],
      );
      group = inserted.rows[0];
      if (!group) {
        sendJson(res, 409, { ok: false, error: "A site with that name already exists." });
        return;
      }
    }

    const base = slugify(group.name);
    if (!base) {
      sendJson(res, 400, { ok: false, error: "Site name must contain letters or numbers." });
      return;
    }
    const slug = `${base}${ENV_SUFFIX[environment]}`;
    const reportToken = crypto.randomBytes(24).toString("hex");
    const inserted = await pool.query(
      `INSERT INTO hosted_sites (
        tenant_id, group_id, slug, display_name, environment, primary_domain, region, status, report_token
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,'provisioning',$8)
      ON CONFLICT (tenant_id, slug) DO NOTHING RETURNING *`,
      [tenantId, group.id, slug, group.name, environment, primaryDomain, region, reportToken],
    );
    const row = inserted.rows[0];
    if (!row) {
      sendJson(res, 409, { ok: false, error: `Install name ${slug} is already in use.` });
      return;
    }
    await auditLog({ tenantId, actorUserId: auth.userId, action: "site.create", payload: { siteId: row.id, slug } });
    const job = await createJob({ siteId: row.id, jobType: "provision", payload: { siteId: row.id } });
    sendJson(res, 201, { ok: true, site: mapSiteRow(row), groupId: group.id, jobId: job.id });
    return;
  }

  if (parts[0] === "users-bulk") {
    await handleBulkUsersRoute(res, method, body, auth, tenantId);
    return;
  }

  const siteId = parts[0];
  const row = await loadSite(pool, tenantId, siteId);
  if (!row) {
    sendJson(res, 404, { ok: false, error: "Site not found." });
    return;
  }

  if (parts[1] === "users") {
    await handleSiteUsersRoute(res, row, parts, method, body, auth, tenantId);
    return;
  }

  if (parts[1] === "activity" && parts.length === 2) {
    await handleSiteActivityRoute(res, row, method);
    return;
  }

  if (parts.length === 1 && method === "GET") {
    sendJson(res, 200, { ok: true, site: mapSiteRow(row) });
    return;
  }

  if (parts.length === 1 && method === "DELETE") {
    if (!requireWrite(res, auth)) return;
    for (const serviceId of [row.render_service_id, row.render_db_service_id]) {
      if (serviceId) await deleteService(serviceId);
    }
    await pool.query(`DELETE FROM hosted_sites WHERE id = $1`, [siteId]);
    await pool.query(
      `DELETE FROM hosted_site_groups g WHERE g.id = $1 AND NOT EXISTS (SELECT 1 FROM hosted_sites s WHERE s.group_id = g.id)`,
      [row.group_id],
    );
    await auditLog({ tenantId, actorUserId: auth.userId, action: "site.delete", payload: { siteId, slug: row.slug } });
    sendJson(res, 200, { ok: true });
    return;
  }

  const action = parts[1];
  if (parts.length !== 2 || method !== "POST") {
    sendJson(res, 404, { ok: false, error: "Not found." });
    return;
  }

  if (action === "deploy") {
    if (!requireWrite(res, auth)) return;
    if (!row.render_service_id) {
      sendJson(res, 400, { ok: false, error: "Site has no Render service id." });
      return;
    }
    const deployId = await triggerServiceDeploy(row.render_service_id);
    await pool.query(`INSERT INTO hosted_deploys (site_id, render_deploy_id, status) VALUES ($1, $2, 'triggered')`, [
      siteId,
      deployId,
    ]);
    sendJson(res, 200, { ok: true, deployId });
    return;
  }

  if (action === "backups" || action === "cache-clear" || action === "retry-provision" || action === "health") {
    if (!requireWrite(res, auth)) return;
    const jobType = action === "backups" ? "backup" : action === "cache-clear" ? "cache_clear" : action === "health" ? "health" : "provision";
    if (jobType === "provision" && row.render_service_id) {
      sendJson(res, 409, { ok: false, error: "Environment is already provisioned." });
      return;
    }
    if (jobType === "provision") {
      await pool.query(`UPDATE hosted_sites SET status = 'provisioning', status_message = NULL, updated_at = NOW() WHERE id = $1`, [
        siteId,
      ]);
    }
    const job = await createJob({ siteId, jobType, payload: { siteId } });
    sendJson(res, 202, { ok: true, jobId: job.id });
    return;
  }

  if (action === "ops-agent") {
    if (!requireWrite(res, auth)) return;
    const job = await createJob({
      siteId,
      jobType: "ops_agent",
      payload: { siteId, execute: Boolean(body.execute), prompt: String(body.prompt || "").trim() },
    });
    sendJson(res, 202, { ok: true, jobId: job.id });
    return;
  }

  sendJson(res, 404, { ok: false, error: "Not found." });
}

export async function bootstrapStagingSiteFromEnv() {
  if ((process.env.NEO_HOST_BOOTSTRAP_STAGING || "") !== "1") return;
  const teamId = Number(process.env.NEO_HOST_DEFAULT_TEAM_ID || 1);
  const tenantId = await ensureTenant(teamId, "Neo Digital");
  const pool = getPool();
  const reportToken = (process.env.PULSE_HOST_STAGING_REPORT_TOKEN || "").trim() || null;
  const existing = await pool.query(`SELECT id FROM hosted_sites WHERE slug = 'host-staging' AND tenant_id = $1`, [tenantId]);
  if (existing.rows[0]) {
    // Env is the source of truth for the staging bench: keep token and Render ids in sync.
    await pool.query(
      `UPDATE hosted_sites SET
         report_token = COALESCE($2, report_token),
         render_service_id = COALESCE($3, render_service_id),
         render_db_service_id = COALESCE($4, render_db_service_id),
         updated_at = NOW()
       WHERE id = $1`,
      [
        existing.rows[0].id,
        reportToken,
        process.env.NEO_HOST_STAGING_WP_SERVICE_ID || null,
        process.env.NEO_HOST_STAGING_DB_SERVICE_ID || null,
      ],
    );
    return;
  }
  const domain = (process.env.NEO_HOST_STAGING_DOMAIN || "host-staging.neodigital.ca").trim();
  const siteUrl = `https://${domain.replace(/^https?:\/\//, "")}`;
  const group = await pool.query(
    `INSERT INTO hosted_site_groups (tenant_id, name) VALUES ($1, 'Pulse Host Staging')
     ON CONFLICT (tenant_id, name) DO UPDATE SET updated_at = NOW() RETURNING id`,
    [tenantId],
  );
  await pool.query(
    `INSERT INTO hosted_sites (
      tenant_id, group_id, slug, display_name, environment, primary_domain, region,
      render_service_id, render_db_service_id, disk_gb, status, site_url, wp_admin_url, report_token
    ) VALUES ($1,$2,'host-staging','Pulse Host Staging','staging',$3,$4,$5,$6,10,'active',$7,$8,$9)`,
    [
      tenantId,
      group.rows[0].id,
      domain,
      process.env.NEO_HOST_DEFAULT_REGION || "ohio",
      process.env.NEO_HOST_STAGING_WP_SERVICE_ID || null,
      process.env.NEO_HOST_STAGING_DB_SERVICE_ID || null,
      siteUrl,
      `${siteUrl}/wp-admin/`,
      reportToken,
    ],
  );
}
