<?php
/**
 * FAQPage schema.org JSON-LD output.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Faq_Schema {

	/**
	 * @param array<int, array{question: string, answer: string}> $entries
	 * @return array<string, mixed>
	 */
	public static function build_faq_page( array $entries ): array {
		$main_entity = array();

		foreach ( $entries as $entry ) {
			$question = self::plain( (string) ( $entry['question'] ?? '' ) );
			$answer   = self::plain( (string) ( $entry['answer'] ?? '' ) );
			if ( $question === '' && $answer === '' ) {
				continue;
			}
			$main_entity[] = array(
				'@type'          => 'Question',
				'name'           => $question,
				'acceptedAnswer' => array(
					'@type' => 'Answer',
					'text'  => $answer,
				),
			);
		}

		return array(
			'@context'   => 'https://schema.org',
			'@type'      => 'FAQPage',
			'mainEntity' => $main_entity,
		);
	}

	/**
	 * Plain text for schema: no tags, entities decoded, whitespace collapsed.
	 */
	private static function plain( string $value ): string {
		$text = wp_strip_all_tags( html_entity_decode( $value, ENT_QUOTES | ENT_HTML5, 'UTF-8' ) );
		return trim( (string) preg_replace( '/\s+/u', ' ', $text ) );
	}

	/**
	 * @param array<int, array{question: string, answer: string}> $entries
	 * @return string
	 */
	public static function render_script( array $entries ): string {
		if ( empty( $entries ) ) {
			return '';
		}

		$schema = self::build_faq_page( $entries );
		if ( empty( $schema['mainEntity'] ) ) {
			return '';
		}

		// HEX_TAG / HEX_AMP plus "<\/" so text can never close the script element.
		$json = wp_json_encode( $schema, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP );
		if ( ! is_string( $json ) || $json === '' ) {
			return '';
		}
		$json = str_replace( '</', '<\/', $json );

		return '<script type="application/ld+json">' . $json . '</script>';
	}
}
