import { type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "google" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand-hover disabled:bg-brand/50",
  secondary: "bg-white text-ink border border-line hover:bg-zinc-50 disabled:opacity-50",
  outline: "bg-white text-brand border border-brand hover:bg-mint disabled:opacity-50",
  ghost: "bg-transparent text-ink hover:bg-zinc-100 disabled:opacity-40",
  google: "bg-mint text-ink hover:bg-[#d7f0e0] disabled:opacity-50",
  danger: "bg-white text-danger border border-red-200 hover:bg-red-50",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  pill?: boolean;
};

export function Button({
  variant = "primary",
  size = "md",
  pill = false,
  className = "",
  type = "button",
  ...props
}: Props) {
  const sizing =
    size === "sm"
      ? "h-8 px-3 text-xs"
      : size === "lg"
        ? "h-11 px-5 text-sm"
        : "h-10 px-4 text-sm";
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 font-medium transition disabled:cursor-not-allowed ${pill ? "rounded-full" : "rounded-lg"} ${sizing} ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
