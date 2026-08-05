import { PageHeader, type PageHeaderProps } from "@/components/ui";

type PageLayoutProps = PageHeaderProps & {
  children: React.ReactNode;
  /** Constrain content width on large screens. Default keeps full workspace width. */
  width?: "full" | "wide" | "narrow";
};

const widthClass: Record<NonNullable<PageLayoutProps["width"]>, string> = {
  full: "max-w-none",
  wide: "max-w-6xl",
  narrow: "max-w-3xl",
};

/**
 * Reusable authenticated page structure:
 * shared page header + content region with consistent spacing.
 * Use inside AppShell (navigation is provided by the shell).
 */
export function PageLayout({
  title,
  description,
  actions,
  children,
  width = "full",
}: PageLayoutProps) {
  return (
    <div className={`app-page mx-auto w-full ${widthClass[width]}`}>
      <header className="app-page-header">
        <PageHeader title={title} description={description} actions={actions} />
      </header>
      <section className="app-page-content" aria-label="Page content">
        {children}
      </section>
    </div>
  );
}
