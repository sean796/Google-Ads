<?php
/**
 * Write operations for the `neo-pulse/write` WordPress Abilities API dispatcher.
 *
 * Implements:
 * - update-business-details (shared with Neo Tools)
 * - update-location
 * - set-page-faqs
 * - clear-page-video-schemas
 * - set-page-schema
 * - set-type-rules
 * - update-settings
 * - undo
 *
 * Every write goes through the plugin's own save functions, supports `dry_run: true`,
 * checks `expected_version` for optimistic concurrency, records a before-state snapshot
 * in `neo_pulse_wp_mcp_history`, and reads back the stored result.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

$neo_pulse_wp_mcp_write_dir = __DIR__ . '/';
require_once $neo_pulse_wp_mcp_write_dir . 'trait-neo-pulse-wp-mcp-write-business-location.php';
require_once $neo_pulse_wp_mcp_write_dir . 'trait-neo-pulse-wp-mcp-write-page-schema.php';
require_once $neo_pulse_wp_mcp_write_dir . 'trait-neo-pulse-wp-mcp-write-settings.php';

final class Neo_Pulse_Wp_Mcp_Write {
	use Neo_Pulse_Wp_Mcp_Write_Trait_Business_Location;
	use Neo_Pulse_Wp_Mcp_Write_Trait_Page_Schema;
	use Neo_Pulse_Wp_Mcp_Write_Trait_Settings;

	/**
	 * Catalog of available write operations.
	 *
	 * @return array<string,mixed>
	 */
	public static function catalog(): array {
		return array(
			'dispatcher' => 'neo-pulse/write',
			'version'    => defined( 'NEO_PULSE_WP_VERSION' ) ? NEO_PULSE_WP_VERSION : '',
			'locked'     => class_exists( 'Neo_Pulse_Wp_Lock', false ) && Neo_Pulse_Wp_Lock::is_locked(),
			'plan'       => class_exists( 'Neo_Pulse_Wp_License', false ) ? Neo_Pulse_Wp_License::plan() : 'pro_ai',
			'operations' => array(
				'update-business-details' => array(
					'description' => 'Patch the shared business details (option neo_business_details, shared with Neo Tools). Only sent fields change; unknown keys are kept. Supports dry_run, expected_version, and create: true.',
					'arguments'   => array(
						'expected_version' => 'string (optional version hash from get-business-details)',
						'create'           => 'boolean (optional; required true if neo_business_details does not exist yet)',
						'dry_run'          => 'boolean (optional; preview before/after without writing)',
						'type'             => 'company | person',
						'name'             => 'string',
						'alternate_name'   => 'string',
						'legal_name'       => 'string',
						'business_type'    => 'string (schema.org letters only, e.g. HomeGoodsStore)',
						'url'              => 'string (URL)',
						'email'            => 'string (email)',
						'price_range'      => 'string',
						'logo'             => 'integer (attachment ID)',
						'logo_light'       => 'integer (attachment ID)',
						'logo_icon'        => 'integer (attachment ID)',
						'locations'        => 'one | several',
						'main_location'    => 'integer (must be a showroom Location post ID)',
						'phones'           => 'array of { number, label } (one-location sites only)',
						'address'          => 'object { street, city, region, postal_code, country } (one-location sites only)',
						'map_url'          => 'string (URL)',
						'geo'              => 'object { lat, lng } (both decimal degrees or both empty; one-location sites only)',
						'hours'            => 'object { monday..sunday => string } (one-location sites only)',
						'social'           => 'object { facebook, instagram, linkedin, x, youtube, tiktok, pinterest, houzz, google }',
						'other_profiles'   => 'array of URL strings',
						'review_url'       => 'string (URL)',
						'review_count'     => 'integer',
					),
				),
				'update-location'         => array(
					'description' => 'Update an existing Location post through location_source (address, phone, map_url, kind, type, geo, profile, hours). Supports dry_run.',
					'arguments'   => array(
						'post_id'    => 'integer (required Location post ID)',
						'dry_run'    => 'boolean (optional)',
						'address'    => 'string',
						'phone'      => 'string',
						'tel'        => 'string',
						'map_url'    => 'string (http/https URL)',
						'kind'       => 'Showroom | Service Area',
						'type'       => 'string (schema.org letters only, e.g. HomeGoodsStore)',
						'lat'        => 'string (decimal degrees)',
						'lng'        => 'string (decimal degrees)',
						'profile'    => 'string (Google Business Profile http/https URL)',
						'hours_line' => 'string',
						'hours'      => 'object { monday..sunday => string }',
					),
				),
				'set-page-faqs'           => array(
					'description' => 'Replace a page or post FAQ schema (rank_math_schema_FAQPage). Pass an empty faqs list to clear it. Supports dry_run and expected_version.',
					'arguments'   => array(
						'post_id'          => 'integer (required unless url is given)',
						'url'              => 'string (optional URL)',
						'faqs'             => 'array of { question, answer }',
						'expected_version' => 'string (optional version from get-page-schema)',
						'dry_run'          => 'boolean (optional)',
					),
				),
				'clear-page-video-schemas' => array(
					'description' => 'Remove all rank_math_schema_VideoObject meta rows on a post (legacy Rank Math / autodetect VideoObject). Page schema type off prevents Neo Pulse from re-adding. Supports dry_run and expected_version.',
					'arguments'   => array(
						'post_id'          => 'integer (required unless url is given)',
						'url'              => 'string (optional URL)',
						'expected_version' => 'string (optional version from get-page-schema)',
						'dry_run'          => 'boolean (optional)',
					),
				),
				'set-page-schema'         => array(
					'description' => 'Set per-page schema type (off, default, WebPage, Article, BlogPosting, NewsArticle) on a post. Supports dry_run and expected_version.',
					'arguments'   => array(
						'post_id'          => 'integer (required unless url is given)',
						'url'              => 'string (optional URL)',
						'type'             => 'off | default | WebPage | Article | BlogPosting | NewsArticle',
						'expected_version' => 'string (optional version from get-page-schema)',
						'dry_run'          => 'boolean (optional)',
					),
				),
				'set-type-rules'          => array(
					'description' => 'Set site-wide schema, title, description, or robots rules per content type (e.g. Pages: no Article). Supports dry_run and expected_version.',
					'arguments'   => array(
						'rules'            => 'object { [post_type]: { schema?: "off"|"Article"|"BlogPosting"|"NewsArticle", robots?: "default"|"index"|"noindex", title?: string, description?: string } }',
						'expected_version' => 'string (optional version from get-settings)',
						'dry_run'          => 'boolean (optional)',
					),
				),
				'update-settings'         => array(
					'description' => 'Patch Neo Pulse SEO settings (titles, indexing, behaviour, social, enabled) through the settings screen sanitiser. Supports dry_run and expected_version.',
					'arguments'   => array(
						'titles'           => 'object (optional)',
						'indexing'         => 'object (optional)',
						'behaviour'        => 'object (optional)',
						'social'           => 'object (optional)',
						'enabled'          => 'boolean (optional)',
						'expected_version' => 'string (optional version from get-settings)',
						'dry_run'          => 'boolean (optional)',
					),
				),
				'undo'                    => array(
					'description' => 'Restore a previous Neo Pulse MCP write by history ID, refusing on conflict unless force: true.',
					'arguments'   => array(
						'id'      => 'string (required history ID from list-history)',
						'force'   => 'boolean (optional; ignore version conflict)',
						'dry_run' => 'boolean (optional)',
					),
				),
			),
		);
	}

	/**
	 * Dispatch a write operation.
	 *
	 * @param string              $operation Operation name.
	 * @param array<string,mixed> $args      Arguments.
	 * @return array<string,mixed>|WP_Error
	 */
	public static function dispatch( string $operation, array $args ) {
		if ( '' === $operation ) {
			return self::catalog();
		}

		if ( class_exists( 'Neo_Pulse_Wp_Lock', false ) && Neo_Pulse_Wp_Lock::is_locked() ) {
			return new WP_Error( 'locked', Neo_Pulse_Wp_Lock::locked_message(), array( 'status' => 403 ) );
		}

		switch ( $operation ) {
			case 'update-business-details':
				return self::update_business_details( $args );
			case 'update-location':
				return self::update_location( $args );
			case 'set-page-faqs':
				return self::set_page_faqs( $args );
			case 'clear-page-video-schemas':
				return self::clear_page_video_schemas( $args );
			case 'set-page-schema':
				return self::set_page_schema( $args );
			case 'set-type-rules':
				return self::set_type_rules( $args );
			case 'update-settings':
				return self::update_settings( $args );
			case 'undo':
				return self::undo( $args );
			default:
				return new WP_Error(
					'invalid_argument',
					sprintf(
						/* translators: %s: operation name */
						__( 'Unknown neo-pulse/write operation "%s". Call with no operation for the catalog.', 'neo-pulse-wp' ),
						$operation
					),
					array( 'status' => 400 )
				);
		}
	}

	/**
	 * `undo`: restore a previous write by history ID.
	 *
	 * @param array<string,mixed> $args Arguments.
	 * @return array<string,mixed>|WP_Error
	 */
	private static function undo( array $args ) {
		if ( ! current_user_can( 'manage_options' ) ) {
			return new WP_Error( 'forbidden', 'You do not have permission to undo MCP writes.', array( 'status' => 403 ) );
		}
		$id = isset( $args['id'] ) ? sanitize_text_field( (string) $args['id'] ) : '';
		if ( '' === $id ) {
			return new WP_Error( 'invalid_argument', 'History id is required for undo.', array( 'status' => 400 ) );
		}

		$entry = Neo_Pulse_Wp_Mcp_History::get( $id );
		if ( null === $entry ) {
			return new WP_Error( 'not_found', sprintf( 'History entry "%s" not found.', $id ), array( 'status' => 404 ) );
		}
		if ( ! empty( $entry['undone'] ) && empty( $args['force'] ) ) {
			return new WP_Error( 'conflict', sprintf( 'History entry "%s" was already undone.', $id ), array( 'status' => 409 ) );
		}

		$snap = isset( $entry['snapshot'] ) && is_array( $entry['snapshot'] ) ? $entry['snapshot'] : array();
		$kind = (string) ( $snap['kind'] ?? '' );

		if ( ! empty( $args['dry_run'] ) ) {
			return array(
				'dry_run'   => true,
				'id'        => $id,
				'operation' => (string) ( $entry['operation'] ?? '' ),
				'snapshot'  => $snap,
			);
		}

		if ( 'option' === $kind ) {
			$option = (string) ( $snap['option'] ?? '' );
			if ( Neo_Pulse_Wp_Business::OPTION === $option ) {
				if ( empty( $snap['existed'] ) || ! is_array( $snap['value'] ) ) {
					delete_option( Neo_Pulse_Wp_Business::OPTION );
					Neo_Pulse_Wp_Business::forget();
				} else {
					Neo_Pulse_Wp_Business::save( $snap['value'], 'neo-pulse' );
				}
			} elseif ( Neo_Pulse_Wp_Seo_Settings::OPTION === $option ) {
				if ( empty( $snap['existed'] ) || ! is_array( $snap['value'] ) ) {
					delete_option( Neo_Pulse_Wp_Seo_Settings::OPTION );
					Neo_Pulse_Wp_Seo_Settings::flush_cache();
				} else {
					Neo_Pulse_Wp_Seo_Settings::save_raw( $snap['value'] );
				}
			}
		} elseif ( 'post_meta' === $kind ) {
			$post_id = (int) ( $snap['post_id'] ?? 0 );
			$meta    = isset( $snap['meta'] ) && is_array( $snap['meta'] ) ? $snap['meta'] : array();
			if ( $post_id > 0 ) {
				foreach ( $meta as $mk => $mv ) {
					if ( '' === $mv || null === $mv ) {
						delete_post_meta( $post_id, (string) $mk );
					} else {
						update_post_meta( $post_id, (string) $mk, $mv );
					}
				}
			}
		} else {
			return new WP_Error( 'invalid_argument', 'Unsupported snapshot kind.', array( 'status' => 400 ) );
		}

		if ( Neo_Pulse_Wp_Seo_Settings::output_active() && class_exists( 'Neo_Pulse_Wp_Cache_Flush' ) ) {
			Neo_Pulse_Wp_Cache_Flush::purge_html_caches();
		}

		Neo_Pulse_Wp_Mcp_History::mark_undone( $id );

		return array(
			'ok'        => true,
			'undone_id' => $id,
			'operation' => (string) ( $entry['operation'] ?? '' ),
		);
	}
}
