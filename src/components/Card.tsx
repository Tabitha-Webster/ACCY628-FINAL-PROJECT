import type { ReactNode } from "react";

export type CardProps = {
  title?: string;
  /** Optional supporting text under the title. */
  description?: string;
  children: ReactNode;
  /** Optional actions aligned with the header (buttons/links). */
  actions?: ReactNode;
  className?: string;
};

/**
 * Shared content card — consistent border, spacing, and typography.
 */
export function Card({ title, description, children, actions, className = "" }: CardProps) {
  const hasHeader = Boolean(title || description || actions);

  return (
    <section
      className={`rounded-box border border-base-300 bg-base-100 shadow-sm ${className}`.trim()}
    >
      {hasHeader ? (
        <header className="flex flex-col gap-3 border-b border-base-300 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0 space-y-1">
            {title ? <h2 className="text-base font-semibold tracking-tight">{title}</h2> : null}
            {description ? <p className="text-sm leading-relaxed opacity-70">{description}</p> : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">{actions}</div>
          ) : null}
        </header>
      ) : null}
      <div className="p-4">{children}</div>
    </section>
  );
}
