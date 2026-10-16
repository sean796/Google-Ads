<?php
/**
 * Styled sitemaps: an XSL stylesheet at /sitemap-style.xsl that browsers
 * apply to sitemap_index.xml and the child sitemaps, so people see a readable table. Search engines
 * ignore the stylesheet and read the XML as before.
 *
 * The stylesheet is answered by WordPress (not a file in the plugin folder) so it is always on the
 * same address as the sitemap, which browsers require, even when a CDN rewrites asset URLs.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Sitemap_Style {

	// Its own address (not Rank Math's /main-sitemap.xsl, which browsers and caches may still hold),
	// with the plugin version so an update is never shown with an old copy.
	const PATH = 'sitemap-style.xsl';

	public static function init(): void {
		add_action( 'init', array( __CLASS__, 'maybe_serve' ), 1 );
	}

	public static function url(): string {
		return add_query_arg( 'ver', NEO_PULSE_WP_VERSION, home_url( '/' . self::PATH ) );
	}

	/**
	 * Adds the stylesheet line after the XML declaration.
	 */
	public static function add_to( string $xml ): string {
		$pi = '<?xml-stylesheet type="text/xsl" href="' . esc_url( self::url() ) . '"?>';
		// Rank Math's stylesheet line, if a cached sitemap still carries one, is replaced.
		$xml = (string) preg_replace( '/<\?xml-stylesheet[^>]*\?>\s*/', '', $xml );
		if ( preg_match( '/^<\?xml[^>]*\?>/', $xml, $m ) ) {
			return $m[0] . "\n" . $pi . substr( $xml, strlen( $m[0] ) );
		}
		return $pi . "\n" . $xml;
	}

	public static function maybe_serve(): void {
		$path = (string) wp_parse_url( isset( $_SERVER['REQUEST_URI'] ) ? (string) wp_unslash( $_SERVER['REQUEST_URI'] ) : '', PHP_URL_PATH );
		$home = (string) wp_parse_url( home_url( '/' ), PHP_URL_PATH );
		if ( trim( substr( $path, strlen( $home ) ), '/' ) !== self::PATH ) {
			return;
		}
		$config = class_exists( 'Neo_Pulse_Wp_Sitemap_Settings', false ) ? Neo_Pulse_Wp_Sitemap_Settings::get_config() : array();
		if ( empty( $config['general']['enabled'] ) ) {
			return;
		}
		status_header( 200 );
		header( 'Content-Type: text/xsl; charset=UTF-8' );
		header( 'X-Robots-Tag: noindex, follow', true );
		header( 'Cache-Control: public, max-age=86400' );
		echo self::stylesheet(); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- XSL document, dynamic parts escaped below.
		exit;
	}

	private static function x( string $text ): string {
		return htmlspecialchars( $text, ENT_QUOTES | ENT_XML1, 'UTF-8' );
	}

	public static function stylesheet(): string {
		$site  = self::x( wp_specialchars_decode( (string) get_bloginfo( 'name' ), ENT_QUOTES ) );
		$home  = self::x( home_url( '/' ) );
		$t     = array(
			'index_title' => self::x( __( 'XML Sitemap', 'neo-pulse-wp' ) ),
			'index_lead'  => self::x( __( 'This is the sitemap index search engines use to find every page on this site. Each sitemap below lists one kind of content.', 'neo-pulse-wp' ) ),
			'map_lead'    => self::x( __( 'Pages search engines are asked to crawl in this sitemap.', 'neo-pulse-wp' ) ),
			'sitemaps'    => self::x( __( 'sitemaps', 'neo-pulse-wp' ) ),
			'urls'        => self::x( __( 'addresses', 'neo-pulse-wp' ) ),
			'sitemap'     => self::x( __( 'Sitemap', 'neo-pulse-wp' ) ),
			'address'     => self::x( __( 'Address', 'neo-pulse-wp' ) ),
			'images'      => self::x( __( 'Images', 'neo-pulse-wp' ) ),
			'updated'     => self::x( __( 'Last updated', 'neo-pulse-wp' ) ),
			'back'        => self::x( __( 'All sitemaps', 'neo-pulse-wp' ) ),
			'note'        => self::x( __( 'Styled for people; search engines read the plain XML.', 'neo-pulse-wp' ) ),
		);
		$index = self::x( Neo_Pulse_Wp_Sitemap_Settings::index_url() );

		return <<<XSL
<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0"
	xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
	xmlns:s="http://www.sitemaps.org/schemas/sitemap/0.9"
	xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
	exclude-result-prefixes="s image">
<xsl:output method="html" encoding="UTF-8" indent="yes" doctype-system="about:legacy-compat"/>

<xsl:template name="date">
	<xsl:param name="d"/>
	<xsl:if test="\$d">
		<xsl:value-of select="substring(\$d, 1, 10)"/>
		<xsl:if test="string-length(\$d) &gt; 15"><span class="t"><xsl:text> </xsl:text><xsl:value-of select="substring(\$d, 12, 5)"/></span></xsl:if>
	</xsl:if>
</xsl:template>

<xsl:template match="/">
<html lang="en">
<head>
	<meta charset="UTF-8"/>
	<meta name="viewport" content="width=device-width, initial-scale=1"/>
	<meta name="robots" content="noindex, follow"/>
	<title>{$t['index_title']} | {$site}</title>
	<style>
		:root { --ink: #1d2327; --muted: #5f6b78; --line: #e3e7ec; --bg: #f4f6f8; --card: #ffffff; --accent: #84bd00; --accent-ink: #3f6b00; --tint: rgba(132, 189, 0, 0.1); }
		* { box-sizing: border-box; }
		body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
		.wrap { max-width: 1100px; margin: 0 auto; padding: 40px 20px 60px; }
		.site { margin: 0 0 6px; font-size: 13px; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); }
		.site a { color: inherit; text-decoration: none; }
		h1 { margin: 0 0 8px; font-size: 30px; line-height: 1.2; }
		.lead { margin: 0 0 22px; color: var(--muted); max-width: 46rem; }
		.meta { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin: 0 0 18px; }
		.pill { display: inline-block; padding: 4px 12px; border-radius: 999px; background: var(--tint); color: var(--accent-ink); font-weight: 600; font-size: 13px; }
		.back { color: var(--accent-ink); font-weight: 600; text-decoration: none; font-size: 14px; }
		.back:hover { text-decoration: underline; }
		.card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
		table { width: 100%; border-collapse: collapse; }
		th { text-align: left; font-size: 12px; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); font-weight: 600; padding: 12px 16px; border-bottom: 1px solid var(--line); background: #fafbfc; }
		td { padding: 11px 16px; border-bottom: 1px solid var(--line); vertical-align: top; }
		tr:last-child td { border-bottom: 0; }
		tr:hover td { background: #fafcf5; }
		td a { color: var(--ink); text-decoration: none; overflow-wrap: anywhere; }
		td a:hover { color: var(--accent-ink); text-decoration: underline; }
		.num { width: 90px; text-align: right; color: var(--muted); font-variant-numeric: tabular-nums; }
		.when { width: 170px; white-space: nowrap; color: var(--muted); font-variant-numeric: tabular-nums; }
		.foot { margin-top: 16px; font-size: 12px; color: var(--muted); }
		@media (max-width: 640px) {
			.wrap { padding: 24px 14px 40px; }
			h1 { font-size: 24px; }
			.when { width: auto; } .t { display: none; }
			th.hide, td.hide { display: none; }
		}
	</style>
</head>
<body>
<div class="wrap">
	<p class="site"><a href="{$home}">{$site}</a></p>
	<h1>{$t['index_title']}</h1>
	<xsl:choose>
		<xsl:when test="s:sitemapindex">
			<p class="lead">{$t['index_lead']}</p>
			<div class="meta"><span class="pill"><xsl:value-of select="count(s:sitemapindex/s:sitemap)"/> {$t['sitemaps']}</span></div>
			<div class="card"><table>
				<thead><tr><th>{$t['sitemap']}</th><th class="when">{$t['updated']}</th></tr></thead>
				<tbody>
					<xsl:for-each select="s:sitemapindex/s:sitemap">
						<tr>
							<td><a href="{s:loc}"><xsl:value-of select="s:loc"/></a></td>
							<td class="when"><xsl:call-template name="date"><xsl:with-param name="d" select="s:lastmod"/></xsl:call-template></td>
						</tr>
					</xsl:for-each>
				</tbody>
			</table></div>
		</xsl:when>
		<xsl:otherwise>
			<p class="lead">{$t['map_lead']}</p>
			<div class="meta">
				<span class="pill"><xsl:value-of select="count(s:urlset/s:url)"/> {$t['urls']}</span>
				<a class="back" href="{$index}">&#8592; {$t['back']}</a>
			</div>
			<div class="card"><table>
				<thead><tr><th>{$t['address']}</th><th class="num hide">{$t['images']}</th><th class="when">{$t['updated']}</th></tr></thead>
				<tbody>
					<xsl:for-each select="s:urlset/s:url">
						<tr>
							<td><a href="{s:loc}"><xsl:value-of select="s:loc"/></a></td>
							<td class="num hide"><xsl:value-of select="count(image:image)"/></td>
							<td class="when"><xsl:call-template name="date"><xsl:with-param name="d" select="s:lastmod"/></xsl:call-template></td>
						</tr>
					</xsl:for-each>
				</tbody>
			</table></div>
		</xsl:otherwise>
	</xsl:choose>
	<p class="foot">{$t['note']}</p>
</div>
</body>
</html>
</xsl:template>
</xsl:stylesheet>
XSL;
	}
}
