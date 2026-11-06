<?php
/**
 * Content type rules and settings write operations.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Mcp_Write_Trait_Settings {

	/**
	 * `set-type-rules`: site-wide rules per content type (e.g. `pt_page_default_rich_snippet = off`).
	 *
	 * @param array<string,mixed> $args Arguments.
	 * @return array<string,mixed>|WP_Error
	 */
	private static function set_type_rules( array $args ) {
		if ( ! current_user_can( 'manage_options' ) ) {
			return new WP_Error( 'forbidden', 'You do not have permission to change content type SEO rules.', array( 'status' => 403 ) );
		}
		if ( empty( $args['rules'] ) || ! is_array( $args['rules'] ) ) {
			return new WP_Error( 'invalid_argument', 'rules object is required for set-type-rules.', array( 'status' => 400 ) );
		}

		$cur_ver = Neo_Pulse_Wp_Mcp_Read::settings_version_hash();
		if ( ! empty( $args['expected_version'] ) && (string) $args['expected_version'] !== $cur_ver ) {
			return new WP_Error(
				'conflict',
				sprintf( 'SEO settings changed since version %s (current version is %s).', (string) $args['expected_version'], $cur_ver ),
				array( 'status' => 409, 'current_version' => $cur_ver )
			);
		}

		$changes = array();
		foreach ( $args['rules'] as $type => $rule ) {
			$type = sanitize_key( (string) $type );
			if ( '' === $type || ! post_type_exists( $type ) || ! is_array( $rule ) ) {
				return new WP_Error( 'invalid_argument', sprintf( 'Invalid post type "%s" in rules.', (string) $type ), array( 'status' => 400 ) );
			}
			if ( array_key_exists( 'title', $rule ) ) {
				$changes[ 'pt_' . $type . '_title' ] = Neo_Pulse_Wp_Seo_Settings::clean_input( $rule['title'] );
			}
			if ( array_key_exists( 'description', $rule ) ) {
				$changes[ 'pt_' . $type . '_description' ] = Neo_Pulse_Wp_Seo_Settings::clean_input( $rule['description'] );
			}
			if ( array_key_exists( 'robots', $rule ) ) {
				$choice = (string) $rule['robots'];
				if ( 'index' === $choice || 'noindex' === $choice ) {
					$current = Neo_Pulse_Wp_Seo_Settings::robots_list( Neo_Pulse_Wp_Seo_Settings::get( 'pt_' . $type . '_robots', array() ) );
					$others  = array_values( array_diff( $current, array( 'index', 'noindex' ) ) );
					$changes[ 'pt_' . $type . '_custom_robots' ] = 'on';
					$changes[ 'pt_' . $type . '_robots' ]        = array_merge( array( $choice ), $others );
				} else {
					$changes[ 'pt_' . $type . '_custom_robots' ] = 'off';
				}
			}
			if ( array_key_exists( 'schema', $rule ) ) {
				$schema = (string) $rule['schema'];
				if ( in_array( $schema, array( 'Article', 'BlogPosting', 'NewsArticle' ), true ) ) {
					$changes[ 'pt_' . $type . '_default_rich_snippet' ] = 'article';
					$changes[ 'pt_' . $type . '_default_article_type' ] = $schema;
				} elseif ( in_array( $schema, array( 'off', 'none', 'WebPage', '' ), true ) ) {
					$changes[ 'pt_' . $type . '_default_rich_snippet' ] = 'off';
				} else {
					return new WP_Error( 'invalid_argument', sprintf( 'Unsupported schema type "%s" for %s.', $schema, $type ), array( 'status' => 400 ) );
				}
			}
		}

		$before_raw = Neo_Pulse_Wp_Seo_Settings::raw();
		$before_sub = array();
		foreach ( array_keys( $changes ) as $k ) {
			$before_sub[ $k ] = Neo_Pulse_Wp_Seo_Settings::get( $k, '' );
		}

		if ( ! empty( $args['dry_run'] ) ) {
			return array(
				'dry_run'      => true,
				'would_change' => $before_sub !== $changes,
				'before'       => $before_sub,
				'after'        => $changes,
				'version'      => $cur_ver,
			);
		}

		$history_id = Neo_Pulse_Wp_Mcp_History::record(
			'set-type-rules',
			'Updated content-type SEO/schema rules',
			array(
				'kind'   => 'option',
				'option' => Neo_Pulse_Wp_Seo_Settings::OPTION,
				'existed'=> ! empty( $before_raw ),
				'value'  => $before_raw,
			)
		);

		Neo_Pulse_Wp_Seo_Settings::save_titles( $changes );
		if ( Neo_Pulse_Wp_Seo_Settings::output_active() && class_exists( 'Neo_Pulse_Wp_Cache_Flush' ) ) {
			Neo_Pulse_Wp_Cache_Flush::purge_html_caches();
		}

		$after_settings = Neo_Pulse_Wp_Mcp_Read::get_settings();

		return array(
			'ok'         => true,
			'history_id' => $history_id,
			'version'    => $after_settings['version'],
			'data'       => $after_settings,
		);
	}

	/**
	 * `update-settings`: patch non-business SEO settings through the same sanitising as the settings screen.
	 *
	 * @param array<string,mixed> $args Arguments.
	 * @return array<string,mixed>|WP_Error
	 */
	private static function update_settings( array $args ) {
		if ( ! current_user_can( 'manage_options' ) ) {
			return new WP_Error( 'forbidden', 'You do not have permission to update SEO settings.', array( 'status' => 403 ) );
		}

		$cur_ver = Neo_Pulse_Wp_Mcp_Read::settings_version_hash();
		if ( ! empty( $args['expected_version'] ) && (string) $args['expected_version'] !== $cur_ver ) {
			return new WP_Error(
				'conflict',
				sprintf( 'SEO settings changed since version %s (current version is %s).', (string) $args['expected_version'], $cur_ver ),
				array( 'status' => 409, 'current_version' => $cur_ver )
			);
		}

		$title_changes   = array();
		$general_changes = array();

		$titles_in = isset( $args['titles'] ) && is_array( $args['titles'] ) ? $args['titles'] : $args;
		foreach ( array( 'title_separator', 'homepage_title', 'homepage_description', 'author_archive_title', 'date_archive_title', 'search_title', '404_title', 'website_name' ) as $k ) {
			if ( array_key_exists( $k, $titles_in ) ) {
				$val = Neo_Pulse_Wp_Seo_Settings::clean_input( $titles_in[ $k ] );
				if ( 'title_separator' === $k && '' === $val ) {
					$val = '-';
				}
				$title_changes[ $k ] = $val;
			}
		}
		if ( array_key_exists( 'capitalize_titles', $titles_in ) ) {
			$title_changes['capitalize_titles'] = ! empty( $titles_in['capitalize_titles'] ) && 'off' !== $titles_in['capitalize_titles'] ? 'on' : 'off';
		}
		foreach ( $titles_in as $k => $val ) {
			$key = (string) $k;
			if ( preg_match( '/^tax_[a-z0-9_-]+_(title|description)$/', $key ) ) {
				$title_changes[ $key ] = Neo_Pulse_Wp_Seo_Settings::clean_input( $val );
			}
		}
		if ( isset( $args['tax'] ) && is_array( $args['tax'] ) ) {
			foreach ( $args['tax'] as $tax => $row ) {
				$tax = sanitize_key( (string) $tax );
				if ( '' === $tax || ! taxonomy_exists( $tax ) || ! is_array( $row ) ) {
					continue;
				}
				if ( array_key_exists( 'title', $row ) ) {
					$title_changes[ 'tax_' . $tax . '_title' ] = Neo_Pulse_Wp_Seo_Settings::clean_input( $row['title'] );
				}
				if ( array_key_exists( 'description', $row ) ) {
					$title_changes[ 'tax_' . $tax . '_description' ] = Neo_Pulse_Wp_Seo_Settings::clean_input( $row['description'] );
				}
			}
		}

		$indexing_in = isset( $args['indexing'] ) && is_array( $args['indexing'] ) ? $args['indexing'] : $args;
		foreach ( array( 'noindex_search', 'noindex_empty_taxonomies', 'noindex_archive_subpages', 'noindex_paginated_pages', 'noindex_password_protected' ) as $k ) {
			if ( array_key_exists( $k, $indexing_in ) ) {
				$title_changes[ $k ] = ! empty( $indexing_in[ $k ] ) && 'off' !== $indexing_in[ $k ] ? 'on' : 'off';
			}
		}

		$behaviour_in = isset( $args['behaviour'] ) && is_array( $args['behaviour'] ) ? $args['behaviour'] : $args;
		foreach ( array( 'disable_date_archives', 'disable_author_archives', 'neo_pulse_404_monitor' ) as $k ) {
			if ( array_key_exists( $k, $behaviour_in ) ) {
				$title_changes[ $k ] = ! empty( $behaviour_in[ $k ] ) && 'off' !== $behaviour_in[ $k ] ? 'on' : 'off';
			}
		}
		foreach ( array( 'new_window_external_links', 'nofollow_external_links' ) as $k ) {
			if ( array_key_exists( $k, $behaviour_in ) ) {
				$general_changes[ $k ] = ! empty( $behaviour_in[ $k ] ) && 'off' !== $behaviour_in[ $k ] ? 'on' : 'off';
			}
		}

		$social_in = isset( $args['social'] ) && is_array( $args['social'] ) ? $args['social'] : $args;
		if ( array_key_exists( 'open_graph_image', $social_in ) ) {
			$og_url                                = esc_url_raw( Neo_Pulse_Wp_Seo_Settings::clean_input( $social_in['open_graph_image'] ) );
			$title_changes['open_graph_image']     = $og_url;
			$title_changes['open_graph_image_id']  = '' !== $og_url ? (string) attachment_url_to_postid( $og_url ) : '';
		}
		if ( array_key_exists( 'twitter_card_type', $social_in ) ) {
			$title_changes['twitter_card_type'] = 'summary' === $social_in['twitter_card_type'] ? 'summary' : 'summary_large_image';
		}
		if ( array_key_exists( 'twitter_author_names', $social_in ) ) {
			$title_changes['twitter_author_names'] = Neo_Pulse_Wp_Seo_Settings::clean_input( $social_in['twitter_author_names'] );
		}

		$before_raw = Neo_Pulse_Wp_Seo_Settings::raw();

		if ( ! empty( $args['dry_run'] ) ) {
			return array(
				'dry_run'         => true,
				'would_change'    => array() !== $title_changes || array() !== $general_changes || array_key_exists( 'enabled', $args ),
				'title_changes'   => $title_changes,
				'general_changes' => $general_changes,
				'enabled'         => array_key_exists( 'enabled', $args ) ? (bool) $args['enabled'] : Neo_Pulse_Wp_Seo_Settings::enabled(),
				'version'         => $cur_ver,
			);
		}

		$history_id = Neo_Pulse_Wp_Mcp_History::record(
			'update-settings',
			'Updated Neo Pulse SEO settings',
			array(
				'kind'   => 'option',
				'option' => Neo_Pulse_Wp_Seo_Settings::OPTION,
				'existed'=> ! empty( $before_raw ),
				'value'  => $before_raw,
			)
		);

		if ( array() !== $title_changes ) {
			Neo_Pulse_Wp_Seo_Settings::save_titles( $title_changes );
		}
		if ( array() !== $general_changes ) {
			Neo_Pulse_Wp_Seo_Settings::save_general( $general_changes );
		}
		if ( array_key_exists( 'enabled', $args ) ) {
			Neo_Pulse_Wp_Seo_Settings::set_enabled( (bool) $args['enabled'] );
		}
		if ( Neo_Pulse_Wp_Seo_Settings::output_active() && class_exists( 'Neo_Pulse_Wp_Cache_Flush' ) ) {
			Neo_Pulse_Wp_Cache_Flush::purge_html_caches();
		}

		$after_settings = Neo_Pulse_Wp_Mcp_Read::get_settings();

		return array(
			'ok'         => true,
			'history_id' => $history_id,
			'version'    => $after_settings['version'],
			'data'       => $after_settings,
		);
	}
}
