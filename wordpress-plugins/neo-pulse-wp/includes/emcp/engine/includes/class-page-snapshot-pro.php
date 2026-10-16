<?php
/**
 * Pro overlay: adds `a11y` + deep `seo` summaries to the page snapshot via the
 * free `emcp_tools_page_snapshot_sections` seam. No paid logic lives in the free
 * tree — the free core supplies only `performance`; this class supplies the two
 * Pro sections, self-gated on the license.
 *
 * @package EMCP_Tools_Pro
 * @since   3.3.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Attaches Pro a11y/seo sections to the page-snapshot seam.
 *
 * @since 3.3.0
 */
class EMCP_Tools_Page_Snapshot_Pro {

	/**
	 * License-gated init. Only attaches the filter on a licensed Pro build.
	 */
	public static function init(): void {
		if ( function_exists( 'emcp_tools_fs' ) && ! emcp_tools_fs()->can_use_premium_code() ) {
			return;
		}
		add_filter( 'emcp_tools_page_snapshot_sections', array( __CLASS__, 'add_sections' ), 10, 4 );
	}

	/**
	 * Seam callback: inject requested Pro sections.
	 *
	 * @param array $sections Sections accumulated so far.
	 * @param int   $post_id  Target post.
	 * @param array $include  Requested heavy sections.
	 * @param array $args     Build args.
	 * @return array
	 */
	public static function add_sections( array $sections, int $post_id, array $include, array $args ): array {
		$want_a11y = in_array( 'a11y', $include, true );
		$want_seo  = in_array( 'seo', $include, true );
		if ( ! $want_a11y && ! $want_seo ) {
			return $sections;
		}

		$ex = self::extract( $post_id );
		if ( null === $ex ) {
			if ( $want_a11y ) {
				$sections['a11y'] = array(
					'available' => false,
					'reason'    => 'unavailable',
				);
			}
			if ( $want_seo ) {
				$sections['seo'] = array(
					'available' => false,
					'reason'    => 'unavailable',
				);
			}
			return $sections;
		}

		if ( $want_a11y && class_exists( 'EMCP_Tools_A11y_Abilities' ) ) {
			$sections['a11y'] = self::summarize( EMCP_Tools_A11y_Abilities::build_a11y_report( $ex ) );
		}
		if ( $want_seo && class_exists( 'EMCP_Tools_Seo_Abilities' ) ) {
			$seo = class_exists( 'EMCP_Tools_Seo_Meta' ) ? EMCP_Tools_Seo_Meta::get( $post_id ) : array();
			$sections['seo'] = self::summarize( EMCP_Tools_Seo_Abilities::build_seo_report( $ex, (array) $seo ) );
		}

		return $sections;
	}

	/**
	 * Build the normalized content view for a post, or null when unavailable.
	 *
	 * @param int $post_id Post ID.
	 * @return array|null
	 */
	private static function extract( int $post_id ): ?array {
		if ( ! class_exists( 'EMCP_Tools_Content_Extractor' ) || ! class_exists( 'EMCP_Tools_Data' ) ) {
			return null;
		}
		// A page with no Elementor data, a document error, or a malformed document
		// yields a best-effort empty-content audit rather than failing the section.
		try {
			$data = new EMCP_Tools_Data();
			$page = $data->get_page_data( $post_id );
		} catch ( \Throwable $e ) {
			$page = array();
		}
		if ( ( function_exists( 'is_wp_error' ) && is_wp_error( $page ) ) || ! is_array( $page ) ) {
			$page = array();
		}
		$host = ( function_exists( 'home_url' ) && function_exists( 'wp_parse_url' ) )
			? (string) wp_parse_url( home_url(), PHP_URL_HOST )
			: '';
		return EMCP_Tools_Content_Extractor::extract( $page, $host );
	}

	/**
	 * Reduce a full audit report ({score, checks, summary}) to a compact section.
	 *
	 * @param array $report Audit report.
	 * @return array
	 */
	private static function summarize( array $report ): array {
		$issues = array();
		foreach ( (array) ( $report['checks'] ?? array() ) as $c ) {
			$status = isset( $c['status'] ) ? (string) $c['status'] : '';
			if ( '' !== $status && 'pass' !== $status ) {
				$issues[] = array(
					'id'     => $c['id'] ?? '',
					'label'  => $c['label'] ?? '',
					'status' => $status,
					'detail' => $c['detail'] ?? '',
				);
			}
		}
		return array(
			'available' => true,
			'score'     => $report['score'] ?? null,
			'summary'   => $report['summary'] ?? null,
			'issues'    => array_slice( $issues, 0, 8 ),
		);
	}
}
