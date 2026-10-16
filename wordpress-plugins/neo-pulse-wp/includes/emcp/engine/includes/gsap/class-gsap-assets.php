<?php
/**
 * GSAP asset catalog, registration, and enqueueing.
 *
 * @package EMCP_Tools
 * @since   3.16.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Provides stable WordPress handles for the locally bundled GSAP distribution.
 *
 * Every asset is registered when the module boots. Selected assets are enqueued
 * only in the configured contexts, so themes and plugins may safely declare an
 * `emcp-gsap-*` handle as a dependency without loading a second GSAP copy.
 *
 * @since 3.16.0
 */
final class EMCP_Tools_GSAP_Assets {

	const VERSION     = '3.15.0';
	const CORE_HANDLE = 'emcp-gsap';
	const ASSET_ROOT  = 'assets/vendor/gsap/3.15.0/';

	/**
	 * Official plugins included in the GSAP 3.15.0 npm distribution.
	 *
	 * @return array<string,array<string,mixed>>
	 */
	public static function plugins(): array {
		$plugins = array(
			'css-rule'           => self::plugin( 'CSSRulePlugin', 'CSSRulePlugin.min.js', 'CSSRulePlugin', 'Animate CSS pseudo-elements.' ),
			'custom-bounce'      => self::plugin( 'CustomBounce', 'CustomBounce.min.js', 'CustomBounce', 'Create custom bounce eases.', array( 'custom-ease' ) ),
			'custom-ease'        => self::plugin( 'CustomEase', 'CustomEase.min.js', 'CustomEase', 'Create custom easing curves.' ),
			'custom-wiggle'      => self::plugin( 'CustomWiggle', 'CustomWiggle.min.js', 'CustomWiggle', 'Create custom wiggle eases.', array( 'custom-ease' ) ),
			'draggable'          => self::plugin( 'Draggable', 'Draggable.min.js', 'Draggable', 'Make DOM and SVG elements draggable.' ),
			'draw-svg'           => self::plugin( 'DrawSVGPlugin', 'DrawSVGPlugin.min.js', 'DrawSVGPlugin', 'Animate SVG stroke drawing.' ),
			'easel'              => self::plugin( 'EaselPlugin', 'EaselPlugin.min.js', 'EaselPlugin', 'Animate CreateJS/EaselJS objects.', array(), 'CreateJS/EaselJS must be loaded separately.' ),
			'ease-pack'          => self::plugin( 'EasePack', 'EasePack.min.js', 'EasePack', 'Additional RoughEase, SlowMo, and ExpoScaleEase eases.' ),
			'flip'               => self::plugin( 'Flip', 'Flip.min.js', 'Flip', 'Animate layout changes with the FLIP technique.' ),
			'gs-dev-tools'       => self::plugin( 'GSDevTools', 'GSDevTools.min.js', 'GSDevTools', 'Interactive animation debugging controls.' ),
			'inertia'            => self::plugin( 'InertiaPlugin', 'InertiaPlugin.min.js', 'InertiaPlugin', 'Momentum and velocity-based motion.' ),
			'morph-svg'          => self::plugin( 'MorphSVGPlugin', 'MorphSVGPlugin.min.js', 'MorphSVGPlugin', 'Morph one SVG shape into another.' ),
			'motion-path-helper' => self::plugin( 'MotionPathHelper', 'MotionPathHelper.min.js', 'MotionPathHelper', 'Visually edit motion paths.', array( 'motion-path' ) ),
			'motion-path'        => self::plugin( 'MotionPathPlugin', 'MotionPathPlugin.min.js', 'MotionPathPlugin', 'Animate elements along paths.' ),
			'observer'           => self::plugin( 'Observer', 'Observer.min.js', 'Observer', 'Normalize pointer, touch, wheel, and scroll input.' ),
			'physics-2d'         => self::plugin( 'Physics2DPlugin', 'Physics2DPlugin.min.js', 'Physics2DPlugin', 'Velocity, acceleration, friction, and gravity motion.' ),
			'physics-props'      => self::plugin( 'PhysicsPropsPlugin', 'PhysicsPropsPlugin.min.js', 'PhysicsPropsPlugin', 'Physics-based animation of arbitrary properties.' ),
			'pixi'               => self::plugin( 'PixiPlugin', 'PixiPlugin.min.js', 'PixiPlugin', 'Animate PixiJS objects.', array(), 'PixiJS must be loaded separately.' ),
			'scramble-text'      => self::plugin( 'ScrambleTextPlugin', 'ScrambleTextPlugin.min.js', 'ScrambleTextPlugin', 'Animate text through scrambled characters.' ),
			'scroll-smoother'    => self::plugin( 'ScrollSmoother', 'ScrollSmoother.min.js', 'ScrollSmoother', 'Smooth scrolling integrated with ScrollTrigger.', array( 'scroll-trigger' ) ),
			'scroll-to'          => self::plugin( 'ScrollToPlugin', 'ScrollToPlugin.min.js', 'ScrollToPlugin', 'Animate window or element scroll positions.' ),
			'scroll-trigger'     => self::plugin( 'ScrollTrigger', 'ScrollTrigger.min.js', 'ScrollTrigger', 'Build scroll-driven animations.' ),
			'split-text'         => self::plugin( 'SplitText', 'SplitText.min.js', 'SplitText', 'Split text into animatable characters, words, and lines.' ),
			'text'               => self::plugin( 'TextPlugin', 'TextPlugin.min.js', 'TextPlugin', 'Animate text content.' ),
		);
		foreach ( $plugins as $id => &$plugin ) {
			$plugin['handle'] = 'emcp-gsap-' . $id;
		}
		unset( $plugin );
		return $plugins;
	}

