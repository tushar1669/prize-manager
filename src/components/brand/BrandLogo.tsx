import { cn } from "@/lib/utils";
import type { CSSProperties } from "react";

const brandAssets = {
  mark: "/brand/prize-manager-icon.png",
  lockup: "/brand/prize-manager-logo-transparent-cropped.png",
} as const;

type BrandLogoVariant = keyof typeof brandAssets;

type BrandLogoProps = {
  variant?: BrandLogoVariant;
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
  className,
  alt = "Prize Manager",
  opticalOffsetY,
  style,
  loading,
  decoding,
  fetchPriority,
}: BrandLogoProps) {
  const combinedStyle: CSSProperties = {
    ...style,
    transform: [style?.transform, opticalOffsetY != null ? `translateY(${opticalOffsetY}px)` : null]
      .filter(Boolean)
      .join(" ")
      .trim() || undefined,
  };

  return (
    <img
      src={brandAssets[variant]}
      alt={alt}
      className={cn("block object-contain", className)}
      style={combinedStyle}
      loading={loading}
      decoding={decoding}
      fetchPriority={fetchPriority}
    />
  );
}
