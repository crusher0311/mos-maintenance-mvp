import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { ZodError, z } from "zod";
import bcrypt from "bcrypt";
import clientPromise from "./mongodb";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const authOptions = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "Email & Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        try {
          const { email, password } = credentialsSchema.parse(credentials);
          const client = await clientPromise;
          const db = client.db();
          const user = await db.collection("users").findOne({ email: email.toLowerCase() });
          if (!user) return null;

          const ok = await bcrypt.compare(password, user.passwordHash);
          if (!ok) return null;

          // Minimal JWT payload
          return {
            id: user._id.toString(),
            email: user.email,
            role: user.role || "shop",
            shopIds: user.shopIds || [],
          };
        } catch (err) {
          if (err instanceof ZodError) return null;
          console.error("Authorize error:", err);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.shopIds = user.shopIds || [];
      }
      return token;
    },
    async session({ session, token }) {
      if (session?.user) {
        session.user.role = token.role || "shop";
        session.user.shopIds = token.shopIds || [];
      }
      return session;
    },
  },
};
