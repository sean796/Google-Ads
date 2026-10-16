<?php
/**
 * polylang-write handlers for languages, assignment, links, term translations, strings,
 * menus and settings. Used by EMCP_Tools_Polylang_Integration.
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** @since 3.19.0 */
trait EMCP_Tools_Polylang_Setup_Ops {

	/** Settings update-settings may change, with their argument types. */
	protected static $settings_keys = array( 'hide_default', 'force_lang', 'rewrite', 'redirect_lang', 'browser', 'media_support', 'post_types', 'taxonomies', 'sync' );

	/** @return array|WP_Error The language row. */
	protected function language( string $slug ) {
		foreach ( $this->api()->languages() as $lang ) {
			if ( $lang['slug'] === $slug ) {
				return $lang;
			}
		}
		/* translators: %s: language slug. */
		return new WP_Error( 'unknown_language', sprintf( __( 'There is no language "%s". get-setup lists the languages.', 'emcp-tools' ), $slug ) );
	}

	protected static function change( string $id ): array {
		return array( 'change_id' => $id, 'undo' => array( 'available' => '' !== $id ) );
	}

	// Languages.

	/** @return array|WP_Error */
	protected function op_add_language( array $args ) {
		$params = array(
			'locale' => (string) $args['locale'],
			'slug'   => (string) $args['slug'],
			'name'   => (string) $args['name'],
		);
		if ( isset( $args['rtl'] ) ) {
			$params['is_rtl'] = (bool) $args['rtl'];
		}
		if ( isset( $args['flag'] ) ) {
			$params['flag_code'] = (string) $args['flag'];
		}
		if ( isset( $args['order'] ) ) {
			$params['term_group'] = (int) $args['order'];
		}
		$api    = $this->api();
		$result = $api->rest( 'POST', '/pll/v1/languages', $params );
		if ( is_wp_error( $result ) ) {
			return $result;
		}
		$api->clean_cache();
		$term_id = (int) ( $result['term_id'] ?? 0 );
		/* translators: %s: language name. */
		$change = EMCP_Tools_Polylang_History::record_setup( 'add-language', sprintf( __( 'Polylang: language %s added', 'emcp-tools' ), $params['name'] ), 'language-added', array( 'term_id' => $term_id, 'slug' => $params['slug'] ) );
		return array( 'language' => $result, 'change' => self::change( $change ) );
	}

	/** @return array|WP_Error */
	protected function op_update_language( array $args ) {
		$lang = $this->language( (string) $args['lang'] );
		if ( is_wp_error( $lang ) ) {
			return $lang;
		}
		$params = array();
		foreach ( array( 'locale' => 'locale', 'slug' => 'slug', 'name' => 'name', 'rtl' => 'is_rtl', 'flag' => 'flag_code', 'order' => 'term_group' ) as $arg => $param ) {
			if ( array_key_exists( $arg, $args ) ) {
				$params[ $param ] = $args[ $arg ];
			}
		}
		if ( ! $params ) {
			return new WP_Error( 'invalid_argument', __( 'Pass at least one field to change.', 'emcp-tools' ) );
		}
		$before = array( 'locale' => $lang['locale'], 'slug' => $lang['slug'], 'name' => $lang['name'], 'is_rtl' => $lang['rtl'], 'flag_code' => $lang['flag'], 'term_group' => $lang['order'] );
		$api    = $this->api();
		$result = $api->rest( 'PUT', '/pll/v1/languages/' . $lang['term_id'], $params );
		if ( is_wp_error( $result ) ) {
			return $result;
		}
		$api->clean_cache();
		/* translators: %s: language slug. */
		$change = EMCP_Tools_Polylang_History::record_setup( 'update-language', sprintf( __( 'Polylang: language %s changed', 'emcp-tools' ), $lang['slug'] ), 'language-updated', array( 'term_id' => $lang['term_id'], 'before' => array_intersect_key( $before, $params ) ) );
		return array( 'language' => $result, 'change' => self::change( $change ) );
	}

