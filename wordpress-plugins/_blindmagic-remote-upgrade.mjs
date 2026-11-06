import { loadHubSites } from "./deploy/lib/hub-sites.js";

const ZIP_URL =
  "https://neodigital.ca/wp-content/uploads/2026/10/neo-pulse-wp-2.zip";

async function loadAuth() {
  const sitesJson = await loadHubSites();
  const row = (sitesJson.sites || []).find((s) =>
    (s.wpEngineDomain || s.siteUrl || "").includes("blindmagic")
  );
  if (!row?.appPassword) {
    throw new Error("Blind Magic app password missing");
  }
  const pass = String(row.appPassword).replace(/\s+/g, "");
  return Buffer.from(`${row.username}:${pass}`).toString("base64");
}

async function execute(auth, tool, params = {}) {
  const res = await fetch(
    "https://blindmagic.com/wp-json/neo-pulse/v1/tools/execute",
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tool, params }),
    }
  );
  return res.json();
}

const MARK_START = "// NEO_PULSE_ZIP_UPGRADE_230_START";
const MARK_END = "// NEO_PULSE_ZIP_UPGRADE_230_END";

const upgradeBlock = `
${MARK_START}
add_action(
	'init',
	static function () {
		if ( get_option( 'neo_pulse_zip_upgrade_230' ) ) {
			return;
		}
		if ( ! current_user_can( 'install_plugins' ) ) {
			return;
		}
		require_once ABSPATH . 'wp-admin/includes/file.php';
		require_once ABSPATH . 'wp-admin/includes/plugin.php';
		require_once ABSPATH . 'wp-admin/includes/class-wp-upgrader.php';
		$tmp = download_url( '${ZIP_URL}', 300 );
		if ( is_wp_error( $tmp ) ) {
			return;
		}
		$skin     = new Automatic_Upgrader_Skin();
		$upgrader = new Plugin_Upgrader( $skin );
		$installed = $upgrader->install( $tmp, array( 'overwrite_package' => true ) );
		@unlink( $tmp );
		if ( is_wp_error( $installed ) || ! $installed ) {
			return;
		}
		update_option( 'neo_pulse_zip_upgrade_230', 1, false );
		if ( class_exists( 'Neo_Pulse_Wp_Activation', false ) ) {
			Neo_Pulse_Wp_Activation::on_activate();
		}
	},
	1
);
${MARK_END}
`;

const auth = await loadAuth();

const before = await execute(auth, "wp_theme_functions_get");
if (!before.ok || !before.data?.content) {
  console.error("GET_FAIL", JSON.stringify(before).slice(0, 400));
  process.exit(1);
}

const original = before.data.content;
if (!original.includes(MARK_START)) {
  const next = original.replace(/\s*$/, "\n") + upgradeBlock;
  const put = await execute(auth, "wp_theme_functions_put", {
    content: next,
    confirm: true,
  });
  if (!put.ok) {
    console.error("PUT_FAIL", JSON.stringify(put).slice(0, 400));
    process.exit(1);
  }
  console.log("PUT_OK");
} else {
  console.log("UPGRADE_BLOCK_ALREADY_PRESENT");
}

const pingBefore = await execute(auth, "wp_ping");
console.log("PING_BEFORE", pingBefore.data?.version || pingBefore);

const adminKick = await fetch("https://blindmagic.com/wp-admin/", {
  headers: { Authorization: `Basic ${auth}` },
  redirect: "follow",
});
console.log("ADMIN_KICK", adminKick.status);

await new Promise((r) => setTimeout(r, 8000));

const pingAfter = await execute(auth, "wp_ping");
console.log("PING_AFTER", pingAfter.data?.version || pingAfter);

const afterGet = await execute(auth, "wp_theme_functions_get");
if (afterGet.ok && afterGet.data?.content) {
  let cleaned = afterGet.data.content;
  const start = cleaned.indexOf(MARK_START);
  const end = cleaned.indexOf(MARK_END);
  if (start !== -1 && end !== -1) {
    cleaned =
      cleaned.slice(0, start).replace(/\s*$/, "\n") +
      cleaned.slice(end + MARK_END.length).replace(/^\s*/, "");
    const restore = await execute(auth, "wp_theme_functions_put", {
      content: cleaned,
      confirm: true,
    });
    console.log("RESTORE", restore.ok ? "OK" : JSON.stringify(restore).slice(0, 200));
  }
}

process.exit(pingAfter.data?.version === "0.9.230" ? 0 : 1);
