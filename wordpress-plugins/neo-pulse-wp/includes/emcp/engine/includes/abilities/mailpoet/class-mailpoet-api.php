<?php
/**
 * The only class that touches MailPoet (spec 4.3): its public MP v1 API, its internal services
 * from the DI container, its JSON endpoints and REST routes in-process (D2), the automation hold
 * and the drain of its deferred subscriber events (D5), statement capture (D7), Doctrine's
 * identity map (D8), an object's rows for versions and before-images (D12), direct row writes for
 * undo and recovery, and the cancelling transaction for a scheduled send (D17).
 *
 * Rows are keyed by the real table name without the WordPress prefix (mailpoet_subscribers, posts,
 * postmeta), each row by its primary key ("a:b" for composite keys). Keys starting with # are
 * synthetic (digests) and never written back.
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

if ( ! class_exists( 'EMCP_Tools_Query_Capture' ) ) {
	require_once dirname( __DIR__ ) . '/class-query-capture.php';
}

/** @since 3.19.0 */
class EMCP_Tools_MailPoet_Api {

	/** MailPoet internals the adapter needs (D19): class => methods. */
	const REQUIRED = array(
		'MailPoet\API\MP\v1\API'                         => array( 'addSubscriber', 'subscribeToLists', 'unsubscribeFromLists', 'unsubscribe', 'addList', 'updateList', 'deleteList', 'addTag', 'updateTag', 'deleteTag', 'tagSubscriber', 'untagSubscriber', 'addSubscriberField' ),
		'MailPoet\Subscribers\SubscriberSaveController'  => array( 'createOrUpdate' ),
		'MailPoet\Subscribers\SubscribersRepository'     => array( 'bulkDelete' ),
		'MailPoet\API\JSON\v1\Newsletters'               => array( 'create', 'save', 'sendPreview' ),
		'MailPoet\API\JSON\v1\SendingQueue'              => array( 'add', 'pause', 'resume' ),
		'MailPoet\Config\SubscriberChangesNotifier'      => array( 'notify' ),
		'MailPoet\Automation\Engine\Integration\Trigger' => array(),
	);
	const NOTIFIER       = 'MailPoet\Config\SubscriberChangesNotifier';
	const TRIGGER        = 'MailPoet\Automation\Engine\Integration\Trigger';
	/** The notifier's private lists and the hook each fires, in notify() order (D5). */
	const NOTIFIER_LISTS = array(
		'created' => array( 'createdSubscriberIds', 'mailpoet_subscriber_created' ),
		'updated' => array( 'updatedSubscriberIds', 'mailpoet_subscriber_updated' ),
		'status'  => array( 'statusChangedSubscriberIds', 'mailpoet_subscriber_status_changed' ),
	);
	/** MailPoet-owned callbacks on trigger hooks that are not automations (D5); checked live by the smoke. */
	const KNOWN_LISTENERS = array();
	/** Columns MailPoet changes on its own (D12). */
	const VOLATILE = array( 'updated_at', 'last_engagement_at', 'last_sending_at', 'last_open_at', 'last_click_at', 'last_purchase_at', 'last_page_view_at', 'engagement_score', 'engagement_score_updated_at', 'average_engagement_score', 'average_engagement_score_updated_at', 'segments_count' );
	/** Consent evidence EMCP never writes (D9). */
	const CONSENT = array( 'source', 'subscribed_ip', 'confirmed_ip', 'confirmed_at', 'tracking_consent_method', 'tracking_consent_copy' );
	/** Setting keys that never leave the adapter (credentials). */
	const SECRETS = array( 'password', 'login', 'api_key', 'mailpoet_api_key', 'secret_key', 'access_key', 'key', 'token' );
	/** Statement capture scope (D7). */
	const SCOPE = array( 'prefix' => 'mailpoet_', 'tables' => array( 'posts', 'postmeta' ) );
	const STATUSES = array( 'subscribed', 'unconfirmed', 'unsubscribed', 'bounced', 'inactive' );
	const SYSTEM_LISTS = array( 'wp_users', 'woocommerce_users' );

	/** @var int wp_mail() calls seen since the counter was installed. */
	private static $mails = 0;
	private static $counting = false;

	// Environment.

	public function active(): bool {
		return defined( 'MAILPOET_VERSION' ) && class_exists( '\MailPoet\API\MP\v1\API' );
	}

	public function version_string(): string {
		return defined( 'MAILPOET_VERSION' ) ? (string) MAILPOET_VERSION : '';
	}

	protected function symbol_exists( string $class, string $method = '' ): bool {
		if ( '' === $method ) {
			return class_exists( $class ) || interface_exists( $class );
		}
		return method_exists( $class, $method );
	}

	/** MailPoet 5.x with every pinned internal present (D19). */
	public function supported(): bool {
		$v = $this->version_string();
		if ( ! $this->active() || version_compare( $v, '5.0', '<' ) || version_compare( $v, '6.0', '>=' ) ) {
			return false;
		}
		foreach ( self::REQUIRED as $class => $methods ) {
			if ( ! $this->symbol_exists( $class ) ) {
				return false;
			}
			foreach ( $methods as $m ) {
				if ( ! $this->symbol_exists( $class, $m ) ) {
					return false;
				}
			}
		}
		return true;
	}

	public function can( string $cap ): bool {
		return current_user_can( $cap );
	}

	/** Removes credentials from a settings value. */
	protected static function strip_secrets( string $key, $value ) {
		if ( ! is_array( $value ) ) {
			return in_array( $key, self::SECRETS, true ) ? null : $value;
		}
		$out = array();
		foreach ( $value as $k => $v ) {
			if ( in_array( (string) $k, self::SECRETS, true ) || false !== stripos( (string) $k, 'password' ) || false !== stripos( (string) $k, 'secret' ) ) {
				continue;
			}
			$out[ $k ] = is_array( $v ) ? self::strip_secrets( (string) $k, $v ) : $v;
		}
		return $out;
	}

	/** A MailPoet setting with credentials stripped. */
	public function settings( string $key ) {
		if ( ! class_exists( '\MailPoet\Settings\SettingsController' ) ) {
			return null;
		}
		return self::strip_secrets( $key, \MailPoet\Settings\SettingsController::getInstance()->get( $key ) );
	}

	/** @return array{limit: int, reached: bool} MailPoet's subscriber limit (spike item 16). */
	public function subscriber_limit(): array {
		try {
			$s = $this->service( 'MailPoet\Util\License\Features\Subscribers' );
			return array( 'limit' => (int) $s->getSubscribersLimit(), 'reached' => (bool) $s->check() );
		} catch ( \Throwable $e ) {
			return array( 'limit' => 0, 'reached' => false );
		}
	}

	// Calls (D2).

	public function service( string $class ): object {
		return \MailPoet\DI\ContainerWrapper::getInstance()->get( $class );
	}

	/** APIException codes (MailPoet\API\MP\v1\APIException) mapped to EMCP codes. */
	const MP_CODES = array( 12 => 'subscriber_exists', 4 => 'not_found', 5 => 'not_found', 29 => 'not_found', 15 => 'list_exists', 26 => 'tag_exists', 6 => 'system_list', 7 => 'system_list', 20 => 'list_in_use', 21 => 'list_in_use', 24 => 'already_unsubscribed', 10 => 'confirmation_failed' );

	/**
	 * Runs one method of MailPoet's public API (MP v1).
	 *
	 * @return mixed|WP_Error
	 */
	public function mp( string $method, array $args = array() ) {
		try {
			return $this->mp_invoke( $method, $args );
		} catch ( \Throwable $e ) {
			$this->raw_rollback();
			if ( is_a( $e, 'MailPoet\API\MP\v1\APIException' ) ) {
				$code = self::MP_CODES[ (int) $e->getCode() ] ?? 'invalid_argument';
				return new WP_Error( $code, $e->getMessage(), array( 'status' => 'not_found' === $code ? 404 : 400 ) );
			}
			throw $e;
		}
	}

