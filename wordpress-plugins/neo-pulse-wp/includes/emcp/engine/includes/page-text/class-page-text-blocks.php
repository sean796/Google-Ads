<?php
/**
 * Translatable text of Gutenberg content, for an explicit set of core blocks. Where each
 * attribute lives comes from the block's registered definition (source, selector,
 * attribute), because core attributes are often sourced from the saved HTML: an image's
 * alt is the alt of its <img>. Writes change the matched element in the block's own
 * markup, and only changed blocks are re-serialized and spliced into the original
 * content, so separators and untouched blocks keep their bytes.
 *
 * Keys: block:{path}:{attribute}, path = indexes into parse_blocks() output (separators
 * included at the top level) and innerBlocks below, joined with dots.
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** @since 3.19.0 */
class EMCP_Tools_Page_Text_Blocks {

	/** block => attribute => [kind, where it lives: rich-text | attribute | comment]. */
	const MAP = array(
		'core/paragraph'       => array( 'content' => array( 'html', 'rich-text' ) ),
		'core/heading'         => array( 'content' => array( 'html', 'rich-text' ) ),
		'core/list-item'       => array( 'content' => array( 'html', 'rich-text' ) ),
		'core/quote'           => array( 'citation' => array( 'html', 'rich-text' ) ),
		'core/pullquote'       => array(
			'value'    => array( 'html', 'rich-text' ),
			'citation' => array( 'html', 'rich-text' ),
		),
		'core/verse'           => array( 'content' => array( 'html', 'rich-text' ) ),
		'core/preformatted'    => array( 'content' => array( 'html', 'rich-text' ) ),
		'core/details'         => array( 'summary' => array( 'html', 'rich-text' ) ),
		'core/button'          => array(
			'text' => array( 'html', 'rich-text' ),
			'url'  => array( 'url', 'attribute' ),
		),
		'core/image'           => array(
			'alt'     => array( 'text', 'attribute' ),
			'caption' => array( 'html', 'rich-text' ),
			'href'    => array( 'url', 'attribute' ),
		),
		'core/media-text'      => array( 'mediaAlt' => array( 'text', 'attribute' ) ),
		'core/search'          => array(
			'label'       => array( 'text', 'comment' ),
			'placeholder' => array( 'text', 'comment' ),
			'buttonText'  => array( 'text', 'comment' ),
		),
		'core/navigation-link' => array(
			'label' => array( 'text', 'comment' ),
			'url'   => array( 'url', 'comment' ),
		),
	);

	/** Blocks that hold no text of their own; their inner blocks are walked. */
	const NO_TEXT = array( 'core/group', 'core/columns', 'core/column', 'core/buttons', 'core/list', 'core/cover', 'core/spacer', 'core/separator', 'core/more', 'core/nextpage', 'core/gallery', 'core/row', 'core/stack', 'core/navigation' );

	/** The block parser's delimiter pattern (WP_Block_Parser::next_token()). */
	const DELIMITER = '/<!--\s+(?P<closer>\/)?wp:(?P<namespace>[a-z][a-z0-9_-]*\/)?(?P<name>[a-z][a-z0-9_-]*)\s+(?P<attrs>{(?:(?:[^}]+|}+(?=})|(?!}\s+\/?-->).)*+)?}\s+)?(?P<void>\/)?-->/s';

	/** @var callable(string,string):?array */
	private $definition_for;

	public function __construct( ?callable $definition_for = null ) {
		$this->definition_for = $definition_for ? $definition_for : array( __CLASS__, 'registered_definition' );
	}

	public static function registered_definition( string $block, string $attr ): ?array {
		$type = class_exists( 'WP_Block_Type_Registry' ) ? WP_Block_Type_Registry::get_instance()->get_registered( $block ) : null;
		return ( $type && isset( $type->attributes[ $attr ] ) && is_array( $type->attributes[ $attr ] ) ) ? $type->attributes[ $attr ] : null;
	}

