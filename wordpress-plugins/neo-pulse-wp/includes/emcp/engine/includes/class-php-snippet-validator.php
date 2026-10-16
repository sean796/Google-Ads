<?php
/**
 * PHP Snippet Validator — static analysis for admin/AI-submitted PHP snippets.
 *
 * Two layers:
 *   1. PARSE — token_get_all( …, TOKEN_PARSE ) so the snippet must be
 *      syntactically valid PHP before it can be stored as runnable.
 *   2. SECURITY SCAN — a token walk that flags dangerous constructs, at three
 *      severities:
 *        critical — blocks creation and activation outright.
 *        warning  — does not block. Changes site state or reaches outside the
 *                   snippet, so a reviewer should read it before activating.
 *        notice   — does not block. Ordinary in working code, reported only so
 *                   the report is complete.
 *
 *      The notice tier exists because everything used to be a warning, which
 *      meant a well-written snippet arrived covered in them. A reviewer who is
 *      told that ten routine things are warnings learns to skim, and skimming
 *      is exactly how the one that mattered gets waved through. Every message
 *      therefore says what the code does AND what to check.
 *
 *      Use summary() to describe a report to a person; do not count findings at
 *      the call site.
 *
 * IMPORTANT — this is a GUARDRAIL, not a guarantee. PHP is expressive enough to
 * hide intent (variable functions, decoded strings, reflection), so static
 * analysis cannot prove arbitrary code is safe. The real safety boundary is the
 * capability gate (manage_options + unfiltered_html) plus the human approval
 * step: an AI can create a DRAFT and run the validator, but only an admin can
 * activate a snippet so it actually executes.
 *
 * @package EMCP_Tools
 * @since   2.1.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Validates PHP snippet source.
 *
 * @since 2.1.0
 */
class EMCP_Tools_PHP_Snippet_Validator {

	/**
	 * Function names that block a snippet outright (code exec, shell, dynamic
	 * calls, file writes/deletes, network egress, obfuscation decoders, runtime
	 * config). Maps lowercase function name => reviewer-facing reason.
	 *
	 * @var array<string,string>
	 */
	private static $critical_funcs = array(
		// Arbitrary code execution.
		'eval'                    => 'Executes arbitrary code (eval).',
		'assert'                  => 'Can execute arbitrary code (assert with a string).',
		'create_function'         => 'Creates and runs code from a string.',
		// Shell / process execution.
		'exec'                    => 'Runs an operating-system command.',
		'system'                  => 'Runs an operating-system command.',
		'shell_exec'              => 'Runs an operating-system command.',
		'passthru'                => 'Runs an operating-system command.',
		'proc_open'               => 'Spawns an operating-system process.',
		'popen'                   => 'Spawns an operating-system process.',
		'pcntl_exec'              => 'Executes a program in the current process.',
		'expect_popen'            => 'Spawns an operating-system process.',
		// Indirect / dynamic invocation (bypasses this very check).
		'call_user_func'          => 'Calls a function chosen at runtime (bypasses static checks).',
		'call_user_func_array'    => 'Calls a function chosen at runtime (bypasses static checks).',
		'forward_static_call'     => 'Calls a method chosen at runtime (bypasses static checks).',
		'forward_static_call_array' => 'Calls a method chosen at runtime (bypasses static checks).',
		'func_get_args'           => 'Unexpected in a snippet; often used to smuggle dynamic calls.',
		// File writes / deletes.
		'file_put_contents'       => 'Writes to the filesystem.',
		'fwrite'                  => 'Writes to the filesystem.',
		'fputs'                   => 'Writes to the filesystem.',
		'fputcsv'                 => 'Writes to the filesystem.',
		'ftruncate'               => 'Truncates a file.',
		'unlink'                  => 'Deletes a file.',
		'rmdir'                   => 'Removes a directory.',
		'rename'                  => 'Renames/moves a file.',
		'copy'                    => 'Copies a file.',
		'mkdir'                   => 'Creates a directory.',
		'chmod'                   => 'Changes file permissions.',
		'chown'                   => 'Changes file ownership.',
		'chgrp'                   => 'Changes file group.',
		'symlink'                 => 'Creates a symbolic link.',
		'link'                    => 'Creates a hard link.',
		'move_uploaded_file'      => 'Moves an uploaded file into the filesystem.',
		// Network egress.
		'curl_init'               => 'Makes an outbound network request.',
		'curl_exec'               => 'Makes an outbound network request.',
		'curl_setopt'             => 'Configures an outbound network request.',
		'fsockopen'               => 'Opens a network socket.',
		'pfsockopen'              => 'Opens a network socket.',
		'stream_socket_client'    => 'Opens a network socket.',
		'socket_create'           => 'Opens a network socket.',
		'socket_connect'          => 'Connects a network socket.',
		// Obfuscation decoders (the #1 malware signal; rarely needed in a snippet).
		'base64_decode'           => 'Decodes hidden data, a common malware obfuscation.',
		'gzinflate'               => 'Decompresses hidden data, a common malware obfuscation.',
		'gzuncompress'            => 'Decompresses hidden data, a common malware obfuscation.',
		'gzdecode'                => 'Decompresses hidden data, a common malware obfuscation.',
		'str_rot13'               => 'Decodes hidden data, a common malware obfuscation.',
		'convert_uudecode'        => 'Decodes hidden data, a common malware obfuscation.',
		'hex2bin'                 => 'Decodes hidden data, a common malware obfuscation.',
		// Runtime / environment manipulation.
		'dl'                      => 'Loads a PHP extension at runtime.',
		'putenv'                  => 'Changes environment variables.',
		'ini_set'                 => 'Changes PHP runtime configuration.',
		'ini_alter'               => 'Changes PHP runtime configuration.',
		'apache_setenv'           => 'Changes the web-server environment.',
		'virtual'                 => 'Performs an Apache sub-request.',
		'set_error_handler'       => 'Hijacks error handling.',
		'register_shutdown_function' => 'Schedules deferred code execution.',
		'register_tick_function'  => 'Schedules repeated code execution.',
		'extract'                 => 'Creates variables from arbitrary keys (variable injection).',
	);

