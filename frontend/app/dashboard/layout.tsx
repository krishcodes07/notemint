import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AppSidebar } from "@/components/dashboard/app-sidebar";

async function AuthGuard({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }
  return <>{children}</>;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-full items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-3">
            <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-xs text-muted-foreground font-mono">
              Preparing your study workspace...
            </p>
          </div>
        </div>
      }
    >
      <AuthGuard>
        <div className="flex h-screen w-full overflow-hidden bg-background">
          {/* Desktop persistent sidebar */}
          <AppSidebar className="hidden md:flex shrink-0 h-screen sticky top-0" />

          {/* Main workspace area */}
          <div className="flex flex-1 flex-col min-w-0 h-screen overflow-hidden">
            {children}
          </div>
        </div>
      </AuthGuard>
    </Suspense>
  );
}