	/** @return array{segments:array,skipped:array} */
	public function segments( string $content ): array {
		$out = array( 'segments' => array(), 'skipped' => array() );
		$this->walk(
			parse_blocks( $content ),
			array(),
			function ( array $block, array $path ) use ( &$out ) {
				foreach ( $this->fields( $block, $out['skipped'] ) as $attr => $field ) {
					$out['segments'][] = array(
						'key'   => 'block:' . implode( '.', $path ) . ':' . $attr,
						'kind'  => $field['kind'],
						'text'  => $field['value'],
						'where' => $block['blockName'] . ', ' . $attr,
					);
				}
				return null;
			}
		);
		return $out;
	}

	/**
	 * @param array<string,string> $values key => new text (keys come from segments()).
	 */
	public function apply( string $content, array $values ): string {
		$by_path = array();
		foreach ( $values as $key => $text ) {
			if ( ! preg_match( '/^block:([0-9.]+):([A-Za-z]+)$/', (string) $key, $m ) ) {
				continue;
			}
			$by_path[ $m[1] ][ $m[2] ] = (string) $text;
		}
		if ( ! $by_path ) {
			return $content;
		}
		$changed = array(); // path string => serialized block
		$ignored = array();
		$parsed  = parse_blocks( $content );
		$this->walk(
			$parsed,
			array(),
			function ( array $block, array $path ) use ( $by_path, &$changed, &$ignored ) {
				$id = implode( '.', $path );
				if ( ! isset( $by_path[ $id ] ) ) {
					return null;
				}
				$fields = $this->fields( $block, $ignored );
				$dirty  = false;
				foreach ( $by_path[ $id ] as $attr => $text ) {
					if ( ! isset( $fields[ $attr ] ) || $fields[ $attr ]['value'] === $text ) {
						continue;
					}
					$block = $this->write( $block, $attr, $fields[ $attr ], $text );
					$dirty = true;
				}
				if ( $dirty ) {
					$changed[ $id ] = true;
					return $block;
				}
				return null;
			}
		);
		if ( ! $changed ) {
			return $content;
		}
		// Re-walk the modified tree to serialize each changed block; an ancestor's change
		// already contains its descendants', so only outermost changed blocks are spliced.
		$ranges = self::ranges( $content, $parsed );
		$splice = array();
		foreach ( array_keys( $changed ) as $id ) {
			$outer = true;
			foreach ( array_keys( $changed ) as $other ) {
				if ( $other !== $id && 0 === strpos( $id . '.', $other . '.' ) ) {
					$outer = false;
					break;
				}
			}
			if ( $outer && isset( $ranges[ $id ] ) ) {
				$splice[ $id ] = $ranges[ $id ];
			}
		}
		$modified = $this->modified_tree( $parsed, $by_path );
		uasort(
			$splice,
			static function ( $a, $b ) {
				return $b[0] <=> $a[0];
			}
		);
		foreach ( $splice as $id => $range ) {
			$block   = self::at( $modified, explode( '.', $id ) );
			$content = substr( $content, 0, $range[0] ) . serialize_block( $block ) . substr( $content, $range[1] );
		}
		return $content;
	}

	/** The parsed tree with every requested value written in. */
	private function modified_tree( array $parsed, array $by_path ): array {
		$ignored = array();
		return $this->walk(
			$parsed,
			array(),
			function ( array $block, array $path ) use ( $by_path, &$ignored ) {
				$id = implode( '.', $path );
				if ( ! isset( $by_path[ $id ] ) ) {
					return null;
				}
				$fields = $this->fields( $block, $ignored );
				foreach ( $by_path[ $id ] as $attr => $text ) {
					if ( isset( $fields[ $attr ] ) && $fields[ $attr ]['value'] !== $text ) {
						$block = $this->write( $block, $attr, $fields[ $attr ], $text );
					}
				}
				return $block;
			}
		);
	}

	/**
	 * Depth-first walk; $fn may return a replacement block (children already walked).
	 */
	private function walk( array $blocks, array $prefix, callable $fn ): array {
		foreach ( $blocks as $i => $block ) {
			$path = array_merge( $prefix, array( $i ) );
			if ( ! empty( $block['innerBlocks'] ) ) {
				$block['innerBlocks'] = $this->walk( $block['innerBlocks'], $path, $fn );
			}
			if ( null !== ( $block['blockName'] ?? null ) ) {
				$new = $fn( $block, $path );
				if ( is_array( $new ) ) {
					$new['innerBlocks'] = $block['innerBlocks'];
					$block              = $new;
				}
			}
			$blocks[ $i ] = $block;
		}
		return $blocks;
	}

