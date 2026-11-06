<?php
/**
 * Mirror NEO Pulse Integrations sites to the private neo-pulse-data root (sites.json).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Sites_Sync {

	private const PRESERVED_INTEGRATION_FIELDS = array(
		'gbpLocationId',
		'ga4PropertyId',
		'googleAdsCustomerId',
		'semrushSiteAuditProjectId',
		'semrushPositionTrackingProjectId',
		'semrushPositionTrackingCampaignId',
		'wpEngineInstall',
		'wpEngineAccountId',
		'benchmarkCustomTag',
		'industryVertical',
		'clientLogoUrl',
		'clientLogoBoxTheme',
	);

	/**
	 * @param array<int,array<string,mixed>> $sites Site rows from browser.
	 * @param array<string,mixed>              $opts  activeSiteId optional.
	 * @return array{ok:bool,count:int}
	 */
	private const SECRET_FIELDS = array( 'appPassword', 'pluginAccessToken', 'slackIncomingWebhookUrl' );

	/**
	 * Site credential rows from the server-only sites value.
	 *
	 * @return array<string,array<string,mixed>> keyed by site id.
	 */
	public static function env_credentials_by_id(): array {
		$raw = '';
		if ( defined( 'NEO_PULSE_APP_SITES_JSON' ) && NEO_PULSE_APP_SITES_JSON !== '' ) {
			$raw = (string) NEO_PULSE_APP_SITES_JSON;
		} else {
			$env = getenv( 'NEO_PULSE_APP_SITES_JSON' );
			$raw = is_string( $env ) ? $env : '';
		}
		if ( $raw === '' ) {
			return array();
		}
		$rows = json_decode( $raw, true );
		if ( ! is_array( $rows ) ) {
			return array();
		}
		$by_id = array();
		foreach ( $rows as $row ) {
			if ( is_array( $row ) && ! empty( $row['id'] ) ) {
				$by_id[ (string) $row['id'] ] = $row;
			}
		}
		return $by_id;
	}

	/**
	 * @param array<int,array<string,mixed>> $sites
	 * @return array<int,array<string,mixed>>
	 */
	public static function strip_site_secrets( array $sites ): array {
		foreach ( $sites as $i => $site ) {
			if ( ! is_array( $site ) ) {
				continue;
			}
			foreach ( self::SECRET_FIELDS as $field ) {
				unset( $sites[ $i ][ $field ] );
			}
		}
		return $sites;
	}

	/**
	 * Server-internal view: mirror rows plus env credentials. Never send to a browser.
	 *
	 * @param array<int,array<string,mixed>> $sites
	 * @return array<int,array<string,mixed>>
	 */
	public static function with_env_credentials( array $sites ): array {
		$creds = self::env_credentials_by_id();
		if ( $creds === array() ) {
			return $sites;
		}
		foreach ( $sites as $i => $site ) {
			if ( ! is_array( $site ) || empty( $site['id'] ) ) {
				continue;
			}
			$row = $creds[ (string) $site['id'] ] ?? null;
			if ( is_array( $row ) ) {
				$sites[ $i ] = array_merge( $site, array_filter( $row, static fn( $v ) => $v !== '' && $v !== null ) );
			}
		}
		return $sites;
	}

	public static function save_mirror( array $sites, array $opts = array() ): array {
		$sites = self::strip_site_secrets( $sites );
		$sites = self::merge_preserved_fields( $sites );
		$payload = array(
			'sites'        => $sites,
			'syncedAt'     => gmdate( 'c' ),
			'activeSiteId' => isset( $opts['activeSiteId'] ) ? (string) $opts['activeSiteId'] : null,
		);
		$path = Neo_Pulse_App_Data_Paths::sites_path();
		if ( ! Neo_Pulse_App_Json_File_Store::write( $path, $payload ) ) {
			throw new RuntimeException( 'Could not write sites mirror: ' . $path );
		}
		return array( 'ok' => true, 'count' => count( $sites ) );
	}

	/**
	 * Keep server-side integration ids (GBP, GA4, Google Ads, Semrush) when a browser sync omits them (stale bundle or partial payload).
	 *
	 * @param array<int,array<string,mixed>> $sites
	 * @return array<int,array<string,mixed>>
	 */
	private static function merge_preserved_fields( array $sites ): array {
		$existing = self::load_mirror();
		if ( ! is_array( $existing ) || empty( $existing['sites'] ) || ! is_array( $existing['sites'] ) ) {
			return $sites;
		}
		$by_id = array();
		foreach ( $existing['sites'] as $row ) {
			if ( ! is_array( $row ) || empty( $row['id'] ) ) {
				continue;
			}
			$by_id[ (string) $row['id'] ] = $row;
		}
		foreach ( $sites as $i => $site ) {
			if ( ! is_array( $site ) || empty( $site['id'] ) ) {
				continue;
			}
			$prev = $by_id[ (string) $site['id'] ] ?? null;
			if ( ! is_array( $prev ) ) {
				continue;
			}
			foreach ( self::PRESERVED_INTEGRATION_FIELDS as $field ) {
				if ( empty( $site[ $field ] ) && ! empty( $prev[ $field ] ) ) {
					$sites[ $i ][ $field ] = (string) $prev[ $field ];
				}
			}
		}
		return $sites;
	}

	public static function save_active_site_id( ?string $active_site_id ): array {
		Neo_Pulse_App_Json_File_Store::write(
			Neo_Pulse_App_Data_Paths::active_site_path(),
			array(
				'activeSiteId' => $active_site_id,
				'updatedAt'    => gmdate( 'c' ),
			)
		);
		return array( 'ok' => true, 'activeSiteId' => $active_site_id );
	}

	/**
	 * @return array<string,mixed>|null
	 */
	public static function load_mirror() {
		$data = Neo_Pulse_App_Json_File_Store::read( Neo_Pulse_App_Data_Paths::sites_path() );
		if ( is_array( $data ) && isset( $data['sites'] ) && is_array( $data['sites'] ) ) {
			$data['sites'] = self::with_env_credentials( $data['sites'] );
		}
		return $data;
	}

	/**
	 * Browser-safe mirror: no credential fields, ever.
	 */
	public static function load_public_mirror() {
		$data = Neo_Pulse_App_Json_File_Store::read( Neo_Pulse_App_Data_Paths::sites_path() );
		if ( is_array( $data ) && isset( $data['sites'] ) && is_array( $data['sites'] ) ) {
			$data['sites'] = self::strip_site_secrets( $data['sites'] );
		}
		return $data;
	}
}
