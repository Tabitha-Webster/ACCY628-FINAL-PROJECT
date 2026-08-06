/** Compact 1–5 star display for HR applicant match ratings. */
export function StarRating({ stars }: { stars: number }) {
  const filled = Math.max(1, Math.min(5, stars));
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${filled} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className={`text-sm ${i < filled ? "text-warning" : "opacity-25"}`}
          aria-hidden
        >
          ★
        </span>
      ))}
    </span>
  );
}