	/**
	 * Functions worth a reviewer's attention: they change site state, reach
	 * outside the snippet, or read something the snippet did not create. None of
	 * them block. Each message says what happens and what to check, because
	 * "flagged" without "so look at this" only makes a reviewer uneasy.
	 *
	 * @var array<string,string>
	 */
	private static $review_funcs = array(
		// Reads from disk or a remote URL.
		'fopen'             => 'Opens a file. Check the path is fixed rather than built from request input.',
		'file_get_contents' => 'Reads a file or a remote URL. Check the path is fixed rather than built from request input.',
		'readfile'          => 'Reads a file and sends it to the browser. Check what it can be pointed at.',
		'fread'             => 'Reads from a file handle. Check where the handle came from.',
		'fgets'             => 'Reads from a file handle. Check where the handle came from.',
		'scandir'           => 'Lists the contents of a directory. Check which directory.',
		'glob'              => 'Lists files matching a pattern. Check which directory it searches.',
		'opendir'           => 'Opens a directory for reading. Check which directory.',
		// Changes configuration or the request itself.
		'define'            => 'Defines a constant. Check it is not overriding one that core or wp-config already sets.',
		'header'            => 'Sends an HTTP header, which can redirect the visitor. Check the destination.',
		'setcookie'         => 'Sets a cookie in the visitor\'s browser. Check the name, value, and expiry.',
		'error_reporting'   => 'Changes which PHP errors are reported. Usually belongs in wp-config, not a snippet.',
		'set_exception_handler' => 'Takes over handling of uncaught exceptions site-wide, not just for this snippet.',
		// Writes site data.
		'update_option'     => 'Writes a site option. Check which option, and that the value is validated.',
		'delete_option'     => 'Deletes a site option. Check which one, and that nothing else depends on it.',
		'add_option'        => 'Adds a site option. Check the name is prefixed so it cannot collide.',
		'wp_mail'           => 'Sends email. Check the recipient, and that a visitor cannot trigger it repeatedly.',
		'wp_delete_post'    => 'Deletes a post. Check what it selects, and whether the trash is bypassed.',
		'wp_delete_user'    => 'Deletes a user account. Check what it selects.',
		'wp_insert_user'    => 'Creates a user account. Check the role it assigns.',
		'wp_update_user'    => 'Updates a user, which includes their role. Check it cannot raise privileges.',
		'switch_theme'      => 'Switches the active theme for the whole site.',
		'activate_plugin'   => 'Activates a plugin.',
		'deactivate_plugins' => 'Deactivates plugins.',
	);

