import { getCurrentUser } from "@backend/auth/current-user";
import { AccountMenu, SignInLink } from "./account-menu";

/** Top-bar account slot. Reads the session, so it sits behind <Suspense> in app-topbar.tsx. */
export async function AccountButton() {
  const user = await getCurrentUser();
  if (!user) return <SignInLink />;
  return <AccountMenu name={user.name ?? user.email ?? ""} email={user.email ?? ""} isAdmin={user.role === "ADMIN"} />;
}