	/** @return array|WP_Error */
	protected function op_delete_language( array $args, bool $dry_run ) {
		$lang = $this->language( (string) $args['lang'] );
		if ( is_wp_error( $lang ) ) {
			return $lang;
		}
		if ( $dry_run ) {
			return array( 'dry_run' => true, 'lang' => $lang['slug'], 'posts' => $lang['count'], 'terms' => $lang['term_count'], 'is_default' => $lang['is_default'] );
		}
		$api    = $this->api();
		$result = $api->rest( 'DELETE', '/pll/v1/languages/' . $lang['term_id'] );
		if ( is_wp_error( $result ) ) {
			return $result;
		}
		$api->clean_cache();
		$reason = __( 'Polylang removes the language from every post and term that had it; a snapshot cannot honestly put that back.', 'emcp-tools' );
		$change = class_exists( 'EMCP_Tools_Change_Log' ) ? EMCP_Tools_Change_Log::record(
			array(
				'domain'   => 'polylang',
				'action'   => 'delete-language',
				'target'   => 'language ' . $lang['slug'],
				/* translators: %s: language slug. */
				'summary'  => sprintf( __( 'Polylang: language %s deleted', 'emcp-tools' ), $lang['slug'] ),
				'rollback' => array( 'type' => 'irreversible', 'reason' => $reason ),
			)
		) : '';
		return array( 'deleted' => $lang['slug'], 'posts' => $lang['count'], 'change' => array( 'change_id' => $change, 'undo' => array( 'available' => false, 'reason' => $reason ) ) );
	}

	/** @return array|WP_Error */
	protected function op_set_default_language( array $args ) {
		$lang = $this->language( (string) $args['lang'] );
		if ( is_wp_error( $lang ) ) {
			return $lang;
		}
		return $this->update_options( array( 'default_lang' => $lang['slug'] ), 'set-default-language', __( 'Polylang: default language changed', 'emcp-tools' ) );
	}

	/**
	 * Write option keys through Polylang's settings controller, recording the keys' previous values.
	 *
	 * @return array|WP_Error
	 */
	protected function update_options( array $values, string $action, string $summary ) {
		$api    = $this->api();
		$opts   = $api->options();
		$before = array();
		foreach ( array_keys( $values ) as $key ) {
			$before[ $key ] = $opts[ $key ] ?? null;
		}
		$result = $api->rest( 'PUT', '/pll/v1/settings', $values );
		if ( is_wp_error( $result ) ) {
			return $result;
		}
		$api->clean_cache();
		$change = EMCP_Tools_Polylang_History::record_setup( $action, $summary, 'options', array( 'before' => $before ) );
		return array( 'settings' => array_intersect_key( $api->options(), $values ), 'change' => self::change( $change ) );
	}

	/** @return array|WP_Error */
	protected function op_update_settings( array $args, bool $dry_run, bool $confirmed ) {
		$values = array_intersect_key( $args, array_flip( self::$settings_keys ) );
		if ( ! $values ) {
			return new WP_Error( 'invalid_argument', __( 'Pass at least one setting.', 'emcp-tools' ) );
		}
		if ( ( isset( $values['force_lang'] ) || isset( $values['rewrite'] ) ) && ! $confirmed ) {
			return new WP_Error( 'confirmation_required', __( 'force_lang and rewrite change every URL on the site. Pass confirm:true to proceed.', 'emcp-tools' ) );
		}
		if ( isset( $values['force_lang'] ) ) {
			$values['force_lang'] = (int) $values['force_lang'];
		}
		foreach ( array( 'post_types', 'taxonomies', 'sync' ) as $list ) {
			if ( isset( $values[ $list ] ) ) {
				$values[ $list ] = array_values( array_map( 'sanitize_key', array_map( 'strval', (array) $values[ $list ] ) ) );
			}
		}
		return $this->update_options( $values, 'update-settings', __( 'Polylang: settings changed', 'emcp-tools' ) );
	}

	/** @return array|WP_Error */
	protected function op_set_menu_location( array $args ) {
		$lang = $this->language( (string) $args['lang'] );
		if ( is_wp_error( $lang ) ) {
			return $lang;
		}
		$theme    = (string) get_stylesheet();
		$menus    = (array) ( $this->api()->options()['nav_menus'] ?? array() );
		$location = (string) $args['location'];
		$menu_id  = absint( $args['menu_id'] );
		if ( $menu_id ) {
			$menus[ $theme ][ $location ][ $lang['slug'] ] = $menu_id;
		} else {
			unset( $menus[ $theme ][ $location ][ $lang['slug'] ] );
			if ( empty( $menus[ $theme ][ $location ] ) ) {
				unset( $menus[ $theme ][ $location ] );
			}
			if ( empty( $menus[ $theme ] ) ) {
				unset( $menus[ $theme ] );
			}
		}
		/* translators: 1: location, 2: language. */
		return $this->update_options( array( 'nav_menus' => $menus ), 'set-menu-location', sprintf( __( 'Polylang: menu for %1$s (%2$s)', 'emcp-tools' ), $location, $lang['slug'] ) );
	}

	// Assignment and links.

