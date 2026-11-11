"use client";

import { useEffect } from "react";
import { writeLastActivity } from "@/lib/idle";

/**
 * On the login and change-password pages: a person who is signing in starts fresh. Without this,
 * the time of the last activity from an earlier session would sign them straight out again.
 */
export function IdleReset() {
  useEffect(() => {
    writeLastActivity(Date.now());
  }, []);
  return null;
}
