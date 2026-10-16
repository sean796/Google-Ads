<?php
/**
 * The one class that calls Polylang (pll_* functions, PLL(), its REST controllers and
 * string tables). Everything else goes through an instance of this, so unit tests swap
 * in a fake and the rest of the integration never depends on Polylang's internals.
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** @since 3.19.0 */
class EMCP_Tools_Polylang_Api {

	public function active(): bool {
		return function_exists( 'pll_languages_list' ) && function_exists( 'PLL' ) && null !== PLL();
	}

	/**
	 * Languages in Polylang's order, from its own REST controller.
	 *
	 * @return array<int,array{slug:string,locale:string,name:string,rtl:bool,flag:string,order:int,term_id:int,is_default:bool,count:int}>
	 */
	public function languages(): array {
		$data = $this->rest( 'GET', '/pll/v1/languages' );
		if ( is_wp_error( $data ) ) {
			return array();
		}
		$out = array();
		foreach ( (array) $data as $lang ) {
			$lang  = (array) $lang;
			$out[] = array(
				'slug'       => (string) ( $lang['slug'] ?? '' ),
				'locale'     => (string) ( $lang['locale'] ?? '' ),
				'name'       => (string) ( $lang['name'] ?? '' ),
				'rtl'        => ! empty( $lang['is_rtl'] ),
				'flag'       => (string) ( $lang['flag_code'] ?? '' ),
				'order'      => (int) ( $lang['term_group'] ?? 0 ),
				'term_id'    => (int) ( $lang['term_id'] ?? 0 ),
				'is_default' => ! empty( $lang['is_default'] ),
				'count'      => (int) ( $lang['term_props']['language']['count'] ?? 0 ),
				'term_count' => (int) ( $lang['term_props']['term_language']['count'] ?? 0 ),
			);
		}
		return $out;
	}

	public function default_lang(): string {
		return (string) pll_default_language();
	}

	public function post_lang( int $post_id ): string {
		return (string) pll_get_post_language( $post_id );
	}

	public function term_lang( int $term_id ): string {
		return (string) pll_get_term_language( $term_id );
	}

	/** @return array<string,int> */
	public function post_group( int $post_id ): array {
		return array_map( 'intval', (array) pll_get_post_translations( $post_id ) );
	}

	/** @return array<string,int> */
	public function term_group( int $term_id ): array {
		return array_map( 'intval', (array) pll_get_term_translations( $term_id ) );
	}

	/** An empty $lang removes the language. */
	public function set_post_lang( int $post_id, string $lang ): void {
		if ( '' === $lang ) {
			wp_set_object_terms( $post_id, array(), 'language' );
			return;
		}
		pll_set_post_language( $post_id, $lang );
	}

	/** An empty $lang removes the language. */
	public function set_term_lang( int $term_id, string $lang ): void {
		if ( '' === $lang ) {
			wp_set_object_terms( $term_id, array(), 'term_language' );
			return;
		}
		pll_set_term_language( $term_id, $lang );
	}

	/** @return array{term_id:int,name:string,slug:string,description:string,parent:int,taxonomy:string,count:int}|null */
	public function term( int $term_id ): ?array {
		$term = get_term( $term_id );
		if ( ! $term || is_wp_error( $term ) ) {
			return null;
		}
		return array(
			'term_id'     => (int) $term->term_id,
			'name'        => (string) $term->name,
			'slug'        => (string) $term->slug,
			'description' => (string) $term->description,
			'parent'      => (int) $term->parent,
			'taxonomy'    => (string) $term->taxonomy,
			'count'       => (int) $term->count,
		);
	}

	/** @return int|WP_Error New term ID. */
	public function insert_term( string $name, string $taxonomy, string $lang, array $args ) {
		$result = pll_insert_term( $name, $taxonomy, $lang, $args );
		if ( is_wp_error( $result ) ) {
			return $result;
		}
		return (int) ( is_array( $result ) ? ( $result['term_id'] ?? 0 ) : $result );
	}

	public function delete_term( int $term_id, string $taxonomy ): bool {
		$result = wp_delete_term( $term_id, $taxonomy );
		return true === $result;
	}

	/** Term meta of one term, for the undo conflict check. */
	public function term_meta( int $term_id ): array {
		return (array) get_term_meta( $term_id );
	}

	/** @param array<string,int> $group */
	public function save_post_group( array $group ): void {
		pll_save_post_translations( $group );
	}

	/** @param array<string,int> $group */
	public function save_term_group( array $group ): void {
		pll_save_term_translations( $group );
	}

	public function post_translation( int $post_id, string $lang ): int {
		return (int) pll_get_post( $post_id, $lang );
	}

