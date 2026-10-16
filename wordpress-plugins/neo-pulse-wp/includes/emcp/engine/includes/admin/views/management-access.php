<?php
/** Local access policy; rendered with $policy, $actor and $users. @package EMCP_Tools */
if ( ! defined( 'ABSPATH' ) ) { exit; }
$locked = 'config' === ( $policy['source'] ?? '' );
?>
<div class="eui-screen emcp-management-access">
	<header class="eui-page-header">
		<div class="eui-page-header__main">
			<h1 class="eui-page-header__title"><?php esc_html_e( 'Management access', 'emcp-tools' ); ?></h1>
			<p class="eui-page-header__desc"><?php esc_html_e( 'Choose which WordPress administrators can manage Neo EMCP and its settings on this site.', 'emcp-tools' ); ?></p>
		</div>
	</header>

	<div class="emcp-mgmt-grid">
		<section class="eui-card emcp-mgmt-card">
			<div class="emcp-mgmt-card__header">
				<h2 class="emcp-mgmt-card__title"><?php esc_html_e( 'Site management policy', 'emcp-tools' ); ?></h2>
				<span class="eui-badge eui-badge--success"><?php echo esc_html( sprintf( /* translators: 1: WordPress login, 2: user ID. */ __( 'Active user: %1$s (ID %2$d)', 'emcp-tools' ), $actor->user_login, $actor->ID ) ); ?></span>
			</div>
			<p class="emcp-mgmt-card__sub"><?php esc_html_e( 'MCP calls use the WordPress account that authorized their credentials. This local management policy controls who can configure Neo EMCP in wp-admin.', 'emcp-tools' ); ?></p>

			<?php if ( $locked ) : ?>
				<div class="emcp-mgmt-banner emcp-mgmt-banner--info"><p><?php esc_html_e( 'This policy is set by EMCP_TOOLS_MANAGEMENT_ADMINS in wp-config.php, which overrides the setting saved here. Change or remove the constant to edit it.', 'emcp-tools' ); ?></p></div>
				<?php
				$not_admins = array_values( array_filter( $policy['users'], static fn( $id ) => ! user_can( $id, 'manage_options' ) ) );
				if ( $not_admins ) :
					?>
					<div class="emcp-mgmt-banner emcp-mgmt-banner--warn"><p><?php echo esc_html( sprintf( /* translators: %s: user IDs. */ __( 'These IDs in wp-config.php are not current administrators and get no access: %s', 'emcp-tools' ), implode( ', ', $not_admins ) ) ); ?></p></div>
				<?php endif; ?>
			<?php endif; ?>
			<?php if ( '1' === ( $_GET['saved'] ?? '' ) ) : ?>
				<div class="emcp-mgmt-banner emcp-mgmt-banner--ok" role="status"><p><?php esc_html_e( 'Management access saved.', 'emcp-tools' ); ?></p></div>
			<?php endif; ?>

			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" class="emcp-mgmt-form">
				<input type="hidden" name="action" value="<?php echo esc_attr( EMCP_Tools_Management_Access_Admin::ACTION ); ?>">
				<input type="hidden" name="version" value="<?php echo (int) $policy['version']; ?>">
				<?php wp_nonce_field( EMCP_Tools_Management_Access_Admin::ACTION ); ?>
				<fieldset class="emcp-mgmt-fieldset" <?php disabled( $locked ); ?>>
					<div class="emcp-mgmt-field-group">
						<span class="eui-field__label"><?php esc_html_e( 'Who can manage Neo EMCP?', 'emcp-tools' ); ?></span>
						<div class="emcp-mgmt-radios">
							<label class="emcp-mgmt-choice">
								<input type="radio" name="mode" value="all_admins" <?php checked( $policy['mode'], 'all_admins' ); ?>>
								<span><?php esc_html_e( 'All current administrators (default)', 'emcp-tools' ); ?></span>
							</label>
							<label class="emcp-mgmt-choice">
								<input type="radio" name="mode" value="allowlist" <?php checked( $policy['mode'], 'allowlist' ); ?>>
								<span><?php esc_html_e( 'Only the listed administrators', 'emcp-tools' ); ?></span>
							</label>
						</div>
					</div>

					<div class="emcp-mgmt-field-group">
						<label class="eui-field__label" for="emcp-management-users"><?php esc_html_e( 'Administrator user IDs', 'emcp-tools' ); ?></label>
						<input id="emcp-management-users" name="users" type="text" class="eui-input emcp-mgmt-input" maxlength="2000" placeholder="<?php esc_attr_e( 'e.g. 1, 5', 'emcp-tools' ); ?>" aria-describedby="emcp-management-users-help" value="<?php echo esc_attr( implode( ', ', $policy['users'] ?: array( (int) $actor->ID ) ) ); ?>">
						<p id="emcp-management-users-help" class="eui-field__help"><?php esc_html_e( 'Separate IDs with commas. Up to 100 managers. Keep your own ID in the list. Each account must retain administrator permissions. Ignored when all administrators are allowed.', 'emcp-tools' ); ?></p>
					</div>

					<label class="emcp-mgmt-choice emcp-mgmt-choice--confirm">
						<input type="checkbox" name="confirm" value="1" required>
						<span><?php esc_html_e( 'I confirm this site-local management policy.', 'emcp-tools' ); ?></span>
					</label>
				</fieldset>
				<?php if ( ! $locked ) : ?>
					<div class="emcp-mgmt-actions">
						<button type="submit" class="eui-btn eui-btn--primary"><?php esc_html_e( 'Save management access', 'emcp-tools' ); ?></button>
					</div>
				<?php endif; ?>
			</form>
		</section>

		<section class="eui-card emcp-mgmt-card">
			<div class="emcp-mgmt-card__header">
				<h2 class="emcp-mgmt-card__title"><?php esc_html_e( 'Administrator directory', 'emcp-tools' ); ?></h2>
				<span class="eui-badge"><?php echo (int) count( $users ); ?></span>
			</div>
			<p class="emcp-mgmt-card__sub"><?php esc_html_e( 'The first 100 administrator accounts are shown below. A Multisite super administrator must also be listed when the allowlist is active.', 'emcp-tools' ); ?></p>
			<div class="emcp-mgmt-table-wrap">
				<table class="emcp-mgmt-table">
					<caption class="screen-reader-text"><?php esc_html_e( 'Administrator account IDs', 'emcp-tools' ); ?></caption>
					<thead>
						<tr>
							<th scope="col"><?php esc_html_e( 'User ID', 'emcp-tools' ); ?></th>
							<th scope="col"><?php esc_html_e( 'WordPress login', 'emcp-tools' ); ?></th>
						</tr>
					</thead>
					<tbody>
						<?php foreach ( $users as $user ) : ?>
							<tr>
								<td class="emcp-mgmt-table__id"><?php echo (int) $user->ID; ?></td>
								<td class="emcp-mgmt-table__login"><?php echo esc_html( $user->user_login ); ?></td>
							</tr>
						<?php endforeach; ?>
					</tbody>
				</table>
			</div>
		</section>

		<section class="eui-card emcp-mgmt-card">
			<div class="emcp-mgmt-card__header">
				<h2 class="emcp-mgmt-card__title"><?php esc_html_e( 'Recovery and limits', 'emcp-tools' ); ?></h2>
			</div>
			<p class="emcp-mgmt-card__sub"><?php esc_html_e( 'If all listed managers are deleted or demoted, a host operator can recover with WP-CLI using a current administrator account:', 'emcp-tools' ); ?></p>
			<pre class="eui-code emcp-mgmt-code"><code>wp emcp management-access recover --user=ADMIN_ID --confirm</code></pre>
			<p class="emcp-mgmt-card__sub"><?php esc_html_e( 'To lock the allowlist in wp-config.php instead, add one of these lines:', 'emcp-tools' ); ?></p>
			<pre class="eui-code emcp-mgmt-code"><code>define( 'EMCP_TOOLS_MANAGEMENT_ADMINS', '1,5' );
define( 'EMCP_TOOLS_MANAGEMENT_ADMINS', 'all' );</code></pre>
		</section>
	</div>
</div>