	/** @return mixed */
	protected function mp_invoke( string $method, array $args ) {
		$api = \MailPoet\API\API::MP( 'v1' );
		return $api->$method( ...$args );
	}

	/**
	 * A MailPoet JSON endpoint in-process (D2): SuccessResponse data, ErrorResponse errors.
	 *
	 * @return array|WP_Error
	 */
	public function json( string $endpoint, string $method, array $data ) {
		$r = $this->json_invoke( $endpoint, $method, $data );
		if ( is_array( $r ) || is_wp_error( $r ) ) {
			return $r;
		}
		if ( is_a( $r, 'MailPoet\API\JSON\ErrorResponse' ) ) {
			$first = (array) ( $r->errors[0] ?? array() );
			$code  = (string) ( $first['error'] ?? 'mailpoet_refused' );
			$map   = array( 'not_found' => 'not_found', 'forbidden' => 'forbidden' );
			return new WP_Error( $map[ $code ] ?? 'mailpoet_refused', (string) ( $first['message'] ?? __( 'MailPoet refused the request.', 'emcp-tools' ) ), array( 'status' => (int) $r->status, 'errors' => $r->errors ) );
		}
		if ( is_a( $r, 'MailPoet\API\JSON\SuccessResponse' ) ) {
			return array( 'data' => $r->data, 'meta' => (array) $r->meta );
		}
		return new WP_Error( 'mailpoet_error', __( 'MailPoet answered in a form EMCP does not know.', 'emcp-tools' ) );
	}

	/** @return mixed */
	protected function json_invoke( string $endpoint, string $method, array $data ) {
		return $this->service( 'MailPoet\API\JSON\v1\\' . $endpoint )->$method( $data );
	}

	/** @return array|WP_Error a mailpoet/v1 route in-process. */
	public function rest( string $method, string $route, array $params = array() ) {
		try {
			return $this->rest_dispatch( strtoupper( $method ), ltrim( $route, '/' ), $params );
		} catch ( \Throwable $e ) {
			$this->raw_rollback();
			throw $e;
		}
	}

	/** @return array|WP_Error */
	protected function rest_dispatch( string $method, string $route, array $params ) {
		$req = new WP_REST_Request( strtoupper( $method ), '/mailpoet/v1/' . ltrim( $route, '/' ) );
		if ( 'GET' === strtoupper( $method ) ) {
			$req->set_query_params( $params );
		} else {
			$req->set_header( 'content-type', 'application/json' );
			$req->set_body( (string) wp_json_encode( $params ) );
		}
		$res  = rest_do_request( $req );
		$data = $res->get_data();
		if ( $res->is_error() || $res->get_status() >= 400 ) {
			$msg  = is_array( $data ) ? (string) ( $data['message'] ?? '' ) : '';
			$code = 404 === $res->get_status() ? 'not_found' : ( in_array( $res->get_status(), array( 401, 403 ), true ) ? 'forbidden' : 'mailpoet_refused' );
			return new WP_Error( $code, '' !== $msg ? $msg : __( 'MailPoet refused the request.', 'emcp-tools' ), array( 'status' => $res->get_status(), 'errors' => is_array( $data ) ? ( $data['errors'] ?? ( $data['data']['errors'] ?? null ) ) : null ) );
		}
		return (array) $data;
	}

	// Subscriber services (D2, D9).

	/** @return object MailPoet's SubscriberEntity, or throws. */
	protected function subscriber_entity( int $id ): object {
		$e = $this->service( 'MailPoet\Subscribers\SubscribersRepository' )->findOneById( $id );
		if ( ! $e ) {
			throw new \RuntimeException( 'MailPoet has no subscriber ' . $id );
		}
		return $e;
	}

	/**
	 * SubscriberSaveController::createOrUpdate(): sets only the keys present ('' clears a name);
	 * EMCP passes only email, first_name, last_name and status (D9).
	 */
	public function save_subscriber( int $id, array $data ): int {
		$data = array_intersect_key( $data, array_flip( array( 'email', 'first_name', 'last_name', 'status' ) ) );
		$this->service( 'MailPoet\Subscribers\SubscriberSaveController' )->createOrUpdate( $data, $this->subscriber_entity( $id ) );
		return $id;
	}

	/** Custom field values through MailPoet's repository, only the named fields (D9). */
	public function set_custom_values( int $id, array $values ): void {
		$sub    = $this->subscriber_entity( $id );
		$fields = $this->service( 'MailPoet\CustomFields\CustomFieldsRepository' );
		$repo   = $this->service( 'MailPoet\Subscribers\SubscriberCustomFieldRepository' );
		foreach ( $values as $field => $value ) {
			$cf = $fields->findOneById( (int) $field );
			if ( ! $cf ) {
				throw new \RuntimeException( 'MailPoet has no custom field ' . (int) $field );
			}
			$repo->createOrUpdate( $sub, $cf, (string) $value );
		}
	}

	/** SubscribersRepository::bulkDelete(): the subscribers with their memberships, values and tags (D15). */
	public function bulk_delete( array $ids ): int {
		return (int) $this->service( 'MailPoet\Subscribers\SubscribersRepository' )->bulkDelete( array_map( 'intval', $ids ) );
	}

	/** MailPoet's double opt-in email, sent again (D10). */
	public function send_confirmation( int $id ): void {
		$this->service( 'MailPoet\Subscribers\ConfirmationEmailMailer' )->sendConfirmationEmail( $this->subscriber_entity( $id ) );
	}

	// Doctrine (D8).

	protected function entity_manager(): ?object {
		try {
			return $this->service( 'MailPoetVendor\Doctrine\ORM\EntityManager' );
		} catch ( \Throwable $e ) {
			return null;
		}
	}

	public function entities_open(): bool {
		$em = $this->entity_manager();
		return $em && $em->isOpen();
	}

	public function clear_entities(): void {
		$em = $this->entity_manager();
		if ( $em ) {
			$em->clear();
		}
	}

	// Transactions (D7).

	/**
	 * Whether this connection has an open InnoDB transaction. MySQL 5.7 has no @@in_transaction, so
	 * the connection's row in information_schema.innodb_trx answers (a transaction that has written).
	 */
	protected function in_transaction(): bool {
		global $wpdb;
		$suppress = $wpdb->suppress_errors( true );
		$n        = $wpdb->get_var( 'SELECT COUNT(*) FROM information_schema.innodb_trx WHERE trx_mysql_thread_id = CONNECTION_ID()' );
		$wpdb->suppress_errors( $suppress );
		return (int) $n > 0;
	}

	protected function raw_rollback(): void {
		global $wpdb;
		$wpdb->query( 'ROLLBACK' );
	}

	/** ROLLBACK when MailPoet left a transaction open; true when one was open. */
	public function rollback_open(): bool {
		if ( $this->in_transaction() ) {
			$this->raw_rollback();
			return true;
		}
		return false;
	}

	/** @return array statement capture over SCOPE (D7); a throw rolls back. */
	public function capture( callable $fn ): array {
		return EMCP_Tools_Query_Capture::run(
			self::SCOPE,
			$fn,
			function () {
				// After a throw MailPoet may have left a transaction open: a ROLLBACK without one is a no-op.
				$this->raw_rollback();
			}
		);
	}

	/** The theme styles post MailPoet's email editor creates the first time it renders an email. */
	const EMAIL_STYLES_POST = 'wp-global-styles-woocommerce-email';

