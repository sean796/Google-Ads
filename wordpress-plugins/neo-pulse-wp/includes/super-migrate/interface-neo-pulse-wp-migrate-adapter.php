<?php
/**
 * Super Migrate source adapter interface.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

interface Neo_Pulse_Wp_Migrate_Adapter {

	/**
	 * Unique adapter id (e.g. acf, rank_math).
	 */
	public function get_id(): string;

	/**
	 * Admin menu macro group: fields | seo | performance.
	 */
	public function get_macro_group(): string;

	/**
	 * Human label for scan card.
	 */
	public function get_label(): string;

	/**
	 * Whether this adapter can run on the current site.
	 */
	public function is_available(): bool;

	/**
	 * Detection metadata for scan card / sources_detected.
	 *
	 * @return array<string, mixed>
	 */
	public function detect(): array;

	/**
	 * Micro steps for a phase.
	 *
	 * @param string $phase crawl|apply.
	 * @return array<int, array{id: string, label: string, total: int}>
	 */
	public function get_steps( string $phase ): array;

	/**
	 * Execute one micro step (may process one batch when total > 1).
	 *
	 * @param string               $step_id Step id from get_steps().
	 * @param string               $phase   crawl|apply.
	 * @param array<string, mixed> $sheet   Flo Sheet (by reference).
	 * @param array<string, mixed> $context Job context (dry_run, offsets, etc.).
	 * @return array{ok: bool, done?: bool, message?: string, stats?: array<string, int>, error?: string}
	 */
	public function run_step( string $step_id, string $phase, array &$sheet, array $context ): array;
}
