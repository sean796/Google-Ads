<?php
/**
 * SEO Settings page: switch-over from Rank Math, side-by-side check, and the settings form.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Admin_Trait_Render_Seo {

	public static function render_seo_page(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to change SEO settings.', 'neo-pulse-wp' ) );
		}
		self::neo_pulse_group_shell_open( 'neo-pulse-wp-seo', 'neo-pulse-wp-seo neo-pulse-wp-panel-page', 'seo' );
		?>
		<h2 class="neo-pulse-wp-panel-content__title"><?php esc_html_e( 'SEO Settings', 'neo-pulse-wp' ); ?></h2>
		<p class="description npwp-seo__lead">
			<?php esc_html_e( 'Page titles, meta descriptions, robots, canonical links, social sharing tags and schema. Neo Pulse reads the titles, descriptions and schema already saved on your pages by Rank Math, so nothing needs re-entering.', 'neo-pulse-wp' ); ?>
		</p>
		<?php
		self::render_seo_switch_panel();
		self::render_seo_compare_panel();
		self::render_seo_settings_form();
		self::neo_pulse_group_shell_close();
	}

	private static function seo_status(): array {
		$S       = 'Neo_Pulse_Wp_Seo_Settings';
		$other   = $S::other_seo_plugin();
		$enabled = $S::enabled();
		if ( $enabled && $other === '' ) {
			return array( 'live', __( 'Live', 'neo-pulse-wp' ), __( 'Neo Pulse is printing the SEO tags on every page.', 'neo-pulse-wp' ) );
		}
		if ( $enabled ) {
			/* translators: %s: plugin name */
			return array( 'waiting', __( 'Waiting', 'neo-pulse-wp' ), sprintf( __( 'Switched on, waiting for %s. Neo Pulse takes over the moment it is deactivated, with no gap.', 'neo-pulse-wp' ), $other ) );
		}
		if ( $other !== '' ) {
			/* translators: %s: plugin name */
			return array( 'off', __( 'Off', 'neo-pulse-wp' ), sprintf( __( '%s is handling SEO tags. Work through the checklist, then switch Neo Pulse on.', 'neo-pulse-wp' ), $other ) );
		}
		return array( 'off', __( 'Off', 'neo-pulse-wp' ), __( 'No SEO plugin is printing titles, descriptions or schema on this site. Switch Neo Pulse on to add them.', 'neo-pulse-wp' ) );
	}

	/**
	 * @return array{0: string, 1: string, 2: string}
	 */
	private static function ready_status( string $other ): array {
		/* translators: %s: plugin name */
		return array( 'ready', __( 'Ready', 'neo-pulse-wp' ), sprintf( __( 'Everything checks out. Use the switch below to hand over from %s. Visitors and search engines see no change.', 'neo-pulse-wp' ), $other ) );
	}

	/**
	 * Checklist line for the side-by-side check.
	 */
	private static function compare_line( int $pages, int $perfect, int $skipped, int $time ): string {
		if ( $pages < 1 ) {
			return __( 'Side-by-side check: not run yet. It compares what Neo Pulse would print with what visitors see now.', 'neo-pulse-wp' );
		}
		/* translators: %s: time since, e.g. "5 mins" */
		$when = $time > 0 ? ' ' . sprintf( __( 'Checked %s ago.', 'neo-pulse-wp' ), human_time_diff( $time ) ) : '';
		if ( $perfect === $pages ) {
			/* translators: %d: pages */
			$line = sprintf( _n( 'Side-by-side check: the page checked matches what visitors see now.', 'Side-by-side check: all %d pages match what visitors see now.', $pages, 'neo-pulse-wp' ), $pages );
			return $line . $when;
		}
		/* translators: 1: pages with differences, 2: pages checked */
		return sprintf( __( 'Side-by-side check: %1$d of %2$d pages have differences to look at (listed first in the check below).', 'neo-pulse-wp' ), $pages - $perfect, $pages ) . $when;
	}

	/**
	 * The switch-over checklist shown on the SEO screen. The dashboard's "Switch from Rank Math"
	 * to-do counts its steps from the same list.
	 *
	 * @return array<int, array{0: bool, 1: string, 2: string, 3?: bool}> [ done, text, key, needs attention ]
	 */
	private static function seo_switch_checks(): array {
		$S      = 'Neo_Pulse_Wp_Seo_Settings';
		$raw    = $S::raw();
		$has_rm = is_array( get_option( $S::RM_TITLES, null ) );

		$checks = array();
		if ( $has_rm ) {
			$checks[] = array(
				$S::has_own(),
				$S::has_own() && ! empty( $raw['imported_at'] )
					/* translators: %s: date */
					? sprintf( __( 'Rank Math settings copied into Neo Pulse (%s).', 'neo-pulse-wp' ), wp_date( get_option( 'date_format' ), (int) $raw['imported_at'] ) )
					: ( $S::has_own() ? __( 'Settings saved in Neo Pulse.', 'neo-pulse-wp' ) : __( 'Rank Math settings are being read live. Copy them before removing Rank Math.', 'neo-pulse-wp' ) ),
				'import',
			);
			$redirects = self::rank_math_database_import_status();
			$total     = (int) $redirects['imported_count'] + (int) $redirects['pending_count'];
			$checks[]  = array(
				(int) $redirects['pending_count'] === 0,
				(int) $redirects['pending_count'] === 0
					? ( $total > 0
						/* translators: %d: number of redirects */
						? sprintf( _n( 'Redirects: the Rank Math redirect is in Neo Pulse.', 'Redirects: all %d Rank Math redirects are in Neo Pulse.', $total, 'neo-pulse-wp' ), $total )
						: __( 'Redirects: Rank Math has no redirects to bring across.', 'neo-pulse-wp' ) )
					/* translators: %d: number of redirects */
					: sprintf( _n( 'Redirects: %d Rank Math redirect still needs importing. Rank Math stops redirecting once it is deactivated.', 'Redirects: %d Rank Math redirects still need importing. Rank Math stops redirecting once it is deactivated.', (int) $redirects['pending_count'], 'neo-pulse-wp' ), (int) $redirects['pending_count'] ),
				'redirects',
			);
		}
		// Scripts from Header Footer Code Manager. Not tied to Rank Math, but it is part of the same move
		// and easy to forget when this page is the only one being worked through.
		$hfcm = self::hfcm_database_import_status();
		if ( ! empty( $hfcm['available'] ) || ! empty( $hfcm['items'] ) ) {
			$hfcm_done = empty( $hfcm['available'] );
			if ( $hfcm_done ) {
				$hfcm_text = __( 'Scripts: everything from Header Footer Code Manager is in Script Manager and HFCM is off.', 'neo-pulse-wp' );
			} elseif ( (int) $hfcm['pending'] > 0 ) {
				/* translators: %d: number of snippets */
				$hfcm_text = sprintf( _n( 'Scripts: %d Header Footer Code Manager snippet still needs moving into Script Manager, then HFCM is switched off.', 'Scripts: %d Header Footer Code Manager snippets still need moving into Script Manager, then HFCM is switched off.', (int) $hfcm['pending'], 'neo-pulse-wp' ), (int) $hfcm['pending'] );
			} else {
				$hfcm_text = __( 'Scripts: every HFCM snippet is in Script Manager, but Header Footer Code Manager is still active. Switch it off so nothing runs twice.', 'neo-pulse-wp' );
			}
			$checks[] = array( $hfcm_done, $hfcm_text, 'scripts', (int) ( $hfcm['blockers'] ?? 0 ) > 0 );
		}
		$sitemap  = class_exists( 'Neo_Pulse_Wp_Sitemap_Settings', false ) ? Neo_Pulse_Wp_Sitemap_Settings::get_config() : array();
		$checks[] = array(
			! empty( $sitemap['general']['enabled'] ),
			! empty( $sitemap['general']['enabled'] )
				? __( 'Sitemap: Neo Pulse serves sitemap_index.xml once Rank Math is off (same address).', 'neo-pulse-wp' )
				: __( 'Sitemap: switched off in Neo Pulse. Turn it on so search engines keep a sitemap.', 'neo-pulse-wp' ),
			'sitemap',
		);
		$ga = Neo_Pulse_Wp_Seo_Takeover::rank_math_ga();
		if ( $ga['install'] && $ga['measurement_id'] !== '' ) {
			$moved    = Neo_Pulse_Wp_Seo_Takeover::ga_row() || Neo_Pulse_Wp_Seo_Takeover::existing_tags( $ga['measurement_id'] )['same_id'] !== '';
			$checks[] = array(
				$moved,
				$moved
					/* translators: %s: GA measurement ID */
					? sprintf( __( 'Google Analytics: %s is in Script Manager and keeps running once Rank Math is off.', 'neo-pulse-wp' ), $ga['measurement_id'] )
					/* translators: %s: GA measurement ID */
					: sprintf( __( 'Google Analytics: Rank Math adds %s today. Copy settings to move the tag to Script Manager, or tracking stops when Rank Math is deactivated.', 'neo-pulse-wp' ), $ga['measurement_id'] ),
				'ga',
			);
		}
		$verify = Neo_Pulse_Wp_Seo_Takeover::rank_math_verify();
		if ( $verify !== array() ) {
			$missing  = Neo_Pulse_Wp_Seo_Takeover::verify_missing();
			$names    = array_map( array( 'Neo_Pulse_Wp_Seo_Takeover', 'verify_label' ), array_keys( $missing ? $missing : $verify ) );
			$services = wp_sprintf( '%l', $names );
			$checks[] = array(
				$missing === array(),
				$missing === array()
					/* translators: %s: services, e.g. "Google Search Console and Bing" */
					? sprintf( _n( 'Site verification: the %s verification tag is in Script Manager and keeps the site verified once Rank Math is off.', 'Site verification: the %s verification tags are in Script Manager and keep the site verified once Rank Math is off.', count( $names ), 'neo-pulse-wp' ), $services )
					/* translators: %s: services, e.g. "Google Search Console and Bing" */
					: sprintf( _n( 'Site verification: Rank Math adds the %s verification tag today. Move it to Script Manager, or the site can lose its verification when Rank Math is deactivated.', 'Site verification: Rank Math adds the %s verification tags today. Move them to Script Manager, or the site can lose its verification when Rank Math is deactivated.', count( $names ), 'neo-pulse-wp' ), $services ),
				'verify',
			);
		}
		$indexnow = Neo_Pulse_Wp_Seo_Indexnow::last();
		$checks[] = array(
			true,
			$indexnow
				/* translators: 1: date, 2: HTTP status */
				? sprintf( __( 'IndexNow: last sent %1$s (answer %2$s).', 'neo-pulse-wp' ), wp_date( get_option( 'date_format' ) . ' ' . get_option( 'time_format' ), (int) $indexnow['time'] ), (string) ( $indexnow['status'] ?: __( 'no answer', 'neo-pulse-wp' ) ) )
				: __( 'IndexNow: search engines are told about new and updated pages once Neo Pulse SEO is live (using Rank Math\'s key when it had one).', 'neo-pulse-wp' ),
			'indexnow',
		);
		$last       = Neo_Pulse_Wp_Seo_Compare::last_summary();
		$compare_ok = $last['pages'] > 0 && $last['perfect'] === $last['pages'];
		$checks[]   = array(
			$compare_ok,
			self::compare_line( $last['pages'], $last['perfect'], $last['skipped'], $last['time'] ),
			'compare',
			$last['pages'] > 0 && ! $compare_ok,
		);
		return $checks;
	}

	/**
	 * Switch-over steps not done yet (circle or "!" in the checklist).
	 *
	 * @param array<int, array>|null $checks From seo_switch_checks(); worked out when null.
	 */
	private static function seo_steps_left( ?array $checks = null ): int {
		$checks = $checks ?? self::seo_switch_checks();
		return count(
			array_filter(
				$checks,
				static function ( $check ) {
					return empty( $check[0] );
				}
			)
		);
	}

	/**
	 * True when the only thing left is the side-by-side check reporting differences. Those can be
	 * expected (a tag Neo Pulse prints better, a page that changed since), so the one-click switch
	 * is allowed once someone has looked at them and said so.
	 *
	 * @param array<int, array>|null $checks From seo_switch_checks(); worked out when null.
	 */
	private static function seo_only_differences_left( ?array $checks = null ): bool {
		$checks = $checks ?? self::seo_switch_checks();
		$open   = array_filter(
			$checks,
			static function ( $check ) {
				return empty( $check[0] );
			}
		);
		if ( $open === array() ) {
			return false;
		}
		foreach ( $open as $check ) {
			if ( 'compare' !== $check[2] || empty( $check[3] ) ) {
				return false;
			}
		}
		return true;
	}

	private static function render_seo_switch_panel(): void {
		$S      = 'Neo_Pulse_Wp_Seo_Settings';
		$status = self::seo_status();
		$checks = self::seo_switch_checks();
		// Every step done while Rank Math still prints the tags: say so plainly.
		$all_ok = ! in_array( false, array_map( static function ( $check ) { return (bool) $check[0]; }, $checks ), true );
		if ( 'off' === $status[0] && $S::other_seo_plugin() !== '' && $all_ok ) {
			$status = self::ready_status( $S::other_seo_plugin() );
		}
		?>
		<div class="npwp-seo__panel" id="npwp-seo-switch">
			<div class="npwp-seo__status" id="npwp-seo-status">
				<span class="npwp-seo__pill npwp-seo__pill--<?php echo esc_attr( $status[0] ); ?>"><?php echo esc_html( $status[1] ); ?></span>
				<span class="npwp-seo__status-text"><?php echo esc_html( $status[2] ); ?></span>
			</div>
			<ul class="npwp-seo__checks">
				<?php foreach ( $checks as $check ) : ?>
					<?php $attention = ! $check[0] && ! empty( $check[3] ); ?>
					<li id="npwp-seo-check-<?php echo esc_attr( $check[2] ); ?>" class="<?php echo $check[0] ? 'is-ok' : ( $attention ? 'is-attention' : 'is-todo' ); ?>">
						<span class="npwp-seo__check-mark" aria-hidden="true"><?php echo $check[0] ? '&#10003;' : ( $attention ? '!' : '&#9675;' ); ?></span>
						<span class="npwp-seo__check-text"><?php echo esc_html( $check[1] ); ?></span>
						<?php if ( 'import' === $check[2] ) : ?>
							<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" class="npwp-seo__inline-form">
								<input type="hidden" name="action" value="<?php echo esc_attr( self::ACTION_SEO_IMPORT ); ?>" />
								<?php wp_nonce_field( self::ACTION_SEO_IMPORT, 'neo_pulse_wp_seo_nonce' ); ?>
								<button type="submit" class="button"><?php echo $S::has_own() ? esc_html__( 'Copy again', 'neo-pulse-wp' ) : esc_html__( 'Copy settings from Rank Math', 'neo-pulse-wp' ); ?></button>
							</form>
						<?php elseif ( 'redirects' === $check[2] && ! $check[0] ) : ?>
							<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" class="npwp-seo__inline-form">
								<input type="hidden" name="action" value="<?php echo esc_attr( self::ACTION_IMPORT_REDIRECTS_RANK_MATH_DB ); ?>" />
								<input type="hidden" name="neo_pulse_wp_back" value="seo" />
								<?php wp_nonce_field( self::ACTION_IMPORT_REDIRECTS_RANK_MATH_DB, 'neo_pulse_wp_import_redirects_rank_math_db_nonce' ); ?>
								<button type="submit" class="button"><?php esc_html_e( 'Import redirects', 'neo-pulse-wp' ); ?></button>
							</form>
						<?php elseif ( 'scripts' === $check[2] && ! $check[0] ) : ?>
							<a class="button" href="<?php echo esc_url( admin_url( 'admin.php?page=neo-pulse-wp-script-manager' ) ); ?>"><?php esc_html_e( 'Move scripts', 'neo-pulse-wp' ); ?></a>
						<?php elseif ( 'verify' === $check[2] && ! $check[0] ) : ?>
							<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" class="npwp-seo__inline-form">
								<input type="hidden" name="action" value="<?php echo esc_attr( self::ACTION_SEO_VERIFY ); ?>" />
								<?php wp_nonce_field( self::ACTION_SEO_VERIFY, 'neo_pulse_wp_seo_nonce' ); ?>
								<button type="submit" class="button"><?php esc_html_e( 'Move verification tags', 'neo-pulse-wp' ); ?></button>
							</form>
						<?php elseif ( 'sitemap' === $check[2] && ! $check[0] ) : ?>
							<a class="button" href="<?php echo esc_url( admin_url( 'admin.php?page=neo-pulse-wp-sitemap' ) ); ?>"><?php esc_html_e( 'Sitemap settings', 'neo-pulse-wp' ); ?></a>
						<?php elseif ( 'compare' === $check[2] ) : ?>
							<a class="button" href="#npwp-seo-compare"><?php esc_html_e( 'Run the check', 'neo-pulse-wp' ); ?></a>
						<?php endif; ?>
					</li>
				<?php endforeach; ?>
			</ul>
			<?php
			$other_files = $S::other_seo_plugin_files();
			$other_names = $other_files !== array() ? wp_sprintf( '%l', array_values( $other_files ) ) : $S::other_seo_plugin();
			$total       = count( $checks );
			$left        = self::seo_steps_left( $checks );
			$only_diffs  = self::seo_only_differences_left( $checks );
			$live        = $S::enabled() && $S::other_seo_plugin() === '';
			?>
			<div class="npwp-seo__actions">
				<?php if ( ! $live ) : ?>
					<div class="npwp-seo__readiness <?php echo $left === 0 ? 'is-ready' : ( $only_diffs ? 'is-review' : 'is-not-ready' ); ?>" id="npwp-seo-readiness">
						<?php if ( $left === 0 ) : ?>
							<span class="npwp-seo__pill npwp-seo__pill--ready"><?php esc_html_e( 'Ready to switch', 'neo-pulse-wp' ); ?></span>
							<span><?php esc_html_e( 'Every step above is done.', 'neo-pulse-wp' ); ?></span>
						<?php elseif ( $only_diffs ) : ?>
							<span class="npwp-seo__pill npwp-seo__pill--waiting"><?php esc_html_e( 'Review the differences', 'neo-pulse-wp' ); ?></span>
							<span><?php esc_html_e( 'Everything else is done. Look at the amber rows in the side-by-side check below; if the differences are fine, tick the box to switch.', 'neo-pulse-wp' ); ?></span>
						<?php else : ?>
							<span class="npwp-seo__pill npwp-seo__pill--waiting"><?php esc_html_e( 'Not ready yet', 'neo-pulse-wp' ); ?></span>
							<span>
								<?php
								/* translators: 1: steps done, 2: total steps */
								echo esc_html( sprintf( __( '%1$d of %2$d steps done.', 'neo-pulse-wp' ), $total - $left, $total ) );
								echo ' ';
								/* translators: %d: steps left */
								echo esc_html( sprintf( _n( 'Finish the %d step that isn\'t ticked above before switching.', 'Finish the %d steps that aren\'t ticked above before switching.', $left, 'neo-pulse-wp' ), $left ) );
								?>
							</span>
						<?php endif; ?>
					</div>
				<?php endif; ?>

				<div class="npwp-seo__buttons">
					<?php if ( $S::other_seo_plugin() !== '' && current_user_can( 'activate_plugins' ) ) : ?>
						<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" class="npwp-seo__toggle">
							<input type="hidden" name="action" value="<?php echo esc_attr( self::ACTION_SEO_SWITCH ); ?>" />
							<?php wp_nonce_field( self::ACTION_SEO_SWITCH, 'neo_pulse_wp_seo_nonce' ); ?>
							<label class="npwp-seo__accept" id="npwp-seo-accept"<?php echo $only_diffs ? '' : ' hidden'; ?>>
								<input type="checkbox" name="accept_differences" value="1" id="npwp-seo-accept-box"<?php echo $only_diffs ? ' required' : ''; ?> />
								<?php esc_html_e( 'I\'ve looked at the differences in the side-by-side check and they\'re fine.', 'neo-pulse-wp' ); ?>
							</label>
							<button type="submit" class="button button-primary" id="npwp-seo-switch-button"<?php disabled( $left > 0 && ! $only_diffs ); ?>>
								<?php
								echo esc_html(
									$S::enabled()
										/* translators: %s: plugin names */
										? sprintf( __( 'Deactivate %s now', 'neo-pulse-wp' ), $S::other_seo_plugin() )
										/* translators: %s: plugin name */
										: sprintf( __( 'Switch to Neo Pulse and deactivate %s', 'neo-pulse-wp' ), $S::other_seo_plugin() )
								);
								?>
							</button>
						</form>
					<?php endif; ?>
					<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" class="npwp-seo__toggle">
						<input type="hidden" name="action" value="<?php echo esc_attr( self::ACTION_SEO_TOGGLE ); ?>" />
						<?php wp_nonce_field( self::ACTION_SEO_TOGGLE, 'neo_pulse_wp_seo_nonce' ); ?>
						<?php if ( $S::enabled() ) : ?>
							<button type="submit" class="button"><?php esc_html_e( 'Switch Neo Pulse SEO off', 'neo-pulse-wp' ); ?></button>
						<?php else : ?>
							<input type="hidden" name="enabled" value="1" />
							<button type="submit" class="button<?php echo $S::other_seo_plugin() === '' ? ' button-primary' : ''; ?>">
								<?php echo $S::other_seo_plugin() !== '' ? esc_html__( 'Switch Neo Pulse SEO on only', 'neo-pulse-wp' ) : esc_html__( 'Switch Neo Pulse SEO on', 'neo-pulse-wp' ); ?>
							</button>
						<?php endif; ?>
					</form>
				</div>

				<?php if ( $S::other_seo_plugin() !== '' ) : ?>
					<p class="description">
						<?php
						if ( current_user_can( 'activate_plugins' ) && count( $other_files ) > 1 ) {
							/* translators: %s: plugin names, e.g. "Rank Math SEO and Rank Math SEO PRO" */
							echo esc_html( sprintf( __( 'The one-click switch deactivates %s together.', 'neo-pulse-wp' ), $other_names ) ) . ' ';
						}
						if ( $left > 0 && ! $only_diffs && current_user_can( 'activate_plugins' ) ) {
							/* translators: %s: plugin name */
							echo esc_html( sprintf( __( 'It unlocks once every step is done, so redirects, scripts and verification tags are all in Neo Pulse before %s goes quiet.', 'neo-pulse-wp' ), $S::other_seo_plugin() ) ) . ' ';
						}
						if ( ! $S::enabled() ) {
							/* translators: %s: plugin name */
							echo esc_html( sprintf( __( '"Switch on only" turns Neo Pulse on and waits: it takes over the moment you deactivate %s in Plugins.', 'neo-pulse-wp' ), $S::other_seo_plugin() ) ) . ' ';
						}
						/* translators: %s: plugin name */
						echo esc_html( sprintf( __( 'Nothing is deleted. Reactivating %s hands control straight back to it.', 'neo-pulse-wp' ), $S::other_seo_plugin() ) );
						?>
					</p>
				<?php endif; ?>
			</div>
		</div>
		<?php
	}

	private static function render_seo_compare_panel(): void {
		$urls = Neo_Pulse_Wp_Seo_Compare::sample_urls();
		?>
		<div class="npwp-seo__panel" id="npwp-seo-compare">
			<h2><?php esc_html_e( 'Side-by-side check', 'neo-pulse-wp' ); ?></h2>
			<p class="description"><?php esc_html_e( 'Loads each page as visitors see it now and compares its SEO tags with what Neo Pulse would print. Nothing on the live site changes. One address per line.', 'neo-pulse-wp' ); ?></p>
			<textarea id="npwp-seo-compare-urls" rows="6" class="large-text code"><?php echo esc_textarea( implode( "\n", $urls ) ); ?></textarea>
			<p>
				<button type="button" class="button button-primary" id="npwp-seo-compare-run"><?php esc_html_e( 'Run check', 'neo-pulse-wp' ); ?></button>
				<span id="npwp-seo-compare-progress" class="npwp-seo__progress"></span>
			</p>
			<div id="npwp-seo-compare-summary" class="npwp-seo__banner" hidden></div>
			<div id="npwp-seo-compare-results">
				<div class="npwp-seo__group-diff"></div>
				<details class="npwp-seo__group" data-group="ok" hidden><summary></summary><div class="npwp-seo__group-body"></div></details>
				<details class="npwp-seo__group" data-group="skip" hidden><summary></summary><div class="npwp-seo__group-body"></div></details>
			</div>
		</div>
		<?php
		$text = array(
			'skipped'      => __( 'skipped', 'neo-pulse-wp' ),
			'error'        => __( 'error', 'neo-pulse-wp' ),
			'tag'          => __( 'Tag', 'neo-pulse-wp' ),
			'live'         => __( 'Live now', 'neo-pulse-wp' ),
			'ours'         => __( 'Neo Pulse', 'neo-pulse-wp' ),
			'checking'     => __( 'Checking page %1$d of %2$d…', 'neo-pulse-wp' ),
			'done'         => __( 'Done.', 'neo-pulse-wp' ),
			/* translators: %d: pages */
			'okGroup'      => __( '%d pages match exactly. Show them', 'neo-pulse-wp' ),
			'okGroupOne'   => __( '1 page matches exactly. Show it', 'neo-pulse-wp' ),
			/* translators: %d: addresses */
			'skipGroup'    => __( '%d addresses skipped because they redirect elsewhere. Show them', 'neo-pulse-wp' ),
			'skipGroupOne' => __( '1 address skipped because it redirects elsewhere. Show it', 'neo-pulse-wp' ),
			/* translators: %d: pages */
			'allGood'      => __( 'All %d pages match what visitors see now. Switching to Neo Pulse will not change anything search engines see.', 'neo-pulse-wp' ),
			/* translators: 1: pages with differences, 2: pages checked */
			'someDiff'     => __( '%1$d of %2$d pages have differences, shown below in amber. The rest match.', 'neo-pulse-wp' ),
			'lineOk'       => __( 'Side-by-side check: all %d pages match what visitors see now. Checked just now.', 'neo-pulse-wp' ),
			'lineDiff'     => __( 'Side-by-side check: %1$d of %2$d pages have differences to look at (listed first in the check below). Checked just now.', 'neo-pulse-wp' ),
			'ready'        => Neo_Pulse_Wp_Seo_Settings::other_seo_plugin() !== '' ? self::ready_status( Neo_Pulse_Wp_Seo_Settings::other_seo_plugin() ) : null,
			'readyPill'    => __( 'Ready to switch', 'neo-pulse-wp' ),
			'readyText'    => __( 'Every step above is done.', 'neo-pulse-wp' ),
			'notReadyPill' => __( 'Not ready yet', 'neo-pulse-wp' ),
			/* translators: 1: steps done, 2: total steps */
			'stepsDone'    => __( '%1$d of %2$d steps done.', 'neo-pulse-wp' ),
			/* translators: %d: steps left */
			'stepsLeft'    => __( 'Finish the %d steps that aren\'t ticked above before switching.', 'neo-pulse-wp' ),
			'stepLeft'     => __( 'Finish the 1 step that isn\'t ticked above before switching.', 'neo-pulse-wp' ),
			'reviewPill'   => __( 'Review the differences', 'neo-pulse-wp' ),
			'reviewText'   => __( 'Everything else is done. Look at the amber rows in the side-by-side check below; if the differences are fine, tick the box to switch.', 'neo-pulse-wp' ),
		);
		?>
		<script>
		(function () {
			var run = document.getElementById('npwp-seo-compare-run');
			if (!run) { return; }
			var ajax = <?php echo wp_json_encode( admin_url( 'admin-ajax.php' ) ); ?>;
			var nonce = <?php echo wp_json_encode( wp_create_nonce( Neo_Pulse_Wp_Seo_Compare::NONCE_ACTION ) ); ?>;
			var action = <?php echo wp_json_encode( Neo_Pulse_Wp_Seo_Compare::AJAX_ACTION ); ?>;
			var T = <?php echo wp_json_encode( $text ); ?>;
			var results = document.getElementById('npwp-seo-compare-results');
			var diffBox = results.querySelector('.npwp-seo__group-diff');
			var okGroup = results.querySelector('[data-group="ok"]');
			var skipGroup = results.querySelector('[data-group="skip"]');
			var banner = document.getElementById('npwp-seo-compare-summary');
			var progress = document.getElementById('npwp-seo-compare-progress');
			var counts;
			function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
			function fmt(s) { var a = Array.prototype.slice.call(arguments, 1); return s.replace(/%(\d)\$d|%d/g, function (m, n) { return n ? a[n - 1] : a[0]; }); }
			function groupLabel(group, n, many, one) {
				group.hidden = n === 0;
				group.querySelector('summary').textContent = n === 1 ? one : fmt(many, n);
			}
			function render(res) {
				var good = res.ok && res.matched === res.total;
				var box = document.createElement('details');
				box.className = 'npwp-seo__result ' + (res.skipped ? 'is-skip' : (good ? 'is-ok' : 'is-diff'));
				var head = res.skipped ? T.skipped : (res.ok ? (res.matched + ' / ' + res.total) : T.error);
				var html = '<summary><strong>' + esc(head) + '</strong> ' + esc(res.url) + '</summary>';
				if (res.skipped) {
					html += '<p class="description">' + esc(res.error) + '</p>';
				} else if (!res.ok) {
					html += '<p class="npwp-seo__error">' + esc(res.error) + '</p>';
				} else {
					html += '<table class="widefat striped"><thead><tr><th>' + esc(T.tag) + '</th><th>' + esc(T.live) + '</th><th>' + esc(T.ours) + '</th></tr></thead><tbody>';
					res.rows.forEach(function (row) {
						var cls = row.expected ? 'is-expected' : (row.same ? 'is-same' : 'is-diff');
						var note = row.note ? '<div class="npwp-seo__note">' + esc(row.note) + '</div>' : '';
						html += '<tr class="' + cls + '"><td>' + esc(row.label) + '</td><td>' + esc(row.live) + '</td><td>' + esc(row.ours) + note + '</td></tr>';
					});
					html += '</tbody></table>';
				}
				box.innerHTML = html;
				if (res.skipped) {
					counts.skip++;
					skipGroup.querySelector('.npwp-seo__group-body').appendChild(box);
					groupLabel(skipGroup, counts.skip, T.skipGroup, T.skipGroupOne);
				} else if (good) {
					counts.ok++;
					okGroup.querySelector('.npwp-seo__group-body').appendChild(box);
					groupLabel(okGroup, counts.ok, T.okGroup, T.okGroupOne);
				} else {
					counts.diff++;
					box.open = true;
					diffBox.appendChild(box);
				}
			}
			function finish() {
				var pages = counts.ok + counts.diff;
				if (pages === 0) { return; }
				var allGood = counts.diff === 0;
				banner.hidden = false;
				banner.className = 'npwp-seo__banner ' + (allGood ? 'is-ok' : 'is-attention');
				banner.innerHTML = '<span class="npwp-seo__banner-mark" aria-hidden="true">' + (allGood ? '&#10003;' : '!') + '</span><span>' + esc(allGood ? fmt(T.allGood, pages) : fmt(T.someDiff, counts.diff, pages)) + '</span>';
				// The checklist above reflects this run straight away.
				var li = document.getElementById('npwp-seo-check-compare');
				if (li) {
					li.className = allGood ? 'is-ok' : 'is-attention';
					li.querySelector('.npwp-seo__check-mark').innerHTML = allGood ? '&#10003;' : '!';
					li.querySelector('.npwp-seo__check-text').textContent = allGood ? fmt(T.lineOk, pages) : fmt(T.lineDiff, counts.diff, pages);
				}
				var status = document.getElementById('npwp-seo-status');
				var pill = status ? status.querySelector('.npwp-seo__pill') : null;
				var everything = document.querySelectorAll('#npwp-seo-switch .npwp-seo__checks > li:not(.is-ok)').length === 0;
				if (pill && everything && pill.classList.contains('npwp-seo__pill--off') && T.ready) {
					pill.className = 'npwp-seo__pill npwp-seo__pill--ready';
					pill.textContent = T.ready[1];
					status.querySelector('.npwp-seo__status-text').textContent = T.ready[2];
				}
				// The readiness line and the one-click switch follow the checklist too.
				var readiness = document.getElementById('npwp-seo-readiness');
				if (readiness) {
					var total = document.querySelectorAll('#npwp-seo-switch .npwp-seo__checks > li').length;
					var left = document.querySelectorAll('#npwp-seo-switch .npwp-seo__checks > li:not(.is-ok)').length;
					readiness.className = 'npwp-seo__readiness ' + (left === 0 ? 'is-ready' : 'is-not-ready');
					readiness.innerHTML = left === 0
						? '<span class="npwp-seo__pill npwp-seo__pill--ready">' + esc(T.readyPill) + '</span><span>' + esc(T.readyText) + '</span>'
						: '<span class="npwp-seo__pill npwp-seo__pill--waiting">' + esc(T.notReadyPill) + '</span><span>' + esc(fmt(T.stepsDone, total - left, total) + ' ' + (left === 1 ? T.stepLeft : fmt(T.stepsLeft, left))) + '</span>';
				}
				var onlyDiffs = !everything && document.querySelectorAll('#npwp-seo-switch .npwp-seo__checks > li:not(.is-ok)').length === 1 && li && li.className === 'is-attention';
				if (readiness && onlyDiffs) {
					readiness.className = 'npwp-seo__readiness is-review';
					readiness.innerHTML = '<span class="npwp-seo__pill npwp-seo__pill--waiting">' + esc(T.reviewPill) + '</span><span>' + esc(T.reviewText) + '</span>';
				}
				var switchBtn = document.getElementById('npwp-seo-switch-button');
				if (switchBtn) {
					switchBtn.disabled = !(everything || onlyDiffs);
				}
				var accept = document.getElementById('npwp-seo-accept');
				var acceptBox = document.getElementById('npwp-seo-accept-box');
				if (accept && acceptBox) {
					accept.hidden = !onlyDiffs;
					acceptBox.required = onlyDiffs;
				}
			}
			run.addEventListener('click', function () {
				var urls = document.getElementById('npwp-seo-compare-urls').value.split(/\n+/).map(function (u) { return u.trim(); }).filter(Boolean);
				counts = { ok: 0, diff: 0, skip: 0 };
				diffBox.innerHTML = '';
				[okGroup, skipGroup].forEach(function (g) { g.hidden = true; g.open = false; g.querySelector('.npwp-seo__group-body').innerHTML = ''; });
				banner.hidden = true;
				run.disabled = true;
				var i = 0;
				function next() {
					if (i >= urls.length) { run.disabled = false; progress.textContent = T.done; finish(); return; }
					progress.textContent = fmt(T.checking, i + 1, urls.length);
					var body = new FormData();
					body.append('action', action);
					body.append('nonce', nonce);
					body.append('url', urls[i]);
					if (i === 0) { body.append('first', '1'); }
					fetch(ajax, { method: 'POST', credentials: 'same-origin', body: body })
						.then(function (r) { return r.json(); })
						.then(function (j) { render(j && j.success ? j.data : { ok: false, url: urls[i], error: (j && j.data && j.data.message) || 'Request failed' }); })
						.catch(function (e) { render({ ok: false, url: urls[i], error: String(e) }); })
						.then(function () { i++; next(); });
				}
				next();
			});
		})();
		</script>
		<?php
	}

	public static function render_seo_404_page(): void {
		$rows = Neo_Pulse_Wp_Seo_404::rows( 300 );
		self::neo_pulse_group_shell_open( 'neo-pulse-wp-redirects', 'neo-pulse-wp-redirects neo-pulse-wp-seo', 'redirects' );
		?>
		<h2 class="neo-pulse-wp-panel-content__title"><?php esc_html_e( '404 Log', 'neo-pulse-wp' ); ?></h2>
		<p class="description">
			<?php
			echo esc_html(
				Neo_Pulse_Wp_Seo_404::enabled()
					? __( 'Addresses visitors or search engines asked for that do not exist, newest first. Redirect the ones that matter to the right page.', 'neo-pulse-wp' )
					: __( 'The 404 log records while Neo Pulse SEO is live and the log is switched on in SEO Settings.', 'neo-pulse-wp' )
			);
			?>
		</p>
		<?php if ( $rows === array() ) : ?>
			<p><?php esc_html_e( 'Nothing logged yet.', 'neo-pulse-wp' ); ?></p>
		<?php else : ?>
			<table class="widefat striped">
				<thead><tr>
					<th><?php esc_html_e( 'Address', 'neo-pulse-wp' ); ?></th>
					<th><?php esc_html_e( 'Hits', 'neo-pulse-wp' ); ?></th>
					<th><?php esc_html_e( 'Last seen', 'neo-pulse-wp' ); ?></th>
					<th><?php esc_html_e( 'Came from', 'neo-pulse-wp' ); ?></th>
					<th></th>
				</tr></thead>
				<tbody>
				<?php foreach ( $rows as $row ) : ?>
					<tr>
						<td><code><?php echo esc_html( (string) $row->url ); ?></code></td>
						<td><?php echo esc_html( (string) $row->hits ); ?></td>
						<td><?php echo esc_html( (string) $row->last_seen ); ?></td>
						<td style="overflow-wrap:anywhere"><?php echo esc_html( (string) $row->referer ); ?></td>
						<td style="white-space:nowrap">
							<a class="button button-small" href="<?php echo esc_url( add_query_arg( array( 'page' => 'neo-pulse-wp-redirects', 'action' => 'new', 'source' => ltrim( (string) $row->url, '/' ) ), admin_url( 'admin.php' ) ) ); ?>"><?php esc_html_e( 'Redirect', 'neo-pulse-wp' ); ?></a>
							<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" style="display:inline">
								<input type="hidden" name="action" value="<?php echo esc_attr( self::ACTION_SEO_404 ); ?>" />
								<input type="hidden" name="op" value="delete" />
								<input type="hidden" name="id" value="<?php echo esc_attr( (string) $row->id ); ?>" />
								<?php wp_nonce_field( self::ACTION_SEO_404, 'neo_pulse_wp_seo_nonce' ); ?>
								<button type="submit" class="button button-small"><?php esc_html_e( 'Remove', 'neo-pulse-wp' ); ?></button>
							</form>
						</td>
					</tr>
				<?php endforeach; ?>
				</tbody>
			</table>
			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" style="margin-top:1rem">
				<input type="hidden" name="action" value="<?php echo esc_attr( self::ACTION_SEO_404 ); ?>" />
				<input type="hidden" name="op" value="clear" />
				<?php wp_nonce_field( self::ACTION_SEO_404, 'neo_pulse_wp_seo_nonce' ); ?>
				<button type="submit" class="button"><?php esc_html_e( 'Clear the log', 'neo-pulse-wp' ); ?></button>
			</form>
		<?php endif; ?>
		<?php
		self::neo_pulse_group_shell_close();
	}

	private static function seo_robots_choice( string $prefix ): string {
		$S = 'Neo_Pulse_Wp_Seo_Settings';
		if ( ! $S::is_on( $prefix . '_custom_robots' ) ) {
			return 'default';
		}
		return in_array( 'noindex', $S::robots_list( $S::get( $prefix . '_robots', array() ) ), true ) ? 'noindex' : 'index';
	}

	private static function seo_robots_select( string $name, string $current ): void {
		$options = array(
			'default' => __( 'Site default', 'neo-pulse-wp' ),
			'index'   => __( 'Index', 'neo-pulse-wp' ),
			'noindex' => __( 'No index', 'neo-pulse-wp' ),
		);
		echo '<select name="' . esc_attr( $name ) . '">';
		foreach ( $options as $value => $label ) {
			echo '<option value="' . esc_attr( $value ) . '"' . selected( $current, $value, false ) . '>' . esc_html( $label ) . '</option>';
		}
		echo '</select>';
	}

	private static function render_seo_settings_form(): void {
		$S       = 'Neo_Pulse_Wp_Seo_Settings';
		$form_id = 'npwp-seo-settings-form';
		$g       = static function ( string $key, $default = '' ): string {
			$value = Neo_Pulse_Wp_Seo_Settings::get( $key, $default );
			return is_scalar( $value ) ? (string) $value : '';
		};
		$address = $S::get( 'local_address', array() );
		$address = is_array( $address ) ? $address : array();
		$phones  = $S::get( 'phone_numbers', array() );
		$phone   = is_array( $phones ) && isset( $phones[0]['number'] ) ? (string) $phones[0]['number'] : '';
		?>
		<div class="npwp-seo__panel" id="npwp-seo-settings">
			<h2><?php esc_html_e( 'Settings', 'neo-pulse-wp' ); ?></h2>
			<p class="description"><?php esc_html_e( 'Variables: %title% %sep% %sitename% %sitedesc% %excerpt% %term% %term_description% %name% %page% %currentyear%. A title or description set on a page itself always wins over these templates.', 'neo-pulse-wp' ); ?></p>
			<form id="<?php echo esc_attr( $form_id ); ?>" method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" class="neo-pulse-wp-settings__form neo-pulse-schema-form">
				<input type="hidden" name="action" value="<?php echo esc_attr( self::ACTION_SEO_SAVE ); ?>" />
				<?php wp_nonce_field( self::ACTION_SEO_SAVE, 'neo_pulse_wp_seo_nonce' ); ?>

				<h3><?php esc_html_e( 'Titles', 'neo-pulse-wp' ); ?></h3>
				<?php
				self::panel_form_group_open();
				self::panel_form_field_input( 'npwp-seo-sep', 'seo[title_separator]', __( 'Separator (%sep%)', 'neo-pulse-wp' ), $g( 'title_separator', '-' ), 'quarter' );
				if ( 'posts' === get_option( 'show_on_front' ) ) {
					self::panel_form_field_input( 'npwp-seo-home-title', 'seo[homepage_title]', __( 'Home page title', 'neo-pulse-wp' ), $g( 'homepage_title' ), 'half' );
					self::panel_form_field_textarea( 'npwp-seo-home-desc', 'seo[homepage_description]', __( 'Home page description', 'neo-pulse-wp' ), $g( 'homepage_description' ), 'full', 2 );
				}
				self::panel_form_toggle( 'seo[capitalize_titles]', __( 'Capitalise every word in titles', 'neo-pulse-wp' ), $S::is_on( 'capitalize_titles' ) );
				self::panel_form_group_close();
				?>

				<h3><?php esc_html_e( 'Content types', 'neo-pulse-wp' ); ?></h3>
				<table class="widefat striped npwp-seo__table">
					<thead><tr>
						<th><?php esc_html_e( 'Type', 'neo-pulse-wp' ); ?></th>
						<th><?php esc_html_e( 'Title template', 'neo-pulse-wp' ); ?></th>
						<th><?php esc_html_e( 'Description template', 'neo-pulse-wp' ); ?></th>
						<th><?php esc_html_e( 'Robots', 'neo-pulse-wp' ); ?></th>
						<th><?php esc_html_e( 'Schema', 'neo-pulse-wp' ); ?></th>
					</tr></thead>
					<tbody>
					<?php foreach ( $S::post_types() as $type => $label ) : ?>
						<?php
						$snippet = $g( 'pt_' . $type . '_default_rich_snippet' );
						$schema  = 'article' === $snippet ? $g( 'pt_' . $type . '_default_article_type', 'Article' ) : '';
						$other   = ! in_array( $snippet, array( '', 'off', 'article', '0' ), true ) ? $snippet : '';
						$base   = 'seo[pt][' . $type . ']';
						?>
						<tr>
							<td><strong><?php echo esc_html( $label ); ?></strong><br /><code><?php echo esc_html( $type ); ?></code></td>
							<td><input type="text" class="regular-text" name="<?php echo esc_attr( $base . '[title]' ); ?>" value="<?php echo esc_attr( $g( 'pt_' . $type . '_title' ) ); ?>" /></td>
							<td><input type="text" class="regular-text" name="<?php echo esc_attr( $base . '[description]' ); ?>" value="<?php echo esc_attr( $g( 'pt_' . $type . '_description' ) ); ?>" /></td>
							<td><?php self::seo_robots_select( $base . '[robots]', self::seo_robots_choice( 'pt_' . $type ) ); ?></td>
							<td>
								<select name="<?php echo esc_attr( $base . '[schema]' ); ?>">
									<?php if ( $other !== '' ) : ?>
										<option value="keep" selected><?php echo esc_html( ucfirst( $other ) . ' ' . __( '(from Rank Math)', 'neo-pulse-wp' ) ); ?></option>
									<?php endif; ?>
									<option value=""><?php esc_html_e( 'None', 'neo-pulse-wp' ); ?></option>
									<?php foreach ( array( 'Article', 'BlogPosting', 'NewsArticle' ) as $option ) : ?>
										<option value="<?php echo esc_attr( $option ); ?>" <?php selected( $schema, $option ); ?>><?php echo esc_html( $option ); ?></option>
									<?php endforeach; ?>
								</select>
							</td>
						</tr>
					<?php endforeach; ?>
					<?php foreach ( $S::taxonomies() as $tax => $label ) : ?>
						<?php $base = 'seo[tax][' . $tax . ']'; ?>
						<tr>
							<td><strong><?php echo esc_html( $label ); ?></strong><br /><code><?php echo esc_html( $tax ); ?></code></td>
							<td><input type="text" class="regular-text" name="<?php echo esc_attr( $base . '[title]' ); ?>" value="<?php echo esc_attr( $g( 'tax_' . $tax . '_title' ) ); ?>" /></td>
							<td><input type="text" class="regular-text" name="<?php echo esc_attr( $base . '[description]' ); ?>" value="<?php echo esc_attr( $g( 'tax_' . $tax . '_description' ) ); ?>" /></td>
							<td><?php self::seo_robots_select( $base . '[robots]', self::seo_robots_choice( 'tax_' . $tax ) ); ?></td>
							<td>&mdash;</td>
						</tr>
					<?php endforeach; ?>
					<tr>
						<td><strong><?php esc_html_e( 'Author archives', 'neo-pulse-wp' ); ?></strong></td>
						<td><input type="text" class="regular-text" name="seo[author_archive_title]" value="<?php echo esc_attr( $g( 'author_archive_title' ) ); ?>" /></td>
						<td>&mdash;</td>
						<td><?php self::seo_robots_select( 'seo[author_robots]', self::seo_robots_choice( 'author' ) ); ?></td>
						<td>&mdash;</td>
					</tr>
					<tr>
						<td><strong><?php esc_html_e( 'Date archives', 'neo-pulse-wp' ); ?></strong></td>
						<td><input type="text" class="regular-text" name="seo[date_archive_title]" value="<?php echo esc_attr( $g( 'date_archive_title' ) ); ?>" /></td>
						<td colspan="3">&mdash;</td>
					</tr>
					<tr>
						<td><strong><?php esc_html_e( 'Search results', 'neo-pulse-wp' ); ?></strong></td>
						<td><input type="text" class="regular-text" name="seo[search_title]" value="<?php echo esc_attr( $g( 'search_title' ) ); ?>" /></td>
						<td colspan="3">&mdash;</td>
					</tr>
					<tr>
						<td><strong><?php esc_html_e( 'Page not found', 'neo-pulse-wp' ); ?></strong></td>
						<td><input type="text" class="regular-text" name="seo[404_title]" value="<?php echo esc_attr( $g( '404_title' ) ); ?>" /></td>
						<td colspan="3">&mdash;</td>
					</tr>
					</tbody>
				</table>

				<h3><?php esc_html_e( 'Indexing', 'neo-pulse-wp' ); ?></h3>
				<?php
				self::panel_form_group_open();
				self::panel_form_toggle( 'seo[noindex_search]', __( 'No index on search results', 'neo-pulse-wp' ), $S::is_on( 'noindex_search' ) );
				self::panel_form_toggle( 'seo[noindex_empty_taxonomies]', __( 'No index on empty categories and tags', 'neo-pulse-wp' ), $S::is_on( 'noindex_empty_taxonomies' ) );
				self::panel_form_toggle( 'seo[noindex_archive_subpages]', __( 'No index on page 2 and later of the blog and archives', 'neo-pulse-wp' ), $S::is_on( 'noindex_archive_subpages' ) );
				self::panel_form_toggle( 'seo[noindex_paginated_pages]', __( 'No index on page 2 and later of posts split into pages', 'neo-pulse-wp' ), $S::is_on( 'noindex_paginated_pages' ) );
				self::panel_form_toggle( 'seo[noindex_password_protected]', __( 'No index on password-protected pages', 'neo-pulse-wp' ), $S::is_on( 'noindex_password_protected' ) );
				self::panel_form_group_close();
				?>

				<h3><?php esc_html_e( 'Site behaviour', 'neo-pulse-wp' ); ?></h3>
				<?php
				self::panel_form_group_open();
				self::panel_form_toggle( 'seo[new_window_external_links]', __( 'Open links to other websites in a new tab', 'neo-pulse-wp' ), $S::on( $S::gen( 'new_window_external_links', 'off' ) ) );
				self::panel_form_toggle( 'seo[nofollow_external_links]', __( 'Add nofollow to links to other websites', 'neo-pulse-wp' ), $S::on( $S::gen( 'nofollow_external_links', 'off' ) ) );
				self::panel_form_toggle( 'seo[disable_date_archives]', __( 'Send date archives to the home page', 'neo-pulse-wp' ), $S::is_on( 'disable_date_archives' ) );
				self::panel_form_toggle( 'seo[disable_author_archives]', __( 'Send author archives to the home page', 'neo-pulse-wp' ), $S::is_on( 'disable_author_archives' ) );
				self::panel_form_toggle( 'seo[neo_pulse_404_monitor]', __( 'Keep a 404 log (Redirects → 404 Log)', 'neo-pulse-wp' ), $S::on( $S::get( 'neo_pulse_404_monitor', 'on' ) ) );
				self::panel_form_group_close();
				?>

				<h3><?php esc_html_e( 'Social sharing', 'neo-pulse-wp' ); ?></h3>
				<?php
				self::panel_form_group_open();
				self::panel_form_field_input( 'npwp-seo-og-image', 'seo[open_graph_image]', __( 'Default share image URL', 'neo-pulse-wp' ), $g( 'open_graph_image' ), 'full', 'url', false, __( 'Used when a page has no featured image. 1200 × 630 works best.', 'neo-pulse-wp' ) );
				self::panel_form_field_select( 'npwp-seo-twitter-card', 'seo[twitter_card_type]', __( 'X / Twitter card', 'neo-pulse-wp' ), array( 'summary_large_image' => __( 'Large image', 'neo-pulse-wp' ), 'summary' => __( 'Small image', 'neo-pulse-wp' ) ), $g( 'twitter_card_type', 'summary_large_image' ), 'quarter' );
				self::panel_form_field_input( 'npwp-seo-twitter', 'seo[twitter_author_names]', __( 'X / Twitter username', 'neo-pulse-wp' ), $g( 'twitter_author_names' ), 'quarter' );
				self::panel_form_field_input( 'npwp-seo-facebook', 'seo[social_url_facebook]', __( 'Facebook page URL', 'neo-pulse-wp' ), $g( 'social_url_facebook' ), 'half', 'url' );
				self::panel_form_field_textarea( 'npwp-seo-profiles', 'seo[social_additional_profiles]', __( 'Other profiles (one URL per line)', 'neo-pulse-wp' ), $g( 'social_additional_profiles' ), 'full', 3 );
				self::panel_form_group_close();
				?>

				<h3 id="npwp-seo-business"><?php esc_html_e( 'Business details (schema)', 'neo-pulse-wp' ); ?></h3>
				<?php
				$shared   = Neo_Pulse_Wp_Business::exists();
				$several  = $shared && Neo_Pulse_Wp_Business::several();
				$tools_on = Neo_Pulse_Wp_Business::neo_tools_active();
				$created  = isset( $_GET['business'] ) ? sanitize_key( wp_unslash( (string) $_GET['business'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- display only.
				if ( 'created' === $created ) {
					echo '<div class="notice notice-success inline"><p>' . esc_html__( 'Shared business details started from Neo Pulse\'s values.', 'neo-pulse-wp' ) . '</p></div>';
				}
				if ( $shared ) {
					$text = __( 'These are the site\'s shared business details: the schema, and anything else that shows the business name, phone, address or hours, reads them from one place.', 'neo-pulse-wp' );
					if ( $tools_on ) {
						$text .= ' ' . __( 'Also shown in Neo Tools → Business details, which has every field (logos for dark backgrounds, review link, locations).', 'neo-pulse-wp' );
					}
					echo '<p class="description">' . esc_html( $text ) . '</p>';
				} elseif ( $tools_on ) {
					echo '<div class="notice notice-info inline"><p>' . esc_html__( 'Neo Tools keeps the shared business details for this site, but they haven\'t been set up yet. Open Neo Tools → Business details (it compares Neo Pulse, the Contact Information page and WordPress settings), or start them from the values below.', 'neo-pulse-wp' ) . ' <a class="button" href="' . esc_url( wp_nonce_url( admin_url( 'admin-post.php?action=' . Neo_Pulse_Wp_Business::ACTION_CREATE ), Neo_Pulse_Wp_Business::ACTION_CREATE ) ) . '">' . esc_html__( 'Start from Neo Pulse\'s values', 'neo-pulse-wp' ) . '</a></p></div>';
				}
				self::panel_form_group_open();
				self::panel_form_field_select( 'npwp-seo-kg-type', 'seo[knowledgegraph_type]', __( 'This site represents', 'neo-pulse-wp' ), array( 'company' => __( 'A business', 'neo-pulse-wp' ), 'person' => __( 'A person', 'neo-pulse-wp' ) ), $g( 'knowledgegraph_type', 'company' ), 'quarter' );
				self::panel_form_field_input( 'npwp-seo-kg-name', 'seo[knowledgegraph_name]', __( 'Name', 'neo-pulse-wp' ), $g( 'knowledgegraph_name' ), 'quarter' );
				self::panel_form_field_input( 'npwp-seo-legal-name', 'seo[legal_name]', __( 'Legal name', 'neo-pulse-wp' ), $g( 'legal_name' ), 'quarter', 'text', false, __( 'The registered name, if it differs (e.g. "Blind Magic Window Coverings Ltd.").', 'neo-pulse-wp' ) );
				self::panel_form_field_input( 'npwp-seo-business-type', 'seo[local_business_type]', __( 'Business type', 'neo-pulse-wp' ), $g( 'local_business_type' ), 'half', 'text', false, __( 'A schema.org type such as ProfessionalService, HomeAndConstructionBusiness or LegalService. Leave empty for a plain Organization.', 'neo-pulse-wp' ) );
				self::panel_form_field_input( 'npwp-seo-logo', 'seo[knowledgegraph_logo]', __( 'Logo URL', 'neo-pulse-wp' ), $g( 'knowledgegraph_logo' ), 'half', 'url' );
				self::panel_form_field_input( 'npwp-seo-url', 'seo[url]', __( 'Website URL', 'neo-pulse-wp' ), $g( 'url', home_url() ), 'half', 'url' );
				self::panel_form_field_input( 'npwp-seo-site-name', 'seo[website_name]', __( 'Website name', 'neo-pulse-wp' ), $g( 'website_name' ), 'half' );
				self::panel_form_field_input( 'npwp-seo-alt-name', 'seo[website_alternate_name]', __( 'Alternate website name', 'neo-pulse-wp' ), $g( 'website_alternate_name' ), 'half' );
				self::panel_form_field_input( 'npwp-seo-email', 'seo[email]', __( 'Email', 'neo-pulse-wp' ), $g( 'email' ), 'quarter' );
				self::panel_form_field_input( 'npwp-seo-price', 'seo[price_range]', __( 'Price range', 'neo-pulse-wp' ), $g( 'price_range' ), 'quarter', 'text', false, '$, $$ or $$$' );
				self::panel_form_group_close();
				if ( $several ) {
					$main = get_post( (int) Neo_Pulse_Wp_Business::get()['main_location'] );
					echo '<p class="description">' . esc_html(
						sprintf(
							/* translators: %s: main location title */
							__( 'This business has several locations. The address, phone and opening hours below come from the main location, %s; change them on that location page. Each showroom is listed in the schema too.', 'neo-pulse-wp' ),
							$main instanceof WP_Post ? get_the_title( $main ) : '#' . (int) Neo_Pulse_Wp_Business::get()['main_location']
						)
					) . ( $main instanceof WP_Post && current_user_can( 'edit_post', $main->ID ) ? ' <a href="' . esc_url( (string) get_edit_post_link( $main->ID ) ) . '">' . esc_html__( 'Edit main location', 'neo-pulse-wp' ) . '</a>' : '' ) . '</p>';
					echo '<div inert class="npwp-seo__from-location" style="opacity:.6">';
				}
				self::panel_form_group_open();
				self::panel_form_field_input( 'npwp-seo-street', 'seo[address][streetAddress]', __( 'Street address', 'neo-pulse-wp' ), (string) ( $address['streetAddress'] ?? '' ), 'half' );
				self::panel_form_field_input( 'npwp-seo-city', 'seo[address][addressLocality]', __( 'City', 'neo-pulse-wp' ), (string) ( $address['addressLocality'] ?? '' ), 'quarter' );
				self::panel_form_field_input( 'npwp-seo-region', 'seo[address][addressRegion]', __( 'Province / state', 'neo-pulse-wp' ), (string) ( $address['addressRegion'] ?? '' ), 'quarter' );
				self::panel_form_field_input( 'npwp-seo-postal', 'seo[address][postalCode]', __( 'Postal code', 'neo-pulse-wp' ), (string) ( $address['postalCode'] ?? '' ), 'quarter' );
				self::panel_form_field_input( 'npwp-seo-country', 'seo[address][addressCountry]', __( 'Country', 'neo-pulse-wp' ), (string) ( $address['addressCountry'] ?? '' ), 'quarter' );
				self::panel_form_field_input( 'npwp-seo-phone', 'seo[phone]', __( 'Phone', 'neo-pulse-wp' ), $phone, 'quarter' );
				self::panel_form_field_input( 'npwp-seo-lat', 'seo[geo_lat]', __( 'Latitude', 'neo-pulse-wp' ), $g( 'geo_lat' ), 'quarter', 'text', false, __( 'Decimal degrees, e.g. 53.5461. Right-click the spot in Google Maps to copy both.', 'neo-pulse-wp' ) );
				self::panel_form_field_input( 'npwp-seo-lng', 'seo[geo_lng]', __( 'Longitude', 'neo-pulse-wp' ), $g( 'geo_lng' ), 'quarter', 'text', false, __( 'e.g. -113.4937', 'neo-pulse-wp' ) );
				self::panel_form_field_textarea( 'npwp-seo-hours', 'seo[opening_hours]', __( 'Opening hours', 'neo-pulse-wp' ), implode( "\n", self::seo_hours_lines() ), 'half', 4, __( 'One line per day or range, e.g. "Mon-Fri 09:00-17:00".', 'neo-pulse-wp' ) );
				self::panel_form_group_close();
				if ( $several ) {
					echo '</div>';
				}
				?>
				<p><button type="submit" class="button button-primary"><?php esc_html_e( 'Save SEO settings', 'neo-pulse-wp' ); ?></button></p>
			</form>
		</div>
		<?php
	}
}
