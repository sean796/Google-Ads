<?php
/**
 * AI Chat screen (spec 8.6): registers the Pro React screen and builds its boot
 * payload, the same client config the editor panels receive.
 *
 * @package EMCP_Tools
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * AI Chat screen data.
 */
final class EMCP_Tools_Admin_AI_Chat_Data {

	/** Register the screen for the ai-chat tab. */
	public static function register_screen(): void {
		EMCP_Tools_Admin_Screens::register(
			'ai-chat',
			array(
				'script' => 'screen-ai-chat',
				'root'   => 'pro',
				'tabs'   => array( 'ai-chat' ),
				'boot'   => array( self::class, 'payload' ),
			)
		);
	}

	/**
	 * Boot payload: the chat client config (about 120 KB, mostly model lists).
	 */
	public static function payload(): array {
		return class_exists( 'EMCP_Tools_AI_Chat_Page' ) ? EMCP_Tools_AI_Chat_Page::client_config() : array();
	}
}
