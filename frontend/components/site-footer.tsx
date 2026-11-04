import { Leaf } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:px-6">
        <div className="flex items-center gap-2">
          <Leaf className="size-3.5 text-primary" aria-hidden />
          <span>NoteMint</span>
        </div>
        <p>AI-powered personalized learning · Built in phases</p>
      </div>
    </footer>
  );
}
