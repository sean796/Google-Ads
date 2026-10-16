<?php
/**
 * Starter prompts for a new AI Chat, and each user's usage history of them.
 *
 * The chat shows a handful of bubbles above the composer on a new chat. The
 * pool here is larger than what is shown: the script keeps the user's most
 * used prompt first and fills the rest at random from prompts they have not
 * used yet (see pickSuggestions() in ai-chat.js). Usage is counted per user in
 * user meta, so it follows them across browsers.
 *
 * @package EMCP_Tools
 * @since   3.18.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * @since 3.18.0
 */
class EMCP_Tools_AI_Chat_Suggestions {

	/** User meta: array( prompt id => times used ). */
	const USAGE_META = 'emcp_ai_chat_prompt_usage';

	/** How many bubbles a new chat shows. */
	const SHOWN = 6;

	/** Most prompts accepted from the filter. */
	const MAX_POOL = 40;

	/**
	 * The prompt pool for a context.
	 *
	 * Each item has a stable id (usage is counted by id, so it survives a
	 * translation), a short label and the full prompt it puts in the composer.
	 * A [bracketed] part is selected after insertion so the user types over it.
	 *
	 * @param string $embed '' for the AI Chat page, 'elementor' or 'gutenberg' in an editor.
	 * @return array<int,array{id:string,label:string,prompt:string}>
	 */
	public static function pool( string $embed = '' ): array {
		$list = '' !== $embed ? self::page_prompts() : self::site_prompts();

		/**
		 * Filters the starter prompts offered on a new AI Chat.
		 *
		 * @since 3.18.0
		 * @param array  $list  Items of array( 'id' => string, 'label' => string, 'prompt' => string ).
		 *                      The id is optional; one is derived from the label when missing.
		 * @param string $embed '' for the AI Chat page, 'elementor' or 'gutenberg' in an editor.
		 */
		$list = apply_filters( 'emcp_ai_chat_suggestions', $list, $embed );

		$out  = array();
		$seen = array();
		foreach ( (array) $list as $item ) {
			if ( ! is_array( $item ) ) {
				continue;
			}
			$label  = trim( wp_strip_all_tags( (string) ( $item['label'] ?? '' ) ) );
			$prompt = trim( wp_strip_all_tags( (string) ( $item['prompt'] ?? '' ) ) );
			if ( '' === $label || '' === $prompt ) {
				continue;
			}
			$id = sanitize_key( (string) ( $item['id'] ?? '' ) );
			if ( '' === $id ) {
				$id = sanitize_key( sanitize_title( $label ) );
			}
			if ( '' === $id || isset( $seen[ $id ] ) ) {
				continue;
			}
			$seen[ $id ] = true;
			$out[]       = array(
				'id'     => $id,
				'label'  => $label,
				'prompt' => $prompt,
			);
			if ( count( $out ) >= self::MAX_POOL ) {
				break;
			}
		}
		return $out;
	}

	/**
	 * The current user's usage counts, limited to prompts that still exist.
	 *
	 * @param int $user_id User id; 0 for the current user.
	 * @return array<string,int>
	 */
	public static function usage( int $user_id = 0 ): array {
		$user_id = $user_id ? $user_id : get_current_user_id();
		if ( ! $user_id ) {
			return array();
		}
		$raw = get_user_meta( $user_id, self::USAGE_META, true );
		if ( ! is_array( $raw ) ) {
			return array();
		}
		$known = self::known_ids();
		$out   = array();
		foreach ( $raw as $id => $count ) {
			$id    = sanitize_key( (string) $id );
			$count = (int) $count;
			if ( '' !== $id && $count > 0 && isset( $known[ $id ] ) ) {
				$out[ $id ] = $count;
			}
		}
		return $out;
	}

	/**
	 * Count one use of a prompt for a user.
	 *
	 * @param string $id      Prompt id.
	 * @param int    $user_id User id; 0 for the current user.
	 * @return array<string,int>|WP_Error The updated counts, or an error for an unknown prompt.
	 */
	public static function record( string $id, int $user_id = 0 ) {
		$user_id = $user_id ? $user_id : get_current_user_id();
		$id      = sanitize_key( $id );
		if ( ! $user_id ) {
			return new WP_Error( 'not_logged_in', __( 'You must be logged in.', 'emcp-tools' ), array( 'status' => 401 ) );
		}
		if ( '' === $id || ! isset( self::known_ids()[ $id ] ) ) {
			return new WP_Error( 'unknown_prompt', __( 'Unknown prompt.', 'emcp-tools' ), array( 'status' => 400 ) );
		}
		$usage        = self::usage( $user_id );
		$usage[ $id ] = min( 1000000, (int) ( $usage[ $id ] ?? 0 ) + 1 );
		update_user_meta( $user_id, self::USAGE_META, $usage );
		return $usage;
	}

