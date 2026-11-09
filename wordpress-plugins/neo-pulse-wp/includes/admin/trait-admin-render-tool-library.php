<?php
/**
 * Tool Library admin page: MCP / agent tool dictionary.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Admin_Trait_Render_Tool_Library {

	public static function render_tool_library_page(): void {
		if ( ! current_user_can( 'edit_posts' ) ) {
			wp_die( esc_html__( 'You do not have permission to view this page.', 'neo-pulse-wp' ) );
		}

		$grouped    = Neo_Pulse_Wp_Tools_Library::get_entries_by_category();
		$tool_count = Neo_Pulse_Wp_Tools_Library::tool_count();
		$version    = Neo_Pulse_Wp_Tools::VERSION;
		self::neo_pulse_group_shell_open( 'neo-pulse-wp-tool-library', 'neo-pulse-wp-panel-page neo-pulse-wp-tool-library' );
		self::panel_page_header(
				__( 'Reference for all agent tools exposed via MCP and the NEO Pulse tools REST API. Use these names in Cursor, Claude Desktop, or custom automations.', 'neo-pulse-wp' )
			); ?>

			<div class="neo-pulse-wp-tool-library__toolbar">
				<label class="screen-reader-text" for="neo-pulse-tool-library-search"><?php esc_html_e( 'Search tools', 'neo-pulse-wp' ); ?></label>
				<input type="search" id="neo-pulse-tool-library-search" class="neo-pulse-wp-tool-library__search" placeholder="<?php esc_attr_e( 'Search by name or description…', 'neo-pulse-wp' ); ?>" autocomplete="off" />
				<p class="neo-pulse-wp-tool-library__meta">
					<?php
					printf(
						/* translators: 1: tool count, 2: API version */
						esc_html__( '%1$d tools · API version %2$s · Execute via', 'neo-pulse-wp' ),
						(int) $tool_count,
						esc_html( (string) $version )
					);
					?>
					<code>POST /wp-json/neo-pulse/v1/tools/execute</code>
				</p>
			</div>

			<div class="neo-pulse-wp-tool-library__legend" aria-hidden="true">
				<span class="neo-pulse-wp-tool-library__risk neo-pulse-wp-tool-library__risk--read"><?php esc_html_e( 'read', 'neo-pulse-wp' ); ?></span>
				<span class="neo-pulse-wp-tool-library__risk neo-pulse-wp-tool-library__risk--write"><?php esc_html_e( 'write', 'neo-pulse-wp' ); ?></span>
				<span class="neo-pulse-wp-tool-library__risk neo-pulse-wp-tool-library__risk--destructive"><?php esc_html_e( 'destructive', 'neo-pulse-wp' ); ?></span>
				<span class="neo-pulse-wp-tool-library__confirm-hint"><?php esc_html_e( 'confirm: true required on marked tools', 'neo-pulse-wp' ); ?></span>
			</div>

			<div class="neo-pulse-wp-tool-library__mcp">
				<h2 class="neo-pulse-wp-tool-library__mcp-title"><?php esc_html_e( 'MCP setup (Cursor)', 'neo-pulse-wp' ); ?></h2>
				<p><?php esc_html_e( 'Use a WordPress Application Password. OpenRouter and other secrets stay on the server.', 'neo-pulse-wp' ); ?></p>
				<pre class="neo-pulse-wp-tool-library__code"><code>{
  "mcpServers": {
    "neo-pulse-wp": {
      "command": "npx",
      "args": ["-y", "@neo-pulse/neo-pulse-wp-mcp"],
      "env": {
        "WP_URL": "<?php echo esc_html( home_url( '/' ) ); ?>",
        "WP_APP_USER": "your-username",
        "WP_APP_PASSWORD": "your-application-password"
      }
    }
  }
}</code></pre>
			</div>

			<?php foreach ( $grouped as $cat_slug => $entries ) : ?>
				<?php if ( empty( $entries ) ) { continue; } ?>
				<section class="neo-pulse-wp-tool-library__section" data-category="<?php echo esc_attr( $cat_slug ); ?>">
					<h2 class="neo-pulse-wp-tool-library__section-title">
						<?php echo esc_html( Neo_Pulse_Wp_Tools_Library::get_categories()[ $cat_slug ] ?? $cat_slug ); ?>
						<span class="neo-pulse-wp-tool-library__section-count"><?php echo (int) count( $entries ); ?></span>
					</h2>
					<div class="neo-pulse-wp-tool-library__grid">
						<?php foreach ( $entries as $tool ) : ?>
							<?php self::render_tool_library_card( $tool ); ?>
						<?php endforeach; ?>
					</div>
				</section>
			<?php endforeach; ?>

			<p class="neo-pulse-wp-tool-library__empty" id="neo-pulse-tool-library-empty" hidden>
				<?php esc_html_e( 'No tools match your search.', 'neo-pulse-wp' ); ?>
			</p>

		<script>
		(function () {
			var input = document.getElementById('neo-pulse-tool-library-search');
			var empty = document.getElementById('neo-pulse-tool-library-empty');
			if (!input) return;
			input.addEventListener('input', function () {
				var q = (input.value || '').toLowerCase().trim();
				var any = false;
				document.querySelectorAll('.neo-pulse-wp-tool-library__card').forEach(function (card) {
					var hay = (card.getAttribute('data-search') || '').toLowerCase();
					var show = !q || hay.indexOf(q) !== -1;
					card.hidden = !show;
					if (show) any = true;
				});
				document.querySelectorAll('.neo-pulse-wp-tool-library__section').forEach(function (sec) {
					var visible = sec.querySelectorAll('.neo-pulse-wp-tool-library__card:not([hidden])').length;
					sec.hidden = visible === 0;
				});
				if (empty) empty.hidden = any || !q;
			});
		})();
		</script>
		<?php
		self::neo_pulse_group_shell_close();
	}

	/**
	 * @param array<string, mixed> $tool Tool entry.
	 */
	private static function render_tool_library_card( array $tool ): void {
		$risk   = isset( $tool['risk'] ) ? (string) $tool['risk'] : 'read';
		$search = strtolower(
			$tool['name'] . ' ' . $tool['description'] . ' ' . $tool['summary'] . ' ' . implode( ' ', array_keys( (array) $tool['params'] ) )
		);
		?>
		<article class="neo-pulse-wp-tool-library__card" data-search="<?php echo esc_attr( $search ); ?>">
			<header class="neo-pulse-wp-tool-library__card-head">
				<code class="neo-pulse-wp-tool-library__name"><?php echo esc_html( $tool['name'] ); ?></code>
				<span class="neo-pulse-wp-tool-library__risk neo-pulse-wp-tool-library__risk--<?php echo esc_attr( $risk ); ?>"><?php echo esc_html( $risk ); ?></span>
			</header>
			<p class="neo-pulse-wp-tool-library__desc"><?php echo esc_html( $tool['summary'] ); ?></p>
			<dl class="neo-pulse-wp-tool-library__meta-dl">
				<div>
					<dt><?php esc_html_e( 'Capability', 'neo-pulse-wp' ); ?></dt>
					<dd><code><?php echo esc_html( (string) $tool['capability'] ); ?></code></dd>
				</div>
				<?php if ( ! empty( $tool['requires_confirm'] ) ) : ?>
					<div>
						<dt><?php esc_html_e( 'Confirm', 'neo-pulse-wp' ); ?></dt>
						<dd><code>confirm: true</code></dd>
					</div>
				<?php endif; ?>
			</dl>
			<?php if ( ! empty( $tool['params'] ) && is_array( $tool['params'] ) ) : ?>
				<details class="neo-pulse-wp-tool-library__params">
					<summary><?php esc_html_e( 'Parameters', 'neo-pulse-wp' ); ?></summary>
					<dl class="neo-pulse-wp-tool-library__params-dl">
						<?php foreach ( $tool['params'] as $param => $help ) : ?>
							<div>
								<dt><code><?php echo esc_html( (string) $param ); ?></code></dt>
								<dd><?php echo esc_html( (string) $help ); ?></dd>
							</div>
						<?php endforeach; ?>
					</dl>
				</details>
			<?php endif; ?>
			<?php if ( ! empty( $tool['example'] ) ) : ?>
				<details class="neo-pulse-wp-tool-library__example">
					<summary><?php esc_html_e( 'Example', 'neo-pulse-wp' ); ?></summary>
					<pre><code><?php echo esc_html( (string) $tool['example'] ); ?></code></pre>
				</details>
			<?php endif; ?>
		</article>
		<?php
	}
}
