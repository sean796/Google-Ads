#!/usr/bin/env bash
set -euo pipefail

# Replace the plugin folders on the persistent disk with the copies baked into this image.
# Hosted sites get neo-pulse-wp only; neo-pulse-app (the Neo Pulse app backend) belongs on the hub alone.
copy_plugins() {
  mkdir -p /var/www/html/wp-content/plugins
  local plugins="neo-pulse-wp"
  if [[ "${NEO_PULSE_HUB:-}" == "1" ]]; then
    plugins="neo-pulse-wp neo-pulse-app"
  else
    rm -rf /var/www/html/wp-content/plugins/neo-pulse-app
  fi
  for plugin in $plugins; do
    if [[ -d "/usr/src/$plugin" ]]; then
      rm -rf "/var/www/html/wp-content/plugins/$plugin"
      cp -a "/usr/src/$plugin" "/var/www/html/wp-content/plugins/$plugin"
    fi
  done
}

# WP Admin signs in with the Pulse account: an administrator whose user_pass is the Pulse hub bcrypt hash
# (WordPress verifies $2y$ hashes via crypt/password_verify). Runs every boot so a changed hash is applied.
ensure_pulse_admin() {
  if [[ -z "${PULSE_ADMIN_EMAIL:-}" || -z "${PULSE_ADMIN_PASSWORD_HASH:-}" ]]; then
    echo "[pulse-host] PULSE_ADMIN_EMAIL / PULSE_ADMIN_PASSWORD_HASH not set; no Pulse admin user created" >&2
    return
  fi
  if ! wp user get "$PULSE_ADMIN_EMAIL" --field=ID --allow-root >/dev/null 2>&1; then
    wp user create pulse "$PULSE_ADMIN_EMAIL" --role=administrator --display_name=FLO --allow-root >/dev/null
  fi
  wp user set-role "$PULSE_ADMIN_EMAIL" administrator --allow-root >/dev/null
  wp eval 'global $wpdb; $wpdb->update( $wpdb->users, array( "user_pass" => getenv( "PULSE_ADMIN_PASSWORD_HASH" ) ), array( "user_email" => getenv( "PULSE_ADMIN_EMAIL" ) ) );' --allow-root
  echo "[pulse-host] Pulse admin user ready for $PULSE_ADMIN_EMAIL"
}

# Wait for MariaDB, install WordPress on first boot, and activate neo-pulse-wp (host-report endpoint).
install_wordpress() {
  local host="${WORDPRESS_DB_HOST%%:*}"
  local port="${WORDPRESS_DB_HOST##*:}"
  [[ "$port" == "$host" ]] && port=3306
  local attempt
  # A MariaDB redeploy on Render can take several minutes; wait up to 10 minutes before failing the boot.
  for attempt in $(seq 1 300); do
    if mariadb-admin ping -h "$host" -P "$port" -u "$WORDPRESS_DB_USER" -p"$WORDPRESS_DB_PASSWORD" --silent >/dev/null 2>&1; then
      break
    fi
    if [[ "$attempt" == 300 ]]; then
      echo "[pulse-host] MariaDB at ${host}:${port} not reachable after 600s" >&2
      exit 1
    fi
    sleep 2
  done
  # wp-config.php is written by the official entrypoint right before apache starts.
  for attempt in $(seq 1 30); do
    [[ -f /var/www/html/wp-config.php ]] && break
    sleep 1
  done
  cd /var/www/html
  # wp-cli only writes .htaccess rewrite rules when told mod_rewrite is loaded.
  printf 'apache_modules:\n  - mod_rewrite\n' > /var/www/html/wp-cli.yml
  if ! wp core is-installed --allow-root >/dev/null 2>&1; then
    wp core install --allow-root --skip-email \
      --url="$WORDPRESS_SITE_URL" \
      --title="${WORDPRESS_SITE_TITLE:-Pulse Host}" \
      --admin_user="$WORDPRESS_ADMIN_USER" \
      --admin_password="$WORDPRESS_ADMIN_PASSWORD" \
      --admin_email="$WORDPRESS_ADMIN_EMAIL"
    echo "[pulse-host] WordPress installed at $WORDPRESS_SITE_URL"
  fi
  wp plugin activate neo-pulse-wp --allow-root
  # The hub container also runs the Neo Pulse app backend (/api/*) for neo-pulse-static.
  if [[ "${NEO_PULSE_HUB:-}" == "1" ]]; then
    wp plugin activate neo-pulse-app --allow-root
  fi
  ensure_pulse_admin
  # Pretty permalinks (unless the site owner already chose a structure) + .htaccess so /wp-json/ routes through WordPress.
  if [[ -z "$(wp option get permalink_structure --allow-root 2>/dev/null)" ]]; then
    wp rewrite structure '/%postname%/' --allow-root
  fi
  wp rewrite flush --hard --allow-root
}

# The persistent disk mounts at /var/www/html/wp-content; link /var/www/neo-pulse-data onto the persistent disk so data survives container redeploys.
ensure_uploads_writable() {
  mkdir -p /var/www/html/wp-content/uploads
  mkdir -p /var/www/html/wp-content/neo-pulse-data
  if [[ -d /var/www/neo-pulse-data && ! -L /var/www/neo-pulse-data ]]; then
    cp -a /var/www/neo-pulse-data/. /var/www/html/wp-content/neo-pulse-data/ 2>/dev/null || true
    rm -rf /var/www/neo-pulse-data
  fi
  ln -sfn /var/www/html/wp-content/neo-pulse-data /var/www/neo-pulse-data
  chown -R www-data:www-data /var/www/html/wp-content/uploads
  chown -R www-data:www-data /var/www/html/wp-content/neo-pulse-data
  chown -h www-data:www-data /var/www/neo-pulse-data
}

copy_plugins
ensure_uploads_writable

docker-entrypoint.sh apache2-foreground &
apache_pid=$!
install_wordpress
wait "$apache_pid"
