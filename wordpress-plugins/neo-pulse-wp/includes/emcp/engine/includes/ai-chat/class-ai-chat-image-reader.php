<?php
/**
 * Built-in image reader — the dependency-free vision fallback.
 *
 * When a text-only model has an image attached and NO local vision model is
 * available to describe it, this extracts the readable context PHP/GD can get
 * without any model: format, dimensions, aspect/orientation, transparency, a
 * dominant-colour palette, and overall brightness. It cannot describe a scene
 * — but for the web/design work this plugin is built around (mockups,
 * screenshots, references) the size + palette + format is genuinely actionable.
 *
 * Everything runs on the raw bytes in memory; nothing is written to disk and
 * nothing leaves the server.
 *
 * @package EMCP_Tools
 * @since   3.6.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Reads basic, model-free context out of an image.
 *
 * @since 3.6.0
 */
class EMCP_Tools_AI_Chat_Image_Reader {

	/**
	 * Reads an image and returns a structured summary plus a text rendering.
	 *
	 * @since 3.6.0
	 * @param string $b64  Base64 image data (no data: prefix).
	 * @param string $mime Declared mime type (advisory).
	 * @return array{text:string,width:int,height:int,format:string,colours:string[]}
	 */
	public static function read( string $b64, string $mime = '' ): array {
		$bin = base64_decode( $b64, true );
		if ( false === $bin || '' === $bin ) {
			return array(
				'text'    => '[Image could not be read.]',
				'width'   => 0,
				'height'  => 0,
				'format'  => '',
				'colours' => array(),
			);
		}

		$bytes = strlen( $bin );
		$w      = 0;
		$h      = 0;
		$format = '';

		if ( function_exists( 'getimagesizefromstring' ) ) {
			$info = @getimagesizefromstring( $bin ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
			if ( is_array( $info ) ) {
				$w      = (int) $info[0];
				$h      = (int) $info[1];
				$format = self::format_label( $info['mime'] ?? $mime, $info[2] ?? 0 );
			}
		}
		if ( '' === $format ) {
			$format = self::format_label( $mime, 0 );
		}

		$palette   = array();
		$alpha     = false;
		$lightness = null;
		if ( function_exists( 'imagecreatefromstring' ) ) {
			$sample = self::sample( $bin );
			if ( null !== $sample ) {
				$palette   = $sample['colours'];
				$alpha     = $sample['alpha'];
				$lightness = $sample['lightness'];
			}
		}

		return array(
			'text'    => self::render_text( $w, $h, $format, $bytes, $palette, $alpha, $lightness ),
			'width'   => $w,
			'height'  => $h,
			'format'  => $format,
			'colours' => $palette,
		);
	}

	/**
	 * Samples a small version of the image for palette + transparency + brightness.
	 *
	 * @param string $bin Raw image bytes.
	 * @return array{colours:string[],alpha:bool,lightness:float}|null
	 */
	private static function sample( string $bin ): ?array {
		$im = @imagecreatefromstring( $bin ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
		if ( ! $im ) {
			return null;
		}

		$w = imagesx( $im );
		$h = imagesy( $im );
		if ( $w < 1 || $h < 1 ) {
			imagedestroy( $im );
			return null;
		}

		// Downscale so the pixel walk is bounded regardless of source size.
		$edge = 48;
		$sw   = max( 1, min( $edge, $w ) );
		$sh   = max( 1, (int) round( $h * ( $sw / $w ) ) );
		$small = function_exists( 'imagescale' ) ? imagescale( $im, $sw, $sh ) : null;
		if ( ! $small ) {
			$small = $im; // Walk the original with a stride instead.
			$sw    = $w;
			$sh    = $h;
		}
		$stride = $small === $im ? max( 1, (int) floor( max( $w, $h ) / $edge ) ) : 1;

		$counts   = array();
		$lum_sum  = 0.0;
		$lum_n    = 0;
		$has_alpha = false;

		for ( $y = 0; $y < $sh; $y += $stride ) {
			for ( $x = 0; $x < $sw; $x += $stride ) {
				$rgba = imagecolorat( $small, $x, $y );
				$a    = ( $rgba >> 24 ) & 0x7F; // 0 opaque … 127 transparent.
				if ( $a > 100 ) {
					$has_alpha = true;
					continue; // Skip near-transparent pixels from the palette.
				}
				if ( $a > 0 ) {
					$has_alpha = true;
				}
				$r = ( $rgba >> 16 ) & 0xFF;
				$g = ( $rgba >> 8 ) & 0xFF;
				$b = $rgba & 0xFF;

				$lum_sum += ( 0.2126 * $r + 0.7152 * $g + 0.0722 * $b );
				++$lum_n;

				// Quantise to coarse buckets so near-identical shades group.
				$key = ( intdiv( $r, 24 ) * 24 ) . ',' . ( intdiv( $g, 24 ) * 24 ) . ',' . ( intdiv( $b, 24 ) * 24 );
				$counts[ $key ] = ( $counts[ $key ] ?? 0 ) + 1;
			}
		}

		if ( $small !== $im ) {
			imagedestroy( $small );
		}
		imagedestroy( $im );

		arsort( $counts );
		$colours = self::top_colours( array_keys( $counts ), 5 );
		$light   = $lum_n > 0 ? ( $lum_sum / $lum_n ) / 255.0 : null;

		return array(
			'colours'   => $colours,
			'alpha'     => $has_alpha,
			'lightness' => $light,
		);
	}

	/**
	 * Picks the top distinct colours, dropping near-duplicates.
	 *
	 * @param string[] $keys  "r,g,b" bucket keys, most-frequent first.
	 * @param int      $limit Max colours to keep.
	 * @return string[] Hex colours (e.g. "#4F46E5").
	 */
	private static function top_colours( array $keys, int $limit ): array {
		$picked = array();
		foreach ( $keys as $key ) {
			$parts = array_map( 'intval', explode( ',', $key ) );
			if ( 3 !== count( $parts ) ) {
				continue;
			}
			$near = false;
			foreach ( $picked as $p ) {
				$d = abs( $p[0] - $parts[0] ) + abs( $p[1] - $parts[1] ) + abs( $p[2] - $parts[2] );
				if ( $d < 60 ) {
					$near = true;
					break;
				}
			}
			if ( $near ) {
				continue;
			}
			$picked[] = $parts;
			if ( count( $picked ) >= $limit ) {
				break;
			}
		}
		return array_map(
			static function ( $p ) {
				return sprintf( '#%02X%02X%02X', $p[0], $p[1], $p[2] );
			},
			$picked
		);
	}

	/**
	 * Assembles the human/model-readable summary line.
	 */
	private static function render_text( int $w, int $h, string $format, int $bytes, array $colours, bool $alpha, ?float $lightness ): string {
		$bits = array();
		$head = 'Image:';
		if ( '' !== $format ) {
			$head .= ' ' . $format;
		}
		if ( $w > 0 && $h > 0 ) {
			$head .= ' ' . $w . '×' . $h . ' (' . self::orientation( $w, $h ) . ', ' . self::ratio( $w, $h ) . ')';
		}
		$head .= ', ' . self::bytes( $bytes );
		if ( $alpha ) {
			$head .= ', has transparency';
		}
		if ( null !== $lightness ) {
			$head .= ', ' . ( $lightness >= 0.6 ? 'mostly light' : ( $lightness <= 0.35 ? 'mostly dark' : 'mid-tone' ) );
		}
		$bits[] = $head . '.';

		if ( ! empty( $colours ) ) {
			$bits[] = 'Prominent colours: ' . implode( ', ', $colours ) . '.';
		}

		$bits[] = '(Basic reader, size, format, and colours only, not a scene description. '
			. 'For a full description, connect a local vision model such as llava.)';

		return implode( ' ', $bits );
	}

	private static function bytes( int $n ): string {
		if ( $n >= 1048576 ) {
			return round( $n / 1048576, 1 ) . ' MB';
		}
		if ( $n >= 1024 ) {
			return round( $n / 1024 ) . ' KB';
		}
		return $n . ' B';
	}

	private static function orientation( int $w, int $h ): string {
		if ( $w === $h ) {
			return 'square';
		}
		return $w > $h ? 'landscape' : 'portrait';
	}

	private static function ratio( int $w, int $h ): string {
		if ( $w < 1 || $h < 1 ) {
			return '';
		}
		$g = self::gcd( $w, $h );
		$rw = $w / $g;
		$rh = $h / $g;
		// Collapse awkward ratios to a decimal so it stays readable.
		if ( $rw > 21 || $rh > 21 ) {
			return round( $w / $h, 2 ) . ':1';
		}
		return $rw . ':' . $rh;
	}

	private static function gcd( int $a, int $b ): int {
		while ( 0 !== $b ) {
			$t = $b;
			$b = $a % $b;
			$a = $t;
		}
		return max( 1, $a );
	}

	private static function format_label( string $mime, int $type ): string {
		$mime = strtolower( (string) $mime );
		if ( false !== strpos( $mime, 'png' ) ) {
			return 'PNG';
		}
		if ( false !== strpos( $mime, 'jpeg' ) || false !== strpos( $mime, 'jpg' ) ) {
			return 'JPEG';
		}
		if ( false !== strpos( $mime, 'webp' ) ) {
			return 'WebP';
		}
		if ( false !== strpos( $mime, 'gif' ) ) {
			return 'GIF';
		}
		if ( false !== strpos( $mime, 'svg' ) ) {
			return 'SVG';
		}
		return '';
	}
}
