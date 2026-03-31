"use client";

interface PageDotsProps {
  total: number;
  current: number;
}

export function PageDots({ total, current }: PageDotsProps) {
  if (total <= 1) return null;

  return (
    <div data-testid="page-dots" className="flex items-center justify-center gap-2 py-3">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-2 w-2 rounded-full transition-colors ${
            i === current ? "bg-foreground" : "bg-muted-foreground/30"
          }`}
        />
      ))}
    </div>
  );
}
