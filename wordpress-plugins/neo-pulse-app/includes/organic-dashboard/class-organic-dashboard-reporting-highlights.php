<?php
/**
 * Server-side organic Performance report narratives (OpenRouter).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Organic_Dashboard_Reporting_Highlights {

	/**
	 * @param array<string,mixed> $body Expects siteId (string) and snapshot (array).
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	public static function generate( array $body ): array {
		$site_id  = isset( $body['siteId'] ) ? trim( (string) $body['siteId'] ) : '';
		$snapshot = isset( $body['snapshot'] ) && is_array( $body['snapshot'] ) ? $body['snapshot'] : null;

		if ( $site_id === '' || $snapshot === null ) {
			return array(
				'statusCode' => 400,
				'body'       => array(
					'success' => false,
					'error'   => 'siteId and snapshot are required',
				),
			);
		}

		$user = 'Organic dashboard snapshot (JSON). Use only these numbers.' . "\n\n" . wp_json_encode( $snapshot, JSON_PRETTY_PRINT );
		if ( $user === '' ) {
			return array(
				'statusCode' => 400,
				'body'       => array(
					'success' => false,
					'error'   => 'Invalid snapshot',
				),
			);
		}

		try {
			$messages = array(
				array(
					'role'    => 'system',
					'content' => self::system_prompt(),
				),
				array(
					'role'    => 'user',
					'content' => $user,
				),
			);
			$model = Neo_Pulse_App_Openrouter_Agent_Models::resolve(
				Neo_Pulse_App_Openrouter_Agent_Models::CATEGORY_REPORT,
				isset( $body['model'] ) ? (string) $body['model'] : ''
			);
			$opts  = array(
				'model'       => $model,
				'temperature' => 0.15,
				'maxTokens'   => 8192,
			);

			$response_format = array(
				'type'        => 'json_schema',
				'json_schema' => array(
					'name'   => 'organic_reporting_highlights',
					'strict' => true,
					'schema' => self::json_schema(),
				),
			);

			$raw = Neo_Pulse_App_Gsc_Route_Handlers::reporting_chat_completion_request_public(
				$messages,
				$opts,
				$response_format
			);

			$content = trim( (string) ( $raw['content'] ?? '' ) );
			$parsed  = null;
			if ( isset( $raw['raw']['choices'][0]['message']['parsed'] ) && is_array( $raw['raw']['choices'][0]['message']['parsed'] ) ) {
				$parsed = $raw['raw']['choices'][0]['message']['parsed'];
			} elseif ( $content !== '' ) {
				$decoded = json_decode( $content, true );
				if ( is_array( $decoded ) ) {
					$parsed = $decoded;
				}
			}

			if ( ! is_array( $parsed ) ) {
				return array(
					'statusCode' => 502,
					'body'       => array(
						'success' => false,
						'error'   => 'Highlights model returned invalid JSON.',
					),
				);
			}

			return array(
				'statusCode' => 200,
				'body'       => array(
					'success'    => true,
					'highlights' => $parsed,
				),
			);
		} catch ( Exception $e ) {
			return array(
				'statusCode' => 500,
				'body'       => array(
					'success' => false,
					'error'   => $e->getMessage(),
				),
			);
		}
	}

	private static function system_prompt(): string {
		$prose = '**ENGLISH PROSE (mandatory):** Every **sentence you write** (paragraphs, bullet bodies after the label, short intros) must use **client-ready Canadian English**: correct spelling, punctuation, grammar, and apostrophes. **Possessives:** **Calgary\'s**, **Edmonton\'s**, **the site\'s** search performance, **the client\'s** (never **Calgarys**, never **the sites** when you mean this website). **Bold:** use `**` on **1–3 short phrases per paragraph** (a few words each, not whole sentences); **never** open bold in one sentence and close it in a later sentence. **Do not** change spelling inside **verbatim** search queries, keywords, page titles, or brand names from RETRIEVED DATA. **Proofread** narrative before finishing.';

		return 'You are a senior SEO strategist at Neo Digital preparing a client-facing organic performance report.' . "\n\n"
			. $prose . "\n\n"
			. 'Source split (mandatory): ga4Rows in the snapshot are **organic search (GA4)** only. gscTotals and topQueries are **Google Search Console** organic search. Never describe GSC clicks or impressions as website sessions. Never use site-wide or all-channel GA4 metrics (Total users, New users, all-channel Key events, User key event rate); those are omitted from the snapshot on purpose.' . "\n\n"
			. 'Numbers: Every figure must appear in the JSON snapshot. Do not invent metrics.' . "\n\n"
			. 'Return JSON with executiveSummary, keyTakeaways, performanceNarrative, keywordNarrative, and topOpportunities (exactly 3 or 4 items).' . "\n\n"
			. 'Period labels: snapshot.periods.earlier and snapshot.periods.later are the exact date range strings for the compare and primary periods. Use those labels whenever you name a period. Never write the words Earlier or Later.' . "\n\n"
			. 'performanceNarrative: 2–3 short paragraphs for the Performance summary section. Paragraph 1: GA4 **organic search** sessions and engagement only. Paragraph 2: GSC search visibility (clicks, impressions, CTR, position). Plain prose, no bullets inside strings.' . "\n\n"
			. 'keywordNarrative: 1–2 short paragraphs for the Keyword performance section. Use topQueries only. Plain prose; use period date labels only.' . "\n\n"
			. 'executiveSummary: one complete headline sentence (max ~220 characters).' . "\n\n"
			. 'keyTakeaways: 2–4 complete sentences. When GA4 and GSC exist, include at least one takeaway for **organic search traffic (GA4)** and one for **search visibility (GSC)**.' . "\n\n"
			. 'topOpportunities: rank by client impact; each item: rank, label, why, comparisonRows (1–4 table rows). Do not include next steps or recommended actions.';
	}

	/**
	 * @return array<string,mixed>
	 */
	private static function json_schema(): array {
		return array(
			'type'                 => 'object',
			'additionalProperties' => false,
			'required'             => array(
				'executiveSummary',
				'keyTakeaways',
				'performanceNarrative',
				'keywordNarrative',
				'topOpportunities',
			),
			'properties'           => array(
				'executiveSummary'     => array( 'type' => 'string', 'maxLength' => 320 ),
				'performanceNarrative' => array(
					'type'     => 'array',
					'minItems' => 2,
					'maxItems' => 3,
					'items'    => array( 'type' => 'string', 'maxLength' => 520 ),
				),
				'keywordNarrative'     => array(
					'type'     => 'array',
					'minItems' => 1,
					'maxItems' => 2,
					'items'    => array( 'type' => 'string', 'maxLength' => 480 ),
				),
				'keyTakeaways'         => array(
					'type'     => 'array',
					'minItems' => 2,
					'maxItems' => 4,
					'items'    => array( 'type' => 'string', 'maxLength' => 280 ),
				),
				'topOpportunities'     => array(
					'type'     => 'array',
					'minItems' => 3,
					'maxItems' => 4,
					'items'    => array(
						'type'                 => 'object',
						'additionalProperties' => false,
						'required'             => array( 'rank', 'label', 'why', 'comparisonRows' ),
						'properties'           => array(
							'rank'             => array( 'type' => 'integer' ),
							'label'            => array( 'type' => 'string', 'maxLength' => 120 ),
							'why'              => array( 'type' => 'string', 'maxLength' => 480 ),
							'comparisonRows'   => array(
								'type'     => 'array',
								'minItems' => 1,
								'maxItems' => 4,
								'items'    => array(
									'type'                 => 'object',
									'additionalProperties' => false,
									'required'             => array( 'metric', 'comparePeriodValue', 'primaryPeriodValue' ),
									'properties'           => array(
										'metric'               => array( 'type' => 'string', 'maxLength' => 80 ),
										'comparePeriodValue'   => array( 'type' => 'string', 'maxLength' => 72 ),
										'primaryPeriodValue'   => array( 'type' => 'string', 'maxLength' => 72 ),
									),
								),
							),
							'evidence'         => array(
								'type'     => 'array',
								'maxItems' => 6,
								'items'    => array( 'type' => 'string', 'maxLength' => 200 ),
							),
						),
					),
				),
			),
		);
	}
}
