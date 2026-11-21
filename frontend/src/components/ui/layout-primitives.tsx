import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { CloudDivider } from "./cloud-divider";

export function Container({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8", className)} {...props} />;
}

/** Section title: serif heading, optional calligraphy eyebrow, cloud divider. */
export function SectionHeading({
  title,
  eyebrow,
  description,
  align = "center",
  as: Tag = "h2",
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  align?: "center" | "left";
  as?: "h1" | "h2" | "h3";
}) {
  return (
    <div className={cn("flex flex-col gap-2", align === "center" ? "items-center text-center" : "items-start")}>
      {eyebrow && <p className="font-display text-xl text-gold-400">{eyebrow}</p>}
      <Tag className="text-2xl font-semibold text-ivory-100 sm:text-3xl">{title}</Tag>
      <CloudDivider className={cn("w-56", align === "left" && "w-40")} />
      {description && <p className="max-w-2xl text-ivory-300">{description}</p>}
    </div>
  );
}