	/**
	 * A capture without MailPoet's lazily created settings rows: the email editor's styles post. It
	 * is MailPoet's own, made once on a first render, so no write attributes, recovers or undoes it.
	 */
	public function without_side_effects( array $cap ): array {
		$posts  = array();
		$styles = array();
		foreach ( (array) ( $cap['inserted']['posts'] ?? array() ) as $id ) {
			$p = $this->row( 'posts', (int) $id );
			if ( $p && 'wp_global_styles' === (string) ( $p['post_type'] ?? '' ) && self::EMAIL_STYLES_POST === (string) ( $p['post_name'] ?? '' ) ) {
				$styles[] = (int) $id;
				continue;
			}
			$posts[] = (int) $id;
		}
		// WordPress's own follow-up on the new post (wp_insert_post() sets its guid by ID).
		if ( $styles && ! empty( $cap['statements']['posts'] ) ) {
			$cap['statements']['posts'] = array_values(
				array_filter(
					(array) $cap['statements']['posts'],
					static function ( $sql ) use ( $styles ) {
						$c = EMCP_Tools_Query_Capture::where_conditions( (string) $sql );
						$c = is_array( $c ) ? array_change_key_case( $c, CASE_LOWER ) : null;
						return ! ( $c && array( 'id' ) === array_keys( $c ) && 1 === count( $c['id'] ) && in_array( $c['id'][0], $styles, true ) );
					}
				)
			);
			if ( ! $cap['statements']['posts'] ) {
				unset( $cap['statements']['posts'] );
			}
		}
		if ( isset( $cap['inserted']['posts'] ) ) {
			if ( $posts ) {
				$cap['inserted']['posts'] = $posts;
			} else {
				unset( $cap['inserted']['posts'] );
			}
		}
		return $cap;
	}

	/**
	 * WordPress-table statements count as the write's only when they name a newsletter post it
	 * leased, or a mailpoet_email post the call inserted (D7).
	 *
	 * @param int[]           $posts
	 * @param array<int,int>  $metas meta_id => post_id of the leased posts' before-images: wp_delete_post()
	 *                               deletes meta by meta_id, so those rows are gone by the check.
	 * @return true|WP_Error
	 */
	public function wp_rows_attributed( array $cap, array $posts, array $metas = array() ) {
		$posts = array_map( 'intval', $posts );
		$bad   = static function ( string $table ): WP_Error {
			/* translators: %s: table. */
			return new WP_Error( 'attribution_uncertain', sprintf( __( 'A change in %s during the MailPoet call could not be tied to this write, so EMCP left it as it is.', 'emcp-tools' ), $table ), array( 'tables' => array( $table ) ) );
		};
		$inserted = (array) ( $cap['inserted'] ?? array() );
		foreach ( (array) ( $inserted['posts'] ?? array() ) as $id ) {
			$p = $this->row( 'posts', (int) $id );
			if ( ! $p || 'mailpoet_email' !== (string) ( $p['post_type'] ?? '' ) ) {
				continue;
			}
			$posts[] = (int) $id;
		}
		// Revisions WordPress saves of those posts belong to them; anything else is not this write's.
		foreach ( (array) ( $inserted['posts'] ?? array() ) as $id ) {
			$p = $this->row( 'posts', (int) $id );
			if ( ! $p || ( 'mailpoet_email' !== (string) ( $p['post_type'] ?? '' ) && ! ( 'revision' === (string) ( $p['post_type'] ?? '' ) && in_array( (int) ( $p['post_parent'] ?? 0 ), $posts, true ) ) ) ) {
				return $bad( 'posts' );
			}
		}
		foreach ( (array) ( $cap['statements']['posts'] ?? array() ) as $sql ) {
			$c = EMCP_Tools_Query_Capture::where_conditions( (string) $sql );
			if ( null === $c || array( 'id' ) !== array_keys( $c ) || 1 !== count( $c['id'] ) || ! is_int( $c['id'][0] ) || ! in_array( $c['id'][0], $posts, true ) ) {
				return $bad( 'posts' );
			}
		}
		foreach ( (array) ( $cap['statements']['postmeta'] ?? array() ) as $sql ) {
			$c = EMCP_Tools_Query_Capture::where_conditions( (string) $sql );
			if ( null === $c ) {
				return $bad( 'postmeta' );
			}
			if ( isset( $c['post_id'] ) ) {
				if ( array_diff( array_keys( $c ), array( 'post_id', 'meta_key' ) ) || 1 !== count( $c['post_id'] ) || ! is_int( $c['post_id'][0] ) || ! in_array( $c['post_id'][0], $posts, true ) ) {
					return $bad( 'postmeta' );
				}
				continue;
			}
			if ( array( 'meta_id' ) !== array_keys( $c ) ) {
				return $bad( 'postmeta' );
			}
			foreach ( $c['meta_id'] as $mid ) {
				$m = is_int( $mid ) ? $this->row( 'postmeta', $mid ) : null;
				if ( ! $m && is_int( $mid ) && isset( $metas[ $mid ] ) ) {
					$m = array( 'post_id' => (int) $metas[ $mid ] );
				}
				if ( ! $m || ! in_array( (int) $m['post_id'], $posts, true ) ) {
					return $bad( 'postmeta' );
				}
			}
		}
		foreach ( (array) ( $inserted['postmeta'] ?? array() ) as $id ) {
			$m = $this->row( 'postmeta', (int) $id );
			if ( ! $m || ! in_array( (int) $m['post_id'], $posts, true ) ) {
				return $bad( 'postmeta' );
			}
		}
		return true;
	}

	// Automation hold (D5).

	/** @return array<int,array{0:int,1:callable,2:int}> priority, callback, accepted args */
	protected function hook_callbacks( string $hook ): array {
		global $wp_filter;
		$out = array();
		if ( empty( $wp_filter[ $hook ] ) || ! is_object( $wp_filter[ $hook ] ) ) {
			return $out;
		}
		foreach ( (array) $wp_filter[ $hook ]->callbacks as $prio => $list ) {
			foreach ( (array) $list as $entry ) {
				$out[] = array( (int) $prio, $entry['function'], (int) $entry['accepted_args'] );
			}
		}
		return $out;
	}

	/** @return string[] every hook with callbacks */
	protected function hook_names(): array {
		global $wp_filter;
		return array_keys( (array) $wp_filter );
	}

	private static function is_trigger( $cb ): bool {
		return is_array( $cb ) && is_object( $cb[0] ?? null ) && is_a( $cb[0], self::TRIGGER );
	}

	/** The class a callback belongs to, or '' for a plain function. */
	private static function owner( $cb ): string {
		if ( $cb instanceof \Closure ) {
			$r     = new \ReflectionFunction( $cb );
			$this_ = $r->getClosureThis();
			if ( $this_ ) {
				return get_class( $this_ );
			}
			$scope = $r->getClosureScopeClass();
			return $scope ? $scope->getName() : '';
		}
		if ( is_array( $cb ) ) {
			return is_object( $cb[0] ?? null ) ? get_class( $cb[0] ) : (string) ( $cb[0] ?? '' );
		}
		if ( is_string( $cb ) && false !== strpos( $cb, '::' ) ) {
			return (string) strstr( $cb, '::', true );
		}
		return is_object( $cb ) ? get_class( $cb ) : '';
	}