	public function term_translation( int $term_id, string $lang ): int {
		return (int) pll_get_term( $term_id, $lang );
	}

	public function is_translated_post_type( string $type ): bool {
		return (bool) pll_is_translated_post_type( $type );
	}

	public function is_translated_taxonomy( string $tax ): bool {
		return (bool) pll_is_translated_taxonomy( $tax );
	}

	/**
	 * Polylang's settings as they are now. Polylang 3.8 keeps them in an options object that it
	 * writes to the `polylang` option only on shutdown, so read the object, not the option.
	 */
	public function options(): array {
		$options = PLL()->options ?? null;
		if ( is_object( $options ) && method_exists( $options, 'get_all' ) ) {
			return (array) $options->get_all();
		}
		wp_cache_delete( 'polylang', 'options' );
		return (array) get_option( 'polylang', array() );
	}

	/**
	 * Call one of Polylang's REST routes in-process.
	 *
	 * @return mixed|WP_Error Response data.
	 */
	public function rest( string $method, string $route, array $params = array() ) {
		$request = new WP_REST_Request( $method, $route );
		foreach ( $params as $key => $value ) {
			$request->set_param( $key, $value );
		}
		$response = rest_do_request( $request );
		if ( $response->is_error() ) {
			return $response->as_error();
		}
		return $response->get_data();
	}

	/** Forget Polylang's cached language list, so a long-lived process sees a language change. */
	public function clean_cache(): void {
		$model = PLL()->model ?? null;
		if ( $model && isset( $model->languages ) && method_exists( $model->languages, 'clean_cache' ) ) {
			$model->languages->clean_cache();
		} elseif ( $model && method_exists( $model, 'clean_languages_cache' ) ) {
			$model->clean_languages_cache();
		}
	}

	/**
	 * Posts of a type that have no language.
	 *
	 * @return int[]
	 */
	public function posts_without_language( string $post_type, int $limit ): array {
		return array_map(
			'intval',
			get_posts(
				array(
					'post_type'        => $post_type,
					'post_status'      => 'any',
					'fields'           => 'ids',
					'numberposts'      => $limit,
					'lang'             => '',
					'orderby'          => 'ID',
					'order'            => 'ASC',
					'suppress_filters' => false,
					'tax_query'        => array( array( 'taxonomy' => 'language', 'operator' => 'NOT EXISTS' ) ), // phpcs:ignore WordPress.DB.SlowDBQuery
				)
			)
		);
	}

	/**
	 * IDs of a type and status in every language (Polylang's language filter switched off).
	 *
	 * @return int[]
	 */
	public function post_ids( string $post_type, string $status, int $limit ): array {
		return array_map(
			'intval',
			get_posts(
				array(
					'post_type'        => $post_type,
					'post_status'      => $status,
					'fields'           => 'ids',
					'numberposts'      => $limit,
					'lang'             => '',
					'orderby'          => 'ID',
					'order'            => 'ASC',
					'suppress_filters' => false,
				)
			)
		);
	}

	/**
	 * Strings registered with Polylang in this request.
	 *
	 * @return array<int,array{string:string,name:string,group:string,multiline:bool}>
	 */
	public function strings(): array {
		if ( ! class_exists( 'PLL_Admin_Strings' ) ) {
			return array();
		}
		$out = array();
		foreach ( (array) PLL_Admin_Strings::get_strings() as $s ) {
			$out[] = array(
				'string'    => (string) ( $s['string'] ?? '' ),
				'name'      => (string) ( $s['name'] ?? '' ),
				'group'     => (string) ( $s['context'] ?? '' ),
				'multiline' => ! empty( $s['multiline'] ),
			);
		}
		return $out;
	}

	/** @return array<string,string> original => translation */
	public function string_table( string $lang ): array {
		$language = PLL()->model->get_language( $lang );
		if ( ! $language ) {
			return array();
		}
		$mo = new PLL_MO();
		$mo->import_from_db( $language );
		$out = array();
		foreach ( $mo->entries as $entry ) {
			$out[ (string) $entry->singular ] = (string) ( $entry->translations[0] ?? '' );
		}
		return $out;
	}

	/** @param array<string,string> $table original => translation, the whole table. */
	public function save_string_table( string $lang, array $table ): void {
		$language = PLL()->model->get_language( $lang );
		if ( ! $language ) {
			return;
		}
		$mo = new PLL_MO();
		foreach ( $table as $original => $translation ) {
			$mo->add_entry( $mo->make_entry( (string) $original, (string) $translation ) );
		}
		$mo->export_to_db( $language );
	}
}
