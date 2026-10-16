<?php
/**
 * Neo EMCP Themer — PHP Templates review + edit page.
 *
 * @package EMCP_Tools
 * @var array      $templates List of summaries.
 * @var array|null $detail    Full record when viewing one.
 * @var array|false $notice   One-shot { type, message } notice, or false.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}
?>
<div class="wrap emcp-themer-php-wrap">
	<h1><?php esc_html_e( 'Neo EMCP Themer, PHP Templates', 'emcp-tools' ); ?></h1>
	<p class="description">
		<?php esc_html_e( 'PHP templates authored via MCP. Review and edit the code, then attach one to a template on its edit screen (Display Conditions box → “Render with PHP template”). A template only runs once attached.', 'emcp-tools' ); ?>
	</p>

	<?php if ( is_array( $notice ) && ! empty( $notice['message'] ) ) : ?>
		<div class="notice notice-<?php echo 'error' === ( $notice['type'] ?? '' ) ? 'error' : 'success'; ?> is-dismissible">
			<p><?php echo esc_html( $notice['message'] ); ?></p>
		</div>
	<?php endif; ?>

	<?php if ( is_array( $detail ) && ! isset( $detail['error'] ) ) : ?>
		<?php
		$val         = $detail['validation'];
		$has_finding = ! empty( $val['findings'] );
		$save_url    = admin_url( 'admin-post.php' );
		?>
		<h2 style="margin-bottom:6px;">
			<?php echo esc_html( $detail['title'] ); ?>
			<code><?php echo esc_html( $detail['type'] ); ?></code>
			<?php if ( ! empty( $detail['compiled'] ) ) : ?>
				<span class="dashicons dashicons-yes-alt" style="color:#008a20;" title="<?php esc_attr_e( 'Compiled (attached to a template)', 'emcp-tools' ); ?>"></span>
			<?php endif; ?>
		</h2>

		<?php if ( ! empty( $detail['last_error'] ) ) : ?>
			<div class="notice notice-warning inline" style="margin:6px 0;"><p><strong><?php esc_html_e( 'Last runtime error:', 'emcp-tools' ); ?></strong> <?php echo esc_html( $detail['last_error'] ); ?></p></div>
		<?php endif; ?>

		<?php
		$emcp_sum = EMCP_Tools_PHP_Snippet_Validator::summary( (array) $val );
		// The box used to be red for ANY finding, so one routine note made a
		// healthy template look broken. Match the colour to the verdict instead.
		if ( $emcp_sum['blocked'] ) {
			$emcp_box = 'notice-error';
		} elseif ( $emcp_sum['counts']['warning'] > 0 ) {
			$emcp_box = 'notice-warning';
		} else {
			$emcp_box = 'notice-info';
		}
		$emcp_labels = array(
			'critical' => __( 'Must change', 'emcp-tools' ),
			'warning'  => __( 'Worth a read', 'emcp-tools' ),
			'notice'   => __( 'Note', 'emcp-tools' ),
		);
		?>
		<?php if ( $has_finding ) : ?>
			<div class="notice <?php echo esc_attr( $emcp_box ); ?> inline" style="margin:6px 0;">
				<p>
					<strong><?php echo esc_html( $emcp_sum['headline'] ); ?></strong>
					<?php echo esc_html( $emcp_sum['detail'] ); ?>
				</p>
				<ul style="margin:.2em 0 .4em 1.4em;list-style:disc;">
				<?php foreach ( $val['findings'] as $f ) : ?>
					<?php $emcp_sev = (string) ( $f['severity'] ?? 'notice' ); ?>
					<li>
						<strong><?php echo esc_html( $emcp_labels[ $emcp_sev ] ?? $emcp_sev ); ?></strong><?php echo $f['line'] ? esc_html( ' · line ' . (int) $f['line'] ) : ''; ?>:
						<?php echo esc_html( $f['message'] ); ?>
					</li>
				<?php endforeach; ?>
				</ul>
			</div>
		<?php else : ?>
			<p style="color:#008a20;margin:6px 0;">&#10003; <?php esc_html_e( 'Nothing flagged.', 'emcp-tools' ); ?></p>
		<?php endif; ?>

		<form method="post" action="<?php echo esc_url( $save_url ); ?>" class="emcp-themer-php-editor">
			<input type="hidden" name="action" value="emcp_themer_php_save">
			<input type="hidden" name="template_id" value="<?php echo (int) $detail['template_id']; ?>">
			<?php wp_nonce_field( 'emcp_themer_php_save_' . (int) $detail['template_id'] ); ?>

			<?php
			$type_labels = array(
				'header'  => __( 'Header', 'emcp-tools' ),
				'footer'  => __( 'Footer', 'emcp-tools' ),
				'single'  => __( 'Single (post/page)', 'emcp-tools' ),
				'archive' => __( 'Archive', 'emcp-tools' ),
				'any'     => __( 'Any type', 'emcp-tools' ),
			);
			?>
			<div style="display:flex;gap:28px;flex-wrap:wrap;align-items:flex-start;">
				<p style="margin-top:0;">
					<label for="emcp-themer-php-title"><strong><?php esc_html_e( 'Title', 'emcp-tools' ); ?></strong></label><br>
					<input type="text" id="emcp-themer-php-title" name="title" class="regular-text" value="<?php echo esc_attr( $detail['title'] ); ?>">
				</p>
				<p style="margin-top:0;">
					<label for="emcp-themer-php-type"><strong><?php esc_html_e( 'Type', 'emcp-tools' ); ?></strong></label><br>
					<select id="emcp-themer-php-type" name="type">
						<?php foreach ( EMCP_Tools_Themer_PHP_Store::TYPES as $t ) : ?>
							<option value="<?php echo esc_attr( $t ); ?>" <?php selected( $detail['type'], $t ); ?>><?php echo esc_html( $type_labels[ $t ] ?? ucfirst( $t ) ); ?></option>
						<?php endforeach; ?>
					</select>
					<br><span class="description"><?php esc_html_e( 'Which Themer region this can be attached to. “Any type” matches every template type.', 'emcp-tools' ); ?></span>
				</p>
			</div>

			<p><label for="emcp-themer-php-code"><strong><?php esc_html_e( 'Template code', 'emcp-tools' ); ?></strong></label></p>
			<textarea id="emcp-themer-php-code" name="code" rows="20" class="large-text code" spellcheck="false" style="width:100%;font-family:Consolas,Monaco,monospace;"><?php echo esc_textarea( $detail['code'] ); ?></textarea>
			<p class="description">
				<?php esc_html_e( 'Emit markup with echo/heredoc, a closing PHP tag is not allowed. eval/exec/include, network calls and file writes are rejected on save. If this template is attached, saving re-validates and recompiles it.', 'emcp-tools' ); ?>
			</p>

			<p class="submit" style="margin-top:8px;">
				<button type="submit" class="button button-primary"><?php esc_html_e( 'Save changes', 'emcp-tools' ); ?></button>
				<a class="button" href="<?php echo esc_url( add_query_arg( array( 'post_type' => EMCP_Tools_Themer_CPT::POST_TYPE, 'page' => 'emcp-themer-php' ), admin_url( 'edit.php' ) ) ); ?>">&laquo; <?php esc_html_e( 'Back to list', 'emcp-tools' ); ?></a>
			</p>
		</form>
	<?php else : ?>
		<table class="widefat striped">
			<thead><tr>
				<th><?php esc_html_e( 'Title', 'emcp-tools' ); ?></th>
				<th><?php esc_html_e( 'Type', 'emcp-tools' ); ?></th>
				<th><?php esc_html_e( 'Compiled', 'emcp-tools' ); ?></th>
				<th><?php esc_html_e( 'Last error', 'emcp-tools' ); ?></th>
				<th></th>
			</tr></thead>
			<tbody>
			<?php if ( empty( $templates ) ) : ?>
				<tr><td colspan="5"><?php esc_html_e( 'No PHP templates yet. Ask your AI agent to create one with create-theme-php-template.', 'emcp-tools' ); ?></td></tr>
			<?php else : ?>
				<?php foreach ( $templates as $t ) : ?>
					<tr>
						<td><a href="<?php echo esc_url( add_query_arg( array( 'post_type' => EMCP_Tools_Themer_CPT::POST_TYPE, 'page' => 'emcp-themer-php', 'view' => (int) $t['template_id'] ), admin_url( 'edit.php' ) ) ); ?>"><?php echo esc_html( $t['title'] ); ?></a></td>
						<td><code><?php echo esc_html( $t['type'] ); ?></code></td>
						<td><?php echo $t['compiled'] ? '&#10003;' : '&mdash;'; ?></td>
						<td><?php echo esc_html( $t['last_error'] ); ?></td>
						<td>
							<a class="button button-small" href="<?php echo esc_url( add_query_arg( array( 'post_type' => EMCP_Tools_Themer_CPT::POST_TYPE, 'page' => 'emcp-themer-php', 'view' => (int) $t['template_id'] ), admin_url( 'edit.php' ) ) ); ?>"><?php esc_html_e( 'Edit', 'emcp-tools' ); ?></a>
							<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" style="display:inline" onsubmit="return confirm('<?php echo esc_js( __( 'Delete this PHP template?', 'emcp-tools' ) ); ?>');">
								<input type="hidden" name="action" value="emcp_themer_php_delete">
								<input type="hidden" name="template_id" value="<?php echo (int) $t['template_id']; ?>">
								<?php wp_nonce_field( 'emcp_themer_php_delete_' . (int) $t['template_id'] ); ?>
								<button type="submit" class="button-link delete" style="color:#b32d2e;"><?php esc_html_e( 'Delete', 'emcp-tools' ); ?></button>
							</form>
						</td>
					</tr>
				<?php endforeach; ?>
			<?php endif; ?>
			</tbody>
		</table>
	<?php endif; ?>
</div>