	/**
	 * Runs $fn with every MailPoet automation trigger callback removed, on every hook, and puts them
	 * back in a finally (D5). A MailPoet callback on a trigger hook that is neither a trigger nor a
	 * known listener refuses the call; other plugins' callbacks stay.
	 *
	 * @return mixed|WP_Error
	 */
	public function hold_automations( callable $fn ) {
		$held = array();
		foreach ( $this->hook_names() as $hook ) {
			$found = array();
			$other = array();
			foreach ( $this->hook_callbacks( (string) $hook ) as $c ) {
				if ( self::is_trigger( $c[1] ) ) {
					$found[] = array( (string) $hook, $c[1], $c[0], $c[2] );
				} else {
					$other[] = $c[1];
				}
			}
			if ( ! $found ) {
				continue;
			}
			foreach ( $other as $cb ) {
				$owner = self::owner( $cb );
				if ( 0 === strpos( ltrim( $owner, '\\' ), 'MailPoet\\' ) && ! in_array( ltrim( $owner, '\\' ), self::KNOWN_LISTENERS, true ) ) {
					/* translators: 1: hook, 2: class. */
					return new WP_Error( 'automation_hold_unavailable', sprintf( __( 'EMCP could not tell whether MailPoet\'s %2$s on %1$s starts automations, so nothing was written. Pass run_automations:true to let MailPoet run its automations.', 'emcp-tools' ), $hook, $owner ) );
				}
			}
			$held = array_merge( $held, $found );
		}
		foreach ( $held as $h ) {
			remove_action( $h[0], $h[1], $h[2] );
		}
		try {
			return $fn();
		} finally {
			foreach ( $held as $h ) {
				add_action( $h[0], $h[1], $h[2], $h[3] );
			}
		}
	}

	// Deferred subscriber events (D5).

	/**
	 * MailPoet's notifier instance. MailPoet registers it as a private service (the container does
	 * not hand it out) and hooks its notify() on shutdown, so the instance is found there.
	 */
	protected function notifier(): ?object {
		foreach ( $this->hook_callbacks( 'shutdown' ) as $c ) {
			if ( is_array( $c[1] ) && is_object( $c[1][0] ?? null ) && is_a( $c[1][0], self::NOTIFIER ) ) {
				return $c[1][0];
			}
		}
		try {
			$n = $this->service( self::NOTIFIER );
			return is_a( $n, self::NOTIFIER ) ? $n : null;
		} catch ( \Throwable $e ) {
			return null;
		}
	}

	/** @return array{created: array, updated: array, status: array}|null id => timestamp; null when not as pinned. */
	protected function notifier_lists(): ?array {
		$n = $this->notifier();
		if ( ! $n ) {
			return null;
		}
		$out = array();
		try {
			foreach ( self::NOTIFIER_LISTS as $key => $def ) {
				$p = new \ReflectionProperty( $n, $def[0] );
				$p->setAccessible( true );
				$v = $p->getValue( $n );
				if ( ! is_array( $v ) ) {
					return null;
				}
				$out[ $key ] = $v;
			}
		} catch ( \ReflectionException $e ) {
			return null;
		}
		return $out;
	}

	protected function notifier_remove( array $ids ): void {
		$n = $this->notifier();
		foreach ( self::NOTIFIER_LISTS as $def ) {
			$p = new \ReflectionProperty( $n, $def[0] );
			$p->setAccessible( true );
			$v = (array) $p->getValue( $n );
			foreach ( $ids as $id ) {
				unset( $v[ $id ] );
			}
			$p->setValue( $n, $v );
		}
	}

	/** Whether the notifier's private lists are as pinned (D5). */
	public function notifier_ok(): bool {
		return null !== $this->notifier_lists();
	}

	/** @return array the notifier's pending lists (test and smoke helper). */
	public function notifier_pending(): array {
		return (array) $this->notifier_lists();
	}

	/**
	 * Takes these subscribers out of the notifier's pending lists and, with `fire`, fires their
	 * events now, one per subscriber, in the order MailPoet's notify() uses (created first; a
	 * created subscriber's update and status events are dropped as MailPoet drops them). Other ids
	 * stay pending (D5). Each subscriber's events run in their own try; the first throwable per
	 * subscriber is returned.
	 *
	 * @param int[] $ids
	 * @return array<int,\Throwable> subscriber id => what its listener threw
	 */
	public function drain_events( array $ids, string $mode = 'fire' ): array {
		$lists = $this->notifier_lists();
		if ( null === $lists || ! $ids ) {
			return array();
		}
		$ids  = array_values( array_unique( array_map( 'intval', $ids ) ) );
		$want = array();
		foreach ( $ids as $id ) {
			foreach ( array_keys( self::NOTIFIER_LISTS ) as $key ) {
				if ( isset( $lists[ $key ][ $id ] ) ) {
					$want[ $id ][ $key ] = true;
				}
			}
		}
		$this->notifier_remove( $ids );
		if ( 'fire' !== $mode ) {
			return array();
		}
		$errors = array();
		foreach ( array_keys( self::NOTIFIER_LISTS ) as $key ) {
			foreach ( $ids as $id ) {
				if ( empty( $want[ $id ][ $key ] ) || ( 'created' !== $key && ! empty( $want[ $id ]['created'] ) ) || isset( $errors[ $id ] ) ) {
					continue;
				}
				try {
					do_action( self::NOTIFIER_LISTS[ $key ][1], $id );
				} catch ( \Throwable $e ) {
					$errors[ $id ] = $e;
				}
			}
		}
		return $errors;
	}

	// Mail counting (D6).

	/** MailPoet's mta_log sent total (its own mailer, spike item 17). */
	protected function mta_sent_total(): int {
		if ( ! class_exists( '\MailPoet\Mailer\MailerLog' ) ) {
			return 0;
		}
		$log = \MailPoet\Mailer\MailerLog::getMailerLog();
		return (int) array_sum( array_map( 'intval', (array) ( $log['sent'] ?? array() ) ) );
	}

	public function mail_mark(): int {
		if ( ! self::$counting ) {
			add_filter( 'wp_mail', array( __CLASS__, 'count_mail' ), PHP_INT_MAX );
			self::$counting = true;
		}
		return self::$mails + $this->mta_sent_total();
	}

	/** @internal wp_mail filter. */
	public static function count_mail( $atts ) {
		++self::$mails;
		return $atts;
	}

	public function mails_since( int $mark ): int {
		return max( 0, self::$mails + $this->mta_sent_total() - $mark );
	}

	// Newsletters and sending (D16, D17).

	/** The database's UTC_TIMESTAMP(), the clock MailPoet's scheduler query compares against. */
	public function db_utc_now(): string {
		global $wpdb;
		return (string) $wpdb->get_var( 'SELECT UTC_TIMESTAMP()' );
	}

	/** The site's local time (Y-m-d H:i:s). */
	public function site_now(): string {
		return (string) current_time( 'mysql' );
	}

	public function user_email(): string {
		$u = wp_get_current_user();
		return (string) ( $u->user_email ?? '' );
	}

	/**
	 * Writes a block-editor newsletter's content into its post as the current user, so WordPress's
	 * markup filtering applies as in the editor (D16).
	 *
	 * @return string|WP_Error what WordPress stored
	 */
	public function write_post_content( int $post, string $content ) {
		$r = wp_update_post( array( 'ID' => $post, 'post_content' => wp_slash( $content ) ), true );
		if ( is_wp_error( $r ) ) {
			return $r;
		}
		clean_post_cache( $post );
		return (string) get_post_field( 'post_content', $post, 'raw' );
	}

	/**
	 * The campaign name MailPoet lists a block-editor newsletter by (NewsletterEntity::getCampaignName()
	 * reads its email post's title, which MailPoet creates as "New Email"). @return string|WP_Error
	 */
	public function write_post_title( int $post, string $title ) {
		$r = wp_update_post( array( 'ID' => $post, 'post_title' => wp_slash( $title ) ), true );
		if ( is_wp_error( $r ) ) {
			return $r;
		}
		clean_post_cache( $post );
		return (string) get_post_field( 'post_title', $post, 'raw' );
	}

