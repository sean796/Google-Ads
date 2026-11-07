<?php
/**
 * /api/changelog/* route handlers.
 *
 * Serves the Changelog screen: a date-organized archive of app update
 * entries plus the pool of git commits waiting to be covered. Source
 * packs (from scripts/changelog-source.mjs) are merged into the commit
 * pool, deduplicated by hash. Entries and commits persist in
 * changelog.json in the private data root; every write goes through the
 * locked store update so concurrent saves cannot lose each other.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Changelog_Route_Handlers {

	const MAX_PACK_COMMITS = 500;

	/**
	 * @param string              $subpath Route after changelog/.
	 * @param string              $method  HTTP method.
	 * @param array<string,mixed> $body    JSON body.
	 */
	public static function dispatch_http( string $subpath, string $method, array $body ): void {
		$user = Neo_Pulse_App_Auth_Session::require_user();
		if ( ! $user ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Unauthorized' ), 401 );
			return;
		}

		$subpath = trim( $subpath, '/' );
		$method  = strtoupper( $method );

		if ( $subpath === '' && $method === 'GET' ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( self::payload() );
			return;
		}

		if ( $subpath === 'source' && $method === 'GET' ) {
			$state = self::read_state();
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'              => true,
					'coveredThrough'  => self::covered_through( $state ),
					'commits'         => self::uncovered_commits( $state ),
				)
			);
			return;
		}

		if ( $subpath === 'source' && $method === 'POST' ) {
			self::ingest_source( $body );
			return;
		}

		if ( $subpath === 'entry' && $method === 'POST' ) {
			self::save_entry( $body );
			return;
		}

		Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Not found' ), 404 );
	}

	/**
	 * @param mixed $raw Decoded changelog.json contents, if readable.
	 * @return array{entries: array<int,array<string,mixed>>, commits: array<int,array<string,mixed>>}
	 */
	private static function normalize_state( $raw ): array {
		$state = array(
			'entries' => array(),
			'commits' => array(),
		);
		if ( ! is_array( $raw ) ) {
			return $state;
		}
		if ( isset( $raw['entries'] ) && is_array( $raw['entries'] ) ) {
			foreach ( $raw['entries'] as $entry ) {
				if ( is_array( $entry ) && isset( $entry['id'] ) && is_string( $entry['id'] ) && $entry['id'] !== '' ) {
					$state['entries'][] = $entry;
				}
			}
		}
		if ( isset( $raw['commits'] ) && is_array( $raw['commits'] ) ) {
			foreach ( $raw['commits'] as $commit ) {
				$clean = self::clean_commit( $commit );
				if ( $clean !== null ) {
					$state['commits'][] = $clean;
				}
			}
		}
		return $state;
	}

	/**
	 * @return array{entries: array<int,array<string,mixed>>, commits: array<int,array<string,mixed>>}
	 */
	private static function read_state(): array {
		return self::normalize_state(
			Neo_Pulse_App_Json_File_Store::read( Neo_Pulse_App_Data_Paths::changelog_path() )
		);
	}

	/**
	 * Apply a change to the stored state under the store lock, so two
	 * requests cannot read the same state and overwrite each other.
	 *
	 * @param callable $mutator fn(array &$state): void
	 */
	private static function mutate_state( callable $mutator ): bool {
		return Neo_Pulse_App_Json_File_Store::update(
			Neo_Pulse_App_Data_Paths::changelog_path(),
			static function ( $current ) use ( $mutator ) {
				$state = self::normalize_state( $current );
				$mutator( $state );
				return array(
					'entries' => $state['entries'],
					'commits' => $state['commits'],
				);
			}
		);
	}

	/**
	 * @param mixed $commit Raw commit from a source pack.
	 * @return array<string,mixed>|null
	 */
	private static function clean_commit( $commit ): ?array {
		if ( ! is_array( $commit ) ) {
			return null;
		}
		$hash    = isset( $commit['hash'] ) && is_string( $commit['hash'] ) ? trim( $commit['hash'] ) : '';
		$date    = isset( $commit['date'] ) && is_string( $commit['date'] ) ? trim( $commit['date'] ) : '';
		$subject = isset( $commit['subject'] ) && is_string( $commit['subject'] ) ? trim( $commit['subject'] ) : '';
		if ( $hash === '' || $date === '' || $subject === '' ) {
			return null;
		}
		$files = array();
		if ( isset( $commit['files'] ) && is_array( $commit['files'] ) ) {
			foreach ( $commit['files'] as $file ) {
				if ( is_string( $file ) && $file !== '' ) {
					$files[] = $file;
				}
			}
		}
		return array(
			'hash'    => substr( $hash, 0, 64 ),
			'date'    => substr( $date, 0, 32 ),
			'subject' => substr( $subject, 0, 300 ),
			'body'    => isset( $commit['body'] ) && is_string( $commit['body'] ) ? substr( trim( $commit['body'] ), 0, 2000 ) : '',
			'files'   => array_slice( $files, 0, 200 ),
		);
	}

	/**
	 * The latest date covered by a saved entry, or null when the archive
	 * is empty. Derived from the entries so it can never drift.
	 *
	 * @param array{entries: array<int,array<string,mixed>>, commits: array<int,array<string,mixed>>} $state Stored state.
	 */
	private static function covered_through( array $state ): ?string {
		$latest = null;
		foreach ( $state['entries'] as $entry ) {
			$to = isset( $entry['rangeTo'] ) && is_string( $entry['rangeTo'] ) ? $entry['rangeTo'] : '';
			if ( $to !== '' && ( $latest === null || strcmp( $to, $latest ) > 0 ) ) {
				$latest = $to;
			}
		}
		return $latest;
	}

	/**
	 * Commits not yet covered by any saved entry, oldest first so the
	 * agent reads them in the order they landed.
	 *
	 * @param array{entries: array<int,array<string,mixed>>, commits: array<int,array<string,mixed>>} $state Stored state.
	 * @return array<int,array<string,mixed>>
	 */
	private static function uncovered_commits( array $state ): array {
		$covered = self::covered_through( $state );
		$out     = array();
		foreach ( $state['commits'] as $commit ) {
			if ( $covered === null || strcmp( (string) $commit['date'], $covered ) > 0 ) {
				$out[] = $commit;
			}
		}
		usort(
			$out,
			static function ( $a, $b ) {
				return strcmp( (string) $a['date'], (string) $b['date'] );
			}
		);
		return $out;
	}

	/**
	 * @param array{entries: array<int,array<string,mixed>>, commits: array<int,array<string,mixed>>} $state Stored state.
	 * @return array<string,mixed>
	 */
	private static function source_summary( array $state ): array {
		$latest = null;
		foreach ( $state['commits'] as $commit ) {
			$date = (string) $commit['date'];
			if ( $latest === null || strcmp( $date, $latest ) > 0 ) {
				$latest = $date;
			}
		}
		return array(
			'commitCount'      => count( $state['commits'] ),
			'uncoveredCount'   => count( self::uncovered_commits( $state ) ),
			'coveredThrough'   => self::covered_through( $state ),
			'latestCommitDate' => $latest,
		);
	}

	/**
	 * @return array<string,mixed>
	 */
	private static function payload(): array {
		$state   = self::read_state();
		$entries = $state['entries'];
		usort(
			$entries,
			static function ( $a, $b ) {
				return strcmp( (string) ( $b['date'] ?? '' ), (string) ( $a['date'] ?? '' ) );
			}
		);
		return array(
			'ok'      => true,
			'entries' => $entries,
			'source'  => self::source_summary( $state ),
		);
	}

	/**
	 * @param array<string,mixed> $body JSON body.
	 */
	private static function ingest_source( array $body ): void {
		if ( ! isset( $body['commits'] ) || ! is_array( $body['commits'] ) ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'commits is required' ), 400 );
			return;
		}
		if ( count( $body['commits'] ) > self::MAX_PACK_COMMITS ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Too many commits in one pack (max ' . self::MAX_PACK_COMMITS . ')' ), 400 );
			return;
		}
		$incoming = array();
		foreach ( $body['commits'] as $commit ) {
			$clean = self::clean_commit( $commit );
			if ( $clean !== null ) {
				$incoming[ $clean['hash'] ] = $clean;
			}
		}
		if ( $incoming === array() ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'No valid commits in pack' ), 400 );
			return;
		}
		$saved = self::mutate_state(
			static function ( array &$state ) use ( $incoming ): void {
				$by_hash = array();
				foreach ( $state['commits'] as $commit ) {
					$by_hash[ (string) $commit['hash'] ] = $commit;
				}
				foreach ( $incoming as $hash => $commit ) {
					$by_hash[ $hash ] = $commit;
				}
				$state['commits'] = array_values( $by_hash );
			}
		);
		if ( ! $saved ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Changelog save failed' ), 500 );
			return;
		}
		Neo_Pulse_App_Api_Dispatcher::send_json( self::payload() );
	}

	/**
	 * @param mixed $value Raw field value.
	 * @return string[]
	 */
	private static function clean_string_list( $value ): array {
		$out = array();
		if ( is_array( $value ) ) {
			foreach ( $value as $item ) {
				if ( is_string( $item ) && trim( $item ) !== '' ) {
					$out[] = trim( $item );
				}
			}
		}
		return $out;
	}

	/**
	 * @param array<string,mixed> $body JSON body.
	 */
	private static function save_entry( array $body ): void {
		$entry = isset( $body['entry'] ) && is_array( $body['entry'] ) ? $body['entry'] : array();
		$id    = isset( $entry['id'] ) && is_string( $entry['id'] ) ? trim( $entry['id'] ) : '';
		$date  = isset( $entry['date'] ) && is_string( $entry['date'] ) ? trim( $entry['date'] ) : '';
		$title = isset( $entry['title'] ) && is_string( $entry['title'] ) ? trim( $entry['title'] ) : '';
		if ( $id === '' || $date === '' || $title === '' ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'entry.id, entry.date, and entry.title are required' ), 400 );
			return;
		}
		$sections = array();
		if ( isset( $entry['sections'] ) && is_array( $entry['sections'] ) ) {
			foreach ( $entry['sections'] as $section ) {
				if ( ! is_array( $section ) ) {
					continue;
				}
				$heading = isset( $section['heading'] ) && is_string( $section['heading'] ) ? trim( $section['heading'] ) : '';
				$items   = self::clean_string_list( $section['items'] ?? array() );
				if ( $heading !== '' && $items !== array() ) {
					$sections[] = array(
						'heading' => $heading,
						'items'   => $items,
					);
				}
			}
		}
		$clean = array(
			'id'          => substr( $id, 0, 80 ),
			'date'        => substr( $date, 0, 32 ),
			'rangeFrom'   => isset( $entry['rangeFrom'] ) && is_string( $entry['rangeFrom'] ) ? substr( trim( $entry['rangeFrom'] ), 0, 32 ) : '',
			'rangeTo'     => isset( $entry['rangeTo'] ) && is_string( $entry['rangeTo'] ) ? substr( trim( $entry['rangeTo'] ), 0, 32 ) : '',
			'commitCount' => isset( $entry['commitCount'] ) ? max( 0, (int) $entry['commitCount'] ) : 0,
			'title'       => substr( $title, 0, 300 ),
			'summary'     => isset( $entry['summary'] ) && is_string( $entry['summary'] ) ? substr( trim( $entry['summary'] ), 0, 4000 ) : '',
			'highlights'  => self::clean_string_list( $entry['highlights'] ?? array() ),
			'sections'    => $sections,
			'createdAt'   => gmdate( 'c' ),
		);
		$saved = self::mutate_state(
			static function ( array &$state ) use ( $clean ): void {
				$kept = array();
				foreach ( $state['entries'] as $existing ) {
					if ( (string) ( $existing['id'] ?? '' ) !== $clean['id'] ) {
						$kept[] = $existing;
					}
				}
				$kept[]            = $clean;
				$state['entries']  = $kept;
			}
		);
		if ( ! $saved ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Changelog save failed' ), 500 );
			return;
		}
		Neo_Pulse_App_Api_Dispatcher::send_json( self::payload() );
	}
}
