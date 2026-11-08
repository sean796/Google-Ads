$out = array(
	'ok'      => true,
	'titles'  => 0,
	'descs'   => 0,
	'cleaned' => 0,
	'robots'  => '',
	'llms'    => '',
	'dup'     => '',
);

if ( class_exists( 'Neo_Pulse_Wp_Robots_Txt' ) ) {
	Neo_Pulse_Wp_Robots_Txt::save_content( Neo_Pulse_Wp_Robots_Txt::default_content( true ) );
	$out['robots'] = 'reset-default';
}

if ( class_exists( 'Neo_Pulse_Wp_Llms_Txt' ) ) {
	$stored = method_exists( 'Neo_Pulse_Wp_Llms_Txt', 'get_content' ) ? trim( (string) Neo_Pulse_Wp_Llms_Txt::get_content() ) : '';
	if ( $stored === '' ) {
		Neo_Pulse_Wp_Llms_Txt::save_content( Neo_Pulse_Wp_Llms_Txt::default_content() );
		$out['llms'] = 'wrote-default';
	} else {
		$out['llms'] = 'kept';
	}
	if ( method_exists( 'Neo_Pulse_Wp_Llms_Txt', 'flush_rewrites' ) ) {
		Neo_Pulse_Wp_Llms_Txt::flush_rewrites();
	}
}

$ids = get_posts(
	array(
		'post_type'      => array( 'post', 'page' ),
		'post_status'    => 'publish',
		'posts_per_page' => -1,
		'fields'         => 'ids',
		'no_found_rows'  => true,
	)
);

foreach ( $ids as $id ) {
	$id   = (int) $id;
	$post = get_post( $id );
	if ( ! $post instanceof WP_Post ) {
		continue;
	}
	$path    = (string) wp_parse_url( (string) get_permalink( $id ), PHP_URL_PATH );
	$slug    = (string) $post->post_name;
	$rm      = trim( (string) get_post_meta( $id, 'neo_pulse_seo_title', true ) );
	$current = $rm !== '' ? $rm : (string) $post->post_title;
	if ( class_exists( 'Neo_Pulse_Wp_Frontend_Seo' ) ) {
		$clean = Neo_Pulse_Wp_Frontend_Seo::clean_title_suffix( $current );
		if ( $rm !== '' && $clean !== $rm ) {
			update_post_meta( $id, 'neo_pulse_seo_title', $clean );
			$current = $clean;
			$out['cleaned']++;
		}
		if ( strpos( $path, '/blog/' ) === 0 && ! Neo_Pulse_Wp_Frontend_Seo::title_matches_slug( $current, $slug ) ) {
			$want = Neo_Pulse_Wp_Frontend_Seo::title_from_slug( $slug );
			if ( $want !== '' ) {
				update_post_meta( $id, 'neo_pulse_seo_title', $want . ' | Neo Digital' );
				$current = $want;
				$out['titles']++;
			}
		}
	}
	$desc = trim( (string) get_post_meta( $id, 'neo_pulse_seo_description', true ) );
	if ( $desc === '' ) {
		$label = preg_replace( '/\s*[|–-]\s*Neo Digital\s*$/u', '', $current );
		$label = is_string( $label ) && $label !== '' ? $label : $slug;
		$next  = $label . ' from Neo Digital in Edmonton. Practical next steps for local businesses.';
		if ( strlen( $next ) > 155 ) {
			$next = rtrim( substr( $next, 0, 152 ) ) . '...';
		}
		update_post_meta( $id, 'neo_pulse_seo_description', $next );
		$out['descs']++;
	}
}

$out['dup'] = 'plugin-redirect';

echo wp_json_encode( $out );