	private static function at( array $blocks, array $path ): array {
		$block = $blocks[ (int) array_shift( $path ) ];
		foreach ( $path as $i ) {
			$block = $block['innerBlocks'][ (int) $i ];
		}
		return $block;
	}

	/**
	 * The mapped text fields of one block that have a value.
	 *
	 * @return array<string,array{kind:string,lives:string,def:array,value:string}>
	 */
	private function fields( array $block, array &$skipped ): array {
		$name = (string) $block['blockName'];
		if ( ! isset( self::MAP[ $name ] ) ) {
			if ( ! in_array( $name, self::NO_TEXT, true ) ) {
				$skipped[] = array( 'where' => $name, 'reason' => 'unsupported_block' );
			}
			return array();
		}
		$out = array();
		foreach ( self::MAP[ $name ] as $attr => $spec ) {
			list( $kind, $lives ) = $spec;
			$def                  = call_user_func( $this->definition_for, $name, $attr );
			if ( ! self::definition_matches( $def, $lives ) ) {
				$skipped[] = array( 'where' => $name . ' ' . $attr, 'reason' => 'definition_changed' );
				continue;
			}
			$value = $this->read( $block, $attr, $lives, $def );
			if ( null !== $value && '' !== trim( wp_strip_all_tags( $value ) ) ) {
				$out[ $attr ] = array( 'kind' => $kind, 'lives' => $lives, 'def' => $def, 'value' => $value );
			}
		}
		return $out;
	}

	private static function definition_matches( $def, string $lives ): bool {
		if ( ! is_array( $def ) || 'content' !== ( $def['role'] ?? '' ) ) {
			return false;
		}
		$source = (string) ( $def['source'] ?? '' );
		switch ( $lives ) {
			case 'comment':
				return '' === $source;
			case 'rich-text':
				return in_array( $source, array( 'rich-text', 'html' ), true ) && '' !== (string) ( $def['selector'] ?? '' );
			case 'attribute':
				return 'attribute' === $source && '' !== (string) ( $def['selector'] ?? '' ) && '' !== (string) ( $def['attribute'] ?? '' );
		}
		return false;
	}

	/** Tag names a selector can match: the last simple selector of each comma part. */
	private static function selector_tags( string $selector ): array {
		$tags = array();
		foreach ( explode( ',', $selector ) as $part ) {
			$bits = preg_split( '/[\s>+~]+/', trim( $part ) );
			$last = strtolower( (string) end( $bits ) );
			if ( preg_match( '/^[a-z][a-z0-9]*$/', $last ) ) {
				$tags[] = $last;
			}
		}
		return $tags;
	}

	private function read( array $block, string $attr, string $lives, array $def ): ?string {
		if ( 'comment' === $lives ) {
			$value = $block['attrs'][ $attr ] ?? null;
			return is_string( $value ) ? $value : null;
		}
		foreach ( (array) $block['innerContent'] as $chunk ) {
			if ( ! is_string( $chunk ) ) {
				continue;
			}
			$found = 'attribute' === $lives ? self::find_attribute( $chunk, $def ) : self::find_inner( $chunk, $def );
			if ( null !== $found ) {
				return $found['value'];
			}
		}
		return null;
	}

	private function write( array $block, string $attr, array $field, string $text ): array {
		if ( 'comment' === $field['lives'] ) {
			$block['attrs'][ $attr ] = $text;
			return $block;
		}
		foreach ( (array) $block['innerContent'] as $i => $chunk ) {
			if ( ! is_string( $chunk ) ) {
				continue;
			}
			if ( 'attribute' === $field['lives'] ) {
				$found = self::find_attribute( $chunk, $field['def'] );
				if ( null === $found ) {
					continue;
				}
				$tags = new WP_HTML_Tag_Processor( $chunk );
				$tags->next_tag( $found['tag'] );
				$tags->set_attribute( (string) $field['def']['attribute'], $text );
				$block['innerContent'][ $i ] = $tags->get_updated_html();
			} else {
				$found = self::find_inner( $chunk, $field['def'] );
				if ( null === $found ) {
					continue;
				}
				$block['innerContent'][ $i ] = substr( $chunk, 0, $found['start'] ) . $text . substr( $chunk, $found['end'] );
			}
			break;
		}
		$block['innerHTML'] = implode( '', array_filter( (array) $block['innerContent'], 'is_string' ) );
		return $block;
	}

