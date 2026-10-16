<?php
/**
 * Bundled-skill catalog (Pro, read-side).
 *
 * Discovers + parses the on-disk SKILL.md skills under the bundled skills dir
 * and exposes them to MCP agents via EMCP_Tools_Skill_Abilities + the discovery
 * context. Read-only; no DB. A future source (Premium Prompts, user CPT) can
 * extend it through the emcp_tools_skill_sources filter.
 *
 * @package EMCP_Tools
 * @since   3.2.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class EMCP_Tools_Skill_Catalog {

	/** Hook the discovery-context filter (called from the Pro loader). */
	public static function init(): void {
		add_filter( 'emcp_tools_discovery_skills', array( __CLASS__, 'discovery_catalog' ) );
		// Give the in-plugin AI Chat the same skills catalog external MCP agents
		// get, so the Pro assistant can discover + load skills too.
		add_filter( 'emcp_tools_ai_chat_system_prompt', array( __CLASS__, 'append_chat_catalog' ), 10, 2 );
	}

	/** The bundled skills directory (dual-root), or '' when absent. */
	private static function dir(): string {
		return class_exists( 'EMCP_Tools_Pro_Loader' ) ? EMCP_Tools_Pro_Loader::path( 'skills' ) : '';
	}

	/**
	 * The catalog slug for a SKILL.md path, relative to the skills dir:
	 * `emcp-gutenberg` (top-level) or `emcp-themes/astra` (nested one level).
	 *
	 * @param string $dir  Skills base dir.
	 * @param string $file Absolute SKILL.md path.
	 * @return string
	 */
	private static function slug_from_path( string $dir, string $file ): string {
		$rel = ltrim( str_replace( $dir, '', dirname( $file ) ), '/\\' );
		return str_replace( '\\', '/', $rel );
	}

	/**
	 * Split a SKILL.md into { name, description, body }. Handles a YAML
	 * frontmatter block with inline or folded/literal ( >- , | ) scalars.
	 *
	 * @param string $content
	 * @return array{name:string,description:string,body:string}
	 */
	public static function parse( string $content ): array {
		if ( ! preg_match( '/^---\s*\R(.*?)\R---\s*\R?(.*)$/s', $content, $m ) ) {
			return array(
				'name'        => '',
				'description' => '',
				'body'        => trim( $content ),
			);
		}
		return array(
			'name'        => self::front_scalar( $m[1], 'name' ),
			'description' => self::front_scalar( $m[1], 'description' ),
			'body'        => trim( $m[2] ),
		);
	}

	/**
	 * Read a single frontmatter key. Inline value, or a folded/literal block
	 * scalar collected from the more-indented lines that follow (joined to a
	 * single spaced string).
	 *
	 * @param string $front
	 * @param string $key
	 * @return string
	 */
	private static function front_scalar( string $front, string $key ): string {
		$lines = preg_split( '/\R/', $front );
		$n     = is_array( $lines ) ? count( $lines ) : 0;
		for ( $i = 0; $i < $n; $i++ ) {
			if ( ! preg_match( '/^' . preg_quote( $key, '/' ) . ':\s*(.*)$/', $lines[ $i ], $mm ) ) {
				continue;
			}
			$first = trim( $mm[1] );
			if ( '' === $first || in_array( $first, array( '>', '>-', '>+', '|', '|-', '|+' ), true ) ) {
				$collected = array();
				for ( $j = $i + 1; $j < $n; $j++ ) {
					if ( preg_match( '/^\S/', $lines[ $j ] ) ) {
						break; // next top-level key
					}
					$collected[] = trim( $lines[ $j ] );
				}
				return trim( (string) preg_replace( '/\s+/', ' ', implode( ' ', $collected ) ) );
			}
			return trim( $first, " \t\"'" );
		}
		return '';
	}

	/**
	 * All bundled skills: [ { slug, name, description, source } ], sorted by slug.
	 *
	 * @return array<int,array>
	 */
	public static function all(): array {
		$dir    = self::dir();
		$skills = array();
		if ( '' !== $dir && is_dir( $dir ) ) {
			// Top-level skills (slug = folder) AND one nesting level (slug =
			// parent/child), so a domain like `emcp-themes` can hold per-theme
			// sub-skills in their own folders (e.g. `emcp-themes/astra`).
			$files = array_merge(
				(array) glob( $dir . '/*/SKILL.md' ),
				(array) glob( $dir . '/*/*/SKILL.md' )
			);
			foreach ( $files as $file ) {
				$parsed   = self::parse( (string) file_get_contents( $file ) );
				$slug     = self::slug_from_path( $dir, $file );
				$skills[] = array(
					'slug'        => $slug,
					'name'        => '' !== $parsed['name'] ? $parsed['name'] : $slug,
					'description' => $parsed['description'],
					'source'      => 'bundled',
				);
			}
		}
		usort(
			$skills,
			static function ( $a, $b ) {
				return strcmp( $a['slug'], $b['slug'] );
			}
		);
		/**
		 * Filter the skill list. A future source (Premium Prompts, user CPT) can
		 * append or override entries.
		 *
		 * @param array $skills
		 */
		return (array) apply_filters( 'emcp_tools_skill_sources', $skills );
	}

	/**
	 * One skill with its full body, or null when unknown. Slug is validated to
	 * block path traversal.
	 *
	 * @param string $slug
	 * @return array|null
	 */
	public static function get( string $slug ): ?array {
		$dir  = self::dir();
		$file = $dir . '/' . $slug . '/SKILL.md';
		// Allow a single nesting level (`parent/child`); the strict alnum+hyphen
		// charset with no dots blocks path traversal.
		if ( '' !== $dir && preg_match( '#^[a-z0-9-]+(?:/[a-z0-9-]+)?$#i', $slug ) && is_readable( $file ) ) {
			$parsed = self::parse( (string) file_get_contents( $file ) );
			return array(
				'slug'        => $slug,
				'name'        => '' !== $parsed['name'] ? $parsed['name'] : $slug,
				'description' => $parsed['description'],
				'body'        => $parsed['body'],
			);
		}
		// Fall through to filter-provided sources that carry their own body.
		foreach ( self::all() as $s ) {
			if ( ( $s['slug'] ?? '' ) === $slug && isset( $s['body'] ) ) {
				return $s;
			}
		}
		return null;
	}

	/**
	 * Discovery-context "## Skills" block, or the unchanged input when not Pro
	 * or no skills exist.
	 *
	 * @param string $current
	 * @return string
	 */
	public static function discovery_catalog( $current ): string {
		if ( function_exists( 'emcp_tools_fs' ) && ! emcp_tools_fs()->can_use_premium_code() ) {
			return (string) $current;
		}
		// Gated by the Agent Skills module — off = no catalog injection.
		if ( class_exists( 'EMCP_Tools_Agent_Skills_Module' ) && ! EMCP_Tools_Agent_Skills_Module::is_enabled() ) {
			return (string) $current;
		}
		$skills = self::all();
		if ( empty( $skills ) ) {
			return (string) $current;
		}
		$lines = array(
			'## Skills',
			'Curated playbooks for common tasks. When a skill\'s description matches the task, call `get-skill` with its slug to load its full instructions before starting.',
		);
		foreach ( $skills as $s ) {
			$lines[] = sprintf( '- `%s`, %s', $s['slug'], self::first_sentence( (string) $s['description'] ) );
		}
		return implode( "\n", $lines );
	}

	/**
	 * Appends the `## Skills` catalog to the AI Chat system prompt.
	 *
	 * Same catalog external MCP agents receive in the discovery context, so the
	 * in-plugin assistant can discover a skill and call `get-skill` to load its
	 * full instructions. Gated three ways: the same Pro + Agent-Skills-module
	 * gate as the MCP catalog (via discovery_catalog), and — additionally — only
	 * when `get-skill` is actually reachable in this chat, so the model is never
	 * told to load skills it can't call (e.g. the tool disabled in the grid).
	 *
	 * @since 3.6.0
	 * @param string        $prompt       The assembled chat system prompt.
	 * @param string[]|null $active_names Active ability names the prompt was built from.
	 * @return string
	 */
	public static function append_chat_catalog( $prompt, $active_names = array() ): string {
		$names = is_array( $active_names ) ? $active_names : array();
		if ( ! in_array( 'emcp-tools/get-skill', $names, true ) && ! in_array( 'get-skill', $names, true ) ) {
			return (string) $prompt;
		}

		$catalog = self::discovery_catalog( '' ); // '' in the gated/empty cases.
		if ( '' === trim( $catalog ) ) {
			return (string) $prompt;
		}

		return rtrim( (string) $prompt ) . "\n\n" . $catalog;
	}

	/**
	 * Compact catalog for `list-skills`: slug + name + a one-line description.
	 *
	 * Full frontmatter descriptions can run ~1KB each; returning all of them
	 * blows up a small local model's context (a real failure — a 16k-context
	 * model overflowed on the full list). The agent only needs enough to pick a
	 * skill, then calls get-skill for the body.
	 *
	 * @since 3.6.0
	 * @return array<int,array{slug:string,name:string,description:string}>
	 */
	public static function compact(): array {
		$out = array();
		foreach ( self::all() as $s ) {
			$out[] = array(
				'slug'        => (string) ( $s['slug'] ?? '' ),
				'name'        => (string) ( $s['name'] ?? '' ),
				'description' => self::first_sentence( (string) ( $s['description'] ?? '' ) ),
			);
		}
		return $out;
	}

	/**
	 * First sentence (or first ~200 chars) of a description, for the catalog.
	 *
	 * @param string $text
	 * @return string
	 */
	private static function first_sentence( string $text ): string {
		$text = trim( $text );
		if ( preg_match( '/^(.*?[.!?])(\s|$)/', $text, $m ) ) {
			return trim( $m[1] );
		}
		return mb_strlen( $text ) > 200 ? mb_substr( $text, 0, 197 ) . '…' : $text;
	}
}
