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

const marker = 'neo_pulse_bm_header_search_fix';

const block = `

/**
 * ${marker} — header magnifier opens AI Search, not chat (2026-10-06).
 */
add_action( 'init', function () {
	$chat = get_option( 'neo_pulse_wp_chat_settings', array() );
	if ( is_array( $chat ) && ! empty( $chat['header_search_opens_sidebar'] ) ) {
		$chat['header_search_opens_sidebar'] = false;
		update_option( 'neo_pulse_wp_chat_settings', $chat );
	}
	$design = get_option( 'neo_pulse_wp_ai_widgets_design', array() );
	if ( is_array( $design ) ) {
		if ( ! isset( $design['chat_sidebar'] ) || ! is_array( $design['chat_sidebar'] ) ) {
			$design['chat_sidebar'] = array();
		}
		$design['chat_sidebar']['header_search_opens_sidebar'] = false;
		if ( ! isset( $design['search_sidebar'] ) || ! is_array( $design['search_sidebar'] ) ) {
			$design['search_sidebar'] = array();
		}
		$design['search_sidebar']['header_search_opens_sidebar'] = true;
		update_option( 'neo_pulse_wp_ai_widgets_design', $design );
	}
	if ( class_exists( 'Neo_Pulse_Wp_Speed' ) && method_exists( 'Neo_Pulse_Wp_Speed', 'flush_all_caches' ) ) {
		Neo_Pulse_Wp_Speed::flush_all_caches();
	}
	if ( class_exists( 'WpeCommon' ) ) {
		if ( method_exists( 'WpeCommon', 'purge_memcached' ) ) {
			WpeCommon::purge_memcached();
		}
		if ( method_exists( 'WpeCommon', 'purge_varnish_cache' ) ) {
			WpeCommon::purge_varnish_cache();
		}
	}
}, 5 );

add_filter( 'option_neo_pulse_wp_chat_settings', function ( $value ) {
	if ( is_array( $value ) ) {
		$value['header_search_opens_sidebar'] = false;
	}
	return $value;
}, 99 );

add_filter( 'script_loader_tag', function ( $tag, $handle ) {
	if ( $handle === 'neo-pulse-chat-header-search' ) {
		return '';
	}
	return $tag;
}, 10, 2 );
`;

const basicAuth = await auth();
const get = await exec(basicAuth, 'wp_theme_functions_get', {});
const content = get.data?.content ?? get.content ?? '';
if (!content) {
  console.error('functions_get failed', get);
  process.exit(1);
}
if (content.includes(marker)) {
  console.log('Fix already present in functions.php');
} else {
  const newContent = content.replace(/\s*$/, '') + block;
  const put = await exec(basicAuth, 'wp_theme_functions_put', {
    confirm: true,
    content: newContent,
  });
  console.log('functions_put', JSON.stringify(put, null, 2));
  if (!put.ok) process.exit(1);
}

const flush = await exec(basicAuth, 'wp_speed_flush', {});
console.log('speed_flush', JSON.stringify(flush, null, 2));