	/** @return array<string,true> Every prompt id in either context. */
	private static function known_ids(): array {
		$ids = array();
		foreach ( array( '', 'elementor' ) as $embed ) {
			foreach ( self::pool( $embed ) as $item ) {
				$ids[ $item['id'] ] = true;
			}
		}
		return $ids;
	}

	/** @return array<int,array{id:string,label:string,prompt:string}> Site-level prompts for the AI Chat page. */
	private static function site_prompts(): array {
		return array(
			array( 'id' => 'site-landing', 'label' => __( 'Build a landing page', 'emcp-tools' ), 'prompt' => __( 'Build a landing page for [my business] with a hero, services, testimonials, pricing and a contact form.', 'emcp-tools' ) ),
			array( 'id' => 'site-blog', 'label' => __( 'Write a blog post', 'emcp-tools' ), 'prompt' => __( 'Write a blog post about [topic] and save it as a draft.', 'emcp-tools' ) ),
			array( 'id' => 'site-seo', 'label' => __( 'Audit my homepage SEO', 'emcp-tools' ), 'prompt' => __( 'Audit the SEO of my homepage and list the most important fixes, then apply the safe ones.', 'emcp-tools' ) ),
			array( 'id' => 'site-a11y', 'label' => __( 'Check accessibility', 'emcp-tools' ), 'prompt' => __( 'Check my homepage for accessibility problems like contrast and missing alt text, and fix what you safely can.', 'emcp-tools' ) ),
			array( 'id' => 'site-speed', 'label' => __( 'Speed up my site', 'emcp-tools' ), 'prompt' => __( 'Analyze the performance of my site and give me the five fixes that would help most.', 'emcp-tools' ) ),
			array( 'id' => 'site-security', 'label' => __( 'Run a security scan', 'emcp-tools' ), 'prompt' => __( 'Run a security scan of my site and explain anything that needs my attention.', 'emcp-tools' ) ),
			array( 'id' => 'site-about', 'label' => __( 'Create an About page', 'emcp-tools' ), 'prompt' => __( 'Create an About page for [my business] with our story, the team and our values.', 'emcp-tools' ) ),
			array( 'id' => 'site-contact', 'label' => __( 'Create a Contact page', 'emcp-tools' ), 'prompt' => __( 'Create a Contact page with a contact form, our address, a map section and opening hours.', 'emcp-tools' ) ),
			array( 'id' => 'site-services', 'label' => __( 'Create a Services page', 'emcp-tools' ), 'prompt' => __( 'Create a Services page listing [our services], each with an icon, a short description and a call to action.', 'emcp-tools' ) ),
			array( 'id' => 'site-faq', 'label' => __( 'Build an FAQ page', 'emcp-tools' ), 'prompt' => __( 'Build an FAQ page with [8] common questions about [my business], using an accordion.', 'emcp-tools' ) ),
			array( 'id' => 'site-pricing', 'label' => __( 'Design a pricing page', 'emcp-tools' ), 'prompt' => __( 'Design a pricing page with three plans, a feature comparison and a short FAQ.', 'emcp-tools' ) ),
			array( 'id' => 'site-404', 'label' => __( 'Design a 404 page', 'emcp-tools' ), 'prompt' => __( 'Design a friendly 404 page with a search box and links to the most useful pages.', 'emcp-tools' ) ),
			array( 'id' => 'site-colors', 'label' => __( 'Set brand colors', 'emcp-tools' ), 'prompt' => __( 'Set the global colors of the site to a palette built around [#1d4ed8] and use them for buttons and headings.', 'emcp-tools' ) ),
			array( 'id' => 'site-fonts', 'label' => __( 'Pick site fonts', 'emcp-tools' ), 'prompt' => __( 'Choose a heading and body font pair that suits [a modern agency] and set them as the global typography.', 'emcp-tools' ) ),
			array( 'id' => 'site-home-review', 'label' => __( 'Review my homepage', 'emcp-tools' ), 'prompt' => __( 'Review my homepage and suggest the five changes that would improve it most.', 'emcp-tools' ) ),
			array( 'id' => 'site-structure', 'label' => __( 'Plan my site', 'emcp-tools' ), 'prompt' => __( 'Plan the pages and navigation for a [dental clinic] website and list the pages to create first.', 'emcp-tools' ) ),
			array( 'id' => 'site-menu', 'label' => __( 'Improve my menu', 'emcp-tools' ), 'prompt' => __( 'Review the main navigation menu and suggest a clearer structure, then apply it.', 'emcp-tools' ) ),
			array( 'id' => 'site-links', 'label' => __( 'Find broken links', 'emcp-tools' ), 'prompt' => __( 'Find broken internal links across the site and propose redirects for them.', 'emcp-tools' ) ),
			array( 'id' => 'site-alt-text', 'label' => __( 'Add missing alt text', 'emcp-tools' ), 'prompt' => __( 'Find images without alt text on my main pages and add short, descriptive alt text.', 'emcp-tools' ) ),
			array( 'id' => 'site-plugins', 'label' => __( 'Review my plugins', 'emcp-tools' ), 'prompt' => __( 'List my installed plugins, flag inactive or outdated ones and suggest which to remove.', 'emcp-tools' ) ),
		);
	}

