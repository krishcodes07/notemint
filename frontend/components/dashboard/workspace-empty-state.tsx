"use client";

import { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface WorkspaceEmptyStateProps {
  icon: LucideIcon;
  title: string;
  phaseBadge: string;
  description: string;
  features: string[];
  previewComponent?: React.ReactNode;
  onAction?: () => void;
  actionLabel?: string;
}

export function WorkspaceEmptyState({
  icon: Icon,
  title,
  phaseBadge,
  description,
  features,
  previewComponent,
  onAction,
  actionLabel = "Return to Notes",
}: WorkspaceEmptyStateProps) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-6 py-8 text-center">
      {/* Icon badge */}
      <div className="flex size-14 items-center justify-center rounded-2xl border border-primary/20 bg-brand-soft/40 text-primary shadow-xs">
        <Icon className="size-7" />
      </div>

      {/* Title & Phase */}
      <div className="flex flex-col items-center gap-2">
        <Badge variant="secondary" className="font-mono text-[11px]">
          {phaseBadge}
        </Badge>
        <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {title}
        </h2>
        <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>

      {/* Feature roadmap pill grid */}
      <div className="w-full max-w-lg rounded-2xl border bg-card/60 p-4 text-left shadow-xs">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Planned capabilities
        </span>
        <ul className="mt-2.5 flex flex-col gap-2">
          {features.map((feature, i) => (
            <li
              key={i}
              className="flex items-start gap-2 text-xs text-foreground/90"
            >
              <span className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Optional Interactive Preview */}
      {previewComponent && (
        <div className="w-full max-w-lg">{previewComponent}</div>
      )}

      {/* Action */}
      {onAction && (
        <Button variant="outline" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

