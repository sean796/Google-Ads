<?php
/**
 * Pro granular selector matchers for Neo EMCP Themer.
 *
 * Registered onto the free `emcp_themer_matchers` seam. Every matcher is pure
 * (rule + ctx -> bool). This is the paid differentiator and lives only in pro/.
 *
 * @package EMCP_Tools_Pro
 * @since   3.1.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * @since 3.1.0
 */
class EMCP_Tools_Themer_Pro_Matchers {

	/**
	 * Add the granular matchers to the registry map.
	 *
	 * @param array $matchers Existing matcher map.
	 * @return array
	 */
	public static function register( array $matchers ): array {
		$matchers['post'] = array(
			'specificity' => 40,
			'callback'    => static function ( array $rule, array $ctx ): bool {
				return ! empty( $ctx['is_singular'] ) && (int) ( $ctx['post_id'] ?? 0 ) === (int) EMCP_Tools_Themer_Matcher_Registry::param( $rule );
			},
		);
		$matchers['tax'] = array(
			'specificity' => 30,
			'callback'    => static function ( array $rule, array $ctx ): bool {
				$tax  = EMCP_Tools_Themer_Matcher_Registry::param( $rule );
				$term = (int) EMCP_Tools_Themer_Matcher_Registry::param2( $rule );
				return in_array( $term, (array) ( $ctx['term_ids'][ $tax ] ?? array() ), true );
			},
		);
		$matchers['author'] = array(
			'specificity' => 30,
			'callback'    => static function ( array $rule, array $ctx ): bool {
				return ! empty( $ctx['is_singular'] ) && (int) ( $ctx['author_id'] ?? 0 ) === (int) EMCP_Tools_Themer_Matcher_Registry::param( $rule );
			},
		);
		$matchers['term'] = array(
			'specificity' => 30,
			'callback'    => static function ( array $rule, array $ctx ): bool {
				return ( $ctx['queried_taxonomy'] ?? '' ) === EMCP_Tools_Themer_Matcher_Registry::param( $rule )
					&& (int) ( $ctx['queried_term_id'] ?? 0 ) === (int) EMCP_Tools_Themer_Matcher_Registry::param2( $rule );
			},
		);
		$matchers['author-archive'] = array(
			'specificity' => 30,
			'callback'    => static function ( array $rule, array $ctx ): bool {
				return ! empty( $ctx['is_author'] ) && (int) ( $ctx['author_id'] ?? 0 ) === (int) EMCP_Tools_Themer_Matcher_Registry::param( $rule );
			},
		);
		$matchers['date'] = array(
			'specificity' => 20,
			'callback'    => static function ( array $rule, array $ctx ): bool {
				return ! empty( $ctx['is_date'] );
			},
		);
		return $matchers;
	}

	/**
	 * Selector keys this class adds (for the metabox/validation seam).
	 *
	 * @return string[]
	 */
	public static function selector_keys(): array {
		return array( 'post', 'tax', 'author', 'term', 'author-archive', 'date' );
	}
}
