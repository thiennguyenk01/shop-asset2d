import type { DefaultSession } from "next-auth";

type Role = "USER" | "ADMIN";

declare module "next-auth" {
  interface User {
    role?: Role;
    sessionVersion?: number;
  }
  interface Session {
    user: { id: string; role: Role } & DefaultSession["user"];
  }
}

// Must target @auth/core/jwt — augmenting the "next-auth/jwt" re-export does not merge.
declare module "@auth/core/jwt" {
  interface JWT {
    uid?: string;
    sv?: number;
    role?: Role;
  }
}
