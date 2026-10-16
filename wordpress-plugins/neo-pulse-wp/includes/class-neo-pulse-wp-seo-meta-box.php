<?php
/**
 * "SEO" box on the post edit screen, shown once no other SEO plugin is active.
 *
 * Edits the same fields Rank Math used (rank_math_title, rank_math_description,
 * rank_math_focus_keyword, rank_math_robots, rank_math_canonical_url, rank_math_primary_{tax}),
 * so nothing is lost moving either way.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Seo_Meta_Box {

	const NONCE = 'neo_pulse_wp_seo_meta_nonce';

	public static function init(): void {
		add_action( 'add_meta_boxes', array( __CLASS__, 'register' ), 10, 2 );
		add_action( 'save_post', array( __CLASS__, 'save' ), 10, 2 );
	}

	public static function active(): bool {
		return Neo_Pulse_Wp_Seo_Settings::enabled() && Neo_Pulse_Wp_Seo_Settings::other_seo_plugin() === '';
	}

	/**
	 * @param mixed $post_type Post type.
	 * @param mixed $post      Post.
	 */
	public static function register( $post_type, $post = null ): void {
		unset( $post );
		if ( ! self::active() || ! is_string( $post_type ) || ! array_key_exists( $post_type, Neo_Pulse_Wp_Seo_Settings::post_types() ) || 'attachment' === $post_type ) {
			return;
		}
		add_meta_box( 'neo_pulse_wp_seo', __( 'SEO', 'neo-pulse-wp' ), array( __CLASS__, 'render' ), $post_type, 'normal', 'high' );
	}

	public static function render( WP_Post $post ): void {
		wp_nonce_field( self::NONCE, self::NONCE );
		$S         = 'Neo_Pulse_Wp_Seo_Settings';
		$title     = (string) get_post_meta( $post->ID, 'rank_math_title', true );
		$desc      = (string) get_post_meta( $post->ID, 'rank_math_description', true );
		$keyword   = (string) get_post_meta( $post->ID, 'rank_math_focus_keyword', true );
		$canonical = (string) get_post_meta( $post->ID, 'rank_math_canonical_url', true );
		$robots    = $S::robots_list( get_post_meta( $post->ID, 'rank_math_robots', true ) );
		// Show what the page really gets: its own setting, else the post type / site default.
		$effective = Neo_Pulse_Wp_Seo_Head::effective_post_robots( $robots, $post->post_type );
		$inherited = ! array_intersect( $robots, array( 'index', 'noindex', 'follow', 'nofollow' ) );
		$taxonomy  = (string) $S::get( 'pt_' . $post->post_type . '_primary_taxonomy', 'post' === $post->post_type ? 'category' : '' );
		$terms     = ( $taxonomy !== '' && $taxonomy !== 'off' && taxonomy_exists( $taxonomy ) ) ? get_the_terms( $post, $taxonomy ) : array();
		$primary   = $taxonomy !== '' ? (int) get_post_meta( $post->ID, 'rank_math_primary_' . $taxonomy, true ) : 0;
		?>
		<style>
			#neo_pulse_wp_seo .npwp-seo-mb p { margin: 0 0 12px; }
			#neo_pulse_wp_seo .npwp-seo-mb label.block { display: block; font-weight: 600; margin-bottom: 4px; }
			#neo_pulse_wp_seo .npwp-seo-mb input[type=text], #neo_pulse_wp_seo .npwp-seo-mb input[type=url], #neo_pulse_wp_seo .npwp-seo-mb textarea { width: 100%; }
			#neo_pulse_wp_seo .npwp-seo-mb .npwp-count { color: #646970; font-size: 12px; }
		</style>
		<div class="npwp-seo-mb">
			<p>
				<label class="block" for="npwp_seo_title"><?php esc_html_e( 'SEO title', 'neo-pulse-wp' ); ?></label>
				<input type="text" id="npwp_seo_title" name="npwp_seo[title]" value="<?php echo esc_attr( $title ); ?>" placeholder="<?php echo esc_attr( (string) $S::get( 'pt_' . $post->post_type . '_title' ) ); ?>" />
				<span class="npwp-count"><?php esc_html_e( 'Leave empty to use the template. Aim for under 60 characters.', 'neo-pulse-wp' ); ?></span>
			</p>
			<p>
				<label class="block" for="npwp_seo_desc"><?php esc_html_e( 'Meta description', 'neo-pulse-wp' ); ?></label>
				<textarea id="npwp_seo_desc" name="npwp_seo[description]" rows="3" placeholder="<?php echo esc_attr( (string) $S::get( 'pt_' . $post->post_type . '_description' ) ); ?>"><?php echo esc_textarea( $desc ); ?></textarea>
				<span class="npwp-count"><?php esc_html_e( 'Aim for 120–160 characters.', 'neo-pulse-wp' ); ?></span>
			</p>
			<p>
				<label class="block" for="npwp_seo_kw"><?php esc_html_e( 'Focus keyword', 'neo-pulse-wp' ); ?></label>
				<input type="text" id="npwp_seo_kw" name="npwp_seo[keyword]" value="<?php echo esc_attr( $keyword ); ?>" />
			</p>
			<p>
				<label class="block" for="npwp_seo_canonical"><?php esc_html_e( 'Canonical URL', 'neo-pulse-wp' ); ?></label>
				<input type="url" id="npwp_seo_canonical" name="npwp_seo[canonical]" value="<?php echo esc_attr( $canonical ); ?>" placeholder="<?php esc_attr_e( 'This page (default)', 'neo-pulse-wp' ); ?>" />
			</p>
			<?php if ( is_array( $terms ) && count( $terms ) > 1 ) : ?>
				<p>
					<label class="block" for="npwp_seo_primary"><?php esc_html_e( 'Primary category', 'neo-pulse-wp' ); ?></label>
					<select id="npwp_seo_primary" name="npwp_seo[primary]">
						<option value="0"><?php esc_html_e( 'First category', 'neo-pulse-wp' ); ?></option>
						<?php foreach ( $terms as $term ) : ?>
							<option value="<?php echo esc_attr( (string) $term->term_id ); ?>" <?php selected( $primary, (int) $term->term_id ); ?>><?php echo esc_html( $term->name ); ?></option>
						<?php endforeach; ?>
					</select>
					<input type="hidden" name="npwp_seo[primary_tax]" value="<?php echo esc_attr( $taxonomy ); ?>" />
				</p>
			<?php endif; ?>
			<p>
				<label><input type="checkbox" name="npwp_seo[noindex]" value="1" <?php checked( in_array( 'noindex', $effective, true ) ); ?> /> <?php esc_html_e( 'Hide from search engines (noindex)', 'neo-pulse-wp' ); ?></label><br />
				<label><input type="checkbox" name="npwp_seo[nofollow]" value="1" <?php checked( in_array( 'nofollow', $effective, true ) ); ?> /> <?php esc_html_e( 'Do not follow links on this page (nofollow)', 'neo-pulse-wp' ); ?></label>
				<?php if ( $inherited ) : ?>
					<br /><span class="npwp-count"><?php esc_html_e( 'Showing the default for this post type. Leave as is to keep following the default.', 'neo-pulse-wp' ); ?></span>
				<?php endif; ?>
			</p>
		</div>
		<?php
	}

	/**
	 * @param mixed $post_id Post ID.
	 * @param mixed $post    Post.
	 */
	public static function save( $post_id, $post = null ): void {
		$post_id = (int) $post_id;
		if ( ! isset( $_POST[ self::NONCE ], $_POST['npwp_seo'] ) || ! is_array( $_POST['npwp_seo'] ) ) {
			return;
		}
		if ( ! wp_verify_nonce( sanitize_text_field( wp_unslash( (string) $_POST[ self::NONCE ] ) ), self::NONCE ) ) {
			return;
		}
		if ( ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) || wp_is_post_revision( $post_id ) || ! current_user_can( 'edit_post', $post_id ) ) {
			return;
		}
		$in = wp_unslash( $_POST['npwp_seo'] ); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- sanitised per field.

		$fields = array(
			'rank_math_title'         => Neo_Pulse_Wp_Seo_Settings::clean_input( $in['title'] ?? '' ),
			'rank_math_description'   => Neo_Pulse_Wp_Seo_Settings::clean_input( $in['description'] ?? '' ),
			'rank_math_focus_keyword' => Neo_Pulse_Wp_Seo_Settings::clean_input( $in['keyword'] ?? '' ),
			'rank_math_canonical_url' => esc_url_raw( (string) ( $in['canonical'] ?? '' ) ),
		);
		foreach ( $fields as $key => $value ) {
			if ( $value === '' ) {
				delete_post_meta( $post_id, $key );
			} else {
				update_post_meta( $post_id, $key, $value );
			}
		}

		$before   = Neo_Pulse_Wp_Seo_Settings::robots_list( get_post_meta( $post_id, 'rank_math_robots', true ) );
		$extras   = array_values( array_diff( $before, array( 'index', 'noindex', 'follow', 'nofollow' ) ) );
		$type     = (string) get_post_type( $post_id );
		$explicit = $extras !== $before; // index/noindex/follow/nofollow stored on the post itself.
		$noindex  = ! empty( $in['noindex'] );
		$nofollow = ! empty( $in['nofollow'] );

		// The checkboxes show the inherited default when the post has none of its own. If they still
		// match what the post would inherit, store nothing explicit, so saving an untouched box never
		// turns a post type's noindex into index (or the other way round).
		$inherit = Neo_Pulse_Wp_Seo_Head::effective_post_robots( $extras, $type );
		if ( ! $explicit && in_array( 'noindex', $inherit, true ) === $noindex && in_array( 'nofollow', $inherit, true ) === $nofollow ) {
			$robots = $extras;
		} else {
			$robots   = $extras;
			$robots[] = $noindex ? 'noindex' : 'index';
			if ( $nofollow ) {
				$robots[] = 'nofollow';
			}
		}
		if ( $robots === array() ) {
			delete_post_meta( $post_id, 'rank_math_robots' );
		} elseif ( $robots !== $before ) {
			update_post_meta( $post_id, 'rank_math_robots', $robots );
		}

		$tax = sanitize_key( (string) ( $in['primary_tax'] ?? '' ) );
		if ( $tax !== '' && taxonomy_exists( $tax ) && isset( $in['primary'] ) ) {
			$primary = absint( $in['primary'] );
			if ( $primary > 0 ) {
				update_post_meta( $post_id, 'rank_math_primary_' . $tax, $primary );
			} else {
				delete_post_meta( $post_id, 'rank_math_primary_' . $tax );
			}
		}
	}
}
