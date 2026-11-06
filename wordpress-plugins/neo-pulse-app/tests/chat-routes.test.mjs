import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function readPhp(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

describe("chat routes", () => {
  it("registers chat store and route handlers in loader", () => {
    const loader = readPhp("includes/class-neo-pulse-app-loader.php");
    expect(loader).toContain("class-chat-store.php");
    expect(loader).toContain("class-chat-route-handlers.php");
    expect(loader).toContain("Neo_Pulse_App_Chat_Store::install_tables()");
  });

  it("mounts chat dispatch from teams route handlers", () => {
    const teams = readPhp("includes/teams/class-teams-route-handlers.php");
    expect(teams).toContain("Neo_Pulse_App_Chat_Route_Handlers::dispatch");
    expect(teams).toMatch(/chat\//);
  });

  it("defines chat tables and communication permission checks", () => {
    const store = readPhp("includes/chat/class-chat-store.php");
    expect(store).toContain("neo_pulse_chat_channels");
    expect(store).toContain("neo_pulse_chat_messages");
    expect(store).toContain("neo_pulse_chat_assets");
    expect(store).toContain("neo_pulse_chat_link_previews");
    expect(store).toContain("neo_pulse_chat_activity_log");
    expect(store).toContain("Neo_Pulse_App_Chat_Mentions::sanitize_chat_body_html");

    const routes = readPhp("includes/chat/class-chat-route-handlers.php");
    expect(routes).toContain("can_read( $member, 'communication' )");
    expect(routes).toContain("can_write( $member, 'communication' )");
    expect(routes).toContain("'channels'");
    expect(routes).toContain("'dms'");
    expect(routes).toContain("activity-log");
    expect(routes).toContain("attachmentAssetIds");
  });

  it("loads chat asset, unfurl, and activity log modules", () => {
    const loader = readPhp("includes/class-neo-pulse-app-loader.php");
    expect(loader).toContain("class-chat-assets.php");
    expect(loader).toContain("class-chat-link-unfurl.php");
    expect(loader).toContain("class-chat-activity-log.php");
    expect(loader).toContain("class-chat-typing.php");
  });

  it("defines thread, typing, and shared-search routes", () => {
    const store = readPhp("includes/chat/class-chat-store.php");
    expect(store).toContain("neo_pulse_chat_thread_read_state");
    expect(store).toContain("mark_thread_read");
    expect(store).toContain("scope === 'channel'");
    expect(store).toContain("search_channel_messages");

    const routes = readPhp("includes/chat/class-chat-route-handlers.php");
    expect(routes).toContain("shared-search");
    expect(routes).toContain("messages/search");
    expect(routes).toContain("/typing");
    expect(routes).toContain("threadsUnread");
    expect(routes).toContain("includeThreadUnread");
  });

  it("cascades shared content cleanup by message id", () => {
    const activity = readPhp("includes/chat/class-chat-activity-log.php");
    expect(activity).toContain("link_removed");
    expect(activity).toContain("purge_shared_for_message");
    expect(activity).toContain("entry_message_alive");
    expect(activity).toContain("should_include_shared_entry");

    const store = readPhp("includes/chat/class-chat-store.php");
    expect(store).toContain("purge_shared_for_message");
    expect(store).toContain("clear_for_message");
  });

  it("loads chat call module and call routes", () => {
    const loader = readPhp("includes/class-neo-pulse-app-loader.php");
    expect(loader).toContain("class-chat-calls.php");

    const calls = readPhp("includes/chat/class-chat-calls.php");
    expect(calls).toContain("neo_pulse_chat_calls");
    expect(calls).toContain("neo_pulse_chat_call_signals");
    expect(calls).toContain("neo_pulse_chat_call_transcript");

    const routes = readPhp("includes/chat/class-chat-route-handlers.php");
    expect(routes).toContain("calls/start");
    expect(routes).toContain("calls/incoming");
    expect(routes).toContain("calls/active");
    expect(routes).toContain("/join");
    expect(routes).toContain("/leave");
    expect(routes).toContain("/accept");
    expect(routes).toContain("/transcript");
    expect(routes).toContain("floHuddle");
  });

  it("defines huddle participants table and flo huddle helpers", () => {
    const calls = readPhp("includes/chat/class-chat-calls.php");
    expect(calls).toContain("neo_pulse_chat_call_participants");
    expect(calls).toContain("start_flo_huddle");
    expect(calls).toContain("list_active_huddles");
    expect(calls).toContain("join_huddle");
    expect(calls).toContain("leave_huddle");

    const flo = readPhp("includes/chat/class-chat-neo-pulse.php");
    expect(flo).toContain("maybe_start_huddle_from_message");
    expect(flo).toContain("message_requests_huddle");
    expect(flo).toContain("utterance_addresses_flo");
    expect(flo).toContain("'addressed'");

    const routes = readPhp("includes/chat/class-chat-route-handlers.php");
    expect(routes).toContain("'addressed'");
  });

  it("loads chat mentions module and mention routes", () => {
    const loader = readPhp("includes/class-neo-pulse-app-loader.php");
    expect(loader).toContain("class-chat-mentions.php");

    const mentions = readPhp("includes/chat/class-chat-mentions.php");
    expect(mentions).toContain("neo_pulse_chat_mentions");
    expect(mentions).toContain("sync_for_message");
    expect(mentions).toContain("sanitize_chat_body_html");

    const routes = readPhp("includes/chat/class-chat-route-handlers.php");
    expect(routes).toContain("mentions/unread-count");
    expect(routes).toContain("mentions/read");
    expect(routes).toContain("'mentions'");
  });

  it("loads chat preferences module and preference routes", () => {
    const loader = readPhp("includes/class-neo-pulse-app-loader.php");
    expect(loader).toContain("class-chat-preferences.php");

    const prefs = readPhp("includes/chat/class-chat-preferences.php");
    expect(prefs).toContain("neo_pulse_chat_user_preferences");
    expect(prefs).toContain("zoneThemes");
    expect(prefs).toContain("headingTheme");
    expect(prefs).toContain("get_for_user");
    expect(prefs).toContain("patch_for_user");

    const store = readPhp("includes/chat/class-chat-store.php");
    expect(store).toContain("Neo_Pulse_App_Chat_Preferences::install_tables");

    const routes = readPhp("includes/chat/class-chat-route-handlers.php");
    expect(routes).toContain("'preferences'");
    expect(routes).toContain("preferences/avatar");
  });

  it("resolves OpenRouter key from agency and manager settings fallbacks", () => {
    const secrets = readPhp("includes/config/class-secrets-loader.php");
    expect(secrets).toContain("get_agency_openrouter_api_key");
    expect(secrets).toContain("openrouter-api-key");
  });

  it("parses mentions from HTML and returns floReply on message POST", () => {
    const mentions = readPhp("includes/chat/class-chat-mentions.php");
    expect(mentions).toContain("parse_mentioned_user_ids_from_html");
    expect(mentions).toContain("merge_mentioned_user_ids_from_body");

    const flo = readPhp("includes/chat/class-chat-neo-pulse.php");
    expect(flo).toContain("@FLO\\b/i");
    expect(flo).toContain("maybe_reply_to_message");
    expect(flo).toContain("thread_parent_for_reply");

    const routes = readPhp("includes/chat/class-chat-route-handlers.php");
    expect(routes).toContain("merge_mentioned_user_ids_from_body");
    expect(routes).toContain("floReply");
    expect(routes).toContain("use_request_api_key");

    const openrouter = readPhp("includes/chat/class-chat-openrouter.php");
    expect(openrouter).toContain("api_key_from_request");
    // Wave 0: client-supplied OpenRouter keys (header or body) are ignored.
    expect(openrouter).not.toContain("HTTP_X_OPENROUTER_API_KEY");

    const teams = readPhp("includes/teams/class-teams-store.php");
    expect(teams).toContain("ensure_team_member( $team_id )");
  });
});
