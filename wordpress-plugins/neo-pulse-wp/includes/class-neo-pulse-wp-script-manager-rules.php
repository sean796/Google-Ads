<?php
/**
 * Display rules normalization, evaluation, and summaries for Script Manager.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Script_Manager_Rules {

	const MODES         = array( 'all', 'include', 'exclude' );
	const DEVICES       = array( 'all', 'mobile', 'desktop' );
	const LOGGED_IN     = array( 'all', 'only', 'exclude' );
	const ARCHIVES      = array( 'category', 'tag', 'author', 'date', 'post_type_archive' );
	const SPECIAL_PAGES = array( 'front_page', 'blog', 'search', '404', 'attachment', 'singular', 'archive' );

	/**
	 * Default rules structure.
	 *
	 * @return array<string, mixed>
	 */
	public static function defaults(): array {
		return array(
			'mode'      => 'all',
			'include'   => self::empty_targets(),
			'exclude'   => self::empty_targets(),
			'device'    => 'all',
			'logged_in' => 'all',
		);
	}

	/**
	 * @return array<string, mixed>
	 */
	private static function empty_targets(): array {
		return array(
			'posts'      => array(),
			'post_types' => array(),
			'taxonomies' => array(),
			'archives'   => array(),
			'special'    => array(),
		);
	}

	/**
	 * @param mixed $raw Raw rules from DB, JSON string, or array.
	 * @return array{ok: bool, rules?: array<string, mixed>, error?: string}
	 */
	public static function normalize( $raw ) {
		if ( is_string( $raw ) ) {
			$raw = trim( $raw );
			if ( $raw === '' ) {
				return array(
					'ok'    => true,
					'rules' => self::defaults(),
				);
			}
			$decoded = json_decode( $raw, true );
			if ( ! is_array( $decoded ) ) {
				return array(
					'ok'    => false,
					'error' => __( 'Display rules must be valid JSON.', 'neo-pulse-wp' ),
				);
			}
			$raw = $decoded;
		}

		if ( ! is_array( $raw ) ) {
			return array(
				'ok'    => false,
				'error' => __( 'Display rules must be an object.', 'neo-pulse-wp' ),
			);
		}

		$mode = isset( $raw['mode'] ) ? sanitize_key( (string) $raw['mode'] ) : 'all';
		if ( ! in_array( $mode, self::MODES, true ) ) {
			$mode = 'all';
		}

		$device = isset( $raw['device'] ) ? sanitize_key( (string) $raw['device'] ) : 'all';
		if ( ! in_array( $device, self::DEVICES, true ) ) {
			$device = 'all';
		}

		$logged_in = isset( $raw['logged_in'] ) ? sanitize_key( (string) $raw['logged_in'] ) : 'all';
		if ( ! in_array( $logged_in, self::LOGGED_IN, true ) ) {
			$logged_in = 'all';
		}

		return array(
			'ok'    => true,
			'rules' => array(
				'mode'      => $mode,
				'include'   => self::normalize_targets( isset( $raw['include'] ) ? $raw['include'] : array() ),
				'exclude'   => self::normalize_targets( isset( $raw['exclude'] ) ? $raw['exclude'] : array() ),
				'device'    => $device,
				'logged_in' => $logged_in,
			),
		);
	}

	/**
	 * @param mixed $raw Target group.
	 * @return array<string, mixed>
	 */
	private static function normalize_targets( $raw ): array {
		if ( ! is_array( $raw ) ) {
			return self::empty_targets();
		}

		$posts = array();
		if ( ! empty( $raw['posts'] ) && is_array( $raw['posts'] ) ) {
			foreach ( $raw['posts'] as $id ) {
				$id = (int) $id;
				if ( $id > 0 ) {
					$posts[] = $id;
				}
			}
			$posts = array_values( array_unique( $posts ) );
		}

		$post_types = array();
		if ( ! empty( $raw['post_types'] ) && is_array( $raw['post_types'] ) ) {
			foreach ( $raw['post_types'] as $pt ) {
				$pt = sanitize_key( (string) $pt );
				if ( $pt !== '' ) {
					$post_types[] = $pt;
				}
			}
			$post_types = array_values( array_unique( $post_types ) );
		}

		$archives = array();
		if ( ! empty( $raw['archives'] ) && is_array( $raw['archives'] ) ) {
			foreach ( $raw['archives'] as $arch ) {
				$arch = sanitize_key( (string) $arch );
				if ( in_array( $arch, self::ARCHIVES, true ) ) {
					$archives[] = $arch;
				}
			}
			$archives = array_values( array_unique( $archives ) );
		}

		$special = array();
		if ( ! empty( $raw['special'] ) && is_array( $raw['special'] ) ) {
			foreach ( $raw['special'] as $sp ) {
				$sp = sanitize_key( (string) $sp );
				if ( in_array( $sp, self::SPECIAL_PAGES, true ) ) {
					$special[] = $sp;
				}
			}
			$special = array_values( array_unique( $special ) );
		}

		$taxonomies = array();
		if ( ! empty( $raw['taxonomies'] ) && is_array( $raw['taxonomies'] ) ) {
			foreach ( $raw['taxonomies'] as $tax_row ) {
				if ( ! is_array( $tax_row ) ) {
					continue;
				}
				$taxonomy = isset( $tax_row['taxonomy'] ) ? sanitize_key( (string) $tax_row['taxonomy'] ) : '';
				if ( $taxonomy === '' || ! taxonomy_exists( $taxonomy ) ) {
					continue;
				}
				$terms = array();
				if ( ! empty( $tax_row['terms'] ) && is_array( $tax_row['terms'] ) ) {
					foreach ( $tax_row['terms'] as $term_id ) {
						$term_id = (int) $term_id;
						if ( $term_id > 0 ) {
							$terms[] = $term_id;
						}
					}
				}
				if ( ! empty( $terms ) ) {
					$taxonomies[] = array(
						'taxonomy' => $taxonomy,
						'terms'    => array_values( array_unique( $terms ) ),
					);
				}
			}
		}

		return array(
			'posts'      => $posts,
			'post_types' => $post_types,
			'taxonomies' => $taxonomies,
			'archives'   => $archives,
			'special'    => $special,
		);
	}

	/**
	 * Encode rules for DB storage.
	 *
	 * @param array<string, mixed> $rules Normalized rules.
	 */
	public static function encode( array $rules ): string {
		return wp_json_encode( $rules );
	}

	/**
	 * @param mixed $raw Raw rules.
	 * @return array<string, mixed>
	 */
	public static function decode( $raw ): array {
		$result = self::normalize( $raw );
		return ! empty( $result['rules'] ) ? $result['rules'] : self::defaults();
	}

	/**
	 * Whether the current front-end request should output a script.
	 *
	 * @param array<string, mixed> $rules Normalized rules.
	 */
	public static function matches_current_request( array $rules ): bool {
		if ( ! self::matches_device( $rules ) ) {
			return false;
		}
		if ( ! self::matches_logged_in( $rules ) ) {
			return false;
		}

		$mode = isset( $rules['mode'] ) ? (string) $rules['mode'] : 'all';
		$include = isset( $rules['include'] ) && is_array( $rules['include'] ) ? $rules['include'] : self::empty_targets();
		$exclude = isset( $rules['exclude'] ) && is_array( $rules['exclude'] ) ? $rules['exclude'] : self::empty_targets();

		if ( self::targets_match_current( $exclude ) ) {
			return false;
		}

		if ( 'include' === $mode ) {
			return self::targets_match_current( $include );
		}

		// "all" and "exclude": everywhere except the excluded targets (checked above).
		return true;
	}

	/**
	 * @param array<string, mixed> $rules Rules.
	 */
	private static function matches_device( array $rules ): bool {
		$device = isset( $rules['device'] ) ? (string) $rules['device'] : 'all';
		if ( 'all' === $device ) {
			return true;
		}
		$is_mobile = wp_is_mobile();
		if ( 'mobile' === $device ) {
			return $is_mobile;
		}
		if ( 'desktop' === $device ) {
			return ! $is_mobile;
		}
		return true;
	}

	/**
	 * @param array<string, mixed> $rules Rules.
	 */
	private static function matches_logged_in( array $rules ): bool {
		$logged_in = isset( $rules['logged_in'] ) ? (string) $rules['logged_in'] : 'all';
		if ( 'all' === $logged_in ) {
			return true;
		}
		$is_logged = is_user_logged_in();
		if ( 'only' === $logged_in ) {
			return $is_logged;
		}
		if ( 'exclude' === $logged_in ) {
			return ! $is_logged;
		}
		return true;
	}

	/**
	 * @param array<string, mixed> $targets Target group.
	 */
	private static function targets_match_current( array $targets ): bool {
		if ( self::targets_empty( $targets ) ) {
			return false;
		}

		if ( ! empty( $targets['posts'] ) && is_array( $targets['posts'] ) ) {
			if ( is_singular() ) {
				$post_id = (int) get_queried_object_id();
				if ( $post_id > 0 && in_array( $post_id, array_map( 'intval', $targets['posts'] ), true ) ) {
					return true;
				}
			}
		}

		if ( ! empty( $targets['post_types'] ) && is_array( $targets['post_types'] ) ) {
			if ( is_singular( $targets['post_types'] ) ) {
				return true;
			}
			if ( is_post_type_archive( $targets['post_types'] ) ) {
				return true;
			}
		}

		if ( ! empty( $targets['taxonomies'] ) && is_array( $targets['taxonomies'] ) ) {
			foreach ( $targets['taxonomies'] as $tax_row ) {
				if ( ! is_array( $tax_row ) ) {
					continue;
				}
				$taxonomy = isset( $tax_row['taxonomy'] ) ? (string) $tax_row['taxonomy'] : '';
				$terms    = isset( $tax_row['terms'] ) && is_array( $tax_row['terms'] ) ? array_map( 'intval', $tax_row['terms'] ) : array();
				if ( $taxonomy === '' || empty( $terms ) ) {
					continue;
				}
				// is_tax() never matches the built-in category and tag archives.
				if ( 'category' === $taxonomy ) {
					$on_archive = is_category( $terms );
				} elseif ( 'post_tag' === $taxonomy ) {
					$on_archive = is_tag( $terms );
				} else {
					$on_archive = is_tax( $taxonomy, $terms );
				}
				if ( $on_archive ) {
					return true;
				}
				// Any singular post type that uses this taxonomy (posts, pages, CPTs).
				if ( is_singular() ) {
					$queried = get_queried_object();
					if ( $queried instanceof WP_Post && is_object_in_taxonomy( $queried->post_type, $taxonomy ) && has_term( $terms, $taxonomy, $queried ) ) {
						return true;
					}
				}
			}
		}

		if ( ! empty( $targets['archives'] ) && is_array( $targets['archives'] ) ) {
			foreach ( $targets['archives'] as $arch ) {
				switch ( $arch ) {
					case 'category':
						if ( is_category() ) {
							return true;
						}
						break;
					case 'tag':
						if ( is_tag() ) {
							return true;
						}
						break;
					case 'author':
						if ( is_author() ) {
							return true;
						}
						break;
					case 'date':
						if ( is_date() ) {
							return true;
						}
						break;
					case 'post_type_archive':
						if ( is_post_type_archive() ) {
							return true;
						}
						break;
				}
			}
		}

		if ( ! empty( $targets['special'] ) && is_array( $targets['special'] ) ) {
			foreach ( $targets['special'] as $sp ) {
				switch ( $sp ) {
					case 'front_page':
						if ( is_front_page() ) {
							return true;
						}
						break;
					case 'blog':
						if ( is_home() && ! is_front_page() ) {
							return true;
						}
						break;
					case 'search':
						if ( is_search() ) {
							return true;
						}
						break;
					case '404':
						if ( is_404() ) {
							return true;
						}
						break;
					case 'attachment':
						if ( is_attachment() ) {
							return true;
						}
						break;
					case 'singular':
						if ( is_singular() ) {
							return true;
						}
						break;
					case 'archive':
						if ( is_archive() ) {
							return true;
						}
						break;
				}
			}
		}

		return false;
	}

	/**
	 * @param array<string, mixed> $targets Targets.
	 */
	private static function targets_empty( array $targets ): bool {
		foreach ( array( 'posts', 'post_types', 'archives', 'special' ) as $key ) {
			if ( ! empty( $targets[ $key ] ) && is_array( $targets[ $key ] ) ) {
				return false;
			}
		}
		if ( ! empty( $targets['taxonomies'] ) && is_array( $targets['taxonomies'] ) ) {
			return false;
		}
		return true;
	}

	/**
	 * Human-readable summary for list table.
	 *
	 * @param array<string, mixed>|string $rules Rules or JSON.
	 */
	public static function summarize( $rules ): string {
		$rules = is_array( $rules ) ? $rules : self::decode( $rules );
		if ( ! is_array( $rules ) ) {
			$rules = self::defaults();
		}
		$mode  = isset( $rules['mode'] ) ? (string) $rules['mode'] : 'all';

		$parts = array();

		if ( 'all' === $mode ) {
			$parts[] = __( 'All pages', 'neo-pulse-wp' );
		} elseif ( 'include' === $mode ) {
			$parts[] = __( 'Include', 'neo-pulse-wp' ) . ': ' . self::summarize_targets( self::coerce_targets( $rules['include'] ?? null ) );
		} else {
			$parts[] = __( 'Exclude rules', 'neo-pulse-wp' ) . ': ' . self::summarize_targets( self::coerce_targets( $rules['exclude'] ?? null ) );
		}

		$device = isset( $rules['device'] ) ? (string) $rules['device'] : 'all';
		if ( 'mobile' === $device ) {
			$parts[] = __( 'Mobile only', 'neo-pulse-wp' );
		} elseif ( 'desktop' === $device ) {
			$parts[] = __( 'Desktop only', 'neo-pulse-wp' );
		}

		$logged_in = isset( $rules['logged_in'] ) ? (string) $rules['logged_in'] : 'all';
		if ( 'only' === $logged_in ) {
			$parts[] = __( 'Logged-in users', 'neo-pulse-wp' );
		} elseif ( 'exclude' === $logged_in ) {
			$parts[] = __( 'Guests only', 'neo-pulse-wp' );
		}

		$include = self::coerce_targets( $rules['include'] ?? null );
		$exclude = self::coerce_targets( $rules['exclude'] ?? null );
		if ( 'all' === $mode && ! self::targets_empty( $exclude ) ) {
			$parts[] = __( 'Except', 'neo-pulse-wp' ) . ': ' . self::summarize_targets( $exclude );
		}
		if ( 'all' !== $mode && 'include' !== $mode && ! self::targets_empty( $exclude ) ) {
			$parts[] = __( 'Except', 'neo-pulse-wp' ) . ': ' . self::summarize_targets( $exclude );
		}

		return implode( ' · ', array_filter( $parts ) );
	}

	/**
	 * @param mixed $raw Target group from DB/import.
	 * @return array<string, mixed>
	 */
	private static function coerce_targets( $raw ): array {
		if ( ! is_array( $raw ) ) {
			return self::empty_targets();
		}
		return self::normalize_targets( $raw );
	}

	/**
	 * @param array<string, mixed> $targets Targets.
	 */
	private static function summarize_targets( array $targets ): string {
		$bits = array();
		if ( ! empty( $targets['posts'] ) && is_array( $targets['posts'] ) ) {
			$post_count = count( $targets['posts'] );
			$bits[]     = sprintf(
				/* translators: %d: number of posts */
				_n( '%d post', '%d posts', $post_count, 'neo-pulse-wp' ),
				$post_count
			);
		}
		if ( ! empty( $targets['post_types'] ) && is_array( $targets['post_types'] ) ) {
			$bits[] = implode( ', ', array_map( 'strval', $targets['post_types'] ) );
		}
		if ( ! empty( $targets['taxonomies'] ) ) {
			$bits[] = __( 'taxonomies', 'neo-pulse-wp' );
		}
		if ( ! empty( $targets['archives'] ) && is_array( $targets['archives'] ) ) {
			$bits[] = implode( ', ', array_map( 'strval', $targets['archives'] ) );
		}
		if ( ! empty( $targets['special'] ) && is_array( $targets['special'] ) ) {
			$bits[] = implode( ', ', array_map( 'strval', $targets['special'] ) );
		}
		if ( empty( $bits ) ) {
			return __( 'none', 'neo-pulse-wp' );
		}
		return implode( ', ', $bits );
	}
}
