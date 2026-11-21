import { NotFoundContent } from "@/components/layout/not-found-content";

/** 404 inside the store (unknown path, unknown pack…): the (site) layout already draws the shell. */
export default function NotFound() {
  return <NotFoundContent />;
}
