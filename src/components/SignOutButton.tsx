"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => void signOut({ callbackUrl: "/" })}
      className="rounded-full border border-line px-4 py-2 text-sm text-muted transition hover:border-muted hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marquee"
    >
      Log out
    </button>
  );
}