	/** @return array<string,mixed> */
	private static function plugin( string $label, string $file, string $global, string $description, array $dependencies = array(), string $external = '' ): array {
		return array(
			'label'         => $label,
			'file'          => $file,
			'handle'        => '',
			'global'        => $global,
			'description'   => $description,
			'dependencies'  => $dependencies,
			'external_note' => $external,
		);
	}

	/** @return string[] */
	public static function plugin_ids(): array {
		return array_keys( self::plugins() );
	}

	/**
	 * Normalize IDs and add required plugin dependencies.
	 *
	 * @param mixed $ids Candidate plugin ids.
	 * @return string[]
	 */
	public static function dependency_closure( $ids ): array {
		$catalog = self::plugins();
		$queue   = is_array( $ids ) ? $ids : array();
		$result  = array();

		while ( $queue ) {
			$candidate = array_shift( $queue );
			if ( ! is_scalar( $candidate ) ) {
				continue;
			}
			$id = sanitize_key( (string) $candidate );
			if ( ! isset( $catalog[ $id ] ) || in_array( $id, $result, true ) ) {
				continue;
			}
			$result[] = $id;
			foreach ( $catalog[ $id ]['dependencies'] as $dependency ) {
				$queue[] = $dependency;
			}
		}

		return array_values( array_intersect( array_keys( $catalog ), $result ) );
	}

	/** Register core and every plugin with WordPress. */
	public static function register_scripts(): void {
		$core_url = EMCP_Tools_Pro_Loader::url( self::ASSET_ROOT . 'gsap.min.js' );
		if ( '' === $core_url ) {
			return;
		}

		wp_register_script( self::CORE_HANDLE, $core_url, array(), self::VERSION, array( 'in_footer' => true, 'strategy' => 'defer' ) );
		foreach ( self::plugins() as $plugin ) {
			$url = EMCP_Tools_Pro_Loader::url( self::ASSET_ROOT . $plugin['file'] );
			if ( '' === $url ) {
				continue;
			}
			$dependencies = array( self::CORE_HANDLE );
			foreach ( $plugin['dependencies'] as $dependency ) {
				$dependencies[] = self::plugins()[ $dependency ]['handle'];
			}
			wp_register_script( $plugin['handle'], $url, $dependencies, self::VERSION, array( 'in_footer' => true, 'strategy' => 'defer' ) );
		}

		/**
		 * Fires after all EMCP GSAP handles have been registered.
		 *
		 * @since 3.16.0
		 * @param array<string,array<string,mixed>> $plugins Plugin catalog.
		 */
		do_action( 'emcp_tools_gsap_registered', self::plugins() );
	}

	/** Enqueue core and the selected plugin dependency closure. */
	public static function enqueue_selected(): void {
		if ( ! wp_script_is( self::CORE_HANDLE, 'registered' ) ) {
			self::register_scripts();
		}
		wp_enqueue_script( self::CORE_HANDLE );
		foreach ( self::dependency_closure( EMCP_Tools_GSAP_Module::selected_plugins() ) as $id ) {
			$plugin = self::plugins()[ $id ];
			wp_enqueue_script( $plugin['handle'] );
		}
	}

	/**
	 * Enqueue one plugin by catalog id for third-party integrations.
	 *
	 * @return bool False for an unknown id.
	 */
	public static function enqueue_plugin( string $id ): bool {
		$id      = sanitize_key( $id );
		$plugins = self::plugins();
		if ( ! isset( $plugins[ $id ] ) ) {
			return false;
		}
		if ( ! wp_script_is( self::CORE_HANDLE, 'registered' ) ) {
			self::register_scripts();
		}
		wp_enqueue_script( $plugins[ $id ]['handle'] );
		return true;
	}

	/** MCP-safe catalog including runtime state where available. */
	public static function public_catalog(): array {
		$selected = class_exists( 'EMCP_Tools_GSAP_Module' ) ? EMCP_Tools_GSAP_Module::selected_plugins() : array();
		$out      = array();
		foreach ( self::plugins() as $id => $plugin ) {
			$out[] = array(
				'id'              => $id,
				'label'           => $plugin['label'],
				'handle'          => $plugin['handle'],
				'global'          => $plugin['global'],
				'description'     => $plugin['description'],
				'dependencies'    => $plugin['dependencies'],
				'external_note'   => $plugin['external_note'],
				'enabled'         => in_array( $id, $selected, true ),
				'is_registered'   => function_exists( 'wp_script_is' ) && wp_script_is( $plugin['handle'], 'registered' ),
				'is_enqueued'     => function_exists( 'wp_script_is' ) && wp_script_is( $plugin['handle'], 'enqueued' ),
			);
		}
		return $out;
	}
}
