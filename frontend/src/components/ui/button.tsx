import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

const variants = {
  /** Main call to action — Mua ngay, Thanh toán. */
  primary: "[background-color:var(--color-gold-500)] bg-gradient-to-b from-gold-400 to-gold-600 text-soot hover:from-gold-300 hover:to-gold-500",
  /** Secondary — Thêm vào giỏ, Xem chi tiết. */
  secondary: "border border-gold-500/60 text-gold-300 hover:bg-gold-500/10",
  /** Free download. */
  jade: "bg-jade-600 text-paper hover:bg-jade-500",
  /** Destructive — Xóa. */
  danger: "bg-cinnabar-600 text-paper hover:bg-cinnabar-500",
  ghost: "text-ivory-300 hover:bg-ivory-100/5 hover:text-ivory-100",
} as const;

/** Bo góc theo chiều cao (evondevKit F1): dưới 40px bo 8px, từ 40px bo 12px. Không bóng màu (M15). */
const sizes = {
  sm: "h-9 rounded-lg px-3 gap-1.5",
  md: "h-10 rounded-xl px-4 gap-2",
  lg: "h-11 rounded-xl px-5 gap-2",
  icon: "size-10 rounded-xl justify-center",
} as const;

export type ButtonProps = ComponentProps<"button"> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  /** Render the child element (e.g. a Link) with button styles. */
  asChild?: boolean;
};

export function Button({ variant = "primary", size = "md", asChild, className, type, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      type={asChild ? undefined : (type ?? "button")}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center justify-center text-sm font-medium whitespace-nowrap",
        "transition-[background-color,border-color,color] duration-150",
        "disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
