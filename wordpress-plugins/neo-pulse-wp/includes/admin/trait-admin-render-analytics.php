<?php
/**
 * NEO Pulse WP Insights → Search Console (tabbed): overview with trend charts and breakdowns,
 * opportunities, winners and losers, top keywords and top pages.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Admin_Trait_Render_Analytics {

	/** @var bool Chart script printed once per page. */
	private static $insights_script_printed = false;

	public static function render_analytics_page(): void {
		if ( ! current_user_can( self::required_capability() ) ) {
			return;
		}

		$tab   = self::panel_active_tab( 'overview' );
		$range = Neo_Pulse_Wp_Gsc_Insights::sanitize_range( isset( $_GET['range'] ) ? wp_unslash( (string) $_GET['range'] ) : '28d' ); // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only view switch.
		$data  = Neo_Pulse_Wp_Gsc_Insights::fetch( $range );

		$nav_groups = array(
			array(
				'heading' => __( 'Search Console', 'neo-pulse-wp' ),
				'tabs'    => array(
					'overview'      => __( 'Overview', 'neo-pulse-wp' ),
					'opportunities' => __( 'Opportunities', 'neo-pulse-wp' ),
					'movers'        => __( 'Winners & losers', 'neo-pulse-wp' ),
					'queries'       => __( 'Top Queries', 'neo-pulse-wp' ),
					'pages'         => __( 'Top Pages', 'neo-pulse-wp' ),
				),
			),
		);
		self::neo_pulse_group_shell_open( 'neo-pulse-wp-analytics', 'neo-pulse-wp-analytics neo-pulse-wp-panel-page' );
		self::panel_layout_start( 'neo-pulse-wp-analytics', $nav_groups, $tab, __( 'Analytics sections', 'neo-pulse-wp' ) );

		if ( is_wp_error( $data ) ) {
			self::render_analytics_error( $data );
		} else {
			echo '<div class="npwp-ins">';
			switch ( $tab ) {
				case 'opportunities':
					self::render_insights_opportunities( $data, $tab );
					break;
				case 'movers':
					self::render_insights_movers( $data, $tab );
					break;
				case 'queries':
					self::render_insights_top( $data, $tab, 'queries' );
					break;
				case 'pages':
					self::render_insights_top( $data, $tab, 'pages' );
					break;
				default:
					self::render_insights_overview( $data, 'overview' );
			}
			self::render_insights_refresh( $tab );
			echo '</div>';
			self::print_insights_script();
		}

		self::panel_layout_end();
		self::neo_pulse_group_shell_close();
	}

	private static function render_analytics_error( WP_Error $error ): void {
		$settings_url = admin_url( 'admin.php?page=neo-pulse-wp-settings&tab=gsc' );
		?>
		<h2 class="neo-pulse-wp-panel-content__title"><?php esc_html_e( 'Search Console', 'neo-pulse-wp' ); ?></h2>
		<div class="neo-pulse-wp-panel-info-box" role="alert">
			<p><?php echo esc_html( $error->get_error_message() ); ?></p>
			<p><a href="<?php echo esc_url( $settings_url ); ?>"><?php esc_html_e( 'Check the Search Console connection in Settings', 'neo-pulse-wp' ); ?></a></p>
		</div>
		<?php
	}

	/* ---------- Shared pieces ---------- */

	/**
	 * Title, period line and the range switch.
	 */
	private static function render_insights_header( array $data, string $tab, string $title, string $desc ): void {
		$p   = $data['period'];
		$fmt = static function ( string $d ): string {
			return wp_date( 'M j, Y', strtotime( $d . ' 12:00:00' ) );
		};
		?>
		<div class="npwp-ins__head">
			<div>
				<h2 class="neo-pulse-wp-panel-content__title"><?php echo esc_html( $title ); ?></h2>
				<p class="neo-pulse-wp-panel-content__desc">
					<?php
					echo esc_html( $desc ) . ' ';
					echo esc_html(
						sprintf(
							/* translators: 1: start, 2: end, 3: previous start, 4: previous end */
							__( '%1$s – %2$s, compared with %3$s – %4$s.', 'neo-pulse-wp' ),
							$fmt( $p['start'] ),
							$fmt( $p['end'] ),
							$fmt( $p['prevStart'] ),
							$fmt( $p['prevEnd'] )
						)
					);
					?>
				</p>
			</div>
			<nav class="npwp-ins__ranges" aria-label="<?php esc_attr_e( 'Date range', 'neo-pulse-wp' ); ?>">
				<?php foreach ( Neo_Pulse_Wp_Gsc_Insights::ranges() as $key => $range ) : ?>
					<a class="npwp-ins__range npwp-ins__nav-item<?php echo $key === $p['key'] ? ' is-active' : ''; ?>" href="<?php echo esc_url( add_query_arg( array( 'page' => 'neo-pulse-wp-analytics', 'tab' => $tab, 'range' => $key ), admin_url( 'admin.php' ) ) ); ?>"<?php echo $key === $p['key'] ? ' aria-current="true"' : ''; ?>><?php echo esc_html( $range['label'] ); ?></a>
				<?php endforeach; ?>
			</nav>
		</div>
		<?php
	}

	private static function render_insights_refresh( string $tab ): void {
		self::panel_footer_actions(
			$tab,
			'neo-pulse_analytics_tab',
			array(
				array(
					'action'       => self::ACTION_REFRESH_ANALYTICS,
					'nonce_action' => self::ACTION_REFRESH_ANALYTICS,
					'nonce_field'  => 'neo_pulse_wp_analytics_refresh_nonce',
					'label'        => __( 'Refresh data', 'neo-pulse-wp' ),
					'button_class' => '',
				),
			)
		);
	}

	private static function ins_compact( float $n ): string {
		$abs = abs( $n );
		if ( $abs >= 1000000 ) {
			return number_format_i18n( $n / 1000000, $abs >= 10000000 ? 0 : 1 ) . 'M';
		}
		if ( $abs >= 10000 ) {
			return number_format_i18n( $n / 1000, $abs >= 100000 ? 0 : 1 ) . 'K';
		}
		return number_format_i18n( $n, $n == (int) $n ? 0 : 1 ); // phpcs:ignore Universal.Operators.StrictComparisons.LooseEqual
	}

	private static function ins_pct( float $ratio, int $decimals = 1 ): string {
		if ( 0 === $decimals && $ratio > 0 && $ratio < 0.005 ) {
			return '<1%';
		}
		return number_format_i18n( $ratio * 100, $decimals ) . '%';
	}

	/**
	 * Change badge: arrow + amount, green when it is good news, red when it is not.
	 *
	 * @param string $kind 'pct' (relative change), 'pts' (CTR points), 'pos' (position: lower is better).
	 */
	private static function ins_delta( $now, $then, string $kind = 'pct' ): string {
		if ( null === $then ) {
			return '<span class="npwp-ins__delta is-new">' . esc_html__( 'New', 'neo-pulse-wp' ) . '</span>';
		}
		$now  = (float) $now;
		$then = (float) $then;
		if ( 'pos' === $kind ) {
			$diff = round( $then - $now, 1 ); // Positive = moved up the results.
			$text = number_format_i18n( abs( $diff ), 1 );
		} elseif ( 'pts' === $kind ) {
			$diff = round( ( $now - $then ) * 100, 2 );
			$text = number_format_i18n( abs( $diff ), 1 ) . ' ' . __( 'pts', 'neo-pulse-wp' );
		} else {
			if ( 0.0 === $then ) {
				return $now > 0 ? '<span class="npwp-ins__delta is-up">↑ ' . esc_html__( 'New', 'neo-pulse-wp' ) . '</span>' : '<span class="npwp-ins__delta">–</span>';
			}
			$diff = ( $now - $then ) / $then * 100;
			$text = number_format_i18n( abs( $diff ), abs( $diff ) < 10 ? 1 : 0 ) . '%';
		}
		if ( abs( $diff ) < 0.05 ) {
			return '<span class="npwp-ins__delta">' . esc_html__( 'No change', 'neo-pulse-wp' ) . '</span>';
		}
		$up = $diff > 0;
		return sprintf(
			'<span class="npwp-ins__delta %1$s"><span aria-hidden="true">%2$s</span> %3$s<span class="screen-reader-text"> %4$s</span></span>',
			$up ? 'is-up' : 'is-down',
			$up ? '↑' : '↓',
			esc_html( $text ),
			esc_html( $up ? __( 'better than the previous period', 'neo-pulse-wp' ) : __( 'worse than the previous period', 'neo-pulse-wp' ) )
		);
	}

	/**
	 * Address without scheme and host, for tables (full URL in the title).
	 */
	private static function ins_path( string $url ): string {
		$path = (string) wp_parse_url( $url, PHP_URL_PATH );
		$q    = (string) wp_parse_url( $url, PHP_URL_QUERY );
		$path = '' === $path ? '/' : $path;
		return rawurldecode( $path . ( '' !== $q ? '?' . $q : '' ) );
	}

	private static function ins_page_cell( string $url ): void {
		$edit = Neo_Pulse_Wp_Gsc_Insights::edit_link( $url );
		?>
		<a class="npwp-ins__url" href="<?php echo esc_url( $url ); ?>" target="_blank" rel="noopener noreferrer" title="<?php echo esc_attr( $url ); ?>"><?php echo esc_html( self::ins_path( $url ) ); ?></a>
		<?php if ( '' !== $edit ) : ?>
			<a class="npwp-ins__edit" href="<?php echo esc_url( $edit ); ?>"><?php esc_html_e( 'Edit', 'neo-pulse-wp' ); ?></a>
		<?php endif; ?>
		<?php
	}

	/* ---------- Overview ---------- */

	private static function render_insights_overview( array $data, string $tab ): void {
		$cur  = $data['totals']['cur'];
		$prev = $data['totals']['prev'];
		self::render_insights_header( $data, $tab, __( 'Overview', 'neo-pulse-wp' ), __( 'How this site does in Google search.', 'neo-pulse-wp' ) );

		$keywords = number_format_i18n( $cur['keywords'] ) . ( ! empty( $data['keywordsCapped'] ) ? '+' : '' );
		$tiles    = array(
			array( __( 'Clicks', 'neo-pulse-wp' ), self::ins_compact( $cur['clicks'] ), self::ins_delta( $cur['clicks'], $prev['clicks'] ) ),
			array( __( 'Impressions', 'neo-pulse-wp' ), self::ins_compact( $cur['impressions'] ), self::ins_delta( $cur['impressions'], $prev['impressions'] ) ),
			array( __( 'Click-through rate', 'neo-pulse-wp' ), self::ins_pct( $cur['ctr'] ), self::ins_delta( $cur['ctr'], $prev['ctr'], 'pts' ) ),
			array( __( 'Average position', 'neo-pulse-wp' ), number_format_i18n( $cur['position'], 1 ), self::ins_delta( $cur['position'], $prev['position'] > 0 ? $prev['position'] : null, 'pos' ) ),
			array( __( 'Keywords', 'neo-pulse-wp' ), $keywords, self::ins_delta( $cur['keywords'], $prev['keywords'] ) ),
		);
		?>
		<section class="npwp-ins__tiles" aria-label="<?php esc_attr_e( 'Totals', 'neo-pulse-wp' ); ?>">
			<?php foreach ( $tiles as $tile ) : ?>
				<div class="npwp-ins__tile">
					<span class="npwp-ins__tile-label"><?php echo esc_html( $tile[0] ); ?></span>
					<span class="npwp-ins__tile-value"><?php echo esc_html( $tile[1] ); ?></span>
					<span class="npwp-ins__tile-delta"><?php echo $tile[2]; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- built from escaped parts. ?> <span class="npwp-ins__vs"><?php esc_html_e( 'vs previous period', 'neo-pulse-wp' ); ?></span></span>
				</div>
			<?php endforeach; ?>
		</section>

		<div class="npwp-ins__charts">
			<?php
			self::render_insights_trend( $data, 'clicks', __( 'Clicks per day', 'neo-pulse-wp' ) );
			self::render_insights_trend( $data, 'impressions', __( 'Impressions per day', 'neo-pulse-wp' ) );
			?>
		</div>

		<div class="npwp-ins__grid3">
			<?php
			$bands = array();
			foreach ( $data['bands'] as $band ) {
				$bands[] = array(
					'label' => $band['label'],
					'value' => $band['count'],
					'text'  => number_format_i18n( $band['count'] ),
				);
			}
			self::render_insights_bars( __( 'Keywords by position', 'neo-pulse-wp' ), __( 'Where this site ranks for each keyword it shows up for.', 'neo-pulse-wp' ), $bands );

			$devices = array();
			$names   = array(
				'MOBILE'  => __( 'Mobile', 'neo-pulse-wp' ),
				'DESKTOP' => __( 'Desktop', 'neo-pulse-wp' ),
				'TABLET'  => __( 'Tablet', 'neo-pulse-wp' ),
			);
			foreach ( $data['devices'] as $row ) {
				$devices[] = array(
					'label' => $names[ $row['key'] ] ?? ucfirst( strtolower( $row['key'] ) ),
					'value' => $row['clicks'],
					'text'  => self::ins_pct( $row['share'], 0 ),
					'title' => sprintf( /* translators: %s: clicks */ __( '%s clicks', 'neo-pulse-wp' ), number_format_i18n( $row['clicks'] ) ),
				);
			}
			self::render_insights_bars( __( 'Clicks by device', 'neo-pulse-wp' ), __( 'Share of clicks from each kind of device.', 'neo-pulse-wp' ), $devices );

			$countries = array();
			foreach ( $data['countries'] as $row ) {
				$countries[] = array(
					'label' => Neo_Pulse_Wp_Gsc_Insights::country_name( $row['key'] ),
					'value' => $row['clicks'],
					'text'  => self::ins_pct( $row['share'], 0 ),
					'title' => sprintf( /* translators: %s: clicks */ __( '%s clicks', 'neo-pulse-wp' ), number_format_i18n( $row['clicks'] ) ),
				);
			}
			self::render_insights_bars( __( 'Clicks by country', 'neo-pulse-wp' ), __( 'Where searchers are.', 'neo-pulse-wp' ), $countries );
			?>
		</div>
		<?php
	}

	/**
	 * Daily line chart: this period (brand green, with a light wash) over the previous period
	 * (grey), one measure per chart. Drawn as SVG; labels are HTML so they never stretch.
	 */
	private static function render_insights_trend( array $data, string $metric, string $title ): void {
		$cur  = array_column( $data['series']['cur'], $metric );
		$prev = array_column( $data['series']['prev'], $metric );
		$days = array_column( $data['series']['cur'], 'date' );
		$pday = array_column( $data['series']['prev'], 'date' );
		$n    = count( $cur );
		if ( $n < 2 ) {
			return;
		}

		// Clean y-axis: 0, half, top.
		$max = max( 1, max( $cur ), $prev ? max( $prev ) : 0 );
		$mag = pow( 10, floor( log10( $max ) ) );
		$top = ceil( $max / $mag ) * $mag;
		$w = 1000;
		$h = 240;
		$x = static function ( int $i ) use ( $n, $w ): float {
			return round( $i / ( $n - 1 ) * $w, 2 );
		};
		$y = static function ( float $v ) use ( $top, $h ): float {
			return round( $h - ( $v / $top ) * $h, 2 );
		};
		$path = static function ( array $vals ) use ( $x, $y ): string {
			$d = '';
			foreach ( array_values( $vals ) as $i => $v ) {
				$d .= ( 0 === $i ? 'M' : 'L' ) . $x( $i ) . ' ' . $y( (float) $v );
			}
			return $d;
		};
		$cur_d  = $path( $cur );
		$area_d = $cur_d . 'L' . $w . ' ' . $h . 'L0 ' . $h . 'Z';
		$prev_d = count( $prev ) === $n ? $path( $prev ) : '';
		$last   = end( $cur );

		$payload = array(
			'dates'  => array_map(
				static function ( $d ) {
					return wp_date( 'D, M j', strtotime( $d . ' 12:00:00' ) );
				},
				$days
			),
			'pdates' => array_map(
				static function ( $d ) {
					return wp_date( 'M j', strtotime( $d . ' 12:00:00' ) );
				},
				$pday
			),
			'cur'    => array_values( $cur ),
			'prev'   => array_values( $prev ),
			'top'    => $top,
		);
		$fmt_day = static function ( string $d ): string {
			return wp_date( 'M j', strtotime( $d . ' 12:00:00' ) );
		};
		?>
		<figure class="npwp-ins__card npwp-ins-chart" data-npwp-chart="<?php echo esc_attr( wp_json_encode( $payload ) ); ?>">
			<figcaption class="npwp-ins-chart__head">
				<span class="npwp-ins__card-title"><?php echo esc_html( $title ); ?></span>
				<span class="npwp-ins-chart__legend">
					<span><i class="npwp-ins-chart__key is-cur" aria-hidden="true"></i><?php esc_html_e( 'This period', 'neo-pulse-wp' ); ?></span>
					<span><i class="npwp-ins-chart__key is-prev" aria-hidden="true"></i><?php esc_html_e( 'Previous period', 'neo-pulse-wp' ); ?></span>
				</span>
			</figcaption>
			<div class="npwp-ins-chart__body">
				<div class="npwp-ins-chart__y" aria-hidden="true">
					<span style="top:0%"><?php echo esc_html( self::ins_compact( $top ) ); ?></span>
					<span style="top:50%"><?php echo esc_html( self::ins_compact( $top / 2 ) ); ?></span>
					<span style="top:100%">0</span>
				</div>
				<div class="npwp-ins-chart__plot">
					<svg viewBox="0 0 <?php echo (int) $w; ?> <?php echo (int) $h; ?>" preserveAspectRatio="none" role="img" aria-label="<?php echo esc_attr( sprintf( /* translators: 1: chart title, 2: total */ __( '%1$s. Latest day: %2$s.', 'neo-pulse-wp' ), $title, number_format_i18n( (float) $last ) ) ); ?>">
						<line class="npwp-ins-chart__grid" x1="0" x2="<?php echo (int) $w; ?>" y1="0.5" y2="0.5" />
						<line class="npwp-ins-chart__grid" x1="0" x2="<?php echo (int) $w; ?>" y1="<?php echo (int) ( $h / 2 ); ?>" y2="<?php echo (int) ( $h / 2 ); ?>" />
						<line class="npwp-ins-chart__base" x1="0" x2="<?php echo (int) $w; ?>" y1="<?php echo (int) $h - 0.5; ?>" y2="<?php echo (int) $h - 0.5; ?>" />
						<?php if ( '' !== $prev_d ) : ?>
							<path class="npwp-ins-chart__prev" d="<?php echo esc_attr( $prev_d ); ?>" />
						<?php endif; ?>
						<path class="npwp-ins-chart__area" d="<?php echo esc_attr( $area_d ); ?>" />
						<path class="npwp-ins-chart__line" d="<?php echo esc_attr( $cur_d ); ?>" />
					</svg>
					<span class="npwp-ins-chart__dot" style="left:100%;top:<?php echo esc_attr( (string) round( $y( (float) $last ) / $h * 100, 2 ) ); ?>%" aria-hidden="true"></span>
					<span class="npwp-ins-chart__cross" aria-hidden="true"></span>
					<span class="npwp-ins-chart__hover-dot" aria-hidden="true"></span>
					<div class="npwp-ins-chart__tip" role="status" aria-live="polite"></div>
				</div>
				<div class="npwp-ins-chart__x" aria-hidden="true">
					<span><?php echo esc_html( $fmt_day( $days[0] ) ); ?></span>
					<span><?php echo esc_html( $fmt_day( $days[ intdiv( $n - 1, 2 ) ] ) ); ?></span>
					<span><?php echo esc_html( $fmt_day( $days[ $n - 1 ] ) ); ?></span>
				</div>
			</div>
			<details class="npwp-ins-chart__table">
				<summary><?php esc_html_e( 'Show as a table', 'neo-pulse-wp' ); ?></summary>
				<table class="npwp-ins__table">
					<thead><tr><th scope="col"><?php esc_html_e( 'Day', 'neo-pulse-wp' ); ?></th><th scope="col"><?php esc_html_e( 'This period', 'neo-pulse-wp' ); ?></th><th scope="col"><?php esc_html_e( 'Previous period', 'neo-pulse-wp' ); ?></th></tr></thead>
					<tbody>
						<?php foreach ( $days as $i => $day ) : ?>
							<tr><td><?php echo esc_html( $fmt_day( $day ) ); ?></td><td><?php echo esc_html( number_format_i18n( (float) $cur[ $i ] ) ); ?></td><td><?php echo esc_html( isset( $prev[ $i ] ) ? number_format_i18n( (float) $prev[ $i ] ) . ' (' . $fmt_day( $pday[ $i ] ) . ')' : '–' ); ?></td></tr>
						<?php endforeach; ?>
					</tbody>
				</table>
			</details>
		</figure>
		<?php
	}

	/**
	 * Horizontal bars, one measure, value at the tip.
	 *
	 * @param array<int,array{label:string,value:int|float,text:string,title?:string}> $rows
	 */
	private static function render_insights_bars( string $title, string $desc, array $rows ): void {
		$max = 0;
		foreach ( $rows as $row ) {
			$max = max( $max, (float) $row['value'] );
		}
		?>
		<section class="npwp-ins__card">
			<h3 class="npwp-ins__card-title"><?php echo esc_html( $title ); ?></h3>
			<p class="npwp-ins__card-desc"><?php echo esc_html( $desc ); ?></p>
			<?php if ( ! $rows || $max <= 0 ) : ?>
				<p class="npwp-ins__empty"><?php esc_html_e( 'No data for this period.', 'neo-pulse-wp' ); ?></p>
			<?php else : ?>
				<ul class="npwp-ins-bars">
					<?php foreach ( $rows as $row ) : ?>
						<li class="npwp-ins-bars__row"<?php echo ! empty( $row['title'] ) ? ' title="' . esc_attr( $row['label'] . ': ' . $row['title'] ) . '"' : ''; ?>>
							<span class="npwp-ins-bars__label"><?php echo esc_html( $row['label'] ); ?></span>
							<span class="npwp-ins-bars__track"><span class="npwp-ins-bars__bar" style="width:<?php echo esc_attr( (string) max( 0.5, round( (float) $row['value'] / $max * 100, 2 ) ) ); ?>%"></span></span>
							<span class="npwp-ins-bars__value"><?php echo esc_html( $row['text'] ); ?></span>
						</li>
					<?php endforeach; ?>
				</ul>
			<?php endif; ?>
		</section>
		<?php
	}

	/* ---------- Opportunities ---------- */

	private static function render_insights_opportunities( array $data, string $tab ): void {
		self::render_insights_header( $data, $tab, __( 'Opportunities', 'neo-pulse-wp' ), __( 'The quickest wins: keywords and pages that are close to earning more clicks.', 'neo-pulse-wp' ) );
		$near = $data['nearPageOne'];
		$low  = $data['lowCtrPages'];
		?>
		<section class="npwp-ins__card">
			<h3 class="npwp-ins__card-title"><?php esc_html_e( 'Almost on page one', 'neo-pulse-wp' ); ?></h3>
			<p class="npwp-ins__card-desc"><?php esc_html_e( 'Keywords at positions 8 to 20 that people search for often. A stronger page (better title, more on the topic, internal links) can move these onto the first page, where nearly all the clicks are.', 'neo-pulse-wp' ); ?></p>
			<?php if ( ! $near ) : ?>
				<p class="npwp-ins__empty"><?php esc_html_e( 'No keywords sitting just off page one in this period.', 'neo-pulse-wp' ); ?></p>
			<?php else : ?>
				<div class="npwp-ins__table-wrap">
					<table class="npwp-ins__table">
						<thead><tr>
							<th scope="col"><?php esc_html_e( 'Keyword', 'neo-pulse-wp' ); ?></th>
							<th scope="col" class="is-num"><?php esc_html_e( 'Position', 'neo-pulse-wp' ); ?></th>
							<th scope="col" class="is-num"><?php esc_html_e( 'Impressions', 'neo-pulse-wp' ); ?></th>
							<th scope="col" class="is-num"><?php esc_html_e( 'Clicks', 'neo-pulse-wp' ); ?></th>
							<th scope="col"><?php esc_html_e( 'Page Google shows', 'neo-pulse-wp' ); ?></th>
						</tr></thead>
						<tbody>
							<?php foreach ( $near as $row ) : ?>
								<tr>
									<td><?php echo esc_html( $row['key'] ); ?></td>
									<td class="is-num"><?php echo esc_html( number_format_i18n( $row['position'], 1 ) ); ?></td>
									<td class="is-num"><?php echo esc_html( number_format_i18n( $row['impressions'] ) ); ?></td>
									<td class="is-num"><?php echo esc_html( number_format_i18n( $row['clicks'] ) ); ?></td>
									<td><?php '' !== $row['page'] ? self::ins_page_cell( $row['page'] ) : print( '–' ); ?></td>
								</tr>
							<?php endforeach; ?>
						</tbody>
					</table>
				</div>
			<?php endif; ?>
		</section>

		<section class="npwp-ins__card">
			<h3 class="npwp-ins__card-title"><?php esc_html_e( 'Seen often, clicked rarely', 'neo-pulse-wp' ); ?></h3>
			<p class="npwp-ins__card-desc">
				<?php
				echo esc_html(
					sprintf(
						/* translators: %s: site click-through rate */
						__( 'Pages that show up in search a lot but get under half this site\'s usual click-through rate (%s). A clearer, more tempting SEO title and description usually fixes this.', 'neo-pulse-wp' ),
						self::ins_pct( $data['totals']['cur']['ctr'] )
					)
				);
				?>
			</p>
			<?php if ( ! $low ) : ?>
				<p class="npwp-ins__empty"><?php esc_html_e( 'No pages stand out in this period.', 'neo-pulse-wp' ); ?></p>
			<?php else : ?>
				<div class="npwp-ins__table-wrap">
					<table class="npwp-ins__table">
						<thead><tr>
							<th scope="col"><?php esc_html_e( 'Page', 'neo-pulse-wp' ); ?></th>
							<th scope="col" class="is-num"><?php esc_html_e( 'Impressions', 'neo-pulse-wp' ); ?></th>
							<th scope="col" class="is-num"><?php esc_html_e( 'Click-through', 'neo-pulse-wp' ); ?></th>
							<th scope="col" class="is-num"><?php esc_html_e( 'Position', 'neo-pulse-wp' ); ?></th>
							<th scope="col" class="is-num"><?php esc_html_e( 'Clicks missed', 'neo-pulse-wp' ); ?></th>
						</tr></thead>
						<tbody>
							<?php foreach ( $low as $row ) : ?>
								<tr>
									<td><?php self::ins_page_cell( $row['key'] ); ?></td>
									<td class="is-num"><?php echo esc_html( number_format_i18n( $row['impressions'] ) ); ?></td>
									<td class="is-num"><?php echo esc_html( self::ins_pct( $row['ctr'] ) ); ?></td>
									<td class="is-num"><?php echo esc_html( number_format_i18n( $row['position'], 1 ) ); ?></td>
									<td class="is-num" title="<?php esc_attr_e( 'Extra clicks this page would have had at the site\'s usual click-through rate.', 'neo-pulse-wp' ); ?>">~<?php echo esc_html( number_format_i18n( max( 0, $row['missed'] ) ) ); ?></td>
								</tr>
							<?php endforeach; ?>
						</tbody>
					</table>
				</div>
			<?php endif; ?>
		</section>
		<?php
	}

	/* ---------- Winners & losers ---------- */

	private static function render_insights_movers( array $data, string $tab ): void {
		self::render_insights_header( $data, $tab, __( 'Winners & losers', 'neo-pulse-wp' ), __( 'Biggest changes in clicks against the previous period.', 'neo-pulse-wp' ) );
		$groups = array(
			array( 'queries', 'up', __( 'Keywords gaining clicks', 'neo-pulse-wp' ) ),
			array( 'queries', 'down', __( 'Keywords losing clicks', 'neo-pulse-wp' ) ),
			array( 'pages', 'up', __( 'Pages gaining clicks', 'neo-pulse-wp' ) ),
			array( 'pages', 'down', __( 'Pages losing clicks', 'neo-pulse-wp' ) ),
		);
		echo '<div class="npwp-ins__grid2">';
		foreach ( $groups as $g ) {
			$rows = $data['movers'][ $g[0] ][ $g[1] ];
			?>
			<section class="npwp-ins__card">
				<h3 class="npwp-ins__card-title"><?php echo esc_html( $g[2] ); ?></h3>
				<?php if ( ! $rows ) : ?>
					<p class="npwp-ins__empty"><?php esc_html_e( 'Nothing to show for this period.', 'neo-pulse-wp' ); ?></p>
				<?php else : ?>
					<div class="npwp-ins__table-wrap">
						<table class="npwp-ins__table">
							<thead><tr>
								<th scope="col"><?php echo 'queries' === $g[0] ? esc_html__( 'Keyword', 'neo-pulse-wp' ) : esc_html__( 'Page', 'neo-pulse-wp' ); ?></th>
								<th scope="col" class="is-num"><?php esc_html_e( 'Clicks', 'neo-pulse-wp' ); ?></th>
								<th scope="col" class="is-num"><?php esc_html_e( 'Change', 'neo-pulse-wp' ); ?></th>
								<th scope="col" class="is-num"><?php esc_html_e( 'Position', 'neo-pulse-wp' ); ?></th>
							</tr></thead>
							<tbody>
								<?php foreach ( $rows as $row ) : ?>
									<tr>
										<td><?php 'pages' === $g[0] ? self::ins_page_cell( $row['key'] ) : print( esc_html( $row['key'] ) ); ?></td>
										<td class="is-num"><?php echo esc_html( number_format_i18n( $row['clicks'] ) ); ?></td>
										<td class="is-num"><span class="npwp-ins__delta <?php echo $row['change'] > 0 ? 'is-up' : 'is-down'; ?>"><?php echo esc_html( ( $row['change'] > 0 ? '↑ +' : '↓ −' ) . number_format_i18n( abs( $row['change'] ) ) ); ?></span></td>
										<td class="is-num"><?php echo null !== $row['position'] ? esc_html( number_format_i18n( (float) $row['position'], 1 ) ) : '–'; ?></td>
									</tr>
								<?php endforeach; ?>
							</tbody>
						</table>
					</div>
				<?php endif; ?>
			</section>
			<?php
		}
		echo '</div>';
	}

	/* ---------- Top keywords / pages ---------- */

	private static function render_insights_top( array $data, string $tab, string $which ): void {
		$is_q = 'queries' === $which;
		self::render_insights_header(
			$data,
			$tab,
			$is_q ? __( 'Top Queries', 'neo-pulse-wp' ) : __( 'Top Pages', 'neo-pulse-wp' ),
			$is_q ? __( 'The 50 keywords bringing the most clicks.', 'neo-pulse-wp' ) : __( 'The 50 pages getting the most clicks from search.', 'neo-pulse-wp' )
		);
		$rows = $is_q ? $data['topQueries'] : $data['topPages'];
		?>
		<section class="npwp-ins__card">
			<?php if ( ! $rows ) : ?>
				<p class="npwp-ins__empty"><?php esc_html_e( 'No data for this period.', 'neo-pulse-wp' ); ?></p>
			<?php else : ?>
				<div class="npwp-ins__table-wrap">
					<table class="npwp-ins__table">
						<thead><tr>
							<th scope="col"><?php echo $is_q ? esc_html__( 'Keyword', 'neo-pulse-wp' ) : esc_html__( 'Page', 'neo-pulse-wp' ); ?></th>
							<th scope="col" class="is-num"><?php esc_html_e( 'Clicks', 'neo-pulse-wp' ); ?></th>
							<th scope="col" class="is-num"><?php esc_html_e( 'Change', 'neo-pulse-wp' ); ?></th>
							<th scope="col" class="is-num"><?php esc_html_e( 'Impressions', 'neo-pulse-wp' ); ?></th>
							<th scope="col" class="is-num"><?php esc_html_e( 'Click-through', 'neo-pulse-wp' ); ?></th>
							<th scope="col" class="is-num"><?php esc_html_e( 'Position', 'neo-pulse-wp' ); ?></th>
						</tr></thead>
						<tbody>
							<?php foreach ( $rows as $row ) : ?>
								<tr>
									<td><?php $is_q ? print( esc_html( $row['key'] ) ) : self::ins_page_cell( $row['key'] ); ?></td>
									<td class="is-num"><?php echo esc_html( number_format_i18n( $row['clicks'] ) ); ?></td>
									<td class="is-num"><?php echo self::ins_delta( $row['clicks'], $row['prevClicks'] ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?></td>
									<td class="is-num"><?php echo esc_html( number_format_i18n( $row['impressions'] ) ); ?></td>
									<td class="is-num"><?php echo esc_html( self::ins_pct( $row['ctr'] ) ); ?></td>
									<td class="is-num"><?php echo esc_html( number_format_i18n( $row['position'], 1 ) ); ?></td>
								</tr>
							<?php endforeach; ?>
						</tbody>
					</table>
				</div>
			<?php endif; ?>
		</section>
		<?php
	}

	/* ---------- Hover layer for the trend charts ---------- */

	private static function print_insights_script(): void {
		if ( self::$insights_script_printed ) {
			return;
		}
		self::$insights_script_printed = true;
		$labels = array(
			'cur'  => __( 'This period', 'neo-pulse-wp' ),
			'prev' => __( 'Previous', 'neo-pulse-wp' ),
		);
		?>
		<script>
		(function () {
			var L = <?php echo wp_json_encode( $labels ); ?>;
			var nf = new Intl.NumberFormat();
			document.querySelectorAll('[data-npwp-chart]').forEach(function (fig) {
				var d; try { d = JSON.parse(fig.getAttribute('data-npwp-chart')); } catch (e) { return; }
				var plot = fig.querySelector('.npwp-ins-chart__plot');
				var cross = fig.querySelector('.npwp-ins-chart__cross');
				var dot = fig.querySelector('.npwp-ins-chart__hover-dot');
				var tip = fig.querySelector('.npwp-ins-chart__tip');
				var n = d.cur.length;
				if (!plot || n < 2) { return; }
				function show(i) {
					var x = i / (n - 1) * 100, y = 100 - d.cur[i] / d.top * 100;
					cross.style.left = x + '%'; dot.style.left = x + '%'; dot.style.top = y + '%';
					var row = function (cls, label, v) { var r = document.createElement('div'); r.className = 'npwp-ins-chart__tip-row ' + cls; var a = document.createElement('span'); a.textContent = label; var b = document.createElement('strong'); b.textContent = v; r.appendChild(a); r.appendChild(b); return r; };
					tip.textContent = '';
					var h = document.createElement('div'); h.className = 'npwp-ins-chart__tip-date'; h.textContent = d.dates[i]; tip.appendChild(h);
					tip.appendChild(row('is-cur', L.cur, nf.format(d.cur[i])));
					if (d.prev.length === n) { tip.appendChild(row('is-prev', L.prev + ' (' + d.pdates[i] + ')', nf.format(d.prev[i]))); }
					tip.style.left = x + '%';
					tip.classList.toggle('is-left', x > 60);
					fig.classList.add('is-hover');
				}
				function at(clientX) {
					var r = plot.getBoundingClientRect();
					return Math.max(0, Math.min(n - 1, Math.round((clientX - r.left) / r.width * (n - 1))));
				}
				plot.addEventListener('pointermove', function (e) { show(at(e.clientX)); });
				plot.addEventListener('pointerleave', function () { fig.classList.remove('is-hover'); });
				plot.tabIndex = 0;
				var cur = n - 1;
				plot.addEventListener('focus', function () { show(cur); });
				plot.addEventListener('blur', function () { fig.classList.remove('is-hover'); });
				plot.addEventListener('keydown', function (e) {
					if (e.key === 'ArrowLeft') { cur = Math.max(0, cur - 1); show(cur); e.preventDefault(); }
					if (e.key === 'ArrowRight') { cur = Math.min(n - 1, cur + 1); show(cur); e.preventDefault(); }
				});
			});
		})();
		</script>
		<?php
	}
}
