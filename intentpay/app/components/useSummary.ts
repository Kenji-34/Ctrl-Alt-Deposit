"use client";

import { useCallback, useEffect, useState } from "react";
import type { Summary } from "./types";
import { customerQuery, useProfile } from "@/lib/profile";

export function useSummary(pollMs = 3000) {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState(false);
  const profile = useProfile();

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/agent/summary" + customerQuery(profile), { cache: "no-store" });
      if (!res.ok) throw new Error();
      setData(await res.json());
      setError(false);
    } catch {
      setError(true);
    }
  }, [profile]);

  useEffect(() => {
    setData(null); // never show one profile's numbers under the other
    load();
    const t = setInterval(load, pollMs);
    return () => clearInterval(t);
  }, [load, pollMs]);

  return { data, error, reload: load };
}
