import { type WordPressSite } from "../types";
import {
  NOTIFY_OPENROUTER_API_KEY_REQUIRED_IN_API_KEYS_,
  NOTIFY_SET_GOOGLE_BUSINESS_PROFILE_LOCATION_ID_,
  NOTIFY_WORDPRESS_CREDENTIALS_MISSING_PLEASE_UPD,
} from "@/lib/notify-messages";
import { loadApiKey } from "@/lib/api";

export function validateSitePrereqs(target: WordPressSite): string | null {
  // GBP roster is keyed on GBP Location ID; `enabled` is only the single active header connection.
  if (!target.gbpLocationId?.trim()) {
    return NOTIFY_SET_GOOGLE_BUSINESS_PROFILE_LOCATION_ID_;
  }
  if (!target.username?.trim() || !target.appPassword?.trim()) {
    return NOTIFY_WORDPRESS_CREDENTIALS_MISSING_PLEASE_UPD;
  }
  if (!loadApiKey()?.trim() && !import.meta.env.VITE_OPENROUTER_API_KEY) {
    return NOTIFY_OPENROUTER_API_KEY_REQUIRED_IN_API_KEYS_;
  }
  return null;
}
