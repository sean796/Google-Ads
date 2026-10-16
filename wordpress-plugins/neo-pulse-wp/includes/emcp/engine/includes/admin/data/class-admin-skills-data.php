<?php
/**
 * Agent Skills screen data (spec 8.9).
 *
 * @package EMCP_Tools
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class EMCP_Tools_Admin_Skills_Data {

	/** The Agent Skills module: its switch is the runtime switch. */
	const MODULE = 'agent-skills';

	/** Load EMCP_Tools_Pro_Skills (an admin-only Pro file) outside wp-admin. */
	public static function pro_class(): bool {
		if ( ! class_exists( 'EMCP_Tools_Pro_Skills' ) && class_exists( 'EMCP_Tools_Pro_Loader' ) ) {
			$file = EMCP_Tools_Pro_Loader::path( 'includes/admin/class-pro-skills.php' );
			if ( '' !== $file && file_exists( $file ) ) {
				require_once $file;
			}
		}
		return class_exists( 'EMCP_Tools_Pro_Skills' );
	}

	private static function module_on(): bool {
		return in_array( self::MODULE, (array) get_option( EMCP_Tools_Module::OPTION_ACTIVE, array() ), true );
	}

	/** @return string[] Industry pack labels (front-matter `label:`), read from the bundled skills. */
	private static function packs(): array {
		$dir = class_exists( 'EMCP_Tools_Pro_Loader' ) ? EMCP_Tools_Pro_Loader::path( 'skills/emcp-skills/verticals' ) : '';
		if ( '' === $dir || ! is_dir( $dir ) ) {
			return array();
		}
		$out = array();
		foreach ( (array) glob( $dir . '/*.md' ) as $file ) {
			if ( 'readme.md' === strtolower( basename( (string) $file ) ) ) {
				continue;
			}
			$label = '';
			foreach ( array_slice( (array) @file( (string) $file, FILE_IGNORE_NEW_LINES ), 0, 20 ) as $line ) { // phpcs:ignore WordPress.PHP.NoSilencedErrors
				if ( preg_match( '/^label:\s*(.+?)\s*$/', (string) $line, $m ) ) {
					$label = $m[1];
					break;
				}
			}
			$out[] = '' !== $label ? $label : ucwords( str_replace( '-', ' ', basename( (string) $file, '.md' ) ) );
		}
		sort( $out );
		return $out;
	}

	public function payload(): array {
		$licensed = self::pro_class() && EMCP_Tools_Pro_Skills::user_has_access();
		// Option name mirrors EMCP_Tools_Plugin::OPTION_SERVER_ENABLED (read directly, so
		// this has no dependency on the plugin singleton).
		$server   = '1' === (string) get_option( 'emcp_tools_server_enabled', '1' );
		$module   = self::module_on();
		$catalog  = class_exists( 'EMCP_Tools_Skill_Catalog' ) ? EMCP_Tools_Skill_Catalog::all() : array();
		$custom   = class_exists( 'EMCP_Tools_Custom_Skills' ) ? EMCP_Tools_Custom_Skills::items() : array();
		return array(
			'licensed'      => $licensed,
			'bundled'       => $licensed && EMCP_Tools_Pro_Skills::skills_dir_exists(),
			// The bundled skills: the site's own are counted under `custom`.
			'count'         => count(
				array_filter(
					$catalog,
					static function ( $s ) {
						return 'bundled' === ( $s['source'] ?? 'bundled' );
					}
				)
			),
			'custom'        => array(
				'count'    => count( $custom ),
				'injected' => count( array_filter( array_column( $custom, 'enabled' ) ) ),
				'url'      => admin_url( 'admin.php?page=emcp-tools-skills&view=custom' ),
			),
			'runtime'       => array(
				'module' => $module,
				'server' => $server,
				'live'   => $module && $server,
			),
			// wp_nonce_url() returns an HTML-escaped URL (&amp;), meant for printing
			// into markup; React sets href from a raw string, so decode it here.
			'downloads'     => array(
				'folders'       => $licensed ? html_entity_decode( EMCP_Tools_Pro_Skills::download_url(), ENT_QUOTES ) : '',
				'claudeDesktop' => $licensed ? html_entity_decode( EMCP_Tools_Pro_Skills::download_url( 'claude-desktop' ), ENT_QUOTES ) : '',
			),
			'packs'         => self::packs(),
			'moduleUrl'     => admin_url( 'admin.php?page=emcp-tools-modules' ),
			'connectionUrl' => admin_url( 'admin.php?page=emcp-tools-connection' ),
		);
	}

	/** Switch the Agent Skills module, the same change the Modules screen makes. */
	public function set_runtime( bool $on ): array {
		$registry = class_exists( 'EMCP_Tools_Modules_Registry' ) ? EMCP_Tools_Modules_Registry::instance() : null;
		$known    = $registry ? array_keys( $registry->all() ) : array();
		if ( ! in_array( self::MODULE, $known, true ) ) {
			$known[] = self::MODULE;
		}
		// Unregistered ids already stored stay untouched (apply() keeps only known ones).
		$active = (array) get_option( EMCP_Tools_Module::OPTION_ACTIVE, array() );
		$known  = array_values( array_unique( array_merge( $known, $active ) ) );
		$result = EMCP_Tools_Admin_Modules_Data::apply(
			$active,
			$on ? array( self::MODULE ) : array(),
			$on ? array() : array( self::MODULE ),
			$known,
			array( self::MODULE )
		);
		update_option( EMCP_Tools_Module::OPTION_ACTIVE, $result['active'] );
		return $this->payload();
	}
}