	/** NewsletterSaveController::duplicate(): a draft copy (MailPoet's own duplicate). */
	public function duplicate_newsletter( int $id ): int {
		$n = $this->service( 'MailPoet\Newsletter\NewslettersRepository' )->findOneById( $id );
		if ( ! $n ) {
			throw new \RuntimeException( 'MailPoet has no newsletter ' . $id );
		}
		return (int) $this->service( 'MailPoet\Newsletter\NewsletterSaveController' )->duplicate( $n )->getId();
	}

	/** @return array<int|string,array> rows locked FOR UPDATE inside the open transaction. */
	protected function lock_select( string $table, array $where ): array {
		global $wpdb;
		$sql  = array();
		$args = array();
		foreach ( $where as $col => $val ) {
			$col = preg_replace( '/[^A-Za-z0-9_]/', '', (string) $col );
			if ( is_array( $val ) ) {
				if ( array() === $val ) {
					return array();
				}
				$sql[] = "`{$col}` IN (" . implode( ',', array_fill( 0, count( $val ), '%s' ) ) . ')';
				$args  = array_merge( $args, array_map( 'strval', $val ) );
			} else {
				$sql[]  = "`{$col}` = %s";
				$args[] = (string) $val;
			}
		}
		$rows = $wpdb->get_results( $wpdb->prepare( "SELECT * FROM `{$wpdb->prefix}{$table}` WHERE " . implode( ' AND ', $sql ) . ' FOR UPDATE', $args ), ARRAY_A ); // phpcs:ignore WordPress.DB.PreparedSQL
		$out  = array();
		foreach ( (array) $rows as $r ) {
			$out[ self::row_key( $table, $r ) ] = $r;
		}
		return $out;
	}

	protected function set_columns( string $table, $key, array $cols ): bool {
		global $wpdb;
		$where = array();
		$parts = explode( ':', (string) $key );
		foreach ( self::pk_cols( $table ) as $i => $c ) {
			$where[ $c ] = $parts[ $i ] ?? $key;
		}
		return false !== $wpdb->update( $wpdb->prefix . $table, $cols, $where );
	}

	/**
	 * Cancels a scheduled send in EMCP's own single transaction, with no MailPoet call inside (D17):
	 * the newsletter, its queues, tasks and recipient rows locked FOR UPDATE; sending_started when any
	 * task is not scheduled, any queue has processed recipients or any task has recipient rows;
	 * sending_imminent when the send is less than 120 seconds away (read against the database's UTC
	 * clock, which MailPoet's scheduler uses, and against the scheduledAt option, which MailPoet's block
	 * editor stores in UTC, so either reading refuses); else the rows deleted, the newsletter set back to draft and isScheduled to 0.
	 *
	 * @return true|WP_Error
	 */
	public function cancel_sending( int $id ) {
		$this->begin();
		try {
			$nl = $this->lock_select( 'mailpoet_newsletters', array( 'id' => $id ) );
			if ( ! $nl ) {
				$this->raw_rollback();
				return EMCP_Tools_MailPoet_Integration::not_found( 'newsletter' );
			}
			$queues = $this->lock_select( 'mailpoet_sending_queues', array( 'newsletter_id' => $id ) );
			$ids    = array_values( array_unique( array_map( static fn( $q ) => (int) $q['task_id'], $queues ) ) );
			$tasks  = $ids ? $this->lock_select( 'mailpoet_scheduled_tasks', array( 'id' => $ids ) ) : array();
			$recips = $ids ? $this->lock_select( 'mailpoet_scheduled_task_subscribers', array( 'task_id' => $ids ) ) : array();
			if ( ! $tasks ) {
				$this->raw_rollback();
				return new WP_Error( 'not_scheduled', __( 'This newsletter has no scheduled send to take back.', 'emcp-tools' ), array( 'status' => 409 ) );
			}
			$started = (bool) $recips;
			foreach ( $tasks as $t ) {
				$started = $started || 'scheduled' !== (string) $t['status'];
			}
			foreach ( $queues as $q ) {
				$started = $started || (int) $q['count_processed'] > 0;
			}
			if ( $started ) {
				$this->raw_rollback();
				return new WP_Error( 'sending_started', __( 'MailPoet has started sending this newsletter, so it cannot be taken back. Pause it instead.', 'emcp-tools' ), array( 'status' => 409 ) );
			}
			$earliest = min( array_map( static fn( $t ) => strtotime( (string) $t['scheduled_at'] . ' UTC' ), $tasks ) );
			$option   = $this->option_value( $id, 'scheduledAt' );
			$now      = strtotime( $this->db_utc_now() . ' UTC' );
			$soon     = $earliest < $now + 120;
			if ( null !== $option && '' !== $option ) {
				$at   = strtotime( $option . ' UTC' );
				$soon = $soon || false === $at || $at < $now + 120;
			}
			if ( $soon ) {
				$this->raw_rollback();
				return new WP_Error( 'sending_imminent', __( 'This newsletter is due to send within two minutes (or is due already), so MailPoet may be picking it up; it was not taken back. Pause it instead.', 'emcp-tools' ), array( 'status' => 409 ) );
			}
			foreach ( array( 'mailpoet_scheduled_task_subscribers' => $recips, 'mailpoet_sending_queues' => $queues, 'mailpoet_scheduled_tasks' => $tasks ) as $table => $rows ) {
				foreach ( $rows as $row ) {
					if ( ! $this->delete_row( $table, $row ) ) {
						$this->raw_rollback();
						return new WP_Error( 'mailpoet_error', __( 'The scheduled send could not be taken back; nothing changed.', 'emcp-tools' ) );
					}
				}
			}
			$ok = $this->set_columns( 'mailpoet_newsletters', $id, array( 'status' => 'draft' ) );
			foreach ( $this->option_rows( $id, 'isScheduled' ) as $key => $o ) {
				$ok = $ok && $this->set_columns( 'mailpoet_newsletter_option', $key, array( 'value' => '0' ) );
			}
			if ( ! $ok ) {
				$this->raw_rollback();
				return new WP_Error( 'mailpoet_error', __( 'The scheduled send could not be taken back; nothing changed.', 'emcp-tools' ) );
			}
			$this->commit();
		} catch ( \Throwable $e ) {
			$this->raw_rollback();
			throw $e;
		}
		$this->clear_entities();
		return true;
	}

	/** @return array<int|string,array> a newsletter's option rows of one name */
	public function option_rows( int $newsletter, string $name ): array {
		$fields = array_keys( $this->select( 'mailpoet_newsletter_option_fields', array( 'name' => $name ) ) );
		return $fields ? $this->select( 'mailpoet_newsletter_option', array( 'newsletter_id' => $newsletter, 'option_field_id' => $fields ) ) : array();
	}

	public function option_value( int $newsletter, string $name ): ?string {
		$rows = $this->option_rows( $newsletter, $name );
		return $rows ? (string) current( $rows )['value'] : null;
	}

	/** Recipient rows of a newsletter's tasks (what a send queued). */
	public function queued_count( int $newsletter ): int {
		$rows = $this->rows( 'sending', $newsletter );
		return count( $rows['mailpoet_scheduled_task_subscribers'] );
	}

	// Rows (D12).

	/** @return string[] primary key columns of a table */
	public static function pk_cols( string $table ): array {
		$map = array(
			'posts'                                 => array( 'ID' ),
			'postmeta'                              => array( 'meta_id' ),
			'mailpoet_scheduled_task_subscribers'   => array( 'task_id', 'subscriber_id' ),
			'mailpoet_automation_triggers'          => array( 'automation_id', 'trigger_key' ),
		);
		return $map[ $table ] ?? array( 'id' );
	}

