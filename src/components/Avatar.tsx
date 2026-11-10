"use client";

import { useState } from "react";

/**
 * Google profile photo with a graceful fallback: if there is no photo, or it
 * fails to load, show the user's initial instead.
 */
export function Avatar({
  src,
  label,
}: {
  src: string | null;
  label: string;
}) {
  const [failed, setFailed] = useState(false);
  const initial = label.trim().charAt(0).toUpperCase() || "?";

  if (!src || failed) {
    return (
      <div
        aria-hidden="true"
        className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-marquee font-display text-2xl font-bold text-ink"
      >
        {initial}
      </div>
    );
  }

  return (
    // A plain <img> keeps this simple: no remote image allow-list to maintain
    // for a single 64px avatar.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={64}
      height={64}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="h-16 w-16 shrink-0 rounded-full object-cover"
    />
  );
}
