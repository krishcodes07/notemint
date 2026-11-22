import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  iconClassName?: string;
  textClassName?: string;
  size?: "sm" | "md" | "lg" | "xl";
  showText?: boolean;
  href?: string;
}

const sizeConfig = {
  sm: { width: 28, height: 28, text: "text-sm", gap: "gap-2" },
  md: { width: 34, height: 34, text: "text-base font-bold", gap: "gap-2.5" },
  lg: { width: 44, height: 44, text: "text-xl font-extrabold", gap: "gap-3" },
  xl: { width: 56, height: 56, text: "text-2xl font-extrabold", gap: "gap-3.5" },
};

export function NoteMintLogo({
  className,
  iconClassName,
  textClassName,
  size = "md",
  showText = true,
  href = "/",
}: LogoProps) {
  const config = sizeConfig[size];

  const content = (
    <div className={cn("inline-flex items-center select-none group", config.gap, className)}>
      <div
        className={cn(
          "relative flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105",
          iconClassName
        )}
        style={{ width: config.width, height: config.height }}
      >
        <Image
          src="/logo-square.png"
          alt="NoteMint Logo"
          width={config.width * 2}
          height={config.height * 2}
          className="size-full object-contain drop-shadow-[0_2px_8px_rgba(16,185,129,0.25)]"
          priority
        />
      </div>
      {showText && (
        <span
          className={cn(
            "font-sans tracking-tight text-foreground transition-colors group-hover:text-primary",
            config.text,
            textClassName
          )}
        >
          NoteMint
        </span>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="inline-flex items-center focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
        {content}
      </Link>
    );
  }

  return content;
}

