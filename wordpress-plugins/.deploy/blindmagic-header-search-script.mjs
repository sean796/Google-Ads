import { loadHubSites } from "../deploy/lib/hub-sites.js";

async function auth() {
  const j = await loadHubSites();
  const row = (j.sites || []).find((s) =>
    (s.wpEngineDomain || s.siteUrl || '').includes('blindmagic')
  );
  const pass = String(row.appPassword).replace(/\s+/g, '');
  return Buffer.from(`${row.username}:${pass}`).toString('base64');
}

async function exec(auth, tool, params) {
  const r = await fetch(
    'https://blindmagic.com/wp-json/neo-pulse/v1/tools/execute',
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tool, params }),
    }
  );
  return r.json();
}

const code = `<script>
(function () {
  'use strict';
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) {
      return;
    }
    var launcher = t.closest('.fbs__icon-launcher');
    if (!launcher) {
      return;
    }
    var wrap = launcher.closest('.neo-pulse-search-wrap--header-slot');
    if (!wrap) {
      return;
    }
    e.stopImmediatePropagation();
    if (window.NeoPulseAiSidebarUnify && window.NeoPulseAiSidebarUnify.isMerged()) {
      window.NeoPulseAiSidebarUnify.openTab('search');
      return;
    }
    var shell = wrap._faiSidebarShell;
    if (shell && typeof shell.toggle === 'function') {
      shell.toggle(true);
    }
  }, true);
})();
</script>`;

const basicAuth = await auth();

async function restScripts(method, body, id) {
  const url =
    id != null
      ? `https://blindmagic.com/wp-json/neo-pulse/v1/scripts/${id}`
      : 'https://blindmagic.com/wp-json/neo-pulse/v1/scripts';
  const r = await fetch(url, {
    method,
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json();
}

const list = await restScripts('GET');
const items = list.items ?? [];
const existing = items.find((i) => i.name === 'BM header search fix');
const payload = {
  name: 'BM header search fix',
  placement: 'header',
  priority: 1,
  status: 'active',
  category: 'NEO Pulse',
  code,
};

if (existing?.id) {
  const upd = await restScripts('PUT', { ...payload, id: existing.id }, existing.id);
  console.log('updated', JSON.stringify(upd, null, 2));
} else {
  const cre = await restScripts('POST', payload);
  console.log('created', JSON.stringify(cre, null, 2));
}

const flush = await exec(basicAuth, 'wp_speed_flush', {});
console.log('flush', JSON.stringify(flush, null, 2));
