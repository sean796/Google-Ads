<?php
/**
 * NEO Pulse dashboard: what the plugin does on this site, grouped by purpose, with live status
 * and on/off switches for the main features.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Admin_Trait_Render_App {

	/**
	 * Flip one feature on or off from a dashboard switch, then return to the dashboard.
	 */
	public static function handle_dashboard_toggle(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to change Neo Pulse settings.', 'neo-pulse-wp' ) );
		}
		check_admin_referer( 'neo_pulse_wp_dashboard_toggle', 'neo_pulse_wp_dashboard_nonce' );

		$feature = isset( $_POST['feature'] ) ? sanitize_key( wp_unslash( (string) $_POST['feature'] ) ) : '';
		$on      = isset( $_POST['value'] ) && '1' === (string) wp_unslash( $_POST['value'] );
		$message = '';

		switch ( $feature ) {
			case 'seo':
				Neo_Pulse_Wp_Seo_Settings::set_enabled( $on );
				if ( $on && Neo_Pulse_Wp_Seo_Settings::other_seo_plugin() !== '' ) {
					/* translators: %s: other SEO plugin name */
					$message = sprintf( __( 'Neo Pulse SEO is on. It takes over once %s is deactivated.', 'neo-pulse-wp' ), Neo_Pulse_Wp_Seo_Settings::other_seo_plugin() );
				} else {
					$message = $on ? __( 'Neo Pulse SEO is on.', 'neo-pulse-wp' ) : __( 'Neo Pulse SEO is off.', 'neo-pulse-wp' );
				}
				break;

			case 'image_auto_alt':
				// save_config() takes the settings form's shape (field_alt, field_title …), so rebuild it.
				$config = Neo_Pulse_Wp_Image_Seo::get_config();
				$input  = $config;
				unset( $input['fields'] );
				foreach ( (array) $config['fields'] as $key => $ticked ) {
					$input[ 'field_' . $key ] = ! empty( $ticked );
				}
				$input['auto_on_upload'] = $on;
				// Uploads only get the fields ticked in Image SEO settings; make sure alt text is one of them.
				if ( $on && empty( $input['field_alt'] ) && empty( $input['field_title'] ) ) {
					$input['field_alt'] = true;
				}
				Neo_Pulse_Wp_Image_Seo::save_config( $input );
				$message = $on ? __( 'New images now get alt text automatically.', 'neo-pulse-wp' ) : __( 'Automatic alt text is off.', 'neo-pulse-wp' );
				break;

			case 'chat':
				$changes = array( 'enabled' => $on );
				if ( $on ) {
					// "Off everywhere" would keep the widget hidden even when enabled.
					$changes['off_everywhere'] = false;
				}
				Neo_Pulse_Wp_Chat::save_settings( $changes );
				$message = $on ? __( 'Chat is on for visitors.', 'neo-pulse-wp' ) : __( 'Chat is off on the site.', 'neo-pulse-wp' );
				break;

			case 'tracking':
				$settings                     = Neo_Pulse_Wp_Overseer::get_settings();
				$settings['tracking_enabled'] = $on;
				Neo_Pulse_Wp_Overseer::save_settings( $settings );
				Neo_Pulse_Wp_Overseer::sync_builtin_script();
				$message = $on ? __( 'Visitor tracking is on.', 'neo-pulse-wp' ) : __( 'Visitor tracking is off.', 'neo-pulse-wp' );
				break;

			default:
				$message = '';
		}

		if ( $message !== '' ) {
			self::set_flash(
				array(
					'success' => true,
					'message' => $message,
				)
			);
		}
		wp_safe_redirect( admin_url( 'admin.php?page=neo-pulse-wp' ) );
		exit;
	}

	public static function render_app_page(): void {
		if ( ! current_user_can( self::required_capability() ) ) {
			return;
		}

		$flash = self::get_and_clear_flash();
		$s     = self::dashboard_state();
		$admin = current_user_can( 'manage_options' );

		$settings_url = admin_url( 'admin.php?page=neo-pulse-wp-settings' );
		?>
		<div class="wrap npwp-admin neo-pulse-wp-app neo-pulse-wp-app--dashboard">
			<div class="npwp-admin__frame npwp-dash">
				<header class="npwp-head">
					<div class="npwp-head__titles">
						<span class="npwp-head__crumb"><?php esc_html_e( 'Neo Digital / Neo Pulse', 'neo-pulse-wp' ); ?></span>
						<h1 class="npwp-head__title"><?php esc_html_e( 'Dashboard', 'neo-pulse-wp' ); ?></h1>
					</div>
					<div class="npwp-head__meta">
						<a class="npwp-pill npwp-pill--ghost" href="https://neodigital.ca/contact/" target="_blank" rel="noopener noreferrer"><?php esc_html_e( 'Contact Neo Digital', 'neo-pulse-wp' ); ?></a>
						<?php if ( Neo_Pulse_Wp_Admin_Menu::user_can_open( 'neo-pulse-wp-settings' ) ) : ?>
							<a class="npwp-pill npwp-pill--ghost" href="<?php echo esc_url( $settings_url ); ?>"><?php esc_html_e( 'Settings', 'neo-pulse-wp' ); ?></a>
						<?php endif; ?>
					</div>
				</header>

				<?php if ( $flash && ! empty( $flash['message'] ) ) : ?>
					<div class="notice inline notice-<?php echo ! empty( $flash['success'] ) ? 'success' : 'error'; ?> is-dismissible npwp-dash__notice">
						<p><?php echo esc_html( (string) $flash['message'] ); ?></p>
					</div>
				<?php endif; ?>
				<?php Neo_Pulse_Wp_License::render_shell_banner(); ?>
				<?php Neo_Pulse_Wp_Lock::render_admin_card(); ?>

				<div class="npwp-dash__grid">
					<?php self::render_dashboard_hero( $s ); ?>
					<?php self::render_dashboard_todo( $s ); ?>

					<?php
					self::render_dashboard_stat( __( 'Searches · last 30 days', 'neo-pulse-wp' ), number_format_i18n( $s['searches_30'] ), '', 'search' );
					self::render_dashboard_stat( __( 'Chat messages · last 30 days', 'neo-pulse-wp' ), number_format_i18n( $s['chat_30'] ), '', 'chat' );
					self::render_dashboard_stat( __( 'Images missing alt text', 'neo-pulse-wp' ), number_format_i18n( $s['missing_alt'] ), '/ ' . number_format_i18n( $s['images'] ), 'image' );
					self::render_dashboard_stat( __( 'Scripts on', 'neo-pulse-wp' ), number_format_i18n( $s['scripts_on'] ), '/ ' . number_format_i18n( $s['scripts_all'] ), 'scripts' );
					?>

					<?php
					self::render_dashboard_section_head( __( 'SEO', 'neo-pulse-wp' ), __( 'How search engines see the site.', 'neo-pulse-wp' ) );

					if ( $s['other_seo'] !== '' ) {
						/* translators: %s: other SEO plugin name */
						$seo_chip = array( 'warn', sprintf( __( '%s in charge', 'neo-pulse-wp' ), $s['other_seo'] ) );
						$seo_text = $s['seo_enabled']
							/* translators: %s: other SEO plugin name */
							? sprintf( __( 'Switched on. Neo Pulse takes over the moment %s is deactivated.', 'neo-pulse-wp' ), $s['other_seo'] )
							/* translators: %s: other SEO plugin name */
							: sprintf( __( 'Titles, descriptions, social sharing and schema. Switch on when %s comes off.', 'neo-pulse-wp' ), $s['other_seo'] );
					} else {
						$seo_chip = $s['seo_output'] ? array( 'ok', __( 'Neo Pulse in charge', 'neo-pulse-wp' ) ) : array( 'warn', __( 'No SEO tags printed', 'neo-pulse-wp' ) );
						$seo_text = __( 'Titles, descriptions, social sharing and schema for every page.', 'neo-pulse-wp' );
					}
					$seo_buttons = array( array( __( 'Open', 'neo-pulse-wp' ), 'neo-pulse-wp-seo', array() ) );
					if ( $s['rank_math'] ) {
						$seo_buttons[] = array( __( 'Switch from Rank Math', 'neo-pulse-wp' ), 'neo-pulse-wp-seo', array() );
					}
					self::render_dashboard_card(
						array(
							'span'    => 3,
							'icon'    => 'seo',
							'title'   => __( 'SEO settings', 'neo-pulse-wp' ),
							'chip'    => $seo_chip,
							'text'    => $seo_text,
							'on'      => $s['seo_output'] || $s['seo_enabled'],
							'buttons' => $seo_buttons,
							'switch'  => $admin ? array( 'seo', $s['seo_enabled'], __( 'Neo Pulse SEO', 'neo-pulse-wp' ) ) : null,
						)
					);

					self::render_dashboard_card(
						array(
							'span'    => 3,
							'icon'    => 'sitemap',
							'title'   => __( 'Sitemap & robots.txt', 'neo-pulse-wp' ),
							'chip'    => $s['sitemap_on'] ? array( 'ok', __( 'XML sitemap on', 'neo-pulse-wp' ) ) : array( 'mute', __( 'XML sitemap off', 'neo-pulse-wp' ) ),
							'text'    => __( 'The XML sitemap for Google, an optional HTML sitemap page, and robots.txt rules.', 'neo-pulse-wp' ),
							'on'      => $s['sitemap_on'],
							'buttons' => array(
								array( __( 'Sitemap', 'neo-pulse-wp' ), 'neo-pulse-wp-sitemap', array() ),
								array( __( 'robots.txt', 'neo-pulse-wp' ), 'neo-pulse-wp-robots-txt', array() ),
							),
						)
					);

					self::render_dashboard_card(
						array(
							'span'    => 3,
							'icon'    => 'redirects',
							'title'   => __( 'Redirects', 'neo-pulse-wp' ),
							'chip'    => $s['redirects'] > 0
								/* translators: %s: number of active redirects */
								? array( 'ok', sprintf( _n( '%s redirect on', '%s redirects on', $s['redirects'], 'neo-pulse-wp' ), number_format_i18n( $s['redirects'] ) ) )
								: array( 'mute', __( 'No redirects yet', 'neo-pulse-wp' ) ),
							'text'    => __( '301 and 302 redirects, plus a log of addresses that weren’t found.', 'neo-pulse-wp' ),
							'on'      => $s['redirects'] > 0,
							'buttons' => array(
								array( __( 'Redirects', 'neo-pulse-wp' ), 'neo-pulse-wp-redirects', array() ),
								array( __( '404 log', 'neo-pulse-wp' ), 'neo-pulse-wp-redirects', array( 'action' => '404' ) ),
							),
						)
					);

					self::render_dashboard_card(
						array(
							'span'    => 3,
							'icon'    => 'image',
							'title'   => __( 'Image SEO', 'neo-pulse-wp' ),
							'chip'    => $s['missing_alt'] > 0
								/* translators: %s: number of images */
								? array( 'warn', sprintf( _n( '%s missing alt text', '%s missing alt text', $s['missing_alt'], 'neo-pulse-wp' ), number_format_i18n( $s['missing_alt'] ) ) )
								: array( 'ok', __( 'Every image has alt text', 'neo-pulse-wp' ) ),
							'text'    => $s['pro'] && $s['image_ai_mode']
								? __( 'Edit image titles and alt text in the library. Automatic AI alt text for new uploads is part of Pro + AI.', 'neo-pulse-wp' )
								: ( $s['auto_alt']
								? __( 'Looks at each new image and writes its alt text and title.', 'neo-pulse-wp' )
								: __( 'Automatic alt text is off. Turn it on to fill new uploads as they arrive.', 'neo-pulse-wp' ) ),
							'on'      => $s['auto_alt'],
							'buttons' => array(
								array( __( 'Library', 'neo-pulse-wp' ), 'neo-pulse-wp-image-seo', array( 'tab' => 'library' ) ),
								array( __( 'Settings', 'neo-pulse-wp' ), 'neo-pulse-wp-image-seo', array( 'tab' => 'settings' ) ),
							),
							'switch'  => $admin ? array( 'image_auto_alt', $s['auto_alt'], __( 'Automatic alt text', 'neo-pulse-wp' ) ) : null,
						)
					);

					self::render_dashboard_section_head( __( 'AI on your site', 'neo-pulse-wp' ), __( 'What visitors and editors use.', 'neo-pulse-wp' ) );

					if ( $s['pro'] ) {
						$chat_chip = array( 'mute', __( 'Part of Pro + AI', 'neo-pulse-wp' ) );
					} elseif ( $s['chat_on'] ) {
						$chat_chip = $s['ai_ready'] ? array( 'ok', __( 'On for visitors', 'neo-pulse-wp' ) ) : array( 'warn', __( 'On, but no AI key', 'neo-pulse-wp' ) );
					} else {
						$chat_chip = array( 'mute', __( 'Off on the site', 'neo-pulse-wp' ) );
					}
					self::render_dashboard_card(
						array(
							'span'    => 4,
							'icon'    => 'chat',
							'title'   => __( 'Chat', 'neo-pulse-wp' ),
							'chip'    => $chat_chip,
							'text'    => __( 'Answers visitors from your pages and knowledge base, and hands off to a person by text.', 'neo-pulse-wp' ),
							'on'      => $s['chat_on'],
							'buttons' => array(
								array( __( 'Settings', 'neo-pulse-wp' ), 'neo-pulse-wp-chat', array( 'tab' => 'general' ) ),
								array( __( 'Training', 'neo-pulse-wp' ), 'neo-pulse-wp-chat', array( 'tab' => 'training' ) ),
								array( __( 'Conversations', 'neo-pulse-wp' ), 'neo-pulse-wp-chat-logs', array() ),
							),
							'switch'  => $admin && ! $s['chat_forced_off'] && ! $s['pro'] ? array( 'chat', $s['chat_on'], __( 'Chat', 'neo-pulse-wp' ) ) : null,
						)
					);

					self::render_dashboard_card(
						array(
							'span'    => 4,
							'icon'    => 'search',
							'title'   => __( 'Search', 'neo-pulse-wp' ),
							'chip'    => $s['searches_30'] > 0
								/* translators: %s: number of searches */
								? array( 'ok', sprintf( _n( '%s search this month', '%s searches this month', $s['searches_30'], 'neo-pulse-wp' ), number_format_i18n( $s['searches_30'] ) ) )
								: array( 'mute', __( 'No searches this month', 'neo-pulse-wp' ) ),
							'text'    => $s['pro']
								? __( 'Site Search: keyword results in your chosen order, plus your pinned searches. AI Smart Search is part of Pro + AI.', 'neo-pulse-wp' )
								: ( $s['ai_ready']
								? __( 'AI search with match scores, popular searches and your pinned searches.', 'neo-pulse-wp' )
								: __( 'Keyword search for now. Add an AI key for match scores and smarter results.', 'neo-pulse-wp' ) ),
							'on'      => true,
							'buttons' => array(
								array( __( 'Settings', 'neo-pulse-wp' ), 'neo-pulse-wp-search', array( 'tab' => 'general' ) ),
								array( __( 'Popular searches', 'neo-pulse-wp' ), 'neo-pulse-wp-search', array( 'tab' => 'popular' ) ),
								array( __( 'Search log', 'neo-pulse-wp' ), 'neo-pulse-wp-search-logs', array() ),
							),
						)
					);

					self::render_dashboard_card(
						array(
							'span'    => 4,
							'icon'    => 'sparkle',
							'title'   => __( 'Backend Assist', 'neo-pulse-wp' ),
							'chip'    => $s['pro'] ? array( 'mute', __( 'Part of Pro + AI', 'neo-pulse-wp' ) ) : ( $s['ai_ready'] ? array( 'ok', __( 'Ready', 'neo-pulse-wp' ) ) : array( 'warn', __( 'Needs an AI key', 'neo-pulse-wp' ) ) ),
							'text'    => __( 'Ask in plain words for a page, post or change, and it builds it in Elementor.', 'neo-pulse-wp' ),
							'on'      => $s['ai_ready'],
							'buttons' => array(
								array( __( 'Open assistant', 'neo-pulse-wp' ), 'neo-pulse-wp-backend-assist', array() ),
								array( __( 'Tool library', 'neo-pulse-wp' ), 'neo-pulse-wp-tool-library', array() ),
							),
						)
					);

					self::render_dashboard_section_head( __( 'Insights & site', 'neo-pulse-wp' ), __( 'Traffic, tags and the plugin itself.', 'neo-pulse-wp' ) );

					self::render_dashboard_card(
						array(
							'span'    => 3,
							'icon'    => 'analytics',
							'title'   => __( 'Search Console', 'neo-pulse-wp' ),
							'chip'    => $s['gsc'] ? array( 'ok', __( 'Connected', 'neo-pulse-wp' ) ) : array( 'warn', __( 'Not connected', 'neo-pulse-wp' ) ),
							'text'    => __( 'Clicks, impressions and the searches people find you with on Google.', 'neo-pulse-wp' ),
							'on'      => $s['gsc'],
							'buttons' => $s['gsc']
								? array( array( __( 'Open', 'neo-pulse-wp' ), 'neo-pulse-wp-analytics', array() ) )
								: array( array( __( 'Connect', 'neo-pulse-wp' ), 'neo-pulse-wp-settings', array( 'tab' => 'gsc' ) ) ),
						)
					);

					self::render_dashboard_card(
						array(
							'span'    => 3,
							'icon'    => 'eye',
							'title'   => __( 'Visitors', 'neo-pulse-wp' ),
							'chip'    => $s['visits'] > 0
								/* translators: %s: number of visits */
								? array( $s['tracking'] ? 'ok' : 'mute', sprintf( _n( '%s visit recorded', '%s visits recorded', $s['visits'], 'neo-pulse-wp' ), number_format_i18n( $s['visits'] ) ) )
								: array( 'mute', __( 'No visits recorded', 'neo-pulse-wp' ) ),
							'text'    => __( 'Private page view, click and conversion tracking, with AI reports.', 'neo-pulse-wp' ),
							'on'      => $s['tracking'],
							'buttons' => array( array( __( 'Open', 'neo-pulse-wp' ), 'neo-pulse-wp-overseer', array( 'action' => 'metrics' ) ) ),
							'switch'  => $admin ? array( 'tracking', $s['tracking'], __( 'Visitor tracking', 'neo-pulse-wp' ) ) : null,
						)
					);

					self::render_dashboard_card(
						array(
							'span'    => 3,
							'icon'    => 'scripts',
							'title'   => __( 'Script Manager', 'neo-pulse-wp' ),
							'chip'    => $s['scripts_all'] > 0
								/* translators: 1: scripts on, 2: total scripts */
								? array( $s['scripts_on'] > 0 ? 'ok' : 'mute', sprintf( __( '%1$s of %2$s on', 'neo-pulse-wp' ), number_format_i18n( $s['scripts_on'] ), number_format_i18n( $s['scripts_all'] ) ) )
								: array( 'mute', __( 'No scripts yet', 'neo-pulse-wp' ) ),
							'text'    => __( 'Tracking pixels and verification tags in the header, body or footer.', 'neo-pulse-wp' ),
							'on'      => $s['scripts_on'] > 0,
							'buttons' => array( array( __( 'Scripts', 'neo-pulse-wp' ), 'neo-pulse-wp-script-manager', array() ) ),
						)
					);

					self::render_dashboard_card(
						array(
							'span'    => 3,
							'icon'    => 'settings',
							'title'   => __( 'Settings', 'neo-pulse-wp' ),
							'chip'    => $s['licensed'] ? array( 'ok', __( 'Licence active', 'neo-pulse-wp' ) ) : array( 'warn', $s['locked'] ? __( 'Locked', 'neo-pulse-wp' ) : __( 'Not licensed', 'neo-pulse-wp' ) ),
							'text'    => __( 'Licence, AI key, where the editor AI appears, and connections.', 'neo-pulse-wp' ),
							'on'      => true,
							'buttons' => array( array( __( 'Settings', 'neo-pulse-wp' ), 'neo-pulse-wp-settings', array() ) ),
						)
					);
					?>
				</div>

				<footer class="npwp-dash__footer">
					<span>
						<?php
						printf(
							/* translators: %s: Neo Digital */
							esc_html__( 'Made by %s, Edmonton', 'neo-pulse-wp' ),
							'<b>Neo Digital</b>'
						);
						?>
					</span>
					<span class="npwp-dash__footer-version">NEO Pulse <?php echo esc_html( defined( 'NEO_PULSE_WP_VERSION' ) ? NEO_PULSE_WP_VERSION : '' ); ?></span>
				</footer>
			</div>
		</div>
		<?php
	}

	/**
	 * Everything the dashboard shows, read once.
	 *
	 * @return array<string,mixed>
	 */
	private static function dashboard_state(): array {
		$other_seo = Neo_Pulse_Wp_Seo_Settings::other_seo_plugin();
		$scripts   = self::dashboard_safe( array( 'Neo_Pulse_Wp_Script_Manager', 'status_counts' ), array() );
		$redirects = self::dashboard_safe( array( 'Neo_Pulse_Wp_Redirects', 'status_counts' ), array() );
		$sitemap   = self::dashboard_safe( array( 'Neo_Pulse_Wp_Sitemap_Settings', 'get_config' ), array() );
		$image_cfg = Neo_Pulse_Wp_Image_Seo::get_config();

		$state = array(
			'site'            => get_bloginfo( 'name' ),
			'licensed'        => Neo_Pulse_Wp_License::is_licensed( false ),
			'locked'          => Neo_Pulse_Wp_Lock::is_locked(),
			'ai_ready'        => Neo_Pulse_Wp_OpenRouter::get_api_key() !== '' && ! Neo_Pulse_Wp_License::ai_needs_upgrade( false ),
			'pro'             => Neo_Pulse_Wp_License::ai_needs_upgrade( false ),
			'image_ai_mode'   => 'ai' === ( $image_cfg['auto_mode'] ?? '' ),
			'other_seo'       => $other_seo,
			'rank_math'       => Neo_Pulse_Wp_Seo_Settings::rank_math_active(),
			'seo_enabled'     => Neo_Pulse_Wp_Seo_Settings::enabled(),
			'seo_output'      => Neo_Pulse_Wp_Seo_Settings::output_active(),
			'sitemap_on'      => ! empty( $sitemap['general']['enabled'] ),
			'redirects'       => (int) ( $redirects['active'] ?? 0 ),
			'auto_alt'        => ! empty( $image_cfg['auto_on_upload'] ) && ( ! empty( $image_cfg['fields']['alt'] ) || ! empty( $image_cfg['fields']['title'] ) ),
			'missing_alt'     => self::dashboard_image_count( true ),
			'images'          => self::dashboard_image_count( false ),
			'chat_on'         => Neo_Pulse_Wp_Chat::is_enabled() && ! Neo_Pulse_Wp_Chat::is_off_everywhere(),
			'chat_forced_off' => defined( 'NEO_PULSE_WP_CHAT_OFF' ) && NEO_PULSE_WP_CHAT_OFF,
			'tracking'        => (bool) self::dashboard_safe( array( 'Neo_Pulse_Wp_Overseer', 'is_tracking_active' ), false ),
			'visits'          => (int) self::dashboard_safe( array( 'Neo_Pulse_Wp_Overseer', 'count_visits' ), 0 ),
			'scripts_on'      => (int) ( $scripts['active'] ?? 0 ),
			'scripts_all'     => (int) ( $scripts['all'] ?? 0 ),
			'searches_30'     => self::dashboard_recent_rows( Neo_Pulse_Wp_Search_Logs::table_name() ),
			'chat_30'         => self::dashboard_recent_rows( Neo_Pulse_Wp_Chat_Logs::messages_table_name() ),
			'gsc'             => self::dashboard_gsc_connected(),
			'rm_done'         => 0,
			'rm_total'        => 0,
		);

		if ( $state['rank_math'] ) {
			// Same checklist as the SEO screen (minus the informational IndexNow line), plus the
			// final "switch Neo Pulse SEO on" step.
			$checks = self::dashboard_safe( array( __CLASS__, 'seo_switch_checks' ), array() );
			foreach ( is_array( $checks ) ? $checks : array() as $check ) {
				if ( ! is_array( $check ) || ( $check[2] ?? '' ) === 'indexnow' ) {
					continue;
				}
				++$state['rm_total'];
				$state['rm_done'] += empty( $check[0] ) ? 0 : 1;
			}
			++$state['rm_total'];
			$state['rm_done'] += $state['seo_enabled'] ? 1 : 0;
		}

		return $state;
	}

	/**
	 * Run a read, returning a fallback if it throws (a missing table should not break the dashboard).
	 *
	 * @param callable $callback Reader.
	 * @param mixed    $fallback Value on failure.
	 * @return mixed
	 */
	private static function dashboard_safe( callable $callback, $fallback ) {
		try {
			return call_user_func( $callback );
		} catch ( Throwable $e ) {
			return $fallback;
		}
	}

	private static function dashboard_image_count( bool $missing_alt ): int {
		$result = self::dashboard_safe(
			static function () use ( $missing_alt ) {
				return Neo_Pulse_Wp_Image_Seo::query_attachments(
					array(
						'page'        => 1,
						'per_page'    => 1,
						'missing_alt' => $missing_alt,
					)
				);
			},
			array()
		);
		return (int) ( $result['total'] ?? 0 );
	}

	/**
	 * Rows created in the last 30 days (tables store UTC times).
	 */
	private static function dashboard_recent_rows( string $table ): int {
		global $wpdb;
		$since    = gmdate( 'Y-m-d H:i:s', time() - 30 * DAY_IN_SECONDS );
		$suppress = $wpdb->suppress_errors( true );
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$count = $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$table} WHERE created_at >= %s", $since ) );
		$wpdb->suppress_errors( $suppress );
		return (int) $count;
	}

	/**
	 * Search Console connected for this site. Checking asks Google, so the answer is kept for 10 minutes.
	 */
	private static function dashboard_gsc_connected(): bool {
		$cached = get_transient( 'neo_pulse_wp_dash_gsc' );
		if ( false !== $cached ) {
			return '1' === (string) $cached;
		}
		$connected = (bool) self::dashboard_safe( array( 'Neo_Pulse_Wp_Gsc', 'is_available' ), false );
		set_transient( 'neo_pulse_wp_dash_gsc', $connected ? '1' : '0', 10 * MINUTE_IN_SECONDS );
		return $connected;
	}

	/**
	 * @param array<string,mixed> $s Dashboard state.
	 */
	private static function render_dashboard_hero( array $s ): void {
		$version = defined( 'NEO_PULSE_WP_VERSION' ) ? NEO_PULSE_WP_VERSION : '';
		$chips   = array();
		/* translators: %s: plan name, "Pro" or "Pro + AI" */
		$chips[] = $s['licensed'] ? array( 'ok', sprintf( __( 'NEO Pulse %s', 'neo-pulse-wp' ), Neo_Pulse_Wp_License::plan_label() ) ) : array( 'warn', $s['locked'] ? __( 'Locked', 'neo-pulse-wp' ) : __( 'Not licensed', 'neo-pulse-wp' ) );
		if ( $s['pro'] ) {
			$chips[] = array( 'plain', __( 'AI features: Pro + AI', 'neo-pulse-wp' ) );
		} else {
			$chips[] = $s['ai_ready'] ? array( 'ok', __( 'AI ready', 'neo-pulse-wp' ) ) : array( 'warn', __( 'AI key missing', 'neo-pulse-wp' ) );
		}
		if ( $s['other_seo'] !== '' ) {
			/* translators: %s: other SEO plugin name */
			$chips[] = array( 'plain', sprintf( __( '%s still handles SEO', 'neo-pulse-wp' ), $s['other_seo'] ) );
		} elseif ( $s['seo_output'] ) {
			$chips[] = array( 'ok', __( 'Neo Pulse handles SEO', 'neo-pulse-wp' ) );
		}
		?>
		<section class="npwp-dash__hero npwp-dash__span-8" aria-label="<?php esc_attr_e( 'NEO Pulse', 'neo-pulse-wp' ); ?>">
			<svg class="npwp-dash__hero-mark" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="#97d400" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12.5h4l2.5 6 3.5-14 3 11.5 2-3.5h4"/></svg>
			<div class="npwp-dash__hero-brand">
				<?php echo Neo_Pulse_Wp_Brand::logo_svg(); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- fixed markup. ?>
				<?php if ( $version !== '' ) : ?>
					<span class="npwp-dash__hero-version">
						<?php
						/* translators: %s: plugin version */
						echo esc_html( sprintf( __( 'Version %s', 'neo-pulse-wp' ), $version ) );
						?>
					</span>
				<?php endif; ?>
			</div>
			<h2 class="npwp-dash__hero-title">
				<?php
				/* translators: %s: site name */
				echo esc_html( sprintf( __( 'AI chat, smart search and SEO for %s.', 'neo-pulse-wp' ), $s['site'] ) );
				?>
			</h2>
			<p class="npwp-dash__hero-text"><?php esc_html_e( 'Everything NEO Pulse does on this site, grouped by what it’s for. Open a card to change its settings.', 'neo-pulse-wp' ); ?></p>
			<div class="npwp-dash__hero-chips">
				<?php foreach ( $chips as $chip ) : ?>
					<span class="npwp-dash__hero-chip npwp-dash__hero-chip--<?php echo esc_attr( $chip[0] ); ?>"><?php echo $chip[0] !== 'plain' ? '<span class="npwp-dot" aria-hidden="true"></span>' : ''; ?><?php echo esc_html( $chip[1] ); ?></span>
				<?php endforeach; ?>
			</div>
		</section>
		<?php
	}

	/**
	 * @param array<string,mixed> $s Dashboard state.
	 */
	private static function render_dashboard_todo( array $s ): void {
		$items = array();

		if ( ! $s['licensed'] && Neo_Pulse_Wp_Admin_Menu::user_can_open( 'neo-pulse-wp-settings' ) ) {
			$items[] = $s['locked']
				? array( 'key', __( 'NEO Pulse is locked', 'neo-pulse-wp' ), __( 'Nothing runs until it is activated with a site key', 'neo-pulse-wp' ), __( 'Add key', 'neo-pulse-wp' ), 'neo-pulse-wp-settings', array( 'tab' => 'licence' ) )
				: array( 'key', __( 'Licence not active', 'neo-pulse-wp' ), __( 'Updates and AI features need a site key', 'neo-pulse-wp' ), __( 'Add key', 'neo-pulse-wp' ), 'neo-pulse-wp-settings', array( 'tab' => 'licence' ) );
		}
		if ( ! $s['ai_ready'] && ! $s['pro'] && Neo_Pulse_Wp_Admin_Menu::user_can_open( 'neo-pulse-wp-settings' ) ) {
			$items[] = array( 'sparkle', __( 'No AI key yet', 'neo-pulse-wp' ), __( 'Chat, AI search and alt text need one', 'neo-pulse-wp' ), __( 'Add key', 'neo-pulse-wp' ), 'neo-pulse-wp-settings', array( 'tab' => 'openrouter' ) );
		}
		if ( $s['missing_alt'] > 0 && Neo_Pulse_Wp_Admin_Menu::user_can_open( 'neo-pulse-wp-image-seo' ) ) {
			$items[] = array(
				'image',
				/* translators: %s: number of images */
				sprintf( _n( '%s image has no alt text', '%s images have no alt text', $s['missing_alt'], 'neo-pulse-wp' ), number_format_i18n( $s['missing_alt'] ) ),
				$s['auto_alt'] ? __( 'New uploads are filled automatically', 'neo-pulse-wp' ) : __( 'Automatic alt text is off', 'neo-pulse-wp' ),
				__( 'Fill with AI', 'neo-pulse-wp' ),
				'neo-pulse-wp-image-seo',
				array(
					'tab'         => 'library',
					'missing_alt' => '1',
				),
			);
		}
		if ( ! $s['gsc'] && Neo_Pulse_Wp_Admin_Menu::user_can_open( 'neo-pulse-wp-settings' ) ) {
			$items[] = array( 'analytics', __( 'Search Console not connected', 'neo-pulse-wp' ), __( 'Search Console stays empty until it is', 'neo-pulse-wp' ), __( 'Connect', 'neo-pulse-wp' ), 'neo-pulse-wp-settings', array( 'tab' => 'gsc' ) );
		}
		if ( $s['rank_math'] && Neo_Pulse_Wp_Admin_Menu::user_can_open( 'neo-pulse-wp-seo' ) ) {
			$items[] = array(
				'seo',
				__( 'Switch from Rank Math', 'neo-pulse-wp' ),
				/* translators: 1: steps done, 2: total steps */
				sprintf( __( '%1$d of %2$d steps done', 'neo-pulse-wp' ), (int) $s['rm_done'], (int) $s['rm_total'] ),
				$s['rm_done'] > 0 ? __( 'Continue', 'neo-pulse-wp' ) : __( 'Start', 'neo-pulse-wp' ),
				'neo-pulse-wp-seo',
				array(),
			);
		}
		?>
		<section class="npwp-dash__card npwp-dash__span-4 npwp-dash__todo">
			<div class="npwp-dash__card-head">
				<span class="npwp-dash__ticon is-on"><?php echo self::dashboard_icon( 'alert' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?></span>
				<div class="npwp-dash__card-titles">
					<span class="npwp-dash__eyebrow"><?php esc_html_e( 'To do', 'neo-pulse-wp' ); ?></span>
					<h2 class="npwp-dash__h2"><?php echo $items ? esc_html__( 'Needs your attention', 'neo-pulse-wp' ) : esc_html__( 'All caught up', 'neo-pulse-wp' ); ?></h2>
				</div>
			</div>
			<div class="npwp-dash__rows">
				<?php if ( ! $items ) : ?>
					<div class="npwp-dash__row npwp-dash__row--done">
						<span class="npwp-dash__mini is-on"><?php echo self::dashboard_icon( 'check', 17 ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?></span>
						<div class="npwp-dash__row-text"><strong><?php esc_html_e( 'Nothing needs doing', 'neo-pulse-wp' ); ?></strong><span><?php esc_html_e( 'Everything Neo Pulse checks is set up.', 'neo-pulse-wp' ); ?></span></div>
					</div>
				<?php endif; ?>
				<?php foreach ( array_slice( $items, 0, 4 ) as $item ) : ?>
					<div class="npwp-dash__row">
						<span class="npwp-dash__mini is-on"><?php echo self::dashboard_icon( $item[0], 17 ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?></span>
						<div class="npwp-dash__row-text"><strong><?php echo esc_html( $item[1] ); ?></strong><span><?php echo esc_html( $item[2] ); ?></span></div>
						<a class="npwp-pill npwp-pill--ghost npwp-pill--small" href="<?php echo esc_url( add_query_arg( array_merge( array( 'page' => $item[4] ), $item[5] ), admin_url( 'admin.php' ) ) ); ?>"><?php echo esc_html( $item[3] ); ?></a>
					</div>
				<?php endforeach; ?>
			</div>
		</section>
		<?php
	}

	private static function render_dashboard_stat( string $label, string $big, string $small, string $icon ): void {
		?>
		<section class="npwp-dash__card npwp-dash__span-3 npwp-dash__stat">
			<div class="npwp-dash__stat-text">
				<span class="npwp-dash__stat-label"><?php echo esc_html( $label ); ?></span>
				<span class="npwp-dash__stat-big"><?php echo esc_html( $big ); ?><?php if ( $small !== '' ) : ?><small> <?php echo esc_html( $small ); ?></small><?php endif; ?></span>
			</div>
			<span class="npwp-dash__stat-icon"><?php echo self::dashboard_icon( $icon, 20 ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?></span>
		</section>
		<?php
	}

	private static function render_dashboard_section_head( string $eyebrow, string $text ): void {
		?>
		<div class="npwp-dash__section-head npwp-dash__span-12">
			<h2 class="npwp-dash__eyebrow"><?php echo esc_html( $eyebrow ); ?></h2>
			<span class="npwp-dash__sub"><?php echo esc_html( $text ); ?></span>
		</div>
		<?php
	}

	/**
	 * One feature card: icon (dark when on, grey when off), title, optional switch, status chip, text, links.
	 *
	 * @param array<string,mixed> $c Card definition.
	 */
	private static function render_dashboard_card( array $c ): void {
		$buttons = array();
		foreach ( (array) $c['buttons'] as $button ) {
			if ( Neo_Pulse_Wp_Admin_Menu::user_can_open( $button[1] ) ) {
				$buttons[] = $button;
			}
		}
		if ( ! $buttons && empty( $c['switch'] ) ) {
			return;
		}
		$chip = (array) $c['chip'];
		?>
		<section class="npwp-dash__card npwp-dash__span-<?php echo (int) $c['span']; ?> npwp-dash__mod">
			<div class="npwp-dash__card-head">
				<span class="npwp-dash__ticon <?php echo ! empty( $c['on'] ) ? 'is-on' : 'is-off'; ?>"><?php echo self::dashboard_icon( (string) $c['icon'] ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?></span>
				<h2 class="npwp-dash__h2"><?php echo esc_html( (string) $c['title'] ); ?></h2>
				<?php
				if ( ! empty( $c['switch'] ) ) {
					self::render_dashboard_switch( (string) $c['switch'][0], (bool) $c['switch'][1], (string) $c['switch'][2] );
				}
				?>
			</div>
			<div><span class="npwp-chip npwp-chip--<?php echo esc_attr( (string) $chip[0] ); ?>"><span class="npwp-dot" aria-hidden="true"></span><?php echo esc_html( (string) $chip[1] ); ?></span></div>
			<p class="npwp-dash__sub"><?php echo esc_html( (string) $c['text'] ); ?></p>
			<?php if ( $buttons ) : ?>
				<div class="npwp-dash__actions">
					<?php foreach ( $buttons as $button ) : ?>
						<a class="npwp-pill npwp-pill--ghost npwp-pill--small" href="<?php echo esc_url( add_query_arg( array_merge( array( 'page' => $button[1] ), $button[2] ), admin_url( 'admin.php' ) ) ); ?>"><?php echo esc_html( (string) $button[0] ); ?></a>
					<?php endforeach; ?>
				</div>
			<?php endif; ?>
		</section>
		<?php
	}

	/**
	 * An on/off switch that posts straight to the toggle handler (works without JavaScript).
	 */
	private static function render_dashboard_switch( string $feature, bool $on, string $label ): void {
		?>
		<form class="npwp-dash__switch-form" method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
			<input type="hidden" name="action" value="neo_pulse_wp_dashboard_toggle" />
			<input type="hidden" name="feature" value="<?php echo esc_attr( $feature ); ?>" />
			<input type="hidden" name="value" value="<?php echo $on ? '0' : '1'; ?>" />
			<?php wp_nonce_field( 'neo_pulse_wp_dashboard_toggle', 'neo_pulse_wp_dashboard_nonce', false ); ?>
			<button type="submit" class="npwp-switch<?php echo $on ? ' is-on' : ''; ?>" role="switch" aria-checked="<?php echo $on ? 'true' : 'false'; ?>" aria-label="<?php echo esc_attr( $label ); ?>" title="<?php echo esc_attr( $on ? __( 'On: click to turn off', 'neo-pulse-wp' ) : __( 'Off: click to turn on', 'neo-pulse-wp' ) ); ?>"><span></span></button>
		</form>
		<?php
	}

	/**
	 * Line icons (24x24, currentColor) used across the dashboard.
	 */
	private static function dashboard_icon( string $name, int $size = 18 ): string {
		$paths = array(
			'seo'       => '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/><path d="M8 12.5l2-2 1.5 1.5L14 9.5"/>',
			'settings'  => '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
			'analytics' => '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
			'sitemap'   => '<rect x="9" y="3" width="6" height="5" rx="1.2"/><rect x="3" y="16" width="6" height="5" rx="1.2"/><rect x="15" y="16" width="6" height="5" rx="1.2"/><path d="M12 8v4M6 16v-2.5h12V16"/>',
			'chat'      => '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.8-.9L3 20l1.1-4.2A8.4 8.4 0 0 1 12 3a8.5 8.5 0 0 1 9 8.5z"/><path d="M8 10h8M8 14h5"/>',
			'redirects' => '<path d="M16 3h5v5"/><path d="M4 20L21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/>',
			'scripts'   => '<path d="M16 18l6-6-6-6"/><path d="M8 6l-6 6 6 6"/>',
			'eye'       => '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
			'image'     => '<rect x="3" y="3" width="18" height="18" rx="2.5"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/>',
			'search'    => '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
			'sparkle'   => '<path d="M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7-4.7-1.8 4.7-1.8z"/><path d="M19 15l.8 2.2 2.2.8-2.2.8L19 21l-.8-2.2-2.2-.8 2.2-.8z"/>',
			'key'       => '<circle cx="8" cy="15" r="4"/><path d="m10.8 12.2 9.2-9.2M17 6l2 2M15 8l2 2"/>',
			'alert'     => '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
			'check'     => '<path d="m5 12 5 5 9-10"/>',
		);
		if ( ! isset( $paths[ $name ] ) ) {
			return '';
		}
		return '<svg aria-hidden="true" focusable="false" width="' . (int) $size . '" height="' . (int) $size . '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' . $paths[ $name ] . '</svg>';
	}
}
