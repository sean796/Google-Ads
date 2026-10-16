<?php
/**
 * Google Business Profile (GMB) client for NEO Pulse WP.
 *
 * OAuth token storage in wp_options, token refresh, summarize via OpenRouter,
 * and publish localPosts via Google My Business API v4.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Gmb {

	const OPTION_TOKENS      = 'neo_pulse_wp_gmb_tokens';
	const OPTION_CLIENT_ID   = 'neo_pulse_wp_gmb_client_id';
	const OPTION_CLIENT_SEC  = 'neo_pulse_wp_gmb_client_secret';
	const OPTION_LOCATION_ID = 'neo_pulse_wp_gmb_location_id';
	const OPTION_ACCOUNT_ID  = 'neo_pulse_wp_gmb_account_id';

	const GOOGLE_TOKEN_URL    = 'https://oauth2.googleapis.com/token';
	const GOOGLE_AUTH_URL     = 'https://accounts.google.com/o/oauth2/v2/auth';
	const GMB_SCOPE           = 'https://www.googleapis.com/auth/business.manage';
	const ACCOUNT_MGMT_BASE   = 'https://mybusinessaccountmanagement.googleapis.com/v1';
	const MYBUSINESS_V4_BASE  = 'https://mybusiness.googleapis.com/v4';

	const SUMMARY_MAX_WORDS = 150;

	/** OAuth state transients: neo_pulse_wp_gmb_state_<state> => user ID, valid 10 minutes. */
	const STATE_TRANSIENT_PREFIX = 'neo_pulse_wp_gmb_state_';
	const STATE_TTL              = 600;

	/**
	 * Per-platform character limits and copy-style constraints.
	 * Used by the Social Media Module modal to show limits and tailor AI output.
	 */
	const PLATFORM_CONSTRAINTS = array(
		'gmb'       => array( 'label' => 'Google Business Profile', 'max_chars' => 1500,  'max_words' => 150,  'image_required' => false, 'hashtags' => false, 'cta' => true,  'tone' => 'local-business conversational' ),
		'facebook'  => array( 'label' => 'Facebook',                'max_chars' => 2000,  'max_words' => 200,  'image_required' => false, 'hashtags' => true,  'cta' => true,  'tone' => 'friendly and engaging' ),
		'instagram' => array( 'label' => 'Instagram',               'max_chars' => 2200,  'max_words' => 200,  'image_required' => true,  'hashtags' => true,  'cta' => true,  'tone' => 'visual and aspirational' ),
		'linkedin'  => array( 'label' => 'LinkedIn',                'max_chars' => 3000,  'max_words' => 250,  'image_required' => false, 'hashtags' => true,  'cta' => true,  'tone' => 'professional and authoritative' ),
		'x'         => array( 'label' => 'X (Twitter)',             'max_chars' => 280,   'max_words' => 40,   'image_required' => false, 'hashtags' => true,  'cta' => false, 'tone' => 'concise and punchy' ),
	);

	public static function init(): void {
		add_action( 'rest_api_init', array( __CLASS__, 'register_oauth_routes' ) );
	}

	/**
	 * Register the OAuth callback as a REST route so WordPress handles it.
	 */
	public static function register_oauth_routes(): void {
		register_rest_route(
			'neo-pulse/v1',
			'/gmb/callback',
			array(
				'methods'             => 'GET',
				'callback'            => array( __CLASS__, 'handle_oauth_callback' ),
				'permission_callback' => '__return_true',
			)
		);
	}

	// ── Credentials ──────────────────────────────────────────────

	public static function get_client_id(): string {
		if ( defined( 'NEO_PULSE_WP_GMB_CLIENT_ID' ) && NEO_PULSE_WP_GMB_CLIENT_ID !== '' ) {
			return trim( (string) NEO_PULSE_WP_GMB_CLIENT_ID );
		}
		return trim( (string) get_option( self::OPTION_CLIENT_ID, '' ) );
	}

	public static function get_client_secret(): string {
		if ( defined( 'NEO_PULSE_WP_GMB_CLIENT_SECRET' ) && NEO_PULSE_WP_GMB_CLIENT_SECRET !== '' ) {
			return trim( (string) NEO_PULSE_WP_GMB_CLIENT_SECRET );
		}
		return trim( (string) get_option( self::OPTION_CLIENT_SEC, '' ) );
	}

	public static function get_location_id(): string {
		if ( defined( 'NEO_PULSE_WP_GMB_LOCATION_ID' ) && NEO_PULSE_WP_GMB_LOCATION_ID !== '' ) {
			return trim( (string) NEO_PULSE_WP_GMB_LOCATION_ID );
		}
		return trim( (string) get_option( self::OPTION_LOCATION_ID, '' ) );
	}

	public static function get_account_id(): string {
		return trim( (string) get_option( self::OPTION_ACCOUNT_ID, '' ) );
	}

	public static function is_configured(): bool {
		return self::get_client_id() !== '' && self::get_client_secret() !== '';
	}

	public static function is_connected(): bool {
		$tokens = self::get_tokens();
		return is_array( $tokens ) && ! empty( $tokens['access_token'] );
	}

	public static function save_credentials( string $client_id, string $client_secret, string $location_id = '' ): void {
		update_option( self::OPTION_CLIENT_ID, sanitize_text_field( $client_id ) );
		update_option( self::OPTION_CLIENT_SEC, sanitize_text_field( $client_secret ) );
		if ( $location_id !== '' ) {
			update_option( self::OPTION_LOCATION_ID, sanitize_text_field( $location_id ) );
		}
	}

	public static function save_location_id( string $location_id ): void {
		update_option( self::OPTION_LOCATION_ID, sanitize_text_field( $location_id ) );
	}

	// ── Tokens ───────────────────────────────────────────────────

	/**
	 * @return array{access_token:string,refresh_token:string,expires_at:int}|null
	 */
	public static function get_tokens(): ?array {
		$raw = get_option( self::OPTION_TOKENS );
		if ( ! is_array( $raw ) || empty( $raw['access_token'] ) ) {
			return null;
		}
		return $raw;
	}

	public static function save_tokens( array $tokens ): void {
		$store = array(
			'access_token'  => isset( $tokens['access_token'] )  ? (string) $tokens['access_token']  : '',
			'refresh_token' => isset( $tokens['refresh_token'] ) ? (string) $tokens['refresh_token'] : '',
			'expires_at'    => isset( $tokens['expires_in'] )
				? time() + (int) $tokens['expires_in'] - 60
				: ( isset( $tokens['expires_at'] ) ? (int) $tokens['expires_at'] : 0 ),
		);
		$existing = self::get_tokens();
		if ( $store['refresh_token'] === '' && is_array( $existing ) && ! empty( $existing['refresh_token'] ) ) {
			$store['refresh_token'] = $existing['refresh_token'];
		}
		update_option( self::OPTION_TOKENS, $store, false );
	}

	public static function clear_tokens(): void {
		delete_option( self::OPTION_TOKENS );
	}

	/**
	 * @return string|WP_Error
	 */
	public static function get_valid_access_token() {
		$tokens = self::get_tokens();
		if ( ! is_array( $tokens ) || empty( $tokens['access_token'] ) ) {
			return new WP_Error( 'neo-pulse_gmb_not_connected', __( 'Google Business Profile is not connected. Use Connect in Settings.', 'neo-pulse-wp' ) );
		}

		if ( ! empty( $tokens['expires_at'] ) && $tokens['expires_at'] > time() + 30 ) {
			return $tokens['access_token'];
		}

		if ( empty( $tokens['refresh_token'] ) ) {
			return new WP_Error( 'neo-pulse_gmb_no_refresh', __( 'No refresh token. Re-connect Google Business Profile.', 'neo-pulse-wp' ) );
		}

		$response = wp_remote_post(
			self::GOOGLE_TOKEN_URL,
			array(
				'timeout' => 15,
				'body'    => array(
					'client_id'     => self::get_client_id(),
					'client_secret' => self::get_client_secret(),
					'refresh_token' => $tokens['refresh_token'],
					'grant_type'    => 'refresh_token',
				),
			)
		);

		if ( is_wp_error( $response ) ) {
			return $response;
		}

		$code = (int) wp_remote_retrieve_response_code( $response );
		$body = json_decode( wp_remote_retrieve_body( $response ), true );

		if ( $code < 200 || $code >= 300 || empty( $body['access_token'] ) ) {
			$msg = is_array( $body ) && isset( $body['error_description'] ) && is_scalar( $body['error_description'] )
				? (string) $body['error_description']
				: 'Token refresh failed.';
			// Only a revoked/expired refresh token means the connection is gone; a timeout, quota or
			// 5xx from Google must not disconnect the site.
			if ( is_array( $body ) && isset( $body['error'] ) && 'invalid_grant' === $body['error'] ) {
				self::clear_tokens();
			}
			return new WP_Error( 'neo-pulse_gmb_refresh', $msg );
		}

		self::save_tokens( $body );
		return (string) $body['access_token'];
	}

	// ── OAuth flow ───────────────────────────────────────────────

	public static function get_redirect_uri(): string {
		return rest_url( 'neo-pulse/v1/gmb/callback' );
	}

	/**
	 * Google consent URL. The state is a random value remembered for 10 minutes against the user who
	 * started the connection; the callback (which arrives without a WordPress login) acts for them.
	 */
	public static function get_authorize_url(): string {
		$state = wp_generate_password( 40, false, false );
		set_transient( self::STATE_TRANSIENT_PREFIX . $state, get_current_user_id(), self::STATE_TTL );
		return add_query_arg(
			array(
				'client_id'     => self::get_client_id(),
				'redirect_uri'  => self::get_redirect_uri(),
				'response_type' => 'code',
				'scope'         => self::GMB_SCOPE,
				'access_type'   => 'offline',
				'prompt'        => 'consent',
				'state'         => $state,
			),
			self::GOOGLE_AUTH_URL
		);
	}

	/**
	 * @param WP_REST_Request $request
	 * @return WP_REST_Response
	 */
	public static function handle_oauth_callback( $request ) {
		$code  = $request->get_param( 'code' );
		$state = $request->get_param( 'state' );
		$error = $request->get_param( 'error' );

		// One-time state: look up who started the flow, then forget it whatever happens next.
		$state   = is_string( $state ) ? preg_replace( '/[^A-Za-z0-9]/', '', $state ) : '';
		$user_id = 0;
		if ( is_string( $state ) && strlen( $state ) >= 32 ) {
			$user_id = (int) get_transient( self::STATE_TRANSIENT_PREFIX . $state );
			delete_transient( self::STATE_TRANSIENT_PREFIX . $state );
		}

		if ( $error ) {
			return self::redirect_with_notice( 'error', 'Google denied access: ' . sanitize_text_field( is_scalar( $error ) ? (string) $error : '' ) );
		}

		if ( ! is_string( $code ) || $code === '' || $user_id < 1 ) {
			return self::redirect_with_notice( 'error', 'Invalid OAuth state or missing code.' );
		}
		if ( ! user_can( $user_id, 'manage_options' ) ) {
			return self::redirect_with_notice( 'error', 'Only an administrator can connect Google Business Profile.' );
		}
		wp_set_current_user( $user_id );

		$response = wp_remote_post(
			self::GOOGLE_TOKEN_URL,
			array(
				'timeout' => 15,
				'body'    => array(
					'code'          => sanitize_text_field( $code ),
					'client_id'     => self::get_client_id(),
					'client_secret' => self::get_client_secret(),
					'redirect_uri'  => self::get_redirect_uri(),
					'grant_type'    => 'authorization_code',
				),
			)
		);

		if ( is_wp_error( $response ) ) {
			return self::redirect_with_notice( 'error', $response->get_error_message() );
		}

		$body = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( empty( $body['access_token'] ) ) {
			$msg = is_array( $body ) && isset( $body['error_description'] ) ? $body['error_description'] : 'Token exchange failed.';
			return self::redirect_with_notice( 'error', $msg );
		}

		self::save_tokens( $body );

		$account = self::resolve_account( $body['access_token'] );
		if ( ! is_wp_error( $account ) && ! empty( $account ) ) {
			update_option( self::OPTION_ACCOUNT_ID, sanitize_text_field( $account ) );
		}

		return self::redirect_with_notice( 'success', 'Google Business Profile connected.' );
	}

	/**
	 * @return WP_REST_Response
	 */
	private static function redirect_with_notice( string $type, string $message ) {
		$url = admin_url( 'admin.php?page=neo-pulse-wp-settings&tab=gmb&neo-pulse_gmb_notice=' . rawurlencode( $type . '|' . $message ) );
		return new WP_REST_Response( null, 302, array( 'Location' => $url ) );
	}

	// ── Account resolution ───────────────────────────────────────

	/**
	 * Resolve the first account name from Google Business Profile.
	 *
	 * @return string|WP_Error  Account name e.g. "accounts/123456"
	 */
	public static function resolve_account( string $access_token ) {
		$response = wp_remote_get(
			self::ACCOUNT_MGMT_BASE . '/accounts',
			array(
				'timeout' => 15,
				'headers' => array( 'Authorization' => 'Bearer ' . $access_token ),
			)
		);
		if ( is_wp_error( $response ) ) {
			return $response;
		}
		$data = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( ! is_array( $data ) || empty( $data['accounts'][0]['name'] ) ) {
			return new WP_Error( 'neo-pulse_gmb_no_account', __( 'No Google Business Profile accounts found.', 'neo-pulse-wp' ) );
		}
		return (string) $data['accounts'][0]['name'];
	}

	// ── Summarise post via OpenRouter ────────────────────────────

	/**
	 * @return string|WP_Error  Plain-text GBP-ready summary.
	 */
	public static function summarize_post( int $post_id, string $platform = 'gmb' ) {
		$post = get_post( $post_id );
		if ( ! $post instanceof WP_Post ) {
			return new WP_Error( 'neo-pulse_gmb_post', __( 'Post not found.', 'neo-pulse-wp' ) );
		}

		$constraints = self::PLATFORM_CONSTRAINTS[ $platform ] ?? self::PLATFORM_CONSTRAINTS['gmb'];
		$max_words   = (int) $constraints['max_words'];
		$max_chars   = (int) $constraints['max_chars'];
		$tone        = (string) $constraints['tone'];
		$use_hashtags = ! empty( $constraints['hashtags'] );
		$use_cta      = ! empty( $constraints['cta'] );
		$label        = (string) $constraints['label'];

		$title   = get_the_title( $post );
		$excerpt = has_excerpt( $post ) ? wp_strip_all_tags( $post->post_excerpt ) : '';
		$body    = wp_strip_all_tags( $post->post_content );
		if ( mb_strlen( $body ) > 3000 ) {
			$body = mb_substr( $body, 0, 3000 ) . '…';
		}

		$system = "You are a social media copywriter for a local business.\n"
			. "Write a {$label} post (max {$max_words} words, max {$max_chars} characters) that summarises the page below.\n"
			. "Tone: {$tone}.\n";
		if ( $use_cta ) {
			$system .= "Include a call to action with \"Learn more\" at the end.\n";
		}
		if ( $use_hashtags ) {
			$system .= "Include 2-4 relevant hashtags at the end.\n";
		} else {
			$system .= "Do NOT use hashtags or emojis.\n";
		}
		$system .= 'Return ONLY the post text, nothing else.';

		$user = "Title: {$title}\n";
		if ( $excerpt !== '' ) {
			$user .= "Excerpt: {$excerpt}\n";
		}
		$user .= "\nContent:\n{$body}";

		$max_tokens = $platform === 'x' ? 120 : 500;
		$result     = Neo_Pulse_Wp_OpenRouter::complete( $system, $user, $max_tokens, 0.6 );
		if ( is_wp_error( $result ) ) {
			return $result;
		}

		$text = trim( (string) $result );
		$text = preg_replace( '/^["\']+|["\']+$/u', '', $text );
		return $text;
	}

	/**
	 * Get post data for the Social Media Module preview.
	 *
	 * @return array{title:string,excerpt:string,url:string,image_url:string|null}|WP_Error
	 */
	public static function get_post_preview_data( int $post_id ) {
		$post = get_post( $post_id );
		if ( ! $post instanceof WP_Post ) {
			return new WP_Error( 'neo-pulse_gmb_post', __( 'Post not found.', 'neo-pulse-wp' ) );
		}

		$image_url = get_the_post_thumbnail_url( $post_id, 'large' );

		return array(
			'title'     => get_the_title( $post ),
			'excerpt'   => has_excerpt( $post ) ? wp_strip_all_tags( $post->post_excerpt ) : wp_trim_words( wp_strip_all_tags( $post->post_content ), 55 ),
			'url'       => get_permalink( $post_id ),
			'image_url' => $image_url ? $image_url : null,
		);
	}

	// ── Publish local post to GBP ────────────────────────────────

	/**
	 * @param string      $summary   Post body text.
	 * @param string      $cta_url   "Learn more" button URL.
	 * @param string|null $image_url Featured image (absolute URL).
	 * @return array{ok:bool,post_name:string}|WP_Error
	 */
	public static function create_local_post( string $summary, string $cta_url, ?string $image_url = null ) {
		$access_token = self::get_valid_access_token();
		if ( is_wp_error( $access_token ) ) {
			return $access_token;
		}

		$location_id = self::get_location_id();
		if ( $location_id === '' ) {
			return new WP_Error( 'neo-pulse_gmb_no_location', __( 'GBP Location ID is not set. Configure it in NEO Pulse WP Settings → GMB.', 'neo-pulse-wp' ) );
		}

		$account_id = self::get_account_id();
		if ( $account_id === '' ) {
			$account_id = self::resolve_account( $access_token );
			if ( is_wp_error( $account_id ) ) {
				return $account_id;
			}
			update_option( self::OPTION_ACCOUNT_ID, sanitize_text_field( $account_id ) );
		}

		$location_name = self::build_location_name( $account_id, $location_id );

		$post_body = array(
			'topicType'     => 'STANDARD',
			'languageCode'  => substr( get_locale(), 0, 2 ),
			'summary'       => $summary,
			'callToAction'  => array(
				'actionType' => 'LEARN_MORE',
				'url'        => $cta_url,
			),
		);

		if ( $image_url ) {
			$post_body['media'] = array(
				array(
					'mediaFormat' => 'PHOTO',
					'sourceUrl'   => $image_url,
				),
			);
		}

		$url = self::MYBUSINESS_V4_BASE . '/' . $location_name . '/localPosts';

		$response = wp_remote_post(
			$url,
			array(
				'timeout' => 30,
				'headers' => array(
					'Authorization' => 'Bearer ' . $access_token,
					'Content-Type'  => 'application/json',
				),
				'body'    => wp_json_encode( $post_body ),
			)
		);

		if ( is_wp_error( $response ) ) {
			return $response;
		}

		$code = (int) wp_remote_retrieve_response_code( $response );
		$data = json_decode( wp_remote_retrieve_body( $response ), true );

		if ( $code === 429 ) {
			return new WP_Error( 'neo-pulse_gmb_quota', __( 'Google Business Profile quota exceeded. Wait a minute and try again.', 'neo-pulse-wp' ) );
		}

		if ( $code < 200 || $code >= 300 ) {
			$msg = 'GBP API error.';
			if ( is_array( $data ) && isset( $data['error']['message'] ) ) {
				$msg = (string) $data['error']['message'];
			}
			return new WP_Error( 'neo-pulse_gmb_api', sprintf( 'GBP %d: %s', $code, $msg ) );
		}

		return array(
			'ok'        => true,
			'post_name' => isset( $data['name'] ) ? (string) $data['name'] : '',
		);
	}

	/**
	 * Build the full location resource name for the v4 API.
	 *
	 * Accepts either a bare numeric ID, a full "locations/123" path,
	 * or a full "accounts/X/locations/Y" path.
	 */
	private static function build_location_name( string $account_id, string $location_id ): string {
		if ( strpos( $location_id, 'accounts/' ) === 0 ) {
			return $location_id;
		}

		$account = $account_id;
		if ( strpos( $account, 'accounts/' ) !== 0 ) {
			$account = 'accounts/' . $account;
		}

		if ( strpos( $location_id, 'locations/' ) === 0 ) {
			return $account . '/' . $location_id;
		}

		return $account . '/locations/' . $location_id;
	}
}
