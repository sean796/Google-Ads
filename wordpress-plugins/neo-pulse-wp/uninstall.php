<?php
/**
 * Uninstall NEO Pulse WP.
 *
 * Data is kept unless the site opted in by setting the option neo_pulse_wp_remove_data_on_uninstall
 * to a truthy value (no UI yet; e.g. `wp option update neo_pulse_wp_remove_data_on_uninstall 1`).
 * When it is set, the plugin's tables and every neo_pulse… / neo-pulse… option and transient are
 * deleted.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

/**
 * Remove NEO Pulse data from the current site (blog).
 */
function neo_pulse_wp_uninstall_site(): void {
	global $wpdb;

	if ( ! get_option( 'neo_pulse_wp_remove_data_on_uninstall', false ) ) {
		return;
	}

	$tables = array(
		'neo_pulse_wp_overseer_visits',
		'neo_pulse_wp_overseer_reports',
		'neo_pulse_wp_overseer_tasks',
		'neo_pulse_wp_chat_messages',
		'neo_pulse_wp_chat_log_reports',
		'neo_pulse_wp_redirects',
		'neo_pulse_wp_scripts',
		'neo_pulse_wp_search_events',
		'neo_pulse_wp_seo_blocks',
		'neo_pulse_wp_404',
	);
	foreach ( $tables as $table ) {
		$name = $wpdb->prefix . $table;
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.SchemaChange, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$wpdb->query( "DROP TABLE IF EXISTS `{$name}`" );
	}

	foreach ( array(
		'neo_pulse_wp_overseer_prune',
		'neo_pulse_wp_refresh_chat_starters',
		'neo_pulse_wp_search_weekly_terms',
		'neo_pulse_wp_license_refresh',
		'neo_pulse_wp_indexnow_send',
		'neo_pulse_wp_image_seo_retry',
		'neo_pulse_novamira_page_design',
	) as $hook ) {
		wp_unschedule_hook( $hook );
	}

	// Options and transients (neo_pulse… and the older neo-pulse… keys).
	$prefixes = array(
		'neo_pulse',
		'neo-pulse',
		'_transient_neo_pulse',
		'_transient_timeout_neo_pulse',
		'_transient_neo-pulse',
		'_transient_timeout_neo-pulse',
		'_site_transient_neo_pulse',
		'_site_transient_timeout_neo_pulse',
	);
	foreach ( $prefixes as $prefix ) {
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$names = $wpdb->get_col(
			$wpdb->prepare(
				"SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE %s",
				$wpdb->esc_like( $prefix ) . '%'
			)
		);
		foreach ( (array) $names as $name ) {
			delete_option( (string) $name );
		}
	}

	wp_cache_flush();
}

if ( is_multisite() ) {
	$neo_pulse_wp_site_ids = get_sites(
		array(
			'fields' => 'ids',
			'number' => 0,
		)
	);
	foreach ( $neo_pulse_wp_site_ids as $neo_pulse_wp_site_id ) {
		switch_to_blog( (int) $neo_pulse_wp_site_id );
		neo_pulse_wp_uninstall_site();
		restore_current_blog();
	}
} else {
	neo_pulse_wp_uninstall_site();
}
