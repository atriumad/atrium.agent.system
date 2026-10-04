import type { LucideIcon, LucideProps } from "lucide-react";

export type IconProps = Omit<LucideProps, "size" | "strokeWidth"> & {
  icon: LucideIcon;
  /** 16px beside 14px text, 20px in buttons and navigation, 24px alone. */
  size?: "sm" | "md" | "lg";
  /** Give an icon that stands alone a name. Without one it is hidden from assistive technology. */
  label?: string;
};

const PX = { sm: 16, md: 20, lg: 24 };

/** An icon at the system's stroke (1.5), in currentColor. Lucide is a stand-in until the brand picks a set. */
export function Icon({ icon: Glyph, size = "md", label, ...rest }: IconProps) {
  return (
    <Glyph
      size={PX[size]}
      strokeWidth={1.5}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
      {...rest}
    />
  );
}
