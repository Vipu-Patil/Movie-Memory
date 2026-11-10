import { redirect } from "next/navigation";
import { SignInButton } from "@/components/SignInButton";
import { getCurrentUser } from "@/lib/session";

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect(user.favoriteMovie ? "/dashboard" : "/onboarding");

  const { error } = await searchParams;

  return (
    <section className="text-center">
      <p className="text-sm uppercase tracking-[0.3em] text-marquee">
        Now showing
      </p>
      <h1 className="mt-3 font-display text-5xl font-bold tracking-tight sm:text-6xl">
        Movie Memory
      </h1>
      <p className="mx-auto mt-4 max-w-sm text-muted">
        Tell us your favorite movie and get a fresh fun fact about it every
        time you visit.
      </p>

      <div className="mt-10 flex justify-center">
        <SignInButton />
      </div>

      {error && (
        <p role="alert" className="mt-6 text-sm text-red-300">
          {error === "AccessDenied"
            ? "That Google account could not be used to sign in."
            : "Sign-in didn't complete. Please try again."}
        </p>
      )}
    </section>
  );
}
