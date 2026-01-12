import { cn } from "@/lib/utils";
import type { CSSProperties } from "react";

const brandAssets = {
  mark: "/brand/prize-manager-icon.png",
  lockup: "/brand/prize-manager-logo-transparent-cropped.png",
} as const;

type BrandLogoVariant = keyof typeof brandAssets;
type BrandLogoSize = "sm" | "md" | "lg" | "xl";

const sizeClasses: Record<BrandLogoSize, string> = {
  sm: "h-6 w-auto sm:h-7",
  md: "h-7 w-auto sm:h-8",
  lg: "h-8 w-auto sm:h-10",
  xl: "h-10 w-auto sm:h-12",
};

type BrandLogoProps = {
  variant?: BrandLogoVariant;
  size?: BrandLogoSize;
  className?: string;
  alt?: string;
  opticalOffsetY?: number;
  style?: CSSProperties;
  loading?: "eager" | "lazy";
  decoding?: "async" | "sync" | "auto";
  fetchPriority?: "high" | "low" | "auto";
};

export function BrandLogo({
  variant = "lockup",
  size = "xl",
  className,
  alt = "Prize Manager",
  opticalOffsetY = 0,
  style,
  loading,
  decoding,
  fetchPriority,
}: BrandLogoProps) {
  const combinedStyle: CSSProperties = {
    ...style,
    transform: [style?.transform, opticalOffsetY !== 0 ? `translateY(${opticalOffsetY}px)` : null]
      .filter(Boolean)
      .join(" ")
      .trim() || undefined,
  };

  return (
    <img
      src={brandAssets[variant]}
      alt={alt}
      className={cn("block object-contain", sizeClasses[size], className)}
      style={combinedStyle}
      loading={loading}
      decoding={decoding}
      fetchPriority={fetchPriority}
    />
  );
}
