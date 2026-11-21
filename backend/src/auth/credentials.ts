import "server-only";
import { AuthError as NextAuthError } from "next-auth";
import { signIn } from "./index";

/**
 * Sign in with email + password inside a server action, without Auth.js's own redirect.
 * Returns false when the credentials are refused. Sets the session cookie on success.
 */
export async function credentialsSignIn(email: string, password: string): Promise<boolean> {
  try {
    const url = await signIn("credentials", { email, password, redirect: false });
    // Auth.js reports a refused login through the returned URL (?error=…) on some versions.
    return !(typeof url === "string" && url.includes("error="));
  } catch (e) {
    if (e instanceof NextAuthError) return false;
    throw e;
  }
}
