"use client";

import { usePathname } from "next/navigation";
import PublicNavbar from "./ui/PublicNavbar";
import Footer from "./ui/Footer";

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hiddenRoutes = ["/dashboard", "/onboarding"];
  const shouldShowNavFooter = !hiddenRoutes.some(route =>
    pathname.startsWith(route)
  );

  return (
    <>
      {shouldShowNavFooter && <PublicNavbar />}
      {children}
      {shouldShowNavFooter && <Footer />}
    </>
  );
}