	/** @return array<int,array{id:string,label:string,prompt:string}> Prompts about the page open in an editor. */
	private static function page_prompts(): array {
		return array(
			array( 'id' => 'page-improve', 'label' => __( 'Improve this page', 'emcp-tools' ), 'prompt' => __( 'Review this page and improve its layout, spacing and copy without changing its structure.', 'emcp-tools' ) ),
			array( 'id' => 'page-add-section', 'label' => __( 'Add a section', 'emcp-tools' ), 'prompt' => __( 'Add a [testimonials] section below the hero that matches the style of this page.', 'emcp-tools' ) ),
			array( 'id' => 'page-copy', 'label' => __( 'Rewrite the copy', 'emcp-tools' ), 'prompt' => __( 'Rewrite the text on this page to be clearer and more persuasive. Keep the layout as it is.', 'emcp-tools' ) ),
			array( 'id' => 'page-mobile', 'label' => __( 'Fix mobile layout', 'emcp-tools' ), 'prompt' => __( 'Check this page on tablet and mobile and fix spacing, font sizes and columns that do not fit.', 'emcp-tools' ) ),
			array( 'id' => 'page-brand', 'label' => __( 'Match brand styles', 'emcp-tools' ), 'prompt' => __( 'Make the headings, buttons and colors on this page consistent with the global colors and fonts of the site.', 'emcp-tools' ) ),
			array( 'id' => 'page-seo', 'label' => __( 'SEO for this page', 'emcp-tools' ), 'prompt' => __( 'Audit this page for SEO and suggest a better title, meta description and heading structure.', 'emcp-tools' ) ),
			array( 'id' => 'page-hero', 'label' => __( 'Rework the hero', 'emcp-tools' ), 'prompt' => __( 'Redesign the hero section with a stronger headline, a short subheading and one clear call to action.', 'emcp-tools' ) ),
			array( 'id' => 'page-cta', 'label' => __( 'Add a call to action', 'emcp-tools' ), 'prompt' => __( 'Add a call-to-action section near the end of this page that invites visitors to [book a call].', 'emcp-tools' ) ),
			array( 'id' => 'page-testimonials', 'label' => __( 'Add testimonials', 'emcp-tools' ), 'prompt' => __( 'Add a testimonials section with [3] customer quotes in a clean grid.', 'emcp-tools' ) ),
			array( 'id' => 'page-faq', 'label' => __( 'Add an FAQ', 'emcp-tools' ), 'prompt' => __( 'Add an FAQ section with [5] questions that fit this page, using an accordion.', 'emcp-tools' ) ),
			array( 'id' => 'page-spacing', 'label' => __( 'Tidy the spacing', 'emcp-tools' ), 'prompt' => __( 'Make the vertical spacing between the sections on this page consistent.', 'emcp-tools' ) ),
			array( 'id' => 'page-a11y', 'label' => __( 'Check accessibility', 'emcp-tools' ), 'prompt' => __( 'Check this page for contrast problems and missing alt text, and fix what you safely can.', 'emcp-tools' ) ),
			array( 'id' => 'page-shorten', 'label' => __( 'Shorten this page', 'emcp-tools' ), 'prompt' => __( 'Make this page shorter and easier to scan without losing the key information.', 'emcp-tools' ) ),
			array( 'id' => 'page-images', 'label' => __( 'Improve the images', 'emcp-tools' ), 'prompt' => __( 'Suggest better images for this page and add stock photos where images are missing.', 'emcp-tools' ) ),
			array( 'id' => 'page-translate', 'label' => __( 'Translate this page', 'emcp-tools' ), 'prompt' => __( 'Translate the text on this page into [Spanish] and keep the layout.', 'emcp-tools' ) ),
		);
	}
}
