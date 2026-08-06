/** Badge for ticket service mode (onsite vs remote). */
export function serviceModeLabel(mode: string | null | undefined): string {
  if (mode === "onsite") return "Onsite";
  if (mode === "remote") return "Remote";
  return "Mode not set";
}

export function ServiceModeBadge({
  mode,
  location,
  showLocation = true,
  size = "sm",
}: {
  mode: string | null | undefined;
  location?: string | null;
  showLocation?: boolean;
  size?: "xs" | "sm";
}) {
  const label = serviceModeLabel(mode);
  const isOnsite = mode === "onsite";
  const isRemote = mode === "remote";
  const badgeClass = isOnsite
    ? "badge-warning"
    : isRemote
      ? "badge-info"
      : "badge-ghost";
  const sizeClass = size === "xs" ? "badge-xs" : "badge-sm";

  return (
    <span className="inline-flex max-w-full flex-wrap items-center gap-1.5">
      <span className={`badge badge-outline ${badgeClass} ${sizeClass} font-semibold`} title={label}>
        {isOnsite ? "Onsite job" : isRemote ? "Remote job" : label}
      </span>
      {showLocation && location?.trim() ? (
        <span className="max-w-[14rem] truncate text-xs opacity-70" title={location}>
          {location}
        </span>
      ) : null}
    </span>
  );
}
