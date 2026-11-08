<?php
/**
 * Smoke test: plugin fields win over stale ACF keyword_focus.
 *
 * Run: php wordpress-plugins/neo-pulse-app/scripts/test-rest-acf-plugin-merge.php
 */

define( 'ABSPATH', __DIR__ );

require_once dirname( __DIR__ ) . '/includes/wordpress/class-wp-url-normalize.php';

$merged = Neo_Pulse_App_Wp_Url_Normalize::merge_rest_field_objects(
	array( 'keyword_focus' => 'elementor experts', 'date_modifier' => '2026-09-05' ),
	array( 'keyword_focus' => 'what is national seo' )
);

if ( ( $merged['keyword_focus'] ?? '' ) !== 'what is national seo' ) {
	fwrite( STDERR, "plugin keyword should win\n" );
	exit( 1 );
}
if ( ( $merged['date_modifier'] ?? '' ) !== '2026-09-05' ) {
	fwrite( STDERR, "acf date should remain when plugin omits it\n" );
	exit( 1 );
}

$keep_acf = Neo_Pulse_App_Wp_Url_Normalize::merge_rest_field_objects(
	array( 'keyword_focus' => 'from acf' ),
	array( 'keyword_focus' => '' )
);
if ( ( $keep_acf['keyword_focus'] ?? '' ) !== 'from acf' ) {
	fwrite( STDERR, "empty plugin keyword should not wipe acf\n" );
	exit( 1 );
}

$from_plugin_only = Neo_Pulse_App_Wp_Url_Normalize::rest_post_fields_from_post(
	array(
		'acf'               => array( 'keyword_focus' => 'elementor experts' ),
		'neo_pulse_fields'  => array( 'keyword_focus' => 'national seo strategy' ),
	)
);
if ( ( $from_plugin_only['keyword_focus'] ?? '' ) !== 'national seo strategy' ) {
	fwrite( STDERR, "rest_post_fields_from_post should prefer neo_pulse_fields\n" );
	exit( 1 );
}

echo "ok\n";
