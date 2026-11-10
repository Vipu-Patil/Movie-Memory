import { redirect } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { FactCard } from "@/components/FactCard";
import { SignOutButton } from "@/components/SignOutButton";
import { getCurrentUser } from "@/lib/session";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!user.favoriteMovie) redirect("/onboarding");

  // Google can omit the name; fall back to something sensible.
  const displayName = user.name ?? user.email.split("@")[0] ?? "Movie fan";

  return (
    <section className="space-y-8">
      <header className="flex items-center gap-4">
        <Avatar src={user.image} label={displayName} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-2xl font-bold">
            {displayName}
          </h1>
          <p className="truncate text-sm text-muted">{user.email}</p>
        </div>
        <SignOutButton />
      </header>

      <div className="rounded-2xl border border-line bg-panel p-6">
        <p className="text-sm uppercase tracking-[0.3em] text-marquee">
          Favorite movie
        </p>
        <p className="mt-2 break-words font-display text-3xl font-bold">
          {user.favoriteMovie}
        </p>
      </div>

      <FactCard />
    </section>
  );
}
