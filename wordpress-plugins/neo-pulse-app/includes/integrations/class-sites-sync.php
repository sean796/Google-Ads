<?php
/**
 * Mirror NEO Pulse Integrations sites to uploads/neo-pulse-data/sites.json.
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
	public static function save_mirror( array $sites, array $opts = array() ): array {
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
		return Neo_Pulse_App_Json_File_Store::read( Neo_Pulse_App_Data_Paths::sites_path() );
	}
}
