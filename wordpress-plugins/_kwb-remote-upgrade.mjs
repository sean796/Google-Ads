import { loadHubSites } from "./deploy/lib/hub-sites.js";

const ZIP_URL =
  "https://neodigital.ca/wp-content/uploads/2026/10/neo-pulse-wp-1.zip";

async function loadKwbAuth() {
  const sitesJson = await loadHubSites();
  const row = (sitesJson.sites || []).find((s) =>
    (s.wpEngineDomain || s.siteUrl || "").includes("kwbllp")
  );
  if (!row?.appPassword) {
    throw new Error("KWB app password missing");
  }
  const pass = String(row.appPassword).replace(/\s+/g, "");
  return Buffer.from(`${row.username}:${pass}`).toString("base64");
}

async function execute(auth, tool, params = {}) {
  const res = await fetch(
    "https://kwbllp.com/wp-json/neo-pulse/v1/tools/execute",
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

const MARK_START = "// NEO_PULSE_ZIP_UPGRADE_229_START";
const MARK_END = "// NEO_PULSE_ZIP_UPGRADE_229_END";

const upgradeBlock = `
${MARK_START}
add_action(
	'init',
	static function () {
		if ( get_option( 'neo_pulse_zip_upgrade_229' ) ) {
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
		update_option( 'neo_pulse_zip_upgrade_229', 1, false );
		if ( class_exists( 'Neo_Pulse_Wp_Activation', false ) ) {
			Neo_Pulse_Wp_Activation::on_activate();
		}
	},
	1
);
${MARK_END}
`;

const auth = await loadKwbAuth();

const before = await execute(auth, "wp_theme_functions_get");
if (!before.ok || !before.data?.content) {
  console.error("GET_FAIL", JSON.stringify(before).slice(0, 400));
  process.exit(1);
}

const original = before.data.content;
if (original.includes(MARK_START)) {
  console.log("UPGRADE_BLOCK_ALREADY_PRESENT");
} else {
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
}

const ping1 = await execute(auth, "wp_ping");
console.log("PING_BEFORE", ping1.data?.version || ping1);

await execute(auth, "wp_ping");

const ping2 = await execute(auth, "wp_ping");
console.log("PING_AFTER", ping2.data?.version || ping2);

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

process.exit(ping2.data?.version === "0.9.229" ? 0 : 1);
