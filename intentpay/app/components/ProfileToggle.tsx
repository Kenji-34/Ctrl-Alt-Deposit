"use client";

import { setProfile, useProfile, type Profile } from "@/lib/profile";
import { BUSINESS_NAME } from "@/lib/business-data";

const OPTIONS: { value: Profile; label: string }[] = [
  { value: "personal", label: "Personal" },
  { value: "business", label: "Business" },
];

// Switches the whole demo between the personal customer and the business (Harbour Print Co).
export function ProfileToggle() {
  const profile = useProfile();
  return (
    <div data-demo="profile-toggle" className="space-y-1">
      <div role="group" aria-label="Profile" className="flex rounded-md border border-gray-200 bg-white p-0.5 text-sm">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={profile === o.value}
            data-demo={`profile-${o.value}`}
            onClick={() => setProfile(o.value)}
            className={`flex-1 rounded px-3 py-1.5 font-medium ${profile === o.value ? "bg-gray-900 text-white" : "text-gray-700"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {profile === "business" && <p className="text-xs text-gray-500">{BUSINESS_NAME}: an invented business. All figures and suppliers are simulated demo data.</p>}
    </div>
  );
}
