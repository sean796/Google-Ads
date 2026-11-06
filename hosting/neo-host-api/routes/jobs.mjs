import { getPool } from "../db/pool.mjs";
import { ensureTenant } from "../db/tenants.mjs";
import { sendJson } from "../lib/http.mjs";
import { runBackupJob } from "../jobs/backup.mjs";
import { runHealthJob } from "../jobs/health.mjs";
import { runProvisionJob } from "../jobs/provision.mjs";
import { runCacheClearJob } from "../jobs/cache-clear.mjs";
import { runOpsAgentJob } from "../../agents/hosting-ops-agent.mjs";

export async function createJob({ siteId, jobType, payload }) {
  const result = await getPool().query(
    `INSERT INTO hosting_jobs (site_id, job_type, status, payload_json)
     VALUES ($1, $2, 'queued', $3) RETURNING id, site_id, job_type, status, created_at`,
    [siteId ?? null, jobType, JSON.stringify(payload ?? {})],
  );
  const row = result.rows[0];
  void processJob(row.id).catch((err) => {
    console.error("[neo-host-api] job failed", row.id, err);
  });
  return { id: row.id, siteId: row.site_id, jobType: row.job_type, status: row.status, createdAt: row.created_at };
}

async function processJob(jobId) {
  const pool = getPool();
  const locked = await pool.query(
    `UPDATE hosting_jobs SET status = 'running', updated_at = NOW()
     WHERE id = $1 AND status = 'queued' RETURNING *`,
    [jobId],
  );
  const job = locked.rows[0];
  if (!job) return;

  try {
    let result;
    if (job.job_type === "backup") {
      result = await runBackupJob(job);
    } else if (job.job_type === "health") {
      result = await runHealthJob(job);
    } else if (job.job_type === "ops_agent") {
      result = await runOpsAgentJob(job);
    } else if (job.job_type === "provision") {
      result = await runProvisionJob(job);
    } else if (job.job_type === "cache_clear") {
      result = await runCacheClearJob(job);
    } else {
      result = { ok: false, error: `Unknown job type: ${job.job_type}` };
    }
    await pool.query(
      `UPDATE hosting_jobs SET status = $2, result_json = $3, updated_at = NOW() WHERE id = $1`,
      [jobId, result.ok ? "completed" : "failed", JSON.stringify(result)],
    );
    if (!result.ok) {
      await pool.query(`UPDATE hosting_jobs SET error_message = $2 WHERE id = $1`, [
        jobId,
        result.error || "Job failed",
      ]);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await pool.query(
      `UPDATE hosting_jobs SET status = 'failed', error_message = $2, updated_at = NOW() WHERE id = $1`,
      [jobId, message],
    );
  }
}

export async function handleJobsRoute(req, res, subpath, method, _body, auth) {
  const jobId = subpath.split("/").filter(Boolean)[0];
  if (!jobId || method !== "GET" || !auth?.teamId) {
    sendJson(res, 404, { ok: false, error: "Not found." });
    return;
  }
  const tenantId = await ensureTenant(auth.teamId);
  const result = await getPool().query(
    `SELECT j.* FROM hosting_jobs j
     JOIN hosted_sites s ON s.id = j.site_id
     WHERE j.id = $1 AND s.tenant_id = $2`,
    [jobId, tenantId],
  );
  const row = result.rows[0];
  if (!row) {
    sendJson(res, 404, { ok: false, error: "Job not found." });
    return;
  }
  sendJson(res, 200, {
    ok: true,
    job: {
      id: row.id,
      siteId: row.site_id,
      jobType: row.job_type,
      status: row.status,
      payload: row.payload_json,
      result: row.result_json,
      errorMessage: row.error_message,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  });
}

export async function runCronJob(jobType) {
  const pool = getPool();
  // Degraded sites stay in rotation so they can recover; provisioning/failed ones have nothing to check yet.
  const sites = await pool.query(`SELECT id FROM hosted_sites WHERE status IN ('active', 'degraded')`);
  const jobs = [];
  for (const row of sites.rows) {
    jobs.push(await createJob({ siteId: row.id, jobType, payload: { siteId: row.id, cron: true } }));
  }
  return jobs;
}