	/** @return true|WP_Error */
	protected function cap_assign( array $args ) {
		foreach ( (array) ( $args['post_ids'] ?? array() ) as $id ) {
			$can = $this->can_edit_post( (int) $id );
			if ( is_wp_error( $can ) ) {
				return $can;
			}
		}
		foreach ( (array) ( $args['term_ids'] ?? array() ) as $id ) {
			$can = $this->can_edit_term( (int) $id );
			if ( is_wp_error( $can ) ) {
				return $can;
			}
		}
		return current_user_can( 'edit_posts' ) ? true : self::forbidden();
	}

	/** @return array|WP_Error */
	protected function op_assign_language( array $args ) {
		$lang = $this->language( (string) $args['lang'] );
		if ( is_wp_error( $lang ) ) {
			return $lang;
		}
		$bulk  = ! empty( $args['without_language'] );
		$modes = (int) isset( $args['post_ids'] ) + (int) isset( $args['term_ids'] ) + (int) $bulk;
		if ( 1 !== $modes || ( $bulk && empty( $args['post_type'] ) ) ) {
			return new WP_Error( 'invalid_argument', __( 'Pass exactly one of post_ids, term_ids, or post_type with without_language:true.', 'emcp-tools' ) );
		}
		$api       = $this->api();
		$remaining = 0;
		$posts     = (array) ( $args['post_ids'] ?? array() );
		if ( $bulk ) {
			$all       = $api->posts_without_language( (string) $args['post_type'], PHP_INT_MAX );
			$posts     = array_slice( $all, 0, 500 );
			$remaining = count( $all ) - count( $posts );
			foreach ( $posts as $id ) {
				if ( ! current_user_can( 'edit_post', $id ) ) {
					return self::forbidden();
				}
			}
		}
		$before = array( 'posts' => array(), 'terms' => array() );
		foreach ( $posts as $id ) {
			$before['posts'][ (int) $id ] = $api->post_lang( (int) $id );
			$api->set_post_lang( (int) $id, $lang['slug'] );
		}
		foreach ( (array) ( $args['term_ids'] ?? array() ) as $id ) {
			$before['terms'][ (int) $id ] = $api->term_lang( (int) $id );
			$api->set_term_lang( (int) $id, $lang['slug'] );
		}
		/* translators: %s: language slug. */
		$change = EMCP_Tools_Polylang_History::record_setup( 'assign-language', sprintf( __( 'Polylang: language %s assigned', 'emcp-tools' ), $lang['slug'] ), 'languages', array( 'before' => $before ) );
		return array( 'lang' => $lang['slug'], 'assigned' => count( $before['posts'] ) + count( $before['terms'] ), 'remaining' => $remaining, 'change' => self::change( $change ) );
	}

	/** @return array|WP_Error */
	protected function op_link_translations( array $args ) {
		$posts = isset( $args['post_ids'] );
		if ( $posts === isset( $args['term_ids'] ) ) {
			return new WP_Error( 'invalid_argument', __( 'Pass exactly one of post_ids or term_ids.', 'emcp-tools' ) );
		}
		$api   = $this->api();
		$ids   = array_map( 'intval', (array) ( $posts ? $args['post_ids'] : $args['term_ids'] ) );
		$group = array();
		foreach ( $ids as $id ) {
			$lang = $posts ? $api->post_lang( $id ) : $api->term_lang( $id );
			if ( '' === $lang ) {
				/* translators: %d: ID. */
				return new WP_Error( 'no_language', sprintf( __( '%d has no language. Give it one with assign-language first.', 'emcp-tools' ), $id ) );
			}
			if ( isset( $group[ $lang ] ) ) {
				/* translators: %s: language slug. */
				return new WP_Error( 'duplicate_language', sprintf( __( 'Two of these are in %s; a translation group holds one per language.', 'emcp-tools' ), $lang ) );
			}
			$group[ $lang ] = $id;
		}
		$before = array();
		foreach ( $ids as $id ) {
			$before[ $id ] = $posts ? $api->post_group( $id ) : $api->term_group( $id );
		}
		if ( $posts ) {
			$api->save_post_group( $group );
		} else {
			$api->save_term_group( $group );
		}
		$change = EMCP_Tools_Polylang_History::record_setup( 'link-translations', __( 'Polylang: translations linked', 'emcp-tools' ), 'groups', array( 'object' => $posts ? 'post' : 'term', 'before' => $before ) );
		return array( 'translations' => $group, 'change' => self::change( $change ) );
	}

	// Term translations.

