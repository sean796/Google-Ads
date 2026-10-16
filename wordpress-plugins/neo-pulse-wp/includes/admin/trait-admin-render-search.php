<?php
/**
 * Search panel: tabbed admin UI for AI search settings.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Admin_Trait_Render_Search {

	public static function render_search_page(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		$settings = Neo_Pulse_Wp_Search::get_search_settings();

		$tab = self::panel_active_tab( 'general' );
		if ( ! in_array( $tab, array( 'general', 'popular', 'shortcode' ), true ) ) {
			$tab = 'general';
		}

		self::neo_pulse_group_shell_open( 'neo-pulse-wp-search', 'neo-pulse-wp-search neo-pulse-wp-panel-page' );

		self::render_search_live_demo( $settings );

		// The section tabs across the top already list these tabs, so no in-page nav is passed.
		self::panel_layout_start( 'neo-pulse-wp-search', array(), $tab, __( 'Search sections', 'neo-pulse-wp' ) );
		switch ( $tab ) {
			case 'shortcode':
				self::render_search_section_shortcode();
				break;
			case 'popular':
				self::render_search_section_popular( $settings );
				break;
			default:
				self::render_search_section_general( $settings );
				break;
		}
		self::panel_layout_end();

		self::neo_pulse_group_shell_close();
	}

	/**
	 * @param array<string,mixed> $settings Settings.
	 */
	private static function render_search_section_general( array $settings ): void {
		$form_id        = 'neo-pulse-wp-search-general-form';
		$openrouter_ok  = Neo_Pulse_Wp_OpenRouter::get_api_key() !== '';
		$all_post_types = get_post_types( array( 'public' => true ), 'objects' );
		$selected_types = (array) $settings['post_types'];
		$type_labels    = isset( $settings['content_type_labels'] ) && is_array( $settings['content_type_labels'] )
			? $settings['content_type_labels']
			: array();
		?>
		<h2 class="neo-pulse-wp-panel-content__title"><?php esc_html_e( 'General', 'neo-pulse-wp' ); ?></h2>
		<p class="neo-pulse-wp-panel-content__desc">
			<?php esc_html_e( 'Configure how the search bar behaves and which content it searches.', 'neo-pulse-wp' ); ?>
		</p>

		<div class="neo-pulse-wp-panel-info-box" role="status">
			<p>
				<?php
				if ( Neo_Pulse_Wp_License::ai_needs_upgrade( false ) ) {
					esc_html_e( 'Site Search is on: visitors get keyword results in your chosen order. AI Smart Search, which works out what visitors mean and ranks the results with AI, is part of NEO Pulse Pro + AI.', 'neo-pulse-wp' );
					echo Neo_Pulse_Wp_Plan::label_chip( 'npwp-ai-chip' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped in label_chip().
				} elseif ( $openrouter_ok ) {
					esc_html_e( 'OpenRouter AI: connected. Searches will include AI-powered relevance ranking.', 'neo-pulse-wp' );
					echo ' ';
					echo esc_html(
						sprintf(
							/* translators: 1: AI searches used today, 2: daily limit. */
							__( 'AI searches today: %1$s of %2$s.', 'neo-pulse-wp' ),
							number_format_i18n( Neo_Pulse_Wp_Search::ai_searches_today() ),
							number_format_i18n( Neo_Pulse_Wp_Search::daily_ai_cap() )
						)
					);
				} else {
					esc_html_e( 'OpenRouter AI: not configured. Search will work but without AI relevance ranking. Configure it under Settings → Editor AI.', 'neo-pulse-wp' );
				}
				?>
			</p>
			<p class="neo-pulse-field__note">
				<?php esc_html_e( 'Ranking favors Pages and Service Area URLs over blog posts. Include the Service Area post type below if you use location pages.', 'neo-pulse-wp' ); ?>
			</p>
		</div>

		<form id="<?php echo esc_attr( $form_id ); ?>" method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" class="neo-pulse-wp-settings__form neo-pulse-schema-form" autocomplete="off">
			<input type="hidden" name="action" value="<?php echo esc_attr( self::ACTION_SAVE_SEARCH ); ?>" />
			<input type="hidden" name="neo-pulse_search_tab" value="general" />
			<?php wp_nonce_field( self::ACTION_SAVE_SEARCH, 'neo_pulse_wp_search_nonce' ); ?>

			<?php
			self::panel_form_group_open();
			self::panel_form_field_input(
				'neo-pulse-search-placeholder',
				'neo-pulse_search[placeholder]',
				__( 'Default placeholder text', 'neo-pulse-wp' ),
				(string) $settings['placeholder'],
				'half',
				'text',
				false,
				__( 'Used by the shortcode, the front-page search and any Search widget that leaves its own blank.', 'neo-pulse-wp' )
			);
			self::panel_form_field_input(
				'neo-pulse-search-button-label',
				'neo-pulse_search[button_label]',
				__( 'Default button label', 'neo-pulse-wp' ),
				(string) $settings['button_label'],
				'half',
				'text',
				false,
				__( 'Used by the shortcode and the front-page search. Search widgets set their own (blank shows an arrow).', 'neo-pulse-wp' )
			);
			self::panel_form_field_input(
				'neo-pulse-search-max-results',
				'neo-pulse_search[max_results]',
				__( 'Default number of results', 'neo-pulse-wp' ),
				(string) $settings['max_results'],
				'half',
				'number',
				false,
				__( '1 to 20. A Search widget can set its own.', 'neo-pulse-wp' ),
				' min="1" max="20"'
			);
			self::panel_form_field_input(
				'neo-pulse-search-openrouter-model',
				'neo-pulse_search[openrouter_model]',
				__( 'Search AI model (OpenRouter)', 'neo-pulse-wp' ),
				isset( $settings['openrouter_model'] ) ? (string) $settings['openrouter_model'] : Neo_Pulse_Wp_Search::DEFAULT_OPENROUTER_MODEL,
				'full',
				'text',
				false,
				__( 'Used for query intent and popular terms. Chat and editor wands use the global Editor AI model.', 'neo-pulse-wp' )
			);
			self::panel_form_field_input(
				'neo-pulse-search-daily-ai-cap',
				'neo-pulse_search[daily_ai_cap]',
				__( 'Daily AI search limit', 'neo-pulse-wp' ),
				(string) ( isset( $settings['daily_ai_cap'] ) ? (int) $settings['daily_ai_cap'] : Neo_Pulse_Wp_Search::DEFAULT_DAILY_AI_CAP ),
				'half',
				'number',
				false,
				sprintf(
					/* translators: 1: per-visitor daily AI searches, 2: per-visitor searches per minute. */
					__( 'AI searches for the whole site per day. After that, search keeps working without AI until midnight. Repeat searches reuse a saved answer and do not count. 0 turns AI off for search. Each visitor also gets at most %1$s AI searches a day and %2$s searches a minute.', 'neo-pulse-wp' ),
					number_format_i18n( Neo_Pulse_Wp_Search::RATE_LIMIT_DAY_MAX ),
					number_format_i18n( Neo_Pulse_Wp_Search::RATE_LIMIT_MAX )
				),
				' min="0" max="100000"'
			);
			?>
			<div class="neo-pulse-schema-cell neo-pulse-schema-cell--full">
				<fieldset class="neo-pulse-field neo-pulse-field--stacked neo-pulse-search-fieldset">
					<legend class="neo-pulse-field__label neo-pulse-field__label--above"><?php esc_html_e( 'Post types to search', 'neo-pulse-wp' ); ?></legend>
					<?php foreach ( $all_post_types as $pt ) : ?>
						<?php if ( $pt->name === 'attachment' ) continue; ?>
						<label class="neo-pulse-wp-panel-toggle neo-pulse-search-post-type-toggle">
							<input
								type="checkbox"
								name="neo-pulse_search[post_types][]"
								value="<?php echo esc_attr( $pt->name ); ?>"
								<?php checked( in_array( $pt->name, $selected_types, true ) ); ?>
							/>
							<span class="neo-pulse-wp-panel-toggle__label">
								<?php echo esc_html( $pt->labels->singular_name ); ?>
								<code><?php echo esc_html( $pt->name ); ?></code>
							</span>
						</label>
					<?php endforeach; ?>
				</fieldset>
			</div>
			<div class="neo-pulse-schema-cell neo-pulse-schema-cell--full">
				<h3 class="neo-pulse-chat-settings-section__title"><?php esc_html_e( 'Result order', 'neo-pulse-wp' ); ?></h3>
				<p class="description"><?php esc_html_e( 'Which content shows first in search results. 1 shows first, 9 shows last; types with the same number are mixed by how well they match.', 'neo-pulse-wp' ); ?></p>
				<div class="neo-pulse-schema-inline-grid">
					<?php foreach ( $all_post_types as $pt ) : ?>
						<?php if ( $pt->name === 'attachment' ) continue; ?>
						<?php $rank = Neo_Pulse_Wp_Search::type_priority( $pt->name ); ?>
						<div class="neo-pulse-schema-inline-grid__cell">
							<label class="neo-pulse-field neo-pulse-field--stacked" for="neo-pulse-search-priority-<?php echo esc_attr( $pt->name ); ?>">
								<span class="neo-pulse-field__label neo-pulse-field__label--above"><?php echo esc_html( $pt->labels->singular_name ); ?></span>
								<select id="neo-pulse-search-priority-<?php echo esc_attr( $pt->name ); ?>" name="neo-pulse_search[type_priority][<?php echo esc_attr( $pt->name ); ?>]">
									<?php for ( $i = 1; $i <= 9; $i++ ) : ?>
										<option value="<?php echo (int) $i; ?>" <?php selected( $rank, $i ); ?>>
											<?php
											echo esc_html(
												1 === $i ? __( '1 – first', 'neo-pulse-wp' ) : ( 9 === $i ? __( '9 – last', 'neo-pulse-wp' ) : (string) $i )
											);
											?>
										</option>
									<?php endfor; ?>
								</select>
							</label>
						</div>
					<?php endforeach; ?>
				</div>
				<label class="neo-pulse-field neo-pulse-field--stacked" for="neo-pulse-search-priority-mode">
					<span class="neo-pulse-field__label neo-pulse-field__label--above"><?php esc_html_e( 'How strictly to follow the order', 'neo-pulse-wp' ); ?></span>
					<select id="neo-pulse-search-priority-mode" name="neo-pulse_search[priority_mode]">
						<option value="balanced" <?php selected( $settings['priority_mode'] ?? 'balanced', 'balanced' ); ?>><?php esc_html_e( 'Balanced – a near-exact match can still rise above the order', 'neo-pulse-wp' ); ?></option>
						<option value="strict" <?php selected( $settings['priority_mode'] ?? 'balanced', 'strict' ); ?>><?php esc_html_e( 'Strict – always show higher types first', 'neo-pulse-wp' ); ?></option>
					</select>
				</label>
				<label class="neo-pulse-wp-panel-toggle">
					<input type="hidden" name="neo-pulse_search[indexable_only]" value="0" />
					<input type="checkbox" name="neo-pulse_search[indexable_only]" value="1" <?php checked( ! empty( $settings['indexable_only'] ) ); ?> />
					<span class="neo-pulse-wp-panel-toggle__label"><?php esc_html_e( 'Only show pages that are in the sitemap (leaves out noindex pages such as thank-you pages, and pages that redirect)', 'neo-pulse-wp' ); ?></span>
				</label>
			</div>
			<div class="neo-pulse-schema-cell neo-pulse-schema-cell--full">
				<h3 class="neo-pulse-chat-settings-section__title"><?php esc_html_e( 'Content type labels', 'neo-pulse-wp' ); ?></h3>
				<div class="neo-pulse-schema-inline-grid">
					<?php foreach ( $all_post_types as $pt ) : ?>
						<?php if ( $pt->name === 'attachment' ) continue; ?>
						<?php
						$label_value = isset( $type_labels[ $pt->name ] )
							? (string) $type_labels[ $pt->name ]
							: Neo_Pulse_Wp_Search::default_content_type_label( $pt->name );
						?>
						<div class="neo-pulse-schema-inline-grid__cell">
							<?php
							self::panel_form_field_input(
								'neo-pulse-search-type-label-' . $pt->name,
								'neo-pulse_search[content_type_labels][' . $pt->name . ']',
								sprintf(
									/* translators: %s: WordPress post type singular name */
									__( '%s label', 'neo-pulse-wp' ),
									$pt->labels->singular_name
								),
								$label_value,
								'half'
							);
							?>
						</div>
					<?php endforeach; ?>
				</div>
			</div>
			<?php
			self::panel_form_group_close();
			?>
		</form>

		<?php
		self::panel_footer_save(
			'general',
			$form_id,
			self::ACTION_RESET_SEARCH,
			self::ACTION_RESET_SEARCH,
			'neo_pulse_wp_search_reset_nonce',
			'neo-pulse_search_tab'
		);
	}

	/**
	 * Pinned and hidden Popular searches, plus a preview of what visitors see now.
	 *
	 * @param array<string,mixed> $settings Settings.
	 */
	private static function render_search_section_popular( array $settings ): void {
		$form_id  = 'neo-pulse-wp-search-popular-form';
		$pinned   = isset( $settings['pinned_terms'] ) && is_array( $settings['pinned_terms'] ) ? $settings['pinned_terms'] : array();
		$hidden   = isset( $settings['hidden_terms'] ) && is_array( $settings['hidden_terms'] ) ? $settings['hidden_terms'] : array();
		$preview  = Neo_Pulse_Wp_Search_Popular::terms( 30, 8, true );
		$ai_pins  = $pinned === array() && ! Neo_Pulse_Wp_Search_Popular::has_search_data();
		$list     = get_option( Neo_Pulse_Wp_Search_Weekly::OPTION_LIST );
		$built_at = is_array( $list ) && ! empty( $list['built'] ) ? (int) $list['built'] : 0;
		?>
		<h2 class="neo-pulse-wp-panel-content__title"><?php esc_html_e( 'Popular searches', 'neo-pulse-wp' ); ?></h2>
		<p class="neo-pulse-wp-panel-content__desc">
			<?php esc_html_e( 'The searches suggested in the search box before a visitor types. They come from what visitors searched over the last 12 weeks, updated once a week. Pin searches to always show them first, and hide any you never want shown.', 'neo-pulse-wp' ); ?>
		</p>

		<div class="neo-pulse-wp-panel-info-box" role="status">
			<p><strong><?php esc_html_e( 'Visitors see now:', 'neo-pulse-wp' ); ?></strong>
				<?php
				if ( $preview === array() ) {
					esc_html_e( 'nothing yet (no searches recorded and nothing pinned).', 'neo-pulse-wp' );
				} else {
					$labels = array();
					foreach ( $preview as $row ) {
						$labels[] = $row['query'] . ( ! empty( $row['pinned'] ) ? ' ' . __( '(pinned)', 'neo-pulse-wp' ) : '' );
					}
					echo esc_html( implode( ' · ', $labels ) );
				}
				?>
			</p>
			<?php if ( $ai_pins && $preview !== array() ) : ?>
				<p class="neo-pulse-field__note"><?php esc_html_e( 'No searches have been recorded on this site yet, so the pinned searches were suggested by the AI from your pages. They go away once visitors start searching, or as soon as you pin your own.', 'neo-pulse-wp' ); ?></p>
			<?php endif; ?>
			<?php if ( $built_at ) : ?>
				<p class="neo-pulse-field__note">
					<?php
					/* translators: %s: date */
					echo esc_html( sprintf( __( 'Weekly list last updated %s.', 'neo-pulse-wp' ), wp_date( get_option( 'date_format' ), $built_at ) ) );
					?>
				</p>
			<?php endif; ?>
		</div>

		<form id="<?php echo esc_attr( $form_id ); ?>" method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" class="neo-pulse-wp-settings__form neo-pulse-schema-form" autocomplete="off">
			<input type="hidden" name="action" value="<?php echo esc_attr( self::ACTION_SAVE_SEARCH ); ?>" />
			<input type="hidden" name="neo-pulse_search_tab" value="popular" />
			<?php wp_nonce_field( self::ACTION_SAVE_SEARCH, 'neo_pulse_wp_search_nonce' ); ?>
			<?php
			self::panel_form_group_open();
			self::panel_form_field_textarea(
				'neo-pulse-search-pinned-terms',
				'neo-pulse_search[pinned_terms]',
				__( 'Pinned searches', 'neo-pulse-wp' ),
				implode( "\n", $pinned ),
				'half',
				6,
				__( 'One per line, in the order to show them, e.g. "Free consultation". Shown first, as written. A widget can turn pinned searches off.', 'neo-pulse-wp' )
			);
			self::panel_form_field_textarea(
				'neo-pulse-search-hidden-terms',
				'neo-pulse_search[hidden_terms]',
				__( 'Hidden searches', 'neo-pulse-wp' ),
				implode( "\n", $hidden ),
				'half',
				6,
				__( 'One per line. Any popular search containing these words is never shown, e.g. a competitor\'s name hides every search that mentions it. Not case-sensitive.', 'neo-pulse-wp' )
			);
			self::panel_form_group_close();
			?>
		</form>

		<?php
		self::panel_footer_save(
			'popular',
			$form_id,
			self::ACTION_RESET_SEARCH,
			self::ACTION_RESET_SEARCH,
			'neo_pulse_wp_search_reset_nonce',
			'neo-pulse_search_tab'
		);
	}

	/**
	 * @param array<string,mixed> $settings Settings.
	 */
	private static function render_search_section_shortcode(): void {
		?>
		<h2 class="neo-pulse-wp-panel-content__title"><?php esc_html_e( 'Shortcode & Elementor', 'neo-pulse-wp' ); ?></h2>
		<p class="neo-pulse-wp-panel-content__desc">
			<?php esc_html_e( 'Place the AI search bar on any page using the Elementor widget or the shortcode below.', 'neo-pulse-wp' ); ?>
		</p>

		<div class="neo-pulse-schema-form">
			<section class="neo-pulse-schema-group neo-pulse-search-info-section" aria-labelledby="neo-pulse-search-elementor-heading">
				<h3 id="neo-pulse-search-elementor-heading" class="neo-pulse-chat-settings-section__title"><?php esc_html_e( 'Elementor widget', 'neo-pulse-wp' ); ?></h3>
				<p>
					<?php esc_html_e( 'In the Elementor editor, open the widget panel and search for “NEO Pulse Search”, or browse Widgets → NEO Pulse. Drag it onto your layout; its look (colours, launcher, panel, layout) is set entirely on the widget. What gets searched and the AI settings stay under this Search screen.', 'neo-pulse-wp' ); ?>
				</p>
			</section>

			<section class="neo-pulse-schema-group">
				<div class="neo-pulse-schema-grid">
					<div class="neo-pulse-schema-cell neo-pulse-schema-cell--full">
						<div class="neo-pulse-field neo-pulse-field--text neo-pulse-field--stacked">
							<label class="neo-pulse-field__label neo-pulse-field__label--above" for="neo-pulse-search-shortcode"><?php esc_html_e( 'Shortcode', 'neo-pulse-wp' ); ?></label>
							<div class="neo-pulse-wp-search-shortcode-box">
								<div class="neo-pulse-field neo-pulse-field--text neo-pulse-field--stacked">
									<input
										id="neo-pulse-search-shortcode"
										class="neo-pulse-field__control"
										type="text"
										value="[neo-pulse_search]"
										readonly
										onclick="this.select();"
									/>
								</div>
								<button type="button" class="button" onclick="navigator.clipboard.writeText('[neo-pulse_search]');this.textContent='Copied!';setTimeout(()=>{this.textContent='Copy'},1500);">
									<?php esc_html_e( 'Copy', 'neo-pulse-wp' ); ?>
								</button>
							</div>
							<p class="neo-pulse-field__note">
								<?php esc_html_e( 'You can also use the shortcode in template files: do_shortcode( \'[neo-pulse_search]\' )', 'neo-pulse-wp' ); ?>
							</p>
						</div>
					</div>
				</div>
			</section>

			<section class="neo-pulse-schema-group neo-pulse-search-info-section" aria-labelledby="neo-pulse-search-preview-heading">
				<h3 id="neo-pulse-search-preview-heading" class="neo-pulse-chat-settings-section__title"><?php esc_html_e( 'How it works', 'neo-pulse-wp' ); ?></h3>
				<ol>
					<li><?php esc_html_e( 'A visitor types a query in the search bar.', 'neo-pulse-wp' ); ?></li>
					<li><?php esc_html_e( 'The query is sent to OpenRouter for AI sentiment and intent analysis.', 'neo-pulse-wp' ); ?></li>
					<li><?php esc_html_e( 'Simultaneously, WordPress searches posts and pages by relevance.', 'neo-pulse-wp' ); ?></li>
					<li><?php esc_html_e( 'Results are re-ranked using AI-derived keywords and intent, then displayed.', 'neo-pulse-wp' ); ?></li>
				</ol>
			</section>
		</div>
		<?php
	}

	/**
	 * @param array<string,mixed> $settings Settings.
	 */
	private static function render_search_live_demo( array $settings ): void {
		$rest_url = esc_url( rest_url( Neo_Pulse_Wp_Search::REST_NAMESPACE . '/search' ) );
		$nonce    = wp_create_nonce( 'wp_rest' );

		$asset_ver = Neo_Pulse_Wp_Search::search_asset_version();

		wp_enqueue_style(
			'neo-pulse-search',
			plugin_dir_url( NEO_PULSE_WP_PLUGIN_FILE ) . 'assets/search/neo-pulse-search.css',
			array(),
			$asset_ver
		);
		wp_enqueue_script(
			'neo-pulse-search',
			plugin_dir_url( NEO_PULSE_WP_PLUGIN_FILE ) . 'assets/search/neo-pulse-search.js',
			array(),
			$asset_ver,
			true
		);
		?>
		<div class="neo-pulse-wp-search-demo">
			<p class="neo-pulse-wp-search-demo__label">
				<?php esc_html_e( 'Live preview — try it now', 'neo-pulse-wp' ); ?>
			</p>
			<?php
			echo Neo_Pulse_Wp_Search::render_search_markup( $rest_url, $nonce, $settings ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
			?>
		</div>
		<?php
	}
}
