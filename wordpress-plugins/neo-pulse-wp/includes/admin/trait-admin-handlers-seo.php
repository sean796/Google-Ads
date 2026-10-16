<?php
/**
 * SEO Settings admin_post handlers: save, copy from Rank Math, switch on/off.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Admin_Trait_Handlers_Seo {

	const ACTION_SEO_SAVE   = 'neo_pulse_wp_seo_save';
	const ACTION_SEO_IMPORT = 'neo_pulse_wp_seo_import';
	const ACTION_SEO_404    = 'neo_pulse_wp_seo_404';
	const ACTION_SEO_TOGGLE = 'neo_pulse_wp_seo_toggle';
	const ACTION_SEO_VERIFY = 'neo_pulse_wp_seo_verify';
	const ACTION_SEO_SWITCH  = 'neo_pulse_wp_seo_switch';

	public static function register_seo_handlers(): void {
		add_action( 'admin_post_' . self::ACTION_SEO_SAVE, array( __CLASS__, 'handle_seo_save' ) );
		add_action( 'admin_post_' . self::ACTION_SEO_IMPORT, array( __CLASS__, 'handle_seo_import' ) );
		add_action( 'admin_post_' . self::ACTION_SEO_TOGGLE, array( __CLASS__, 'handle_seo_toggle' ) );
		add_action( 'admin_post_' . self::ACTION_SEO_404, array( __CLASS__, 'handle_seo_404' ) );
		add_action( 'admin_post_' . self::ACTION_SEO_VERIFY, array( __CLASS__, 'handle_seo_verify' ) );
		add_action( 'admin_post_' . self::ACTION_SEO_SWITCH, array( __CLASS__, 'handle_seo_switch' ) );
	}

	private static function seo_guard( string $action ): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to change SEO settings.', 'neo-pulse-wp' ) );
		}
		check_admin_referer( $action, 'neo_pulse_wp_seo_nonce' );
	}

	private static function redirect_to_seo( string $anchor = '' ): void {
		self::redirect_to_page( 'neo-pulse-wp-seo', array(), $anchor );
	}

	public static function handle_seo_toggle(): void {
		self::seo_guard( self::ACTION_SEO_TOGGLE );
		$enable = ! empty( $_POST['enabled'] );
		Neo_Pulse_Wp_Seo_Settings::set_enabled( $enable );
		Neo_Pulse_Wp_Cache_Flush::purge_html_caches();
		$other = Neo_Pulse_Wp_Seo_Settings::other_seo_plugin();
		if ( $enable ) {
			$message = $other !== ''
				/* translators: %s: plugin name */
				? sprintf( __( 'Neo Pulse SEO is switched on and waiting. It takes over the moment %s is deactivated.', 'neo-pulse-wp' ), $other )
				: __( 'Neo Pulse SEO is live. Titles, meta tags and schema now come from Neo Pulse.', 'neo-pulse-wp' );
		} else {
			$message = __( 'Neo Pulse SEO is switched off.', 'neo-pulse-wp' );
		}
		self::set_flash( array( 'kind' => 'seo', 'success' => true, 'message' => $message ) );
		self::redirect_to_seo();
	}

	/**
	 * One click: switch Neo Pulse SEO on and deactivate the other SEO plugin (and its add-ons, e.g.
	 * Rank Math and Rank Math Pro). Only allowed once every switch-over step is ticked, so nothing
	 * (redirects, scripts, verification tags…) is lost when the old plugin goes quiet.
	 */
	public static function handle_seo_switch(): void {
		self::seo_guard( self::ACTION_SEO_SWITCH );
		if ( ! current_user_can( 'activate_plugins' ) ) {
			wp_die( esc_html__( 'You do not have permission to deactivate plugins.', 'neo-pulse-wp' ) );
		}

		$checks   = self::seo_switch_checks();
		$left     = self::seo_steps_left( $checks );
		$accepted = ! empty( $_POST['accept_differences'] ) && self::seo_only_differences_left( $checks );
		if ( $left > 0 && ! $accepted ) {
			self::set_flash(
				array(
					'kind'    => 'seo',
					'success' => false,
					/* translators: %d: steps not done */
					'message' => sprintf( _n( 'Nothing was changed: %d switch-over step isn\'t done yet. Finish it, then try again.', 'Nothing was changed: %d switch-over steps aren\'t done yet. Finish them, then try again.', $left, 'neo-pulse-wp' ), $left ),
				)
			);
			self::redirect_to_seo( 'npwp-seo-switch' );
		}

		$files   = Neo_Pulse_Wp_Seo_Settings::other_seo_plugin_files();
		$network = array();
		foreach ( array_keys( $files ) as $file ) {
			if ( is_multisite() && is_plugin_active_for_network( $file ) ) {
				$network[ $file ] = $files[ $file ];
				unset( $files[ $file ] );
			}
		}

		Neo_Pulse_Wp_Seo_Settings::set_enabled( true );
		if ( $files !== array() ) {
			// Add-ons first (Rank Math Pro before Rank Math), as Plugins → Deactivate would.
			deactivate_plugins( array_reverse( array_keys( $files ) ) );
		}
		Neo_Pulse_Wp_Cache_Flush::purge_html_caches();

		$still = array_filter(
			array_keys( $files ),
			static function ( $file ) {
				return is_plugin_active( $file );
			}
		);
		$off   = array_values( array_diff_key( $files, array_flip( $still ) ) );
		$parts = array();
		if ( $off !== array() ) {
			/* translators: %s: plugin names, e.g. "Rank Math SEO and Rank Math SEO PRO" */
			$parts[] = sprintf( _n( 'Neo Pulse SEO is live and %s has been deactivated (not deleted). Reactivating it in Plugins hands control straight back.', 'Neo Pulse SEO is live and %s have been deactivated (not deleted). Reactivating them in Plugins hands control straight back.', count( $off ), 'neo-pulse-wp' ), wp_sprintf( '%l', $off ) );
		} else {
			$parts[] = __( 'Neo Pulse SEO is switched on.', 'neo-pulse-wp' );
		}
		if ( $still !== array() ) {
			/* translators: %s: plugin names */
			$parts[] = sprintf( __( 'Could not deactivate %s. Deactivate it in Plugins; Neo Pulse takes over the moment it is off.', 'neo-pulse-wp' ), wp_sprintf( '%l', array_values( array_intersect_key( $files, array_flip( $still ) ) ) ) );
		}
		if ( $network !== array() ) {
			/* translators: %s: plugin names */
			$parts[] = sprintf( __( '%s is network-activated, so it has to be deactivated from Network Admin → Plugins.', 'neo-pulse-wp' ), wp_sprintf( '%l', array_values( $network ) ) );
		}
		self::set_flash(
			array(
				'kind'    => 'seo',
				'success' => $still === array() && $network === array(),
				'message' => implode( ' ', $parts ),
			)
		);
		self::redirect_to_seo();
	}

	/**
	 * Move only Rank Math's site verification tags into Script Manager, without re-copying the
	 * SEO settings (which would overwrite anything changed in Neo Pulse since the first copy).
	 */
	public static function handle_seo_verify(): void {
		self::seo_guard( self::ACTION_SEO_VERIFY );
		$line = Neo_Pulse_Wp_Seo_Takeover::import_verify();
		$ok   = Neo_Pulse_Wp_Seo_Takeover::verify_missing() === array();
		self::set_flash(
			array(
				'kind'    => 'seo',
				'success' => $ok,
				'message' => $line !== '' ? $line : __( 'Rank Math has no site verification tags to move.', 'neo-pulse-wp' ),
			)
		);
		self::redirect_to_seo( 'npwp-seo-switch' );
	}

	public static function handle_seo_import(): void {
		self::seo_guard( self::ACTION_SEO_IMPORT );
		$result  = Neo_Pulse_Wp_Seo_Settings::import_from_rank_math();
		$sitemap = Neo_Pulse_Wp_Seo_Settings::import_sitemap_from_rank_math();
		$message = $result['message'];
		if ( $result['ok'] && $sitemap !== '' ) {
			$message .= ' ' . $sitemap;
		}
		if ( $result['ok'] ) {
			foreach ( Neo_Pulse_Wp_Seo_Takeover::import_extras() as $line ) {
				$message .= ' ' . $line;
			}
		}
		self::set_flash( array( 'kind' => 'seo', 'success' => $result['ok'], 'message' => $message ) );
		self::redirect_to_seo();
	}

	public static function handle_seo_save(): void {
		self::seo_guard( self::ACTION_SEO_SAVE );
		$in = isset( $_POST['seo'] ) && is_array( $_POST['seo'] ) ? wp_unslash( $_POST['seo'] ) : array(); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- sanitised per key below.

		$text = static function ( $value ): string {
			return Neo_Pulse_Wp_Seo_Settings::clean_input( $value );
		};
		$changes  = array();
		$warnings = array();

		foreach ( array( 'title_separator', 'homepage_title', 'homepage_description', 'author_archive_title', 'date_archive_title', 'search_title', '404_title', 'knowledgegraph_name', 'website_name', 'website_alternate_name', 'legal_name', 'local_business_type', 'twitter_author_names', 'price_range', 'email' ) as $key ) {
			if ( array_key_exists( $key, $in ) ) {
				$changes[ $key ] = $text( $in[ $key ] );
			}
		}
		if ( isset( $changes['title_separator'] ) && $changes['title_separator'] === '' ) {
			$changes['title_separator'] = '-';
		}
		foreach ( array( 'url', 'social_url_facebook' ) as $key ) {
			if ( array_key_exists( $key, $in ) ) {
				$changes[ $key ] = esc_url_raw( $text( $in[ $key ] ) );
			}
		}
		if ( array_key_exists( 'social_additional_profiles', $in ) && is_string( $in['social_additional_profiles'] ) ) {
			$lines = array();
			foreach ( preg_split( '/\r\n|\r|\n/', (string) $in['social_additional_profiles'] ) as $line ) {
				$line = esc_url_raw( trim( $line ) );
				if ( $line !== '' ) {
					$lines[] = $line;
				}
			}
			$changes['social_additional_profiles'] = implode( "\n", $lines );
		}
		foreach ( array( 'geo_lat' => 90, 'geo_lng' => 180 ) as $key => $max ) {
			if ( array_key_exists( $key, $in ) ) {
				$value = $text( $in[ $key ] );
				$clean = Neo_Pulse_Wp_Business::coordinate( $value, (float) $max );
				if ( $value !== '' && $clean === '' ) {
					$warnings[] = __( 'Latitude and longitude were not changed: use decimal degrees, e.g. 53.5461 and -113.4937.', 'neo-pulse-wp' );
					continue;
				}
				$changes[ $key ] = $clean;
			}
		}
		if ( isset( $in['knowledgegraph_type'] ) ) {
			$changes['knowledgegraph_type'] = 'person' === $in['knowledgegraph_type'] ? 'person' : 'company';
		}
		if ( isset( $in['twitter_card_type'] ) ) {
			$changes['twitter_card_type'] = 'summary' === $in['twitter_card_type'] ? 'summary' : 'summary_large_image';
		}
		foreach ( array( 'knowledgegraph_logo', 'open_graph_image' ) as $key ) {
			if ( array_key_exists( $key, $in ) ) {
				$url                       = esc_url_raw( $text( $in[ $key ] ) );
				$changes[ $key ]           = $url;
				$changes[ $key . '_id' ]   = $url !== '' ? (string) attachment_url_to_postid( $url ) : '';
			}
		}
		foreach ( array( 'noindex_search', 'noindex_empty_taxonomies', 'noindex_paginated_pages', 'noindex_archive_subpages', 'noindex_password_protected', 'capitalize_titles', 'disable_date_archives', 'disable_author_archives', 'neo_pulse_404_monitor' ) as $key ) {
			$changes[ $key ] = ! empty( $in[ $key ] ) ? 'on' : 'off';
		}

		if ( isset( $in['address'] ) && is_array( $in['address'] ) ) {
			$address = array();
			foreach ( array( 'streetAddress', 'addressLocality', 'addressRegion', 'postalCode', 'addressCountry' ) as $key ) {
				$value = $text( $in['address'][ $key ] ?? '' );
				if ( $value !== '' ) {
					$address[ $key ] = $value;
				}
			}
			$changes['local_address'] = $address;
		}
		if ( array_key_exists( 'phone', $in ) ) {
			// Only the first number is on the form; keep any others copied from Rank Math.
			$phone  = $text( $in['phone'] );
			$phones = Neo_Pulse_Wp_Seo_Settings::get( 'phone_numbers', array() );
			$phones = is_array( $phones ) ? array_values( $phones ) : array();
			$first  = isset( $phones[0] ) && is_array( $phones[0] ) ? $phones[0] : array( 'type' => 'customer support' );
			$first['number'] = $phone;
			if ( $phone === '' ) {
				unset( $first['number'] );
			}
			$phones[0]                = $first;
			$changes['phone_numbers'] = $phones;
		}
		if ( array_key_exists( 'opening_hours', $in ) ) {
			$raw_hours = (string) $in['opening_hours'];
			$lines     = array_filter( array_map( 'trim', preg_split( '/\r\n|\r|\n/', $raw_hours ) ) );
			$parsed    = self::seo_parse_hours( $raw_hours );
			$used      = 0;
			foreach ( $lines as $line ) {
				if ( self::seo_parse_hours( $line ) !== array() ) {
					++$used;
				}
			}
			if ( $used === count( $lines ) ) {
				$changes['opening_hours'] = $parsed;
			} else {
				$warnings[] = __( 'Opening hours were not changed: write each line like "Mon-Fri 09:00-17:00".', 'neo-pulse-wp' );
			}
		}

		if ( isset( $in['author_robots'] ) ) {
			self::seo_apply_robots_choice( $changes, 'author', (string) $in['author_robots'] );
		}
		if ( isset( $in['pt'] ) && is_array( $in['pt'] ) ) {
			foreach ( $in['pt'] as $type => $row ) {
				$type = sanitize_key( (string) $type );
				if ( $type === '' || ! post_type_exists( $type ) || ! is_array( $row ) ) {
					continue;
				}
				$changes[ 'pt_' . $type . '_title' ]       = $text( $row['title'] ?? '' );
				$changes[ 'pt_' . $type . '_description' ] = $text( $row['description'] ?? '' );
				self::seo_apply_robots_choice( $changes, 'pt_' . $type, (string) ( $row['robots'] ?? 'default' ) );
				$schema = (string) ( $row['schema'] ?? '' );
				if ( 'keep' === $schema ) {
					continue;
				}
				if ( in_array( $schema, array( 'Article', 'BlogPosting', 'NewsArticle' ), true ) ) {
					$changes[ 'pt_' . $type . '_default_rich_snippet' ] = 'article';
					$changes[ 'pt_' . $type . '_default_article_type' ] = $schema;
				} else {
					$changes[ 'pt_' . $type . '_default_rich_snippet' ] = 'off';
				}
			}
		}
		if ( isset( $in['tax'] ) && is_array( $in['tax'] ) ) {
			foreach ( $in['tax'] as $tax => $row ) {
				$tax = sanitize_key( (string) $tax );
				if ( $tax === '' || ! taxonomy_exists( $tax ) || ! is_array( $row ) ) {
					continue;
				}
				$changes[ 'tax_' . $tax . '_title' ]       = $text( $row['title'] ?? '' );
				$changes[ 'tax_' . $tax . '_description' ] = $text( $row['description'] ?? '' );
				self::seo_apply_robots_choice( $changes, 'tax_' . $tax, (string) ( $row['robots'] ?? 'default' ) );
			}
		}

		// Business details go to the shared option (with Neo Tools) once it exists. Only fields that
		// actually changed are written, so text Neo Tools keeps richer (hours like "8am - 5 PM",
		// phone labels) isn't rewritten by an unchanged form.
		if ( Neo_Pulse_Wp_Business::exists() ) {
			$shared = array();
			foreach ( Neo_Pulse_Wp_Business::SEO_KEYS as $key ) {
				if ( array_key_exists( $key, $changes ) ) {
					if ( 'knowledgegraph_logo_id' !== $key && $changes[ $key ] != Neo_Pulse_Wp_Business::seo_value( $key ) ) { // phpcs:ignore Universal.Operators.StrictComparisons.LooseNotEqual -- '' vs 0 and number strings count as equal.
						$shared[ $key ] = $changes[ $key ];
					}
					unset( $changes[ $key ] );
				}
			}
			if ( $shared !== array() ) {
				$notes   = array();
				$details = Neo_Pulse_Wp_Business::apply_seo_changes( $shared, (array) Neo_Pulse_Wp_Business::stored(), $notes );
				Neo_Pulse_Wp_Business::save( $details, 'neo-pulse' );
				$warnings = array_merge( $warnings, $notes );
			}
		}

		Neo_Pulse_Wp_Seo_Settings::save_titles( $changes );
		Neo_Pulse_Wp_Seo_Settings::save_general(
			array(
				'new_window_external_links' => ! empty( $in['new_window_external_links'] ) ? 'on' : 'off',
				'nofollow_external_links'   => ! empty( $in['nofollow_external_links'] ) ? 'on' : 'off',
			)
		);
		if ( Neo_Pulse_Wp_Seo_Settings::output_active() ) {
			Neo_Pulse_Wp_Cache_Flush::purge_html_caches();
		}
		self::set_flash( array( 'kind' => 'seo', 'success' => $warnings === array(), 'message' => trim( __( 'SEO settings saved.', 'neo-pulse-wp' ) . ' ' . implode( ' ', $warnings ) ) ) );
		self::redirect_to_seo( 'npwp-seo-settings' );
	}

	public static function handle_seo_404(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to manage redirects.', 'neo-pulse-wp' ) );
		}
		check_admin_referer( self::ACTION_SEO_404, 'neo_pulse_wp_seo_nonce' );
		$op = isset( $_POST['op'] ) ? sanitize_key( wp_unslash( (string) $_POST['op'] ) ) : '';
		if ( 'clear' === $op ) {
			Neo_Pulse_Wp_Seo_404::clear();
			$message = __( '404 log cleared.', 'neo-pulse-wp' );
		} else {
			Neo_Pulse_Wp_Seo_404::delete( isset( $_POST['id'] ) ? absint( $_POST['id'] ) : 0 );
			$message = __( 'Entry removed from the 404 log.', 'neo-pulse-wp' );
		}
		self::set_flash( array( 'kind' => 'redirects', 'success' => true, 'message' => $message ) );
		wp_safe_redirect( admin_url( 'admin.php?page=neo-pulse-wp-redirects&action=404' ) );
		exit;
	}

	/**
	 * @param array<string, mixed> $changes Changes being built.
	 * @param string               $prefix  "pt_post", "tax_category" or "author".
	 * @param string               $choice  default|index|noindex.
	 */
	private static function seo_apply_robots_choice( array &$changes, string $prefix, string $choice ): void {
		if ( 'index' === $choice || 'noindex' === $choice ) {
			// Keep other directives (nofollow, noarchive, …) the dropdown does not show.
			$current = Neo_Pulse_Wp_Seo_Settings::robots_list( Neo_Pulse_Wp_Seo_Settings::get( $prefix . '_robots', array() ) );
			$others  = array_values( array_diff( $current, array( 'index', 'noindex' ) ) );
			$changes[ $prefix . '_custom_robots' ] = 'on';
			$changes[ $prefix . '_robots' ]        = array_merge( array( $choice ), $others );
		} else {
			$changes[ $prefix . '_custom_robots' ] = 'off';
		}
	}

	/**
	 * "Monday 09:00-17:00" per line, or "Mon-Fri 09:00-17:00".
	 *
	 * @return array<int, array{day: string, time: string}>
	 */
	public static function seo_parse_hours( string $raw ): array {
		$days  = array_keys( Neo_Pulse_Wp_Seo_Schema::DAYS );
		$short = array();
		foreach ( $days as $day ) {
			$short[ strtolower( substr( $day, 0, 3 ) ) ] = $day;
		}
		$out = array();
		foreach ( preg_split( '/\r\n|\r|\n/', $raw ) as $line ) {
			if ( ! preg_match( '/^\s*([A-Za-z]+)(?:\s*-\s*([A-Za-z]+))?\s+(\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2})\s*$/', $line, $m ) ) {
				continue;
			}
			$from = $short[ strtolower( substr( $m[1], 0, 3 ) ) ] ?? '';
			$to   = $m[2] !== '' ? ( $short[ strtolower( substr( $m[2], 0, 3 ) ) ] ?? '' ) : $from;
			if ( $from === '' || $to === '' ) {
				continue;
			}
			$time  = (string) preg_replace( '/\s+/', '', $m[3] );
			$start = array_search( $from, $days, true );
			$end   = array_search( $to, $days, true );
			for ( $i = (int) $start; $i <= (int) $end; $i++ ) {
				$out[] = array( 'day' => $days[ $i ], 'time' => $time );
			}
		}
		return $out;
	}

	/**
	 * @return array<int, string>
	 */
	public static function seo_hours_lines(): array {
		$lines = array();
		$hours = Neo_Pulse_Wp_Seo_Settings::get( 'opening_hours', array() );
		if ( is_array( $hours ) ) {
			foreach ( $hours as $row ) {
				if ( is_array( $row ) && ! empty( $row['day'] ) && ! empty( $row['time'] ) ) {
					$lines[] = $row['day'] . ' ' . $row['time'];
				}
			}
		}
		return $lines;
	}
}