	/** @return array{tag:string,value:string}|null */
	private static function find_attribute( string $html, array $def ): ?array {
		foreach ( self::selector_tags( (string) $def['selector'] ) as $tag ) {
			$tags = new WP_HTML_Tag_Processor( $html );
			if ( $tags->next_tag( $tag ) ) {
				$value = $tags->get_attribute( (string) $def['attribute'] );
				return array( 'tag' => $tag, 'value' => is_string( $value ) ? $value : '' );
			}
		}
		return null;
	}

	/**
	 * The inner HTML of the first element matching the selector, by byte range.
	 *
	 * @return array{start:int,end:int,value:string}|null
	 */
	private static function find_inner( string $html, array $def ): ?array {
		$best = null;
		foreach ( self::selector_tags( (string) $def['selector'] ) as $tag ) {
			if ( ! preg_match( '/<' . $tag . '(?:\s[^>]*)?>/i', $html, $open, PREG_OFFSET_CAPTURE ) ) {
				continue;
			}
			$start = $open[0][1] + strlen( $open[0][0] );
			$depth = 1;
			$pos   = $start;
			while ( $depth > 0 && preg_match( '/<(\/?)' . $tag . '(?:\s[^>]*)?>/i', $html, $m, PREG_OFFSET_CAPTURE, $pos ) ) {
				$depth += '/' === $m[1][0] ? -1 : 1;
				$pos    = $m[0][1] + strlen( $m[0][0] );
				if ( 0 === $depth ) {
					$candidate = array( 'start' => $start, 'end' => $m[0][1], 'value' => substr( $html, $start, $m[0][1] - $start ), 'at' => $open[0][1] );
					if ( null === $best || $candidate['at'] < $best['at'] ) {
						$best = $candidate;
					}
				}
			}
		}
		if ( null === $best ) {
			return null;
		}
		unset( $best['at'] );
		return $best;
	}

	/**
	 * Byte range of every block in $content, keyed by the same paths parse_blocks() gives.
	 *
	 * @return array<string,array{0:int,1:int}>
	 */
	private static function ranges( string $content, array $parsed ): array {
		preg_match_all( self::DELIMITER, $content, $matches, PREG_SET_ORDER | PREG_OFFSET_CAPTURE );
		$roots = array();
		$stack = array();
		foreach ( $matches as $m ) {
			$start = $m[0][1];
			$end   = $start + strlen( $m[0][0] );
			if ( isset( $m['void'] ) && '/' === $m['void'][0] ) {
				$node = array( 'start' => $start, 'end' => $end, 'children' => array() );
				if ( $stack ) {
					$stack[ count( $stack ) - 1 ]['children'][] = $node;
				} else {
					$roots[] = $node;
				}
				continue;
			}
			if ( '/' === $m['closer'][0] ) {
				$node        = array_pop( $stack );
				if ( null === $node ) {
					continue;
				}
				$node['end'] = $end;
				if ( $stack ) {
					$stack[ count( $stack ) - 1 ]['children'][] = $node;
				} else {
					$roots[] = $node;
				}
				continue;
			}
			$stack[] = array( 'start' => $start, 'end' => $end, 'children' => array() );
		}
		$out = array();
		self::map_ranges( $parsed, $roots, array(), $out );
		return $out;
	}

	private static function map_ranges( array $blocks, array $nodes, array $prefix, array &$out ): void {
		$n = 0;
		foreach ( $blocks as $i => $block ) {
			if ( null === ( $block['blockName'] ?? null ) ) {
				continue;
			}
			if ( ! isset( $nodes[ $n ] ) ) {
				return;
			}
			$path                       = array_merge( $prefix, array( $i ) );
			$out[ implode( '.', $path ) ] = array( $nodes[ $n ]['start'], $nodes[ $n ]['end'] );
			if ( ! empty( $block['innerBlocks'] ) ) {
				self::map_ranges( $block['innerBlocks'], $nodes[ $n ]['children'], $path, $out );
			}
			++$n;
		}
	}
}
