import "server-only";
import { cookies } from "next/headers";
import { FLASH_COOKIE, type FlashKey } from "@backend/lib/flash";

/** Leave a one-shot toast for the next render (server actions only). See lib/flash.ts. */
export async function setFlash(key: FlashKey) {
  (await cookies()).set(FLASH_COOKIE, key, { path: "/", maxAge: 60, sameSite: "lax", httpOnly: false });
}