	/**
	 * Functions that are ordinary in working code and are listed only so the
	 * report is complete. These are notes, not concerns.
	 *
	 * @var array<string,string>
	 */
	private static $note_funcs = array(
		'do_action'         => 'Fires a hook, so other code can run in response. Normal in WordPress.',
		// A callback chosen at runtime could name a dangerous function, but an
		// inline function is safe by inspection, which is the usual case.
		'array_map'         => 'Runs a callback over an array. Fine with an inline function; check it is not a name taken from input.',
		'array_filter'      => 'Runs a callback over an array. Fine with an inline function; check it is not a name taken from input.',
		'array_walk'        => 'Runs a callback over an array. Fine with an inline function; check it is not a name taken from input.',
		'array_walk_recursive' => 'Runs a callback over an array. Fine with an inline function; check it is not a name taken from input.',
		'array_reduce'      => 'Runs a callback over an array. Fine with an inline function; check it is not a name taken from input.',
		'usort'             => 'Sorts using a comparison callback. Fine with an inline function.',
		'uasort'            => 'Sorts using a comparison callback. Fine with an inline function.',
		'uksort'            => 'Sorts using a comparison callback. Fine with an inline function.',
		'ob_start'          => 'Starts output buffering, which is how a snippet captures its own output.',
		'preg_replace_callback' => 'Runs a callback per regex match. Fine with an inline function.',
		'preg_replace_callback_array' => 'Runs callbacks per regex match. Fine with an inline function.',
		'iterator_apply'    => 'Runs a callback over an iterator. Fine with an inline function.',
	);

	private static $warn_superglobals = array( '$_GET', '$_POST', '$_REQUEST', '$_FILES', '$_COOKIE', '$_SERVER', '$_ENV', '$GLOBALS' );

	/**
	 * Validates a PHP snippet.
	 *
	 * @since 2.1.0
	 *
	 * @param string $code Raw snippet source (with or without PHP tags).
	 * @return array{valid:bool,safe:bool,parse_error:string,findings:array<int,array{severity:string,rule:string,message:string,line:int}>}
	 */
	public static function validate( string $code ): array {
		$result = array(
			'valid'       => true,
			'safe'        => true,
			'parse_error' => '',
			'findings'    => array(),
		);

		$clean = self::strip_tags( $code );

		if ( '' === trim( $clean ) ) {
			$result['valid'] = false;
			$result['parse_error'] = __( 'The snippet is empty.', 'emcp-tools' );
			return $result;
		}

		// Reject an embedded closing tag: it would let code break out of the
		// wrapper into raw HTML/inline output we can't reason about.
		if ( false !== strpos( $clean, '?>' ) ) {
			$result['safe'] = false;
			$result['findings'][] = self::finding( 'critical', 'close_tag', __( 'Remove the closing tag ( ?> ). A snippet is a block of PHP, so it never needs one, and it would let code escape into raw output. To print HTML, use echo or a heredoc.', 'emcp-tools' ), 0 );
		}

		// Wrap so top-level statements (return, etc.) are valid in a function
		// context — this is exactly how the snippet will be executed.
		$wrapped = '<?php function __emcp_snippet_validate() { ' . $clean . "\n}";

		$tokens = null;
		try {
			$tokens = token_get_all( $wrapped, TOKEN_PARSE );
		} catch ( \ParseError $e ) {
			$result['valid'] = false;
			$result['parse_error'] = $e->getMessage();
			return $result;
		} catch ( \Throwable $e ) {
			$result['valid'] = false;
			$result['parse_error'] = $e->getMessage();
			return $result;
		}

		self::scan_tokens( $tokens, $result );

		// `safe` is false if any CRITICAL finding exists.
		foreach ( $result['findings'] as $f ) {
			if ( 'critical' === $f['severity'] ) {
				$result['safe'] = false;
				break;
			}
		}

		return $result;
	}

