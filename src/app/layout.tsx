import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Movie Memory",
  description: "Your favorite movie, and a fresh fun fact about it.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased" suppressHydrationWarning>
        <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-5 py-12">
          {children}
        </main>
      </body>
    </html>
  );
}
