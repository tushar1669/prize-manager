import { cn } from "@/lib/utils";
import type { CSSProperties } from "react";

const brandAssets = {
  mark: "/brand/prize-manager-icon.png",
  lockup: "/brand/prize-manager-logo-transparent-cropped.png",
} as const;

type BrandLogoVariant = keyof typeof brandAssets;
type BrandLogoSize = "sm" | "md" | "lg" | "xl";
type BrandLogoTone = "color" | "mono";

const sizeClasses: Record<BrandLogoSize, string> = {
  sm: "h-12 w-auto sm:h-14",
  md: "h-14 w-auto sm:h-16",
  lg: "h-16 w-auto sm:h-20",
  xl: "h-20 w-auto sm:h-24",
};

type BrandLogoProps = {
  variant?: BrandLogoVariant;
  size?: BrandLogoSize;
  tone?: BrandLogoTone;
  className?: string;
  alt?: string;
  xOffset?: number;
  yOffset?: number;
  style?: CSSProperties;
  loading?: "eager" | "lazy";
  decoding?: "async" | "sync" | "auto";
  fetchPriority?: "high" | "low" | "auto";
};

export function BrandLogo({
  variant = "lockup",
  size = "xl",
  tone = "color",
  className,
  alt = "Prize Manager",
  xOffset = 0,
  yOffset = 0,
  style,
  loading,
  decoding,
  fetchPriority,
}: BrandLogoProps) {
  const combinedStyle: CSSProperties = {
    ...style,
    transform: [
      style?.transform,
      xOffset !== 0 || yOffset !== 0 ? `translate(${xOffset}px, ${yOffset}px)` : null,
    ]
      .filter(Boolean)
      .join(" ")
      .trim() || undefined,
  };

  return (
    <img
      src={brandAssets[variant]}
      alt={alt}
      className={cn(
        "block object-contain",
        sizeClasses[size],
        tone === "mono" && "dark:brightness-0 dark:invert",
        className,
      )}
      style={combinedStyle}
      loading={loading}
      decoding={decoding}
      fetchPriority={fetchPriority}
    />
  );
}