	/**
	 * Turns a validation report into something a person can act on.
	 *
	 * Every surface that shows a report should use this rather than counting
	 * findings itself, so a snippet is not described as fine on one screen and
	 * alarming on another. The wording leads with whether the snippet can be
	 * activated, because that is the question the reader actually has, and
	 * "3 warnings" with no verdict reads as "something is wrong" even when
	 * nothing is.
	 *
	 * @param array $validation A report from validate().
	 * @return array{blocked:bool,counts:array<string,int>,headline:string,detail:string}
	 */
	public static function summary( array $validation ): array {
		$counts = array( 'critical' => 0, 'warning' => 0, 'notice' => 0 );
		foreach ( (array) ( $validation['findings'] ?? array() ) as $finding ) {
			$severity = (string) ( $finding['severity'] ?? '' );
			if ( isset( $counts[ $severity ] ) ) {
				++$counts[ $severity ];
			}
		}

		$blocked = empty( $validation['valid'] ) || empty( $validation['safe'] );

		if ( empty( $validation['valid'] ) ) {
			return array(
				'blocked'  => true,
				'counts'   => $counts,
				'headline' => __( 'Will not run', 'emcp-tools' ),
				'detail'   => '' !== (string) ( $validation['parse_error'] ?? '' )
					/* translators: %s: PHP parse error */
					? sprintf( __( 'This is not valid PHP: %s', 'emcp-tools' ), (string) $validation['parse_error'] )
					: __( 'This is not valid PHP.', 'emcp-tools' ),
			);
		}

		if ( $counts['critical'] > 0 ) {
			return array(
				'blocked'  => true,
				'counts'   => $counts,
				'headline' => __( 'Cannot be activated', 'emcp-tools' ),
				'detail'   => sprintf(
					/* translators: %d: number of blocking findings */
					_n(
						'%d thing has to change before this can run. It is listed below.',
						'%d things have to change before this can run. They are listed below.',
						$counts['critical'],
						'emcp-tools'
					),
					$counts['critical']
				),
			);
		}

		$parts = array();
		if ( $counts['warning'] > 0 ) {
			$parts[] = sprintf(
				/* translators: %d: number of findings worth reviewing */
				_n( '%d thing worth reading first', '%d things worth reading first', $counts['warning'], 'emcp-tools' ),
				$counts['warning']
			);
		}
		if ( $counts['notice'] > 0 ) {
			$parts[] = sprintf(
				/* translators: %d: number of informational notes */
				_n( '%d note', '%d notes', $counts['notice'], 'emcp-tools' ),
				$counts['notice']
			);
		}

		if ( ! $parts ) {
			$detail = __( 'Nothing flagged.', 'emcp-tools' );
		} elseif ( 0 === $counts['warning'] ) {
			$detail = sprintf(
				/* translators: %d: number of informational notes */
				_n(
					'%d note, which is ordinary in working code.',
					'%d notes, all ordinary in working code.',
					$counts['notice'],
					'emcp-tools'
				),
				$counts['notice']
			);
		} else {
			$detail = ucfirst( implode( __( ', plus ', 'emcp-tools' ), $parts ) ) . '.';
		}

		return array(
			'blocked'  => $blocked,
			'counts'   => $counts,
			'headline' => __( 'Safe to activate', 'emcp-tools' ),
			'detail'   => $detail,
		);
	}

	/**
	 * Strips a single leading PHP open tag (and a trailing close tag) so callers
	 * may submit code with or without tags.
	 *
	 * @param string $code Raw code.
	 * @return string
	 */
	public static function strip_tags( string $code ): string {
		$code = trim( $code );
		// Leading <?php or <?=  or <?
		$code = preg_replace( '/^<\?php\b/i', '', $code, 1 );
		if ( null === $code ) {
			return '';
		}
		$code = preg_replace( '/^<\?=?/', '', $code, 1 );
		return null === $code ? '' : trim( $code );
	}

