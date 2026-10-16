<?php
/**
 * The pieces of a Rank Math site that live outside the SEO tags, carried over at switch-over:
 * the Google Analytics tag, robots.txt text, the "send 404s home" setting, and a guard that stops
 * Rank Math deleting its data on uninstall (Neo Pulse keeps reading Rank Math's per-post fields).
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Seo_Takeover {

	const RM_ANALYTICS = 'rank_math_google_analytic_options';
	const GA_ID_OPTION = 'neo_pulse_wp_ga_script_id';
	const GA_NAME      = 'Google Analytics (GA4)';

	const VERIFY_ID_OPTION = 'neo_pulse_wp_verify_script_id';
	const VERIFY_NAME      = 'Site verification tags';

	/**
	 * Rank Math's webmaster-tools fields and the meta tag each one prints.
	 */
	const VERIFY_TAGS = array(
		'google_verify'    => 'google-site-verification',
		'bing_verify'      => 'msvalidate.01',
		'baidu_verify'     => 'baidu-site-verification',
		'yandex_verify'    => 'yandex-verification',
		'pinterest_verify' => 'p:domain_verify',
		'norton_verify'    => 'norton-safeweb-site-verification',
	);

	public static function init(): void {
		// Titles, descriptions, focus keywords, schema and redirect history are stored in Rank Math's
		// fields, which Neo Pulse reads. Several client themes tell Rank Math to wipe them on uninstall.
		add_filter( 'rank_math_clear_data_on_uninstall', '__return_false', PHP_INT_MAX );
		add_filter( 'neo_pulse_wp_script_manager_render_code', array( __CLASS__, 'filter_ga_row' ), 5, 2 );
		add_filter( 'neo_pulse_wp_script_manager_render_code', array( __CLASS__, 'filter_verify_row' ), 5, 2 );
	}

	/**
	 * Everything carried over on "Copy settings from Rank Math".
	 *
	 * @return array<int, string> Summary lines.
	 */
	public static function import_extras(): array {
		$out = array();
		foreach ( array( self::import_ga(), self::import_verify(), self::import_robots_txt(), self::import_404_fallback() ) as $line ) {
			if ( $line !== '' ) {
				$out[] = $line;
			}
		}
		return $out;
	}

	/**
	 * Whether a Rank Math module was switched on (settings stay stored after a module is turned off).
	 */
	public static function rank_math_module( string $module ): bool {
		$modules = get_option( 'rank_math_modules', null );
		return is_array( $modules ) && in_array( $module, $modules, true );
	}

	// ── Google Analytics ────────────────────────────────────────────────────

	/**
	 * @return array{measurement_id: string, install: bool, anonymize: bool, exclude_logged_in: bool}
	 */
	public static function rank_math_ga(): array {
		$raw = get_option( self::RM_ANALYTICS, array() );
		$raw = is_array( $raw ) ? $raw : array();
		$id  = strtoupper( trim( (string) ( $raw['measurement_id'] ?? '' ) ) );
		return array(
			'measurement_id'    => preg_match( '/^G-[A-Z0-9]{4,20}$/', $id ) ? $id : '',
			'install'           => self::rank_math_module( 'analytics' ) && Neo_Pulse_Wp_Seo_Settings::on( $raw['install_code'] ?? '' ),
			'anonymize'         => Neo_Pulse_Wp_Seo_Settings::on( $raw['anonymize_ip'] ?? '' ),
			'exclude_logged_in' => Neo_Pulse_Wp_Seo_Settings::on( $raw['exclude_loggedin'] ?? '' ),
		);
	}

	public static function ga_script_template( string $measurement_id, bool $anonymize ): string {
		$config = $anonymize ? ", { 'anonymize_ip': true }" : '';
		return '<script async src="https://www.googletagmanager.com/gtag/js?id=' . esc_attr( $measurement_id ) . '"></script>' . "\n"
			. "<script>\nwindow.dataLayer = window.dataLayer || [];\nfunction gtag(){dataLayer.push(arguments);}\ngtag('js', new Date());\ngtag('config', '" . esc_js( $measurement_id ) . "'" . $config . ");\n</script>";
	}

	/**
	 * Script Manager row that carries the GA tag, or null.
	 *
	 * @return object|null
	 */
	public static function ga_row() {
		$id = (int) get_option( self::GA_ID_OPTION, 0 );
		if ( $id < 1 ) {
			return null;
		}
		$row = Neo_Pulse_Wp_Script_Manager::get( $id );
		return ( $row && 'trash' !== (string) $row->status ) ? $row : null;
	}

	/**
	 * A script named like ours in any status (names must be unique, trash included).
	 */
	private static function ga_row_id_by_name(): int {
		global $wpdb;
		$table = Neo_Pulse_Wp_Script_Manager::table_name();
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		return (int) $wpdb->get_var( $wpdb->prepare( "SELECT id FROM {$table} WHERE name = %s LIMIT 1", self::GA_NAME ) );
	}

	/**
	 * Another Script Manager script already loading this measurement ID or a Tag Manager container.
	 *
	 * @return array{same_id: string, gtm: array<int, string>}
	 */
	public static function existing_tags( string $measurement_id ): array {
		$own    = (int) get_option( self::GA_ID_OPTION, 0 );
		$result = array(
			'same_id' => '',
			'gtm'     => array(),
		);
		$rows   = Neo_Pulse_Wp_Script_Manager::query(
			array(
				'status'   => 'active',
				'per_page' => 500,
			)
		);
		foreach ( (array) ( $rows['items'] ?? array() ) as $row ) {
			if ( (int) $row->id === $own ) {
				continue;
			}
			$code = (string) $row->code;
			if ( $measurement_id !== '' && stripos( $code, $measurement_id ) !== false && $result['same_id'] === '' ) {
				$result['same_id'] = (string) $row->name;
			}
			if ( preg_match( '/GTM-[A-Z0-9]{4,12}/i', $code ) ) {
				$result['gtm'][] = (string) $row->name;
			}
		}
		return $result;
	}

	public static function import_ga(): string {
		$ga = self::rank_math_ga();
		if ( ! $ga['install'] || $ga['measurement_id'] === '' ) {
			return '';
		}
		if ( self::ga_row() ) {
			/* translators: %s: GA measurement ID */
			return sprintf( __( 'Google Analytics: %s is already in Script Manager.', 'neo-pulse-wp' ), $ga['measurement_id'] );
		}
		$existing = self::existing_tags( $ga['measurement_id'] );
		if ( $existing['same_id'] !== '' ) {
			/* translators: 1: GA measurement ID, 2: script name */
			return sprintf( __( 'Google Analytics: %1$s is already loaded by the Script Manager script "%2$s", so no second tag was added.', 'neo-pulse-wp' ), $ga['measurement_id'], $existing['same_id'] );
		}
		$rules = Neo_Pulse_Wp_Script_Manager_Rules::defaults();
		if ( $ga['exclude_logged_in'] ) {
			$rules['logged_in'] = 'exclude';
		}
		$result = Neo_Pulse_Wp_Script_Manager::save(
			array(
				'id'            => self::ga_row_id_by_name(),
				'name'          => self::GA_NAME,
				'placement'     => 'header',
				'code'          => self::ga_script_template( $ga['measurement_id'], $ga['anonymize'] ),
				'priority'      => 1,
				'category'      => Neo_Pulse_Wp_Overseer_Context::BUILTIN_SCRIPT_CATEGORY,
				'status'        => 'active',
				'display_rules' => $rules,
			)
		);
		if ( empty( $result['ok'] ) || empty( $result['id'] ) ) {
			return __( 'Google Analytics: the tag could not be added to Script Manager.', 'neo-pulse-wp' );
		}
		update_option( self::GA_ID_OPTION, (int) $result['id'], false );
		/* translators: %s: GA measurement ID */
		$line = sprintf( __( 'Google Analytics: %s is in Script Manager and takes over from Rank Math when it is deactivated.', 'neo-pulse-wp' ), $ga['measurement_id'] );
		if ( $existing['gtm'] !== array() ) {
			/* translators: %s: script names */
			$line .= ' ' . sprintf( __( 'Check %s: a Tag Manager container that also sends to this property would count visits twice.', 'neo-pulse-wp' ), '"' . implode( '", "', $existing['gtm'] ) . '"' );
		}
		return $line;
	}

	/**
	 * While Rank Math is still adding the GA tag itself, the Script Manager copy stays quiet.
	 *
	 * @param string $code Script code.
	 * @param object $row  Script row.
	 */
	public static function filter_ga_row( $code, $row ) {
		if ( ! is_object( $row ) || (int) $row->id !== (int) get_option( self::GA_ID_OPTION, 0 ) ) {
			return $code;
		}
		if ( Neo_Pulse_Wp_Seo_Settings::rank_math_active() && self::rank_math_ga()['install'] ) {
			return '';
		}
		return $code;
	}

	// ── Site verification (Search Console, Bing, Pinterest…) ────────────────

	/**
	 * Verification codes saved in Rank Math → General → Webmaster Tools.
	 *
	 * @return array<string, string> meta name => code
	 */
	public static function rank_math_verify(): array {
		$general = get_option( Neo_Pulse_Wp_Seo_Settings::RM_GENERAL, array() );
		$general = is_array( $general ) ? $general : array();
		$out     = array();
		foreach ( self::VERIFY_TAGS as $key => $meta ) {
			$value = trim( (string) ( $general[ $key ] ?? '' ) );
			// Someone may have pasted the whole <meta> tag rather than the code.
			if ( preg_match( '/content\s*=\s*["\']([^"\']+)["\']/i', $value, $m ) ) {
				$value = trim( $m[1] );
			}
			if ( $value !== '' && preg_match( '/^[A-Za-z0-9_\-.:=+\/]{4,200}$/', $value ) ) {
				$out[ $meta ] = $value;
			}
		}
		return $out;
	}

	/**
	 * Script Manager row that carries the verification tags, or null.
	 *
	 * @return object|null
	 */
	public static function verify_row() {
		$id = (int) get_option( self::VERIFY_ID_OPTION, 0 );
		if ( $id < 1 ) {
			return null;
		}
		$row = Neo_Pulse_Wp_Script_Manager::get( $id );
		return ( $row && 'trash' !== (string) $row->status ) ? $row : null;
	}

	/**
	 * Rank Math verification codes that no switched-on Script Manager script prints yet.
	 * The verification row itself counts, even while Rank Math keeps it quiet.
	 *
	 * @return array<string, string> meta name => code
	 */
	public static function verify_missing(): array {
		$codes = self::rank_math_verify();
		if ( $codes === array() ) {
			return array();
		}
		$rows = Neo_Pulse_Wp_Script_Manager::query(
			array(
				'status'   => 'active',
				'per_page' => 500,
			)
		);
		$all = '';
		foreach ( (array) ( $rows['items'] ?? array() ) as $row ) {
			$all .= "\n" . (string) $row->code;
		}
		return array_filter(
			$codes,
			static function ( $code ) use ( $all ) {
				return strpos( $all, $code ) === false;
			}
		);
	}

	public static function import_verify(): string {
		$codes = self::rank_math_verify();
		if ( $codes === array() ) {
			return '';
		}
		$missing = self::verify_missing();
		if ( $missing === array() ) {
			return __( 'Site verification: the verification tags Rank Math adds are already in Script Manager.', 'neo-pulse-wp' );
		}

		$existing = self::verify_row();
		$lines    = array();
		if ( $existing ) {
			$lines[] = rtrim( (string) $existing->code );
		}
		foreach ( $missing as $meta => $code ) {
			$lines[] = '<meta name="' . esc_attr( $meta ) . '" content="' . esc_attr( $code ) . '" />';
		}

		global $wpdb;
		$table   = Neo_Pulse_Wp_Script_Manager::table_name();
		$row_id  = $existing ? (int) $existing->id : (int) $wpdb->get_var( $wpdb->prepare( "SELECT id FROM {$table} WHERE name = %s LIMIT 1", self::VERIFY_NAME ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$result  = Neo_Pulse_Wp_Script_Manager::save(
			array(
				'id'            => $row_id,
				'name'          => self::VERIFY_NAME,
				'placement'     => 'header',
				'code'          => implode( "\n", array_filter( $lines ) ),
				'priority'      => 1,
				'category'      => Neo_Pulse_Wp_Overseer_Context::BUILTIN_SCRIPT_CATEGORY,
				'status'        => 'active',
				'display_rules' => Neo_Pulse_Wp_Script_Manager_Rules::defaults(),
			)
		);
		if ( empty( $result['ok'] ) || empty( $result['id'] ) ) {
			return __( 'Site verification: the verification tags could not be added to Script Manager.', 'neo-pulse-wp' );
		}
		update_option( self::VERIFY_ID_OPTION, (int) $result['id'], false );
		$names = array_map( array( __CLASS__, 'verify_label' ), array_keys( $missing ) );
		return sprintf(
			/* translators: %s: services, e.g. "Google Search Console and Bing" */
			_n(
				'Site verification: the %s verification tag is in Script Manager and takes over from Rank Math when it is deactivated, so the site stays verified.',
				'Site verification: the %s verification tags are in Script Manager and take over from Rank Math when it is deactivated, so the site stays verified.',
				count( $names ),
				'neo-pulse-wp'
			),
			wp_sprintf( '%l', $names )
		);
	}

	/**
	 * Friendly name for a verification meta tag.
	 */
	public static function verify_label( string $meta ): string {
		$labels = array(
			'google-site-verification'          => 'Google Search Console',
			'msvalidate.01'                     => 'Bing',
			'baidu-site-verification'           => 'Baidu',
			'yandex-verification'               => 'Yandex',
			'p:domain_verify'                   => 'Pinterest',
			'norton-safeweb-site-verification'  => 'Norton Safe Web',
		);
		return $labels[ $meta ] ?? $meta;
	}

	/**
	 * While Rank Math is still printing the verification tags itself, the Script Manager copy stays quiet.
	 *
	 * @param string $code Script code.
	 * @param object $row  Script row.
	 */
	public static function filter_verify_row( $code, $row ) {
		if ( ! is_object( $row ) || (int) $row->id !== (int) get_option( self::VERIFY_ID_OPTION, 0 ) ) {
			return $code;
		}
		if ( Neo_Pulse_Wp_Seo_Settings::rank_math_active() ) {
			return '';
		}
		return $code;
	}

	// ── robots.txt ──────────────────────────────────────────────────────────

	public static function rank_math_robots_txt(): string {
		$general = get_option( Neo_Pulse_Wp_Seo_Settings::RM_GENERAL, array() );
		return is_array( $general ) ? trim( (string) ( $general['robots_txt_content'] ?? '' ) ) : '';
	}

	public static function import_robots_txt(): string {
		$text = self::rank_math_robots_txt();
		if ( $text === '' ) {
			return '';
		}
		if ( get_option( Neo_Pulse_Wp_Robots_Txt::OPTION_KEY, null ) !== null ) {
			return __( 'robots.txt: Neo Pulse already has its own robots.txt, so Rank Math\'s was not copied.', 'neo-pulse-wp' );
		}
		Neo_Pulse_Wp_Robots_Txt::save_content( $text );
		return __( 'robots.txt: Rank Math\'s robots.txt copied into Neo Pulse.', 'neo-pulse-wp' );
	}

	// ── 404 fallback ───────────────────────────────────────────────────────

	public static function import_404_fallback(): string {
		$general = get_option( Neo_Pulse_Wp_Seo_Settings::RM_GENERAL, array() );
		if ( ! is_array( $general ) || ! self::rank_math_module( 'redirections' ) ) {
			return '';
		}
		$fallback = (string) ( $general['redirections_fallback'] ?? '' );
		if ( 'custom' === $fallback ) {
			/* translators: %s: address */
			return sprintf( __( 'Redirects: Rank Math sent pages that are not found to %s. Neo Pulse can send them to the homepage (Redirects → Settings) or leave them as normal 404 pages.', 'neo-pulse-wp' ), (string) ( $general['redirections_custom_url'] ?? '' ) );
		}
		if ( 'homepage' !== $fallback ) {
			return '';
		}
		$settings = Neo_Pulse_Wp_Redirects::get_settings();
		if ( ! empty( $settings['fallback_home_enabled'] ) ) {
			return '';
		}
		$code                              = (int) ( $general['redirections_header_code'] ?? 301 );
		$settings['fallback_home_enabled'] = true;
		$settings['fallback_home_type']    = in_array( $code, array( 301, 302 ), true ) ? $code : 301;
		Neo_Pulse_Wp_Redirects::save_settings( $settings );
		return __( 'Redirects: pages that are not found go to the homepage, as they did with Rank Math.', 'neo-pulse-wp' );
	}
}
