import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { OnboardingForm } from "./OnboardingForm";

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  // First-time only: returning users go straight to the dashboard.
  if (user.favoriteMovie) redirect("/dashboard");

  const firstName = user.name?.split(" ")[0];

  return (
    <section>
      <p className="text-sm uppercase tracking-[0.3em] text-marquee">
        One question
      </p>
      <h1 className="mt-3 font-display text-4xl font-bold tracking-tight">
        {firstName ? `Welcome, ${firstName}.` : "Welcome."} What&apos;s your
        favorite movie?
      </h1>
      <OnboardingForm />
    </section>
  );
}
