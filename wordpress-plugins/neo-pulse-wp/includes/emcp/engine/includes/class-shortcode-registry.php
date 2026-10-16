<?php
/**
 * Shortcode Registry — the single place a generated widget may embed another
 * plugin's output.
 *
 * The Widget Builder's `shortcode` control names a PROVIDER from the allowlist
 * below (`tag`); the end user picks one of that provider's items in the editor
 * and the stored value is the item id. Rendering goes through render(), which
 * refuses anything not on the list, casts the id to an int, checks the item
 * exists, and guards against a template that embeds the widget embedding it.
 * No widget spec ever contains a shortcode string, and this is the only file in
 * the sandbox path that calls do_shortcode().
 *
 * @package EMCP_Tools
 * @since   3.18.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Allowlisted shortcode providers for generated widgets.
 *
 * @since 3.18.0
 */
class EMCP_Tools_Shortcode_Registry {

	/** Max nesting of render() calls (template inside template inside …). */
	const MAX_DEPTH = 3;

	/** @var array<string, bool> Test-only overrides of active(). */
	private static $forced = array();

	/** @var array<string, true> Items currently being rendered, keyed "tag:id". */
	private static $stack = array();

	/**
	 * The provider allowlist: tag => definition.
	 *
	 * @return array<string, array{label:string, kind:string, post_type?:string, shortcode?:string, plugin:string}>
	 */
	public static function providers(): array {
		return array(
			'elementor-template' => array(
				'label'     => 'Elementor Template',
				'kind'      => 'elementor',
				'post_type' => 'elementor_library',
				'plugin'    => 'Elementor',
			),
			'contact-form-7'     => array(
				'label'     => 'Contact Form 7',
				'kind'      => 'post_type',
				'post_type' => 'wpcf7_contact_form',
				'shortcode' => '[contact-form-7 id="%d"]',
				'plugin'    => 'Contact Form 7',
			),
			'wpforms'            => array(
				'label'     => 'WPForms',
				'kind'      => 'post_type',
				'post_type' => 'wpforms',
				'shortcode' => '[wpforms id="%d"]',
				'plugin'    => 'WPForms',
			),
			'gravityform'        => array(
				'label'     => 'Gravity Forms',
				'kind'      => 'gravity',
				'shortcode' => '[gravityform id="%d" ajax="true"]',
				'plugin'    => 'Gravity Forms',
			),
			'fluentform'         => array(
				'label'     => 'Fluent Forms',
				'kind'      => 'fluent',
				'shortcode' => '[fluentform id="%d"]',
				'plugin'    => 'Fluent Forms',
			),
			'forminator_form'    => array(
				'label'     => 'Forminator',
				'kind'      => 'post_type',
				'post_type' => 'forminator_forms',
				'shortcode' => '[forminator_form id="%d"]',
				'plugin'    => 'Forminator',
			),
		);
	}

	/** @return string[] */
	public static function tags(): array {
		return array_keys( self::providers() );
	}

	/**
	 * Strict allowlist check (no trimming or case folding: a spec must name the tag exactly).
	 *
	 * @param string $tag Provider tag.
	 * @return bool
	 */
	public static function allowed( string $tag ): bool {
		return isset( self::providers()[ $tag ] );
	}

	/**
	 * Whether the provider's plugin is active on this site.
	 *
	 * @param string $tag Provider tag.
	 * @return bool
	 */
	public static function active( string $tag ): bool {
		if ( array_key_exists( $tag, self::$forced ) ) {
			return self::$forced[ $tag ];
		}
		$p = self::providers()[ $tag ] ?? null;
		if ( ! $p ) {
			return false;
		}
		switch ( $p['kind'] ) {
			case 'elementor':
				return class_exists( '\\Elementor\\Plugin' );
			case 'gravity':
				return class_exists( 'GFAPI' );
			case 'fluent':
				return defined( 'FLUENTFORM' ) || function_exists( 'wpFluentForm' );
			default:
				return function_exists( 'post_type_exists' ) && post_type_exists( (string) $p['post_type'] );
		}
	}

