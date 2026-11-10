import type { NextAuthOptions } from "next-auth";
import GoogleProvider, { type GoogleProfile } from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],
  // Stateless signed+encrypted cookie. The only custom claim is our own user
  // id; profile data is always read from Postgres (see lib/session.ts).
  session: { strategy: "jwt" },
  // The landing page is the login page.
  pages: { signIn: "/", error: "/" },
  callbacks: {
    async signIn({ account, profile }) {
      const google = profile as GoogleProfile | undefined;
      return (
        account?.provider === "google" &&
        Boolean(account.providerAccountId) &&
        Boolean(google?.email) &&
        google?.email_verified !== false
      );
    },

    async jwt({ token, account, profile }) {
      // `account` and `profile` are only present on the sign-in request.
      // That is when we create the user or refresh their Google profile.
      if (account?.provider === "google" && profile) {
        const google = profile as GoogleProfile;
        const data = {
          email: google.email,
          name: google.name?.trim() || null,
          image: google.picture || null,
        };
        const user = await prisma.user.upsert({
          where: { googleSub: account.providerAccountId },
          create: { googleSub: account.providerAccountId, ...data },
          update: data,
          select: { id: true },
        });
        token.uid = user.id;
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user && token.uid) session.user.id = token.uid;
      return session;
    },
  },
};