	/** @return int|string the key a row is held under */
	public static function row_key( string $table, array $row ) {
		$cols = self::pk_cols( $table );
		if ( 1 === count( $cols ) ) {
			return (int) $row[ $cols[0] ];
		}
		$parts = array();
		foreach ( $cols as $c ) {
			$parts[] = (string) $row[ $c ];
		}
		return implode( ':', $parts );
	}

	/** @param array $where column => value, values or null (IS NULL). @return array<int|string,array> */
	protected function select( string $table, array $where ): array {
		global $wpdb;
		$sql  = array();
		$args = array();
		foreach ( $where as $col => $val ) {
			$col = preg_replace( '/[^A-Za-z0-9_]/', '', (string) $col );
			if ( null === $val ) {
				$sql[] = "`{$col}` IS NULL";
			} elseif ( is_array( $val ) ) {
				if ( array() === $val ) {
					return array();
				}
				$sql[] = "`{$col}` IN (" . implode( ',', array_fill( 0, count( $val ), '%s' ) ) . ')';
				$args  = array_merge( $args, array_map( 'strval', $val ) );
			} else {
				$sql[]  = "`{$col}` = %s";
				$args[] = (string) $val;
			}
		}
		$order = '`' . implode( '`, `', self::pk_cols( $table ) ) . '`';
		$query = "SELECT * FROM `{$wpdb->prefix}{$table}`" . ( $sql ? ' WHERE ' . implode( ' AND ', $sql ) : '' ) . " ORDER BY {$order}";
		$rows  = $args ? $wpdb->get_results( $wpdb->prepare( $query, $args ), ARRAY_A ) : $wpdb->get_results( $query, ARRAY_A ); // phpcs:ignore WordPress.DB.PreparedSQL
		$out   = array();
		foreach ( (array) $rows as $r ) {
			$out[ self::row_key( $table, $r ) ] = $r;
		}
		return $out;
	}

	public function row( string $table, int $id ): ?array {
		$r = $this->select( $table, array( self::pk_cols( $table )[0] => $id ) );
		return $r ? current( $r ) : null;
	}

	/** @return array rows of a table matching $where (lookups for the writer). */
	public function find( string $table, array $where ): array {
		return $this->select( $table, $where );
	}

	protected function count_rows( string $table, array $where ): int {
		global $wpdb;
		$sql  = array();
		$args = array();
		foreach ( $where as $col => $val ) {
			$col = preg_replace( '/[^A-Za-z0-9_]/', '', (string) $col );
			if ( null === $val ) {
				$sql[] = "`{$col}` IS NULL";
			} elseif ( is_array( $val ) ) {
				if ( array() === $val ) {
					return 0;
				}
				$sql[] = "`{$col}` IN (" . implode( ',', array_fill( 0, count( $val ), '%s' ) ) . ')';
				$args  = array_merge( $args, array_map( 'strval', $val ) );
			} else {
				$sql[]  = "`{$col}` = %s";
				$args[] = (string) $val;
			}
		}
		$query = "SELECT COUNT(*) FROM `{$wpdb->prefix}{$table}`" . ( $sql ? ' WHERE ' . implode( ' AND ', $sql ) : '' );
		return (int) ( $args ? $wpdb->get_var( $wpdb->prepare( $query, $args ) ) : $wpdb->get_var( $query ) ); // phpcs:ignore WordPress.DB.PreparedSQL
	}

	public function count_where( string $table, array $where ): int {
		return $this->count_rows( $table, $where );
	}

	/**
	 * An order-independent digest of a list's or a tag's memberships, computed in SQL (D12): the
	 * count, and the sum and XOR of a 60-bit hash of each membership's identity and status.
	 *
	 * @return array{n: int, sum: string, xor: string}
	 */
	public function membership_digest( string $kind, int $id ): array {
		global $wpdb;
		if ( 'list' === $kind ) {
			$t = $wpdb->prefix . 'mailpoet_subscriber_segment';
			$x = "CONCAT_WS(':', subscriber_id, status)";
			$w = 'segment_id';
		} else {
			$t = $wpdb->prefix . 'mailpoet_subscriber_tag';
			$x = 'CAST(subscriber_id AS CHAR)';
			$w = 'tag_id';
		}
		$h   = "CAST(CONV(LEFT(MD5({$x}), 15), 16, 10) AS UNSIGNED)";
		$row = $wpdb->get_row( $wpdb->prepare( "SELECT COUNT(*) AS n, COALESCE(SUM({$h}), 0) AS s, BIT_XOR({$h}) AS x FROM `{$t}` WHERE `{$w}` = %d", $id ), ARRAY_A ); // phpcs:ignore WordPress.DB.PreparedSQL
		return array( 'n' => (int) ( $row['n'] ?? 0 ), 'sum' => (string) ( $row['s'] ?? '0' ), 'xor' => (string) ( $row['x'] ?? '0' ) );
	}

	/**
	 * Every row of an object across its tables (D12).
	 *
	 * @param string $kind subscriber, list, list_members, tag, tag_members, custom_fields, newsletter, sending, automation.
	 */
	public function rows( string $kind, int $id ): array {
		switch ( $kind ) {
			case 'subscriber':
				return array(
					'mailpoet_subscribers'             => $this->select( 'mailpoet_subscribers', array( 'id' => $id ) ),
					'mailpoet_subscriber_segment'      => $this->select( 'mailpoet_subscriber_segment', array( 'subscriber_id' => $id ) ),
					'mailpoet_subscriber_custom_field' => $this->select( 'mailpoet_subscriber_custom_field', array( 'subscriber_id' => $id ) ),
					'mailpoet_subscriber_tag'          => $this->select( 'mailpoet_subscriber_tag', array( 'subscriber_id' => $id ) ),
				);
			case 'list':
				return array(
					'mailpoet_segments'                => $this->select( 'mailpoet_segments', array( 'id' => $id ) ),
					'mailpoet_newsletter_segment'      => $this->select( 'mailpoet_newsletter_segment', array( 'segment_id' => $id ) ),
					'mailpoet_dynamic_segment_filters' => $this->select( 'mailpoet_dynamic_segment_filters', array( 'segment_id' => $id ) ),
					'#members'                         => $this->membership_digest( 'list', $id ),
				);
			case 'list_members':
				return array( 'mailpoet_subscriber_segment' => $this->select( 'mailpoet_subscriber_segment', array( 'segment_id' => $id ) ) );
			case 'tag':
				return array(
					'mailpoet_tags' => $this->select( 'mailpoet_tags', array( 'id' => $id ) ),
					'#members'      => $this->membership_digest( 'tag', $id ),
				);
			case 'tag_members':
				return array( 'mailpoet_subscriber_tag' => $this->select( 'mailpoet_subscriber_tag', array( 'tag_id' => $id ) ) );
			case 'custom_fields':
				return array( 'mailpoet_custom_fields' => $this->select( 'mailpoet_custom_fields', array() ) );
			case 'newsletter':
				$nl   = $this->select( 'mailpoet_newsletters', array( 'id' => $id ) );
				$post = (int) ( current( $nl )['wp_post_id'] ?? 0 );
				return array(
					'mailpoet_newsletters'        => $nl,
					'mailpoet_newsletter_option'  => $this->select( 'mailpoet_newsletter_option', array( 'newsletter_id' => $id ) ),
					'mailpoet_newsletter_segment' => $this->select( 'mailpoet_newsletter_segment', array( 'newsletter_id' => $id ) ),
					'posts'                       => $post ? $this->select( 'posts', array( 'ID' => $post ) ) : array(),
					'postmeta'                    => $post ? $this->select( 'postmeta', array( 'post_id' => $post ) ) : array(),
				);
			case 'sending':
				$queues = $this->select( 'mailpoet_sending_queues', array( 'newsletter_id' => $id ) );
				$tasks  = array_values( array_unique( array_map( static fn( $q ) => (int) $q['task_id'], $queues ) ) );
				return array(
					'mailpoet_sending_queues'             => $queues,
					'mailpoet_scheduled_tasks'            => $tasks ? $this->select( 'mailpoet_scheduled_tasks', array( 'id' => $tasks ) ) : array(),
					'mailpoet_scheduled_task_subscribers' => $tasks ? $this->select( 'mailpoet_scheduled_task_subscribers', array( 'task_id' => $tasks ) ) : array(),
				);
			case 'automation':
				$versions = $this->select( 'mailpoet_automation_versions', array( 'automation_id' => $id ) );
				return array(
					'mailpoet_automations' => $this->select( 'mailpoet_automations', array( 'id' => $id ) ),
					'#version_id'          => $versions ? max( array_map( 'intval', array_keys( $versions ) ) ) : 0,
				);
		}
		return array();
	}

