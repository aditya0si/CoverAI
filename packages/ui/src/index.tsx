import * as React from "react";
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// Tailwind CSS utility class merger
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ==========================================
// Button Component
// ==========================================
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "terracotta" | "ghost" | "link" | "destructive" | "default";
  size?: "default" | "sm" | "lg" | "icon" | "pill";
  arrow?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "default", arrow, children, ...props }, ref) => {
    const baseStyles =
      "inline-flex items-center justify-center whitespace-nowrap rounded-full text-xs font-semibold tracking-wide transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#191919] disabled:pointer-events-none disabled:opacity-50 cursor-pointer";

    const variants = {
      default: "bg-[#191919] text-[#FAF8F5] hover:bg-[#2D2D2D] shadow-xs active:scale-[0.99]",
      primary: "bg-[#191919] text-[#FAF8F5] hover:bg-[#2D2D2D] shadow-xs active:scale-[0.99]",
      secondary: "bg-[#F1EDE4] text-[#191919] hover:bg-[#EAE4D8] border border-[#E2DDD4]",
      outline: "border border-[#E2DDD4] bg-transparent text-[#191919] hover:bg-[#F1EDE4]",
      terracotta: "bg-[#D2654A] text-[#FAF8F5] hover:bg-[#C0583E] shadow-xs active:scale-[0.99]",
      ghost: "hover:bg-[#F1EDE4] text-[#6E6862] hover:text-[#191919]",
      link: "text-[#191919] underline-offset-4 hover:underline",
      destructive: "bg-[#B83A26] text-[#FAF8F5] hover:bg-[#9E2F1E] shadow-xs",
    };

    const sizes = {
      default: "h-9 px-4 py-2 text-xs",
      sm: "h-8 px-3 text-[11px]",
      lg: "h-11 px-6 py-2.5 text-sm",
      pill: "h-10 px-5 py-2 text-xs rounded-full",
      icon: "h-9 w-9 p-0",
    };

    return (
      <button
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        ref={ref}
        {...props}
      >
        {children}
        {arrow && (
          <span className="ml-1.5 transition-transform group-hover:translate-x-0.5 inline-block">
            →
          </span>
        )}
      </button>
    );
  }
);
Button.displayName = "Button";

// ==========================================
// Card Component
// ==========================================
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "sand" | "bordered" | "dark";
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = "default", ...props }, ref) => {
    const variants = {
      default: "bg-[#F1EDE4] border border-[#E2DDD4] text-[#191919]",
      sand: "bg-[#F3EFE6] border border-[#E2DDD4] text-[#191919]",
      bordered: "bg-[#FAF8F5] border border-[#E2DDD4] text-[#191919]",
      dark: "bg-[#191919] border border-[#2D2D2D] text-[#FAF8F5]",
    };

    return (
      <div
        ref={ref}
        className={cn("rounded-2xl p-6 transition-all", variants[variant], className)}
        {...props}
      />
    );
  }
);
Card.displayName = "Card";

// ==========================================
// Badge Component
// ==========================================
export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "neutral" | "terracotta" | "success" | "warning" | "outline";
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "neutral", ...props }, ref) => {
    const variants = {
      neutral: "bg-[#F1EDE4] text-[#6E6862] border-[#E2DDD4]",
      terracotta: "bg-[#FDF2F0] text-[#B83A26] border-[#F2C0B7]",
      success: "bg-[#EBF7EE] text-[#1E7E34] border-[#C3E8CA]",
      warning: "bg-[#FEF6E9] text-[#9C6114] border-[#F7DCB0]",
      outline: "bg-transparent text-[#191919] border-[#E2DDD4]",
    };

    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold border tracking-wide",
          variants[variant],
          className
        )}
        {...props}
      />
    );
  }
);
Badge.displayName = "Badge";

// ==========================================
// Input Component
// ==========================================
export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-xl border border-[#E2DDD4] bg-[#FAF8F5] px-3.5 py-2 text-xs text-[#191919] placeholder:text-[#8C847B] focus:outline-none focus:border-[#191919] focus:ring-1 focus:ring-[#191919] transition-all disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";