	/**
	 * Walks the token stream and records findings.
	 *
	 * @param array $tokens token_get_all() output.
	 * @param array $result Result array (by reference).
	 */
	private static function scan_tokens( array $tokens, array &$result ): void {
		// Build a list of significant tokens (drop whitespace/comments) with the
		// original line preserved, so we can look at neighbours cheaply.
		$sig = array();
		foreach ( $tokens as $tok ) {
			if ( is_array( $tok ) ) {
				if ( T_WHITESPACE === $tok[0] || T_COMMENT === $tok[0] || T_DOC_COMMENT === $tok[0] ) {
					continue;
				}
				$sig[] = array( 'id' => $tok[0], 'text' => $tok[1], 'line' => (int) $tok[2] );
			} else {
				$sig[] = array( 'id' => null, 'text' => $tok, 'line' => 0 );
			}
		}

		$count = count( $sig );
		for ( $i = 0; $i < $count; $i++ ) {
			$t    = $sig[ $i ];
			$id   = $t['id'];
			$text = $t['text'];
			$line = $t['line'];
			$prev = $i > 0 ? $sig[ $i - 1 ] : null;
			$next = $i + 1 < $count ? $sig[ $i + 1 ] : null;

			// Backtick shell execution: `...`
			if ( null === $id && '`' === $text ) {
				$result['findings'][] = self::finding( 'critical', 'backtick', __( 'Shell execution via the backtick operator.', 'emcp-tools' ), $line );
				continue;
			}

			// Dynamic include/require.
			if ( in_array( $id, array( T_INCLUDE, T_INCLUDE_ONCE, T_REQUIRE, T_REQUIRE_ONCE ), true ) ) {
				$result['findings'][] = self::finding( 'critical', 'include', __( 'Loads and runs another PHP file (include/require).', 'emcp-tools' ), $line );
				continue;
			}

			// eval as a dedicated language construct (T_EVAL) where the engine emits it.
			if ( defined( 'T_EVAL' ) && T_EVAL === $id ) {
				$result['findings'][] = self::finding( 'critical', 'eval', __( 'Executes arbitrary code (eval).', 'emcp-tools' ), $line );
				continue;
			}

			// Variable function call: $var( …  or  $var->( …  treated as dynamic call.
			if ( T_VARIABLE === $id && $next && null === $next['id'] && '(' === $next['text'] ) {
				$result['findings'][] = self::finding( 'critical', 'variable_function', __( 'Calls a function named by a variable (bypasses static checks).', 'emcp-tools' ), $line );
				continue;
			}

			// Dynamic class instantiation: `new $var` — class chosen at runtime.
			if ( T_NEW === $id && $next && T_VARIABLE === $next['id'] ) {
				$result['findings'][] = self::finding( 'critical', 'dynamic_instantiation', __( 'Instantiates a class named by a variable (bypasses static checks).', 'emcp-tools' ), $line );
				continue;
			}

			// Reflection / closure factories that can invoke arbitrary code.
			if ( T_NEW === $id && $next && T_STRING === $next['id']
				&& in_array( strtolower( ltrim( $next['text'], '\\' ) ), array( 'reflectionfunction', 'reflectionmethod', 'reflectionclass', 'reflectionobject', 'closure' ), true ) ) {
				$result['findings'][] = self::finding( 'critical', 'reflection', sprintf(
					/* translators: %s: class name */
					__( 'Uses %s, which can invoke functions/methods chosen at runtime.', 'emcp-tools' ),
					$next['text']
				), $line );
				continue;
			}

			// die / exit — abruptly terminates the request (can skip recovery logic).
			if ( defined( 'T_EXIT' ) && T_EXIT === $id ) {
				$result['findings'][] = self::finding( 'notice', 'exit', __( 'Stops the request here. Expected directly after a redirect.', 'emcp-tools' ), $line );
				continue;
			}

			// Variable variable: $ immediately before a $var, or T_VARIABLE '${'.
			if ( null === $id && '$' === $text && $next && T_VARIABLE === $next['id'] ) {
				$result['findings'][] = self::finding( 'warning', 'variable_variable', __( 'Uses a variable variable ($$x).', 'emcp-tools' ), $line );
				continue;
			}

			// @ error suppression.
			if ( null === $id && '@' === $text ) {
				$result['findings'][] = self::finding( 'warning', 'suppress', __( 'Hides errors with @. The failure still happens, you just will not see it. Handle it instead where you can.', 'emcp-tools' ), $line );
				continue;
			}

			// Superglobals.
			if ( T_VARIABLE === $id && in_array( $text, self::$warn_superglobals, true ) ) {
				$result['findings'][] = self::finding(
					'notice',
					'superglobal',
					sprintf(
						/* translators: %s: superglobal name */
						__( 'Reads request input from %s. Normal, as long as the value is sanitized before use and the surrounding code checks capability and nonce.', 'emcp-tools' ),
						$text
					),
					$line
				);
				continue;
			}

			// Destructive SQL inside a string literal.
			if ( in_array( $id, array( T_CONSTANT_ENCAPSED_STRING, T_ENCAPSED_AND_WHITESPACE ), true ) ) {
				if ( preg_match( '/\b(DROP|TRUNCATE|ALTER)\s+(TABLE|DATABASE)\b/i', $text ) || preg_match( '/\bDELETE\s+FROM\b/i', $text ) ) {
					$result['findings'][] = self::finding( 'critical', 'destructive_sql', __( 'Contains destructive SQL (DROP/TRUNCATE/ALTER/DELETE).', 'emcp-tools' ), $line );
				}
				continue;
			}

			// Function-name calls: a T_STRING followed by '(' that is not a method
			// (->name), static call (::name), or a definition (function name / new).
			if ( T_STRING === $id && $next && null === $next['id'] && '(' === $next['text'] ) {
				$prev_id   = $prev ? $prev['id'] : null;
				$prev_text = $prev ? $prev['text'] : '';
				$is_member = ( T_OBJECT_OPERATOR === $prev_id ) || ( T_DOUBLE_COLON === $prev_id )
					|| ( defined( 'T_NULLSAFE_OBJECT_OPERATOR' ) && T_NULLSAFE_OBJECT_OPERATOR === $prev_id );
				$is_def    = ( T_FUNCTION === $prev_id ) || ( T_NEW === $prev_id );

				// A method call whose NAME is on the critical list. Skipping every
				// member call meant the list could be walked around without any
				// dynamic-dispatch trick, for instance
				// (new SplFileObject($path,'w'))->fwrite($payload): fwrite is on the
				// list, it just never got looked up. Reported as a warning rather
				// than critical, because the name alone does not say what object it
				// belongs to and a false block on someone's $wpdb->query() is worse
				// than a line a reviewer has to read.
				if ( $is_member ) {
					$member = strtolower( $text );
					if ( isset( self::$critical_funcs[ $member ] ) ) {
						$result['findings'][] = self::finding(
							'warning',
							'method:' . $member,
							sprintf(
								/* translators: %s: method name. */
								__( 'Calls ->%s() on an object. The same name as a function this validator blocks outright, so check what the object is and what the call does before activating.', 'emcp-tools' ),
								$text
							),
							$line
						);
					}
					continue;
				}

				if ( $is_def ) {
					continue;
				}
				$name = strtolower( $text );
				if ( isset( self::$critical_funcs[ $name ] ) ) {
					$result['findings'][] = self::finding( 'critical', 'function:' . $name, self::$critical_funcs[ $name ], $line );
				} elseif ( isset( self::$review_funcs[ $name ] ) ) {
					$result['findings'][] = self::finding( 'warning', 'function:' . $name, self::$review_funcs[ $name ], $line );
				} elseif ( isset( self::$note_funcs[ $name ] ) ) {
					$result['findings'][] = self::finding( 'notice', 'function:' . $name, self::$note_funcs[ $name ], $line );
				}
				continue;
			}

			// NAMED function/class definitions inside a snippet (redeclaration risk).
			//
			// Only a name can be redeclared. A closure, an arrow function, and an
			// anonymous class all produce a value and declare nothing, so none of
			// them carry the risk this rule describes. That distinction matters
			// in practice: a snippet that runs on a hook is a closure by
			// construction, so flagging closures put a warning on almost every
			// well-written snippet and buried the named declarations that are
			// actually worth a reviewer's attention.
			if ( in_array( $id, array( T_FUNCTION, T_CLASS, T_TRAIT, T_INTERFACE ), true ) ) {
				$named = $next;
				// `function &foo()` returns by reference; the name follows the &.
				// Matched on the text because PHP 8.1 turned & into a typed token
				// (T_AMPERSAND_*), so it is not always an untyped character token.
				if ( $named && '&' === $named['text'] ) {
					$named = $i + 2 < $count ? $sig[ $i + 2 ] : null;
				}
				if ( ! $named || T_STRING !== $named['id'] ) {
					continue;
				}
				// The wrapper this validator puts around the snippet to parse it.
				if ( '__emcp_snippet_validate' === $named['text'] ) {
					continue;
				}
				$result['findings'][] = self::finding(
					'warning',
					'definition',
					sprintf(
						/* translators: %s: declared name */
						__( 'Declares the name %s. A snippet body runs again every time its hook fires, and a second run cannot redeclare the same name, so this fatals on any hook that fires more than once per request. Use an inline function, or guard it with function_exists().', 'emcp-tools' ),
						$named['text']
					),
					$line
				);
				continue;
			}
		}
	}

	/**
	 * Builds a finding row.
	 *
	 * @param string $severity 'critical' | 'warning'.
	 * @param string $rule     Machine rule id.
	 * @param string $message  Human message.
	 * @param int    $line     1-based line in the snippet (0 = whole snippet).
	 * @return array
	 */
	private static function finding( string $severity, string $rule, string $message, int $line ): array {
		return array(
			'severity' => $severity,
			'rule'     => $rule,
			'message'  => $message,
			'line'     => max( 0, $line ),
		);
	}
}
