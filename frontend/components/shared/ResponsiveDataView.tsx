import type { ReactNode } from "react";

interface ResponsiveDataViewProps {
  desktop: ReactNode;
  mobile: ReactNode;
  desktopLabel: string;
  mobileLabel: string;
  className?: string;
}

export function ResponsiveDataView({
  desktop,
  mobile,
  desktopLabel,
  mobileLabel,
  className,
}: ResponsiveDataViewProps) {
  return (
    <div className={className}>
      <div className="hidden md:block" aria-label={desktopLabel}>
        {desktop}
      </div>
      <div className="space-y-3 md:hidden" aria-label={mobileLabel}>
        {mobile}
      </div>
    </div>
  );
}
