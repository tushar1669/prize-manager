import { cn } from "@/lib/utils";
import type { CSSProperties } from "react";

const brandAssets = {
  mark: "/brand/prize-manager-icon.png",
  lockup: "/brand/prize-manager-logo-transparent-cropped.png",
} as const;

type BrandLogoVariant = keyof typeof brandAssets;
type BrandLogoSize = "sm" | "md" | "lg" | "xl";

const sizeClasses: Record<BrandLogoSize, string> = {
  sm: "h-12 w-auto sm:h-14",
  md: "h-14 w-auto sm:h-16",
  lg: "h-16 w-auto sm:h-20",
  xl: "h-20 w-auto sm:h-24",
};

type BrandLogoProps = {
  variant?: BrandLogoVariant;
  size?: BrandLogoSize;
  className?: string;
  alt?: string;
  opticalOffsetX?: number;
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
  opticalOffsetX,
  opticalOffsetY,
  style,
  loading,
  decoding,
  fetchPriority,
}: BrandLogoProps) {
  const defaultOffsets: Record<BrandLogoVariant, { x: number; y: number }> = {
    lockup: { x: 0, y: -4 },
    mark: { x: 0, y: 0 },
  };

  const resolvedOffsetX = opticalOffsetX ?? defaultOffsets[variant].x;
  const resolvedOffsetY = opticalOffsetY ?? defaultOffsets[variant].y;
  const combinedStyle: CSSProperties = {
    ...style,
    transform: [
      style?.transform,
      resolvedOffsetX !== 0 || resolvedOffsetY !== 0
        ? `translate(${resolvedOffsetX}px, ${resolvedOffsetY}px)`
        : null,
    ]
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