	/**
	 * The select options for a provider's items, resolved at register time so
	 * items created after the widget was generated still show up.
	 *
	 * @param string $tag Provider tag.
	 * @return array<string, string> id => label (empty when inactive/unknown).
	 */
	public static function options( string $tag ): array {
		if ( ! self::allowed( $tag ) || ! self::active( $tag ) ) {
			return array();
		}
		$p   = self::providers()[ $tag ];
		$out = array();
		switch ( $p['kind'] ) {
			case 'gravity':
				if ( class_exists( 'GFAPI' ) ) {
					foreach ( (array) \GFAPI::get_forms() as $form ) {
						if ( is_array( $form ) && ! empty( $form['id'] ) ) {
							$out[ (string) (int) $form['id'] ] = (string) ( $form['title'] ?? ( 'Form #' . $form['id'] ) );
						}
					}
				}
				break;
			case 'fluent':
				global $wpdb;
				if ( isset( $wpdb ) ) {
					$table = $wpdb->prefix . 'fluentform_forms';
					// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
					$rows = $wpdb->get_results( "SELECT id, title FROM `{$table}` WHERE status = 'published' ORDER BY title ASC LIMIT 200", ARRAY_A ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
					foreach ( (array) $rows as $r ) {
						$out[ (string) (int) $r['id'] ] = (string) $r['title'];
					}
				}
				break;
			default:
				$args = array(
					'post_type'      => (string) $p['post_type'],
					'post_status'    => 'publish',
					'posts_per_page' => 200,
					'orderby'        => 'title',
					'order'          => 'ASC',
					'no_found_rows'  => true,
				);
				if ( 'elementor' === $p['kind'] ) {
					// Kits are not embeddable templates.
					$args['meta_query'] = array( // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query
						array(
							'key'     => '_elementor_template_type',
							'value'   => 'kit',
							'compare' => '!=',
						),
					);
				}
				foreach ( (array) get_posts( $args ) as $post ) {
					$id = is_object( $post ) ? (int) $post->ID : (int) $post;
					if ( $id > 0 ) {
						$title = is_object( $post ) ? (string) $post->post_title : '';
						if ( '' === $title ) {
							$title = '#' . $id;
						}
						if ( 'elementor' === $p['kind'] && is_object( $post ) ) {
							$type = (string) get_post_meta( $id, '_elementor_template_type', true );
							if ( '' !== $type ) {
								$title .= ' (' . $type . ')';
							}
						}
						$out[ (string) $id ] = $title;
					}
				}
		}
		return $out;
	}

	/**
	 * Renders one provider item. Returns '' for anything not allowed, unknown,
	 * inactive, malformed, or already being rendered up the stack.
	 *
	 * @param string $tag Provider tag.
	 * @param mixed  $id  The picked item id.
	 * @return string HTML.
	 */
	public static function render( string $tag, $id ): string {
		if ( ! self::allowed( $tag ) || ! self::active( $tag ) ) {
			return '';
		}
		$raw = is_scalar( $id ) ? trim( (string) $id ) : '';
		if ( '' === $raw || ! ctype_digit( $raw ) ) {
			return '';
		}
		$int = (int) $raw;
		if ( $int <= 0 ) {
			return '';
		}
		$key = $tag . ':' . $int;
		if ( isset( self::$stack[ $key ] ) || count( self::$stack ) >= self::MAX_DEPTH ) {
			return '';
		}
		self::$stack[ $key ] = true;
		try {
			$p = self::providers()[ $tag ];
			if ( 'elementor' === $p['kind'] ) {
				return self::render_elementor_template( $int );
			}
			return (string) do_shortcode( sprintf( (string) $p['shortcode'], $int ) );
		} catch ( \Throwable $e ) {
			return '';
		} finally {
			unset( self::$stack[ $key ] );
		}
	}

	/**
	 * Renders a saved Elementor template with its CSS, as Elementor's own
	 * Template widget does.
	 *
	 * @param int $id Template post id.
	 * @return string
	 */
	private static function render_elementor_template( int $id ): string {
		if ( ! class_exists( '\\Elementor\\Plugin' ) ) {
			return '';
		}
		$post = get_post( $id );
		if ( ! $post || 'elementor_library' !== $post->post_type || 'publish' !== $post->post_status ) {
			return '';
		}
		if ( 'kit' === (string) get_post_meta( $id, '_elementor_template_type', true ) ) {
			return '';
		}
		$frontend = \Elementor\Plugin::$instance->frontend ?? null;
		if ( ! $frontend || ! method_exists( $frontend, 'get_builder_content_for_display' ) ) {
			return '';
		}
		return (string) $frontend->get_builder_content_for_display( $id, true );
	}

	// -------------------------------------------------------------------------
	// Test seams
	// -------------------------------------------------------------------------

	/**
	 * @param string $tag    Provider tag.
	 * @param bool   $active Forced state.
	 */
	public static function force_active_for_tests( string $tag, bool $active ): void {
		self::$forced[ $tag ] = $active;
	}

	public static function reset_for_tests(): void {
		self::$forced = array();
		self::$stack  = array();
	}

	public static function depth_for_tests(): int {
		return count( self::$stack );
	}
}
