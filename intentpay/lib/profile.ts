// Which profile the demo is showing: the personal customer or the (simulated) business, Harbour Print Co.
// It only chooses WHOSE agents the screens load (?customer=...). Every decision is still made server-side
// from the agent that is paying; this setting never changes a decision.
import { useSyncExternalStore } from "react";
import { BUSINESS_CUSTOMER } from "@/lib/business-data";

export type Profile = "personal" | "business";

const KEY = "apc-profile";
const EVENT = "apc-profile-change";

export function getProfile(): Profile {
  try {
    return window.localStorage.getItem(KEY) === "business" ? "business" : "personal";
  } catch {
    return "personal"; // storage can be unavailable: fall back to the personal profile
  }
}

export function setProfile(p: Profile) {
  try {
    window.localStorage.setItem(KEY, p);
  } catch {
    /* ignore: the toggle just won't persist across reloads */
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useProfile(): Profile {
  return useSyncExternalStore(subscribe, getProfile, () => "personal");
}

// Query string for the API: nothing for the personal customer (so those calls are exactly as before).
export function customerQuery(p: Profile): string {
  return p === "business" ? `?customer=${BUSINESS_CUSTOMER}` : "";
}
