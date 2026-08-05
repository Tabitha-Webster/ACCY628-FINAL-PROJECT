import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";

export type ButtonVariant = "primary" | "secondary" | "destructive";
export type ButtonSize = "xs" | "sm" | "md" | "lg";

const variantClass: Record<ButtonVariant, string> = {
  primary: "btn-primary",
  secondary: "btn-outline",
  destructive: "btn-error",
};

const sizeClass: Record<ButtonSize, string> = {
  xs: "btn-xs",
  sm: "btn-sm",
  md: "",
  lg: "btn-lg",
};

const focusClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-50";

export function buttonClassName({
  variant = "primary",
  size = "md",
  className = "",
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}) {
  return ["btn", variantClass[variant], sizeClass[size], focusClass, className]
    .filter(Boolean)
    .join(" ");
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

/**
 * Shared action button — primary, secondary, destructive, with disabled/hover/focus states.
 */
export function Button({
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={buttonClassName({ variant, size, className })}
      {...props}
    >
      {children}
    </button>
  );
}

type ButtonLinkProps = Omit<ComponentProps<typeof Link>, "className"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  /** Visually and interactively disabled (renders as a non-navigating span). */
  disabled?: boolean;
};

/**
 * Link styled like Button for header/nav actions within pages.
 */
export function ButtonLink({
  variant = "primary",
  size = "md",
  className = "",
  disabled,
  children,
  href,
  ...props
}: ButtonLinkProps) {
  const classes = buttonClassName({ variant, size, className });

  if (disabled) {
    return (
      <span className={`${classes} pointer-events-none opacity-50`} aria-disabled="true">
        {children}
      </span>
    );
  }

  return (
    <Link href={href} className={classes} {...props}>
      {children}
    </Link>
  );
}
