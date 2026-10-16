<?php
/**
 * Custom skills screen data (Skills > Custom skills).
 *
 * @package EMCP_Tools
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class EMCP_Tools_Admin_Custom_Skills_Data {

	/** The screen payload: the list, the rail stats and the limits. */
	public function payload(): array {
		$skills  = new EMCP_Tools_Admin_Skills_Data();
		$base    = $skills->payload();
		$catalog = class_exists( 'EMCP_Tools_Skill_Catalog' ) ? EMCP_Tools_Skill_Catalog::all() : array();
		$bundled = count(
			array_filter(
				$catalog,
				static function ( $s ) {
					return 'bundled' === ( $s['source'] ?? '' );
				}
			)
		);
		$custom  = count(
			array_filter(
				$catalog,
				static function ( $s ) {
					return 'custom' === ( $s['source'] ?? '' );
				}
			)
		);
		$text    = class_exists( 'EMCP_Tools_Skill_Catalog' ) ? EMCP_Tools_Skill_Catalog::discovery_catalog( '' ) : '';
		return array(
			'licensed' => $base['licensed'],
			'items'    => EMCP_Tools_Custom_Skills::items(),
			'stats'    => array(
				'bundled'       => $bundled,
				'custom'        => $custom,
				'catalogTokens' => EMCP_Tools_Admin_Context_Data::tokens( $text ),
				'budget'        => EMCP_Tools_Admin_Context_Data::BUDGET,
			),
			'runtime'  => $base['runtime'],
			'limits'   => array(
				'name'        => EMCP_Tools_Custom_Skills::MAX_NAME,
				'description' => EMCP_Tools_Custom_Skills::MAX_DESCRIPTION,
				'body'        => EMCP_Tools_Custom_Skills::MAX_BODY,
			),
			'backUrl'  => admin_url( 'admin.php?page=emcp-tools-skills' ),
			'moduleUrl' => $base['moduleUrl'],
		);
	}
}