	/** WordPress's editor presence meta, written by opening a newsletter in MailPoet's editor (browser pass). */
	const VOLATILE_META = array( '_edit_lock', '_edit_last' );

	/** 16 hex of sha256 over the rows, keys sorted, volatile columns and meta dropped (D12). */
	public static function version( array $rows ): string {
		$norm = static function ( $v ) use ( &$norm ) {
			if ( ! is_array( $v ) ) {
				return null === $v ? null : (string) $v;
			}
			foreach ( self::VOLATILE as $col ) {
				unset( $v[ $col ] );
			}
			if ( isset( $v['postmeta'] ) && is_array( $v['postmeta'] ) ) {
				$v['postmeta'] = array_filter( $v['postmeta'], static fn( $m ) => ! is_array( $m ) || ! in_array( (string) ( $m['meta_key'] ?? '' ), self::VOLATILE_META, true ) );
			}
			ksort( $v );
			return array_map( $norm, $v );
		};
		return substr( hash( 'sha256', (string) wp_json_encode( $norm( $rows ) ) ), 0, 16 );
	}

	public function version_of( string $kind, int $id ): string {
		return self::version( $this->rows( $kind, $id ) );
	}

	// Direct writes: undo, recovery and the cancelling transaction only.

	protected function replace_row( string $table, array $row ): bool {
		global $wpdb;
		return false !== $wpdb->replace( $wpdb->prefix . $table, $row );
	}

	protected function delete_row( string $table, array $row ): bool {
		global $wpdb;
		$where = array();
		foreach ( self::pk_cols( $table ) as $c ) {
			$where[ $c ] = $row[ $c ];
		}
		return false !== $wpdb->delete( $wpdb->prefix . $table, $where );
	}

	protected function begin(): void {
		global $wpdb;
		$wpdb->query( 'START TRANSACTION' );
	}

	protected function commit(): void {
		global $wpdb;
		$wpdb->query( 'COMMIT' );
	}

	/** The subscribers whose rows or memberships a direct write touched. @return int[] */
	protected static function touched_subscribers( array $rows ): array {
		$ids = array_keys( (array) ( $rows['mailpoet_subscribers'] ?? array() ) );
		foreach ( (array) ( $rows['mailpoet_subscriber_segment'] ?? array() ) as $m ) {
			$ids[] = (int) ( $m['subscriber_id'] ?? 0 );
		}
		return array_values( array_unique( array_filter( array_map( 'intval', $ids ) ) ) );
	}

	/**
	 * MailPoet keeps a per-subscriber list count (segments_count) that its own writes refresh; a
	 * direct restore bypasses them, so it asks MailPoet's recalculator for those subscribers.
	 */
	protected function recount_segments( array $ids ): void {
		$class = 'MailPoet\Subscribers\SegmentsCountRecalculator';
		if ( ! $ids || ! class_exists( $class ) || ! method_exists( $class, 'recalculateForSubscribers' ) ) {
			return;
		}
		try {
			$this->service( $class )->recalculateForSubscribers( $ids );
		} catch ( \Throwable $e ) {
			// MailPoet's background reconcile worker corrects the counts later.
			$this->raw_rollback();
		}
	}

	protected function flush_caches( array $rows ): void {
		foreach ( array_keys( (array) ( $rows['posts'] ?? array() ) ) as $id ) {
			clean_post_cache( (int) $id );
		}
	}

	/**
	 * Puts $before back: rows in $before written as they were, rows in $current but not in $before
	 * deleted, in one transaction; then the EntityManager is cleared (D8). Synthetic # keys skipped.
	 */
	public function restore_rows( array $before, array $current = array() ): bool {
		$this->begin();
		foreach ( $before as $table => $rows ) {
			if ( '#' === substr( (string) $table, 0, 1 ) ) {
				continue;
			}
			foreach ( (array) $rows as $row ) {
				if ( ! $this->replace_row( (string) $table, (array) $row ) ) {
					$this->raw_rollback();
					return false;
				}
			}
		}
		foreach ( $current as $table => $rows ) {
			if ( '#' === substr( (string) $table, 0, 1 ) ) {
				continue;
			}
			foreach ( (array) $rows as $key => $row ) {
				if ( ! isset( $before[ $table ][ $key ] ) && ! $this->delete_row( (string) $table, (array) $row ) ) {
					$this->raw_rollback();
					return false;
				}
			}
		}
		$this->commit();
		$this->flush_caches( $before + $current );
		$this->clear_entities();
		$this->recount_segments( array_values( array_unique( array_merge( self::touched_subscribers( $before ), self::touched_subscribers( $current ) ) ) ) );
		return true;
	}

	/** Deletes these rows in one transaction; then the EntityManager is cleared. */
	public function delete_rows( array $rows ): bool {
		$this->begin();
		foreach ( $rows as $table => $list ) {
			if ( '#' === substr( (string) $table, 0, 1 ) ) {
				continue;
			}
			foreach ( (array) $list as $row ) {
				if ( ! $this->delete_row( (string) $table, (array) $row ) ) {
					$this->raw_rollback();
					return false;
				}
			}
		}
		$this->commit();
		$this->flush_caches( $rows );
		$this->clear_entities();
		$this->recount_segments( self::touched_subscribers( $rows ) );
		return true;
	}

	// Queries.

	/**
	 * Globally subscribed, untrashed subscribers subscribed to at least one of the lists, distinct:
	 * the rule MailPoet's SubscribersFinder::addSubscribersToTaskFromSegments uses for a send.
	 */
	/**
	 * recipient_count() follows MailPoet's rule for static lists only. SubscribersFinder also queues
	 * dynamic segment members and intersects with a filter segment (the newsletter's or its parent's
	 * filterSegmentId option), which EMCP does not count, so such sends are refused.
	 *
	 * @return true|WP_Error
	 */
	public function countable( array $list_ids, int $newsletter = 0 ) {
		$static = array( 'default', 'wp_users', 'woocommerce_users', 'woocommerce_memberships' );
		$bad    = array();
		foreach ( $list_ids as $l ) {
			$seg = $this->row( 'mailpoet_segments', (int) $l );
			if ( $seg && ! in_array( (string) $seg['type'], $static, true ) ) {
				$bad[] = (int) $l;
			}
		}
		$filter = false;
		for ( $id = $newsletter, $hops = 0; $id > 0 && $hops < 3; $hops++ ) {
			$filter = $filter || '' !== (string) $this->option_value( $id, 'filterSegmentId' );
			$parent = (int) ( $this->row( 'mailpoet_newsletters', $id )['parent_id'] ?? 0 );
			$id     = $parent !== $id ? $parent : 0;
		}
		if ( ! $bad && ! $filter ) {
			return true;
		}
		return new WP_Error( 'recipients_uncountable', __( 'This newsletter goes to a dynamic segment or carries a segment filter, which EMCP cannot count, so it cannot check who would be emailed. Send it from MailPoet, or send it to static lists only.', 'emcp-tools' ), array( 'status' => 409, 'segments' => $bad, 'filter_segment' => $filter ) );
	}