	/** @return true|WP_Error */
	protected function cap_term_create( array $args ) {
		$can = $this->can_edit_term( (int) $args['term_id'] );
		if ( is_wp_error( $can ) ) {
			return $can;
		}
		$term = $this->api()->term( (int) $args['term_id'] );
		if ( ! $term ) {
			return new WP_Error( 'not_found', __( 'This term does not exist.', 'emcp-tools' ) );
		}
		$tax = function_exists( 'get_taxonomy' ) ? get_taxonomy( $term['taxonomy'] ) : null;
		$cap = ( $tax && isset( $tax->cap->manage_terms ) ) ? (string) $tax->cap->manage_terms : 'manage_categories';
		return current_user_can( $cap ) ? true : self::forbidden();
	}

	/** @return array|WP_Error */
	protected function op_create_term_translation( array $args ) {
		$api    = $this->api();
		$source = $api->term( (int) $args['term_id'] );
		$lang   = $this->language( (string) $args['lang'] );
		if ( is_wp_error( $lang ) ) {
			return $lang;
		}
		if ( ! $api->is_translated_taxonomy( $source['taxonomy'] ) ) {
			return new WP_Error( 'not_translatable', __( 'Polylang does not translate this taxonomy.', 'emcp-tools' ) );
		}
		$source_lang = $api->term_lang( $source['term_id'] );
		if ( '' === $source_lang ) {
			return new WP_Error( 'source_has_no_language', __( 'The source term has no language. Give it one with assign-language first.', 'emcp-tools' ) );
		}
		if ( $source_lang === $lang['slug'] ) {
			return new WP_Error( 'same_language', __( 'The source term is already in that language.', 'emcp-tools' ) );
		}
		$existing = $api->term_translation( $source['term_id'], $lang['slug'] );
		if ( $existing ) {
			return new WP_Error( 'translation_exists', __( 'This term already has a translation in that language.', 'emcp-tools' ), array( 'term_id' => $existing ) );
		}
		$parent = $source['parent'] ? $api->term_translation( $source['parent'], $lang['slug'] ) : 0;
		$new    = $api->insert_term(
			(string) $args['name'],
			$source['taxonomy'],
			$lang['slug'],
			array_filter(
				array(
					'slug'        => isset( $args['slug'] ) ? (string) $args['slug'] : '',
					'description' => isset( $args['description'] ) ? (string) $args['description'] : '',
					'parent'      => $parent,
				)
			)
		);
		if ( is_wp_error( $new ) ) {
			return $new;
		}
		$group_before = $api->term_group( $source['term_id'] );
		$api->save_term_group( array_merge( $group_before, array( $lang['slug'] => (int) $new ) ) );
		$change = EMCP_Tools_Polylang_History::record_created_term( (int) $new, $source['taxonomy'], $source['term_id'], $group_before );
		return array( 'term_id' => (int) $new, 'lang' => $lang['slug'], 'translations' => $api->term_group( $source['term_id'] ), 'parent' => $parent, 'change' => self::change( $change ) );
	}

	// Strings.

	/** @return array|WP_Error */
	protected function op_update_strings( array $args ) {
		$lang = $this->language( (string) $args['lang'] );
		if ( is_wp_error( $lang ) ) {
			return $lang;
		}
		$api   = $this->api();
		$table = $api->string_table( $lang['slug'] );
		$known = array_flip( array_merge( array_column( $api->strings(), 'string' ), array_keys( $table ) ) );
		$new   = $table;
		$bad   = array();
		foreach ( (array) $args['strings'] as $row ) {
			if ( ! is_array( $row ) || ! isset( $row['string'], $row['translation'] ) || ! isset( $known[ (string) $row['string'] ] ) ) {
				$bad[] = is_array( $row ) ? (string) ( $row['string'] ?? '' ) : '';
				continue;
			}
			$new[ (string) $row['string'] ] = current_user_can( 'unfiltered_html' ) ? (string) $row['translation'] : wp_kses_post( (string) $row['translation'] );
		}
		if ( $bad ) {
			return new WP_Error( 'unknown_string', __( 'Some strings are not known to Polylang (not registered and not in this language\'s table), so nothing was written.', 'emcp-tools' ), array( 'strings' => $bad ) );
		}
		$api->save_string_table( $lang['slug'], $new );
		/* translators: %s: language slug. */
		$change = EMCP_Tools_Polylang_History::record_setup( 'update-strings', sprintf( __( 'Polylang: %s string translations', 'emcp-tools' ), $lang['slug'] ), 'strings', array( 'lang' => $lang['slug'], 'before' => $table ) );
		return array( 'lang' => $lang['slug'], 'updated' => count( (array) $args['strings'] ), 'change' => self::change( $change ) );
	}
}
