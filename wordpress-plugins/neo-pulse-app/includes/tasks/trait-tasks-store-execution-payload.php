<?php
/**
 * Task execution payload handling.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_App_Tasks_Store_Trait_Execution_Payload {

	/**
	 * @param mixed $raw
	 */
	public static function sanitize_execution_kind( $raw ): string {
		$kind = sanitize_key( (string) $raw );
		return in_array( $kind, self::EXECUTION_KINDS, true ) ? $kind : '';
	}

	/**
	 * @param mixed $raw
	 */
	public static function is_execution_target_all( $raw ): bool {
		return strtoupper( trim( (string) $raw ) ) === 'ALL';
	}

	/**
	 * @param mixed $raw
	 */
	public static function sanitize_execution_target_url( $raw ): string {
		$trimmed = trim( (string) $raw );
		if ( self::is_execution_target_all( $trimmed ) ) {
			return 'ALL';
		}
		return esc_url_raw( $trimmed );
	}

	/**
	 * @param mixed $raw
	 */
	public static function sanitize_execution_target_bucket( $raw ): string {
		$bucket = sanitize_key( (string) $raw );
		return in_array( $bucket, self::EXECUTION_TARGET_BUCKETS, true ) ? $bucket : '';
	}

	/**
	 * @param array<string,mixed> $raw
	 * @return array<string,mixed>
	 */
	public static function sanitize_execution_payload( array $raw ): array {
		$out = array();
		if ( ! empty( $raw['targetUrl'] ) ) {
			$out['targetUrl'] = self::sanitize_execution_target_url( $raw['targetUrl'] );
		}
		if ( ! empty( $raw['targetBucket'] ) ) {
			$out['targetBucket'] = self::sanitize_execution_target_bucket( $raw['targetBucket'] );
		}
		if ( isset( $raw['postId'] ) ) {
			$out['postId'] = (int) $raw['postId'];
		}
		$mode = sanitize_key( (string) ( $raw['updateMode'] ?? 'update' ) );
		$out['updateMode'] = $mode === 'draft' ? 'draft' : 'update';
		if ( isset( $raw['optimizationOptions'] ) && is_array( $raw['optimizationOptions'] ) ) {
			$opts = $raw['optimizationOptions'];
			$out['optimizationOptions'] = array(
				'optimizeTitle'          => ! empty( $opts['optimizeTitle'] ),
				'optimizeMeta'           => ! empty( $opts['optimizeMeta'] ),
				'optimizeExcerpt'        => ! empty( $opts['optimizeExcerpt'] ),
				'optimizeContent'        => ! empty( $opts['optimizeContent'] ),
				'optimizeFeaturedImage'  => ! empty( $opts['optimizeFeaturedImage'] ),
				'optimizeExtraText'      => ! empty( $opts['optimizeExtraText'] ),
				'optimizeExtraImage'     => ! empty( $opts['optimizeExtraImage'] ),
				'useAcfKeyword'          => ! isset( $opts['useAcfKeyword'] ) || ! empty( $opts['useAcfKeyword'] ),
				'testMode'               => ! empty( $opts['testMode'] ),
				'autoOptimize'           => ! empty( $opts['autoOptimize'] ),
			);
			if ( ! empty( $opts['manualKeyword'] ) ) {
				$out['optimizationOptions']['manualKeyword'] = sanitize_text_field( (string) $opts['manualKeyword'] );
			}
			if ( ! empty( $opts['forceNewResearch'] ) ) {
				$out['optimizationOptions']['forceNewResearch'] = true;
			}
		}
		if ( ! empty( $raw['urlFilter'] ) ) {
			$filter = sanitize_key( (string) $raw['urlFilter'] );
			if ( $filter === 'missing_new_template' ) {
				$out['urlFilter'] = $filter;
			}
		}
		if ( array_key_exists( 'targetUrls', $raw ) && is_array( $raw['targetUrls'] ) ) {
			$urls = array();
			foreach ( $raw['targetUrls'] as $url ) {
				$url = esc_url_raw( (string) $url );
				if ( $url !== '' ) {
					$urls[] = $url;
				}
			}
			$out['targetUrls'] = array_values( array_unique( $urls ) );
		}
		if ( ! empty( $raw['prefilledUrlResearch'] ) && is_array( $raw['prefilledUrlResearch'] ) ) {
			$research = array();
			foreach ( $raw['prefilledUrlResearch'] as $url => $text ) {
				$url_key = esc_url_raw( (string) $url );
				$brief   = sanitize_textarea_field( (string) $text );
				if ( $url_key !== '' && $brief !== '' ) {
					$research[ $url_key ] = $brief;
				}
			}
			if ( count( $research ) > 0 ) {
				$out['prefilledUrlResearch'] = $research;
			}
		}
		if ( array_key_exists( 'useUpstreamContext', $raw ) ) {
			$out['useUpstreamContext'] = ! empty( $raw['useUpstreamContext'] );
		}
		if ( ! empty( $raw['workflowContextBlock'] ) ) {
			$out['workflowContextBlock'] = sanitize_textarea_field( (string) $raw['workflowContextBlock'] );
		}
		if ( ! empty( $raw['seoResearchBrief'] ) ) {
			$out['seoResearchBrief'] = sanitize_textarea_field( (string) $raw['seoResearchBrief'] );
		}
		if ( ! empty( $raw['prefilledImportRows'] ) && is_array( $raw['prefilledImportRows'] ) ) {
			$rows = array();
			foreach ( $raw['prefilledImportRows'] as $row ) {
				if ( ! is_array( $row ) ) {
					continue;
				}
				$keyword = sanitize_text_field( (string) ( $row['keyword'] ?? '' ) );
				$title   = sanitize_text_field( (string) ( $row['title'] ?? '' ) );
				if ( $keyword === '' ) {
					continue;
				}
				$mapped = array(
					'keyword' => $keyword,
					'title'   => $title !== '' ? $title : $keyword,
				);
				$dest = esc_url_raw( (string) ( $row['destination_url'] ?? '' ) );
				if ( $dest !== '' ) {
					$mapped['destination_url'] = $dest;
				}
				$seo = sanitize_textarea_field( (string) ( $row['seo_research'] ?? '' ) );
				if ( $seo !== '' ) {
					$mapped['seo_research'] = $seo;
				}
				$modifier = sanitize_textarea_field( (string) ( $row['prompt_modifier'] ?? '' ) );
				if ( $modifier !== '' ) {
					$mapped['prompt_modifier'] = $modifier;
				}
				$rows[] = $mapped;
			}
			if ( count( $rows ) > 0 ) {
				$out['prefilledImportRows'] = $rows;
			}
		}
		if ( ! empty( $raw['comparePreset'] ) ) {
			$preset = sanitize_key( (string) $raw['comparePreset'] );
			$out['comparePreset'] = $preset === 'yoy' ? 'yoy' : 'mom';
		}
		if ( ! empty( $raw['gscComparePresetId'] ) ) {
			$preset_id = sanitize_key( (string) $raw['gscComparePresetId'] );
			if ( in_array( $preset_id, self::gsc_compare_preset_ids(), true ) ) {
				$out['gscComparePresetId'] = $preset_id;
			}
		}
		$trailing_count = self::sanitize_gsc_trailing_month_count( $raw['gscTrailingMonthCount'] ?? null );
		if ( $trailing_count !== null ) {
			$out['gscTrailingMonthCount'] = $trailing_count;
		}
		if ( ! empty( $raw['gscCompareRanges'] ) && is_array( $raw['gscCompareRanges'] ) ) {
			$ranges = self::sanitize_gsc_compare_ranges( $raw['gscCompareRanges'] );
			if ( $ranges ) {
				$out['gscCompareRanges'] = $ranges;
			}
		}
		if ( array_key_exists( 'saveToDisk', $raw ) ) {
			$out['saveToDisk'] = ! empty( $raw['saveToDisk'] );
		}
		if ( array_key_exists( 'saveLocalArchive', $raw ) ) {
			$out['saveLocalArchive'] = ! empty( $raw['saveLocalArchive'] );
		}
		if ( isset( $raw['postCount'] ) ) {
			$out['postCount'] = max( 1, min( 31, (int) $raw['postCount'] ) );
		}
		if ( ! empty( $raw['keywordSource'] ) ) {
			$src = sanitize_key( (string) $raw['keywordSource'] );
			$out['keywordSource'] = in_array( $src, array( 'prompt', 'gsc', 'manual' ), true ) ? $src : 'prompt';
		}
		if ( ! empty( $raw['optionalPrompt'] ) ) {
			$out['optionalPrompt'] = sanitize_textarea_field( (string) $raw['optionalPrompt'] );
		}
		$csv_source = sanitize_key( (string) ( $raw['csvInputSource'] ?? '' ) );
		if ( in_array( $csv_source, array( 'upload', 'workflow', 'site' ), true ) ) {
			$out['csvInputSource'] = $csv_source;
		}
		if ( ! empty( $raw['entityMode'] ) ) {
			$mode = sanitize_key( (string) $raw['entityMode'] );
			$out['entityMode'] = in_array( $mode, array( 'auto', 'manual', 'blank' ), true ) ? $mode : 'blank';
		}
		if ( ! empty( $raw['entityValue'] ) ) {
			$out['entityValue'] = sanitize_text_field( (string) $raw['entityValue'] );
		}
		if ( ! empty( $raw['keywordValue'] ) ) {
			$out['keywordValue'] = sanitize_text_field( (string) $raw['keywordValue'] );
		}
		if ( ! empty( $raw['businessName'] ) ) {
			$out['businessName'] = sanitize_text_field( (string) $raw['businessName'] );
		}
		if ( array_key_exists( 'keyword', $raw ) ) {
			$out['keyword'] = sanitize_text_field( (string) $raw['keyword'] );
		}
		if ( isset( $raw['auditQuestions'] ) && is_array( $raw['auditQuestions'] ) ) {
			$questions = array();
			foreach ( $raw['auditQuestions'] as $question ) {
				$text = sanitize_textarea_field( (string) $question );
				if ( $text !== '' ) {
					$questions[] = $text;
				}
			}
			if ( count( $questions ) > 0 ) {
				$out['auditQuestions'] = array_values( $questions );
			}
		}
		if ( ! empty( $raw['browserInstructionsHtml'] ) ) {
			$out['browserInstructionsHtml'] = wp_kses_post( (string) $raw['browserInstructionsHtml'] );
		}
		if ( ! empty( $raw['titleTemplate'] ) ) {
			$out['titleTemplate'] = sanitize_text_field( (string) $raw['titleTemplate'] );
		}
		if ( array_key_exists( 'featuredImage', $raw ) ) {
			$out['featuredImage'] = ! empty( $raw['featuredImage'] );
		}
		if ( ! empty( $raw['sitemapType'] ) ) {
			$st = sanitize_key( (string) $raw['sitemapType'] );
			$out['sitemapType'] = $st === 'entity' ? 'entity' : 'post';
		}
		if ( ! empty( $raw['postDestination'] ) ) {
			$pd = sanitize_key( (string) $raw['postDestination'] );
			if ( 'bank' === $pd ) {
				$pd = 'wordpress';
			}
			$out['postDestination'] = in_array( $pd, array( 'wordpress', 'draft' ), true ) ? $pd : 'wordpress';
		}
		if ( ! empty( $raw['scheduleFrequency'] ) ) {
			$freq = sanitize_key( (string) $raw['scheduleFrequency'] );
			$allowed_freq = array( 'immediately', 'daily', 'weekly', 'monthly', 'custom', 'everyNDays' );
			if ( in_array( $freq, $allowed_freq, true ) ) {
				$out['scheduleFrequency'] = $freq;
			}
		}
		if ( isset( $raw['scheduleCustomInterval'] ) ) {
			$out['scheduleCustomInterval'] = max( 1, min( 365, (int) $raw['scheduleCustomInterval'] ) );
		}
		if ( isset( $raw['scheduleDayOfWeek'] ) ) {
			$out['scheduleDayOfWeek'] = max( 0, min( 6, (int) $raw['scheduleDayOfWeek'] ) );
		}
		if ( ! empty( $raw['scheduleStartDateOption'] ) ) {
			$opt = sanitize_key( (string) $raw['scheduleStartDateOption'] );
			$out['scheduleStartDateOption'] = $opt === 'immediate' ? 'immediate' : 'custom';
		}
		if ( ! empty( $raw['scheduleCustomStartDate'] ) ) {
			$date = sanitize_text_field( (string) $raw['scheduleCustomStartDate'] );
			if ( preg_match( '/^\d{4}-\d{2}-\d{2}$/', $date ) ) {
				$out['scheduleCustomStartDate'] = $date;
			}
		}
		if ( array_key_exists( 'scheduleDraftOnly', $raw ) ) {
			$out['scheduleDraftOnly'] = ! empty( $raw['scheduleDraftOnly'] );
		}
		if ( isset( $raw['scheduleTimesPerMonth'] ) ) {
			$out['scheduleTimesPerMonth'] = max( 1, min( 31, (int) $raw['scheduleTimesPerMonth'] ) );
		}
		if ( isset( $raw['scheduleStartDay'] ) ) {
			$out['scheduleStartDay'] = max( 1, min( 28, (int) $raw['scheduleStartDay'] ) );
		}
		if ( ! empty( $raw['scheduleStartTime'] ) ) {
			$time = sanitize_text_field( (string) $raw['scheduleStartTime'] );
			if ( preg_match( '/^\d{2}:\d{2}$/', $time ) ) {
				$out['scheduleStartTime'] = $time;
			}
		}
		if ( array_key_exists( 'scheduleStaggerOptimized', $raw ) ) {
			$out['scheduleStaggerOptimized'] = ! empty( $raw['scheduleStaggerOptimized'] );
		}
		if ( ! empty( $raw['locationSource'] ) ) {
			$out['locationSource'] = 'grid';
		}
		if ( ! empty( $raw['gridInputSource'] ) ) {
			$out['gridInputSource'] = 'workflow';
		}
		if ( isset( $raw['entityAdGroupCount'] ) ) {
			$out['entityAdGroupCount'] = max( 1, min( 15, (int) $raw['entityAdGroupCount'] ) );
		}
		if ( isset( $raw['entityAdsPerGroup'] ) ) {
			$out['entityAdsPerGroup'] = max( 1, min( 15, (int) $raw['entityAdsPerGroup'] ) );
		}
		if ( isset( $raw['entityPageCount'] ) ) {
			$out['entityPageCount'] = max( 1, min( 31, (int) $raw['entityPageCount'] ) );
		}
		if ( ! empty( $raw['focusKeyword'] ) ) {
			$out['focusKeyword'] = sanitize_text_field( (string) $raw['focusKeyword'] );
		}
		if ( ! empty( $raw['gridCsvUrl'] ) ) {
			$out['gridCsvUrl'] = esc_url_raw( (string) $raw['gridCsvUrl'] );
		}
		if ( ! empty( $raw['gridCsvBase64'] ) ) {
			$out['gridCsvBase64'] = sanitize_text_field( (string) $raw['gridCsvBase64'] );
		}
		if ( ! empty( $raw['entityCsvInputSource'] ) ) {
			$source = sanitize_key( (string) $raw['entityCsvInputSource'] );
			if ( in_array( $source, array( 'upload', 'workflow' ), true ) ) {
				$out['entityCsvInputSource'] = $source;
			}
		}
		if ( ! empty( $raw['entityCsvUrl'] ) ) {
			$out['entityCsvUrl'] = esc_url_raw( (string) $raw['entityCsvUrl'] );
		}
		if ( ! empty( $raw['entityCsvBase64'] ) ) {
			$out['entityCsvBase64'] = sanitize_text_field( (string) $raw['entityCsvBase64'] );
		}
		if ( ! empty( $raw['ragInputKeys'] ) && is_array( $raw['ragInputKeys'] ) ) {
			$keys = array();
			foreach ( $raw['ragInputKeys'] as $key ) {
				$k = sanitize_key( (string) $key );
				if ( $k !== '' ) {
					$keys[] = $k;
				}
			}
			if ( count( $keys ) > 0 ) {
				$out['ragInputKeys'] = array_values( array_unique( $keys ) );
			}
		}
		if ( ! empty( $raw['entityTypeFocus'] ) && is_array( $raw['entityTypeFocus'] ) ) {
			$focus_types = array();
			foreach ( $raw['entityTypeFocus'] as $item ) {
				$t = sanitize_text_field( (string) $item );
				if ( $t !== '' ) {
					$focus_types[] = $t;
				}
			}
			if ( count( $focus_types ) > 0 ) {
				$out['entityTypeFocus'] = array_values( $focus_types );
			}
		}
		if ( ! empty( $raw['radiusPreset'] ) ) {
			$preset = sanitize_key( (string) $raw['radiusPreset'] );
			if ( in_array( $preset, array( 'off', 'close', 'medium', 'far' ), true ) ) {
				$out['radiusPreset'] = $preset;
			}
		}
		if ( array_key_exists( 'sendAutomationEmail', $raw ) ) {
			$out['sendAutomationEmail'] = ! empty( $raw['sendAutomationEmail'] );
		}
		if ( array_key_exists( 'automationEmailTo', $raw ) ) {
			$email = strtolower( trim( (string) $raw['automationEmailTo'] ) );
			if ( $email !== '' && filter_var( $email, FILTER_VALIDATE_EMAIL ) ) {
				$sanitized = sanitize_email( $email );
				$out['automationEmailTo'] = ( $sanitized !== '' && is_email( $sanitized ) ) ? $sanitized : $email;
			}
		}
		if ( ! empty( $raw['automationEmailSubject'] ) ) {
			$out['automationEmailSubject'] = sanitize_text_field( (string) $raw['automationEmailSubject'] );
		}
		if ( ! empty( $raw['automationEmailMessage'] ) ) {
			$out['automationEmailMessage'] = sanitize_textarea_field( (string) $raw['automationEmailMessage'] );
		}
		if ( array_key_exists( 'automationEmailAiIntro', $raw ) ) {
			$out['automationEmailAiIntro'] = ! empty( $raw['automationEmailAiIntro'] );
		}
		if ( ! empty( $out['automationEmailTo'] ) ) {
			$out['sendAutomationEmail'] = true;
		}
		if ( ! empty( $out['sendAutomationEmail'] ) ) {
			$out['saveLocalArchive'] = true;
		}
		if ( array_key_exists( 'saveToGoogleDrive', $raw ) ) {
			$out['saveToGoogleDrive'] = ! empty( $raw['saveToGoogleDrive'] );
		}
		if ( ! empty( $raw['googleDriveFolderId'] ) ) {
			$folder_id = preg_replace( '/[^a-zA-Z0-9_-]/', '', (string) $raw['googleDriveFolderId'] );
			if ( strlen( $folder_id ) >= 10 ) {
				$out['googleDriveFolderId'] = $folder_id;
			}
		}
		if ( ! empty( $raw['googleDriveFolderLabel'] ) ) {
			$out['googleDriveFolderLabel'] = sanitize_text_field( (string) $raw['googleDriveFolderLabel'] );
		}
		if ( ! empty( $raw['googleDrivePresetKey'] ) ) {
			$out['googleDrivePresetKey'] = sanitize_key( (string) $raw['googleDrivePresetKey'] );
		}
		if ( ! empty( $raw['googleDriveFolderSource'] ) ) {
			$source = sanitize_key( (string) $raw['googleDriveFolderSource'] );
			if ( in_array( $source, array( 'manual', 'client_root', 'path', 'variable' ), true ) ) {
				$out['googleDriveFolderSource'] = $source;
			}
		}
		if ( ! empty( $raw['googleDriveFolderPath'] ) ) {
			$out['googleDriveFolderPath'] = sanitize_text_field( (string) $raw['googleDriveFolderPath'] );
		}
		if ( ! empty( $raw['googleDriveFolderVariable'] ) ) {
			$out['googleDriveFolderVariable'] = sanitize_key( (string) $raw['googleDriveFolderVariable'] );
		}
		if ( ! empty( $out['saveToGoogleDrive'] ) ) {
			$out['saveLocalArchive'] = true;
		}
		return $out;
	}

	/**
	 * @param array<string,mixed> $payload
	 * @return array<string,mixed>
	 */
	public static function automation_email_contract_fields( array $payload ): array {
		$sanitized = self::sanitize_execution_payload( $payload );
		$keys      = array(
			'sendAutomationEmail',
			'automationEmailTo',
			'automationEmailSubject',
			'automationEmailMessage',
			'automationEmailAiIntro',
		);
		$out       = array();
		foreach ( $keys as $key ) {
			if ( array_key_exists( $key, $sanitized ) ) {
				$out[ $key ] = $sanitized[ $key ];
			}
		}
		return $out;
	}

	/**
	 * @param array<string,mixed> $payload
	 * @return array<string,mixed>
	 */
	public static function google_drive_contract_fields( array $payload ): array {
		$sanitized = self::sanitize_execution_payload( $payload );
		$keys      = array(
			'saveToGoogleDrive',
			'googleDriveFolderId',
			'googleDriveFolderLabel',
			'googleDrivePresetKey',
			'googleDriveFolderSource',
			'googleDriveFolderPath',
			'googleDriveFolderVariable',
		);
		$out       = array();
		foreach ( $keys as $key ) {
			if ( array_key_exists( $key, $sanitized ) ) {
				$out[ $key ] = $sanitized[ $key ];
			}
		}
		return $out;
	}

	/**
	 * @return array<string,mixed>|null
	 */
	public static function patch_task_execution_meta( int $team_id, int $task_id, int $execution_id, string $status ): ?array {
		$row = self::get_task_row( $team_id, $task_id );
		if ( ! $row ) {
			return null;
		}
		$payload = self::decode_payload( $row['payload_json'] );
		$payload['lastExecutionId']     = $execution_id;
		$payload['lastExecutionStatus'] = sanitize_key( $status );

		global $wpdb;
		$table = $wpdb->prefix . 'neo_pulse_team_tasks';
		$wpdb->update(
			$table,
			array(
				'payload_json' => self::encode_payload( $payload ),
				'updated_at'   => gmdate( 'Y-m-d H:i:s' ),
			),
			array( 'id' => $task_id, 'team_id' => $team_id ),
			array( '%s', '%s' ),
			array( '%d', '%d' )
		);
		return self::get_task( $team_id, $task_id );
	}
}