	public function recipient_count( array $list_ids ): int {
		global $wpdb;
		$list_ids = array_values( array_filter( array_map( 'intval', $list_ids ) ) );
		if ( ! $list_ids ) {
			return 0;
		}
		$in = implode( ',', $list_ids );
		return (int) $wpdb->get_var( "SELECT COUNT(DISTINCT s.id) FROM `{$wpdb->prefix}mailpoet_subscribers` s INNER JOIN `{$wpdb->prefix}mailpoet_subscriber_segment` ss ON ss.subscriber_id = s.id WHERE ss.segment_id IN ({$in}) AND ss.status = 'subscribed' AND s.status = 'subscribed' AND s.deleted_at IS NULL" ); // phpcs:ignore WordPress.DB.PreparedSQL
	}

	/**
	 * @param array $f search, status, list_id, tag_id, created_after, created_before, sort_by, sort_order, limit, offset.
	 * @return array{rows: array[], total: int}
	 */
	protected function query_subscribers( array $f ): array {
		global $wpdb;
		$t     = $wpdb->prefix . 'mailpoet_subscribers';
		$where = array( 's.deleted_at IS NULL' );
		$args  = array();
		if ( isset( $f['search'] ) ) {
			$like    = '%' . $wpdb->esc_like( (string) $f['search'] ) . '%';
			$where[] = '(s.email LIKE %s OR s.first_name LIKE %s OR s.last_name LIKE %s)';
			array_push( $args, $like, $like, $like );
		}
		if ( isset( $f['status'] ) ) {
			$where[] = 's.status = %s';
			$args[]  = (string) $f['status'];
		}
		if ( isset( $f['list_id'] ) ) {
			$where[] = "s.id IN (SELECT subscriber_id FROM `{$wpdb->prefix}mailpoet_subscriber_segment` WHERE segment_id = %d)";
			$args[]  = (int) $f['list_id'];
		}
		if ( isset( $f['tag_id'] ) ) {
			$where[] = "s.id IN (SELECT subscriber_id FROM `{$wpdb->prefix}mailpoet_subscriber_tag` WHERE tag_id = %d)";
			$args[]  = (int) $f['tag_id'];
		}
		if ( isset( $f['created_after'] ) ) {
			$where[] = 's.created_at >= %s';
			$args[]  = (string) $f['created_after'];
		}
		if ( isset( $f['created_before'] ) ) {
			$where[] = 's.created_at < %s';
			$args[]  = (string) $f['created_before'];
		}
		$sort  = in_array( $f['sort_by'] ?? 'id', array( 'id', 'email', 'created_at', 'first_name', 'last_name' ), true ) ? (string) ( $f['sort_by'] ?? 'id' ) : 'id';
		$dir   = 'desc' === ( $f['sort_order'] ?? 'asc' ) ? 'DESC' : 'ASC';
		$w     = implode( ' AND ', $where );
		$total = (int) $wpdb->get_var( $args ? $wpdb->prepare( "SELECT COUNT(*) FROM `{$t}` s WHERE {$w}", $args ) : "SELECT COUNT(*) FROM `{$t}` s WHERE {$w}" ); // phpcs:ignore WordPress.DB.PreparedSQL
		$rows  = $wpdb->get_results( $wpdb->prepare( "SELECT s.* FROM `{$t}` s WHERE {$w} ORDER BY s.`{$sort}` {$dir}, s.id {$dir} LIMIT %d OFFSET %d", array_merge( $args, array( (int) $f['limit'], (int) $f['offset'] ) ) ), ARRAY_A ); // phpcs:ignore WordPress.DB.PreparedSQL
		return array( 'rows' => (array) $rows, 'total' => $total );
	}

	public function subscribers_page( array $f ): array {
		return $this->query_subscribers( $f );
	}

	/** @return array{rows: array[], total: int} */
	protected function query_newsletters( array $f ): array {
		global $wpdb;
		$t     = $wpdb->prefix . 'mailpoet_newsletters';
		$where = array( 'deleted_at IS NULL' );
		$args  = array();
		foreach ( array( 'type', 'status' ) as $k ) {
			if ( isset( $f[ $k ] ) ) {
				$where[] = "`{$k}` = %s";
				$args[]  = (string) $f[ $k ];
			}
		}
		if ( isset( $f['search'] ) ) {
			$where[] = 'subject LIKE %s';
			$args[]  = '%' . $wpdb->esc_like( (string) $f['search'] ) . '%';
		}
		$w     = implode( ' AND ', $where );
		$total = (int) $wpdb->get_var( $args ? $wpdb->prepare( "SELECT COUNT(*) FROM `{$t}` WHERE {$w}", $args ) : "SELECT COUNT(*) FROM `{$t}` WHERE {$w}" ); // phpcs:ignore WordPress.DB.PreparedSQL
		$rows  = $wpdb->get_results( $wpdb->prepare( "SELECT * FROM `{$t}` WHERE {$w} ORDER BY id DESC LIMIT %d OFFSET %d", array_merge( $args, array( (int) $f['limit'], (int) $f['offset'] ) ) ), ARRAY_A ); // phpcs:ignore WordPress.DB.PreparedSQL
		return array( 'rows' => (array) $rows, 'total' => $total );
	}

	public function newsletters_page( array $f ): array {
		return $this->query_newsletters( $f );
	}

	/** Case- and space-insensitive email lookup (Review Focus 1). */
	public function subscriber_by_email( string $email ): ?int {
		global $wpdb;
		$id = $wpdb->get_var( $wpdb->prepare( "SELECT id FROM `{$wpdb->prefix}mailpoet_subscribers` WHERE LOWER(TRIM(email)) = %s LIMIT 1", strtolower( trim( $email ) ) ) );
		return null === $id ? null : (int) $id;
	}

	/** @return int[] automation run ids naming a subscriber */
	public function runs_for( int $subscriber ): array {
		$ids = array();
		foreach ( $this->select( 'mailpoet_automation_run_subjects', array( 'key' => 'mailpoet:subscriber' ) ) as $s ) {
			$args = json_decode( (string) $s['args'], true );
			if ( (int) ( $args['subscriber_id'] ?? 0 ) === $subscriber ) {
				$ids[] = (int) $s['automation_run_id'];
			}
		}
		return array_values( array_unique( $ids ) );
	}

	/** @return array{emails: int, runs: int, confirmed: bool, wp_user_id: int} later real work on a subscriber (D14). */
	public function subscriber_counts( int $id ): array {
		$s = $this->row( 'mailpoet_subscribers', $id );
		return array(
			'emails'     => $this->count_rows( 'mailpoet_statistics_newsletters', array( 'subscriber_id' => $id ) ) + $this->count_rows( 'mailpoet_scheduled_task_subscribers', array( 'subscriber_id' => $id, 'processed' => 1 ) ),
			'runs'       => count( $this->runs_for( $id ) ),
			'confirmed'  => $s && ( null !== $s['confirmed_at'] || (int) $s['count_confirmations'] > 0 ),
			'wp_user_id' => (int) ( $s['wp_user_id'] ?? 0 ),
		);
	}
}
