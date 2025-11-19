"use client";

import Link from "next/link";
import { useUser, UserButton } from "@clerk/nextjs";
import { useState, useEffect } from "react";
import { Menu, Sun, Moon } from "lucide-react";
import { Sheet, SheetTrigger, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useTheme } from "next-themes";

export default function PublicNavbar() {
  const { isSignedIn } = useUser();
  const { theme, setTheme } = useTheme();

  const [mounted, setMounted] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav
      className={`w-full sticky top-0 z-50 transition-all backdrop-blur-md ${
        isScrolled ? "bg-white/80 shadow-sm dark:bg-zinc-900/80" : "bg-transparent"
      }`}
    >
      <div className="max-w-6xl mx-auto flex items-center justify-between py-4 px-6">
        
        {/* Logo */}
        <Link href="/" className="flex items-center space-x-2">
          <img src="/logo.png" alt="NoteMint" className="h-10 w-10" />
          <span className="text-2xl font-semibold">NoteMint</span>
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center space-x-8 text-sm font-medium">
          <Link href="#features">Features</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/about">About</Link>
          <Link href="/contact">Contact</Link>
        </div>

        {/* Right Side Actions */}
        <div className="hidden md:flex items-center space-x-4">
          {mounted && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            >
              {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </Button>
          )}

          {!isSignedIn ? (
            <Button asChild>
              <Link href="/sign-in">Get Started →</Link>
            </Button>
          ) : (
            <>
              <Link href="/dashboard" className="text-sm hover:text-teal-600">
                Dashboard
              </Link>
              <UserButton afterSignOutUrl="/" />
            </>
          )}
        </div>

        {/* Mobile Menu */}
        {mounted && (
          <div className="md:hidden flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            >
              {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </Button>

            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu size={22} />
                </Button>
              </SheetTrigger>

              <SheetContent side="right" aria-label="Main menu">
                <div className="flex flex-col space-y-6 p-6 text-lg">
                  <Link href="/features">Features</Link>
                  <Link href="/pricing">Pricing</Link>
                  <Link href="/about">About</Link>
                  <Link href="/contact">Contact</Link>

                  {!isSignedIn ? (
                    <Button asChild className="w-full mt-6">
                      <Link href="/sign-in">Get Started →</Link>
                    </Button>
                  ) : (
                    <>
                      <Button asChild className="w-full mt-6">
                        <Link href="/dashboard">Dashboard</Link>
                      </Button>
                      <div className="mt-4 flex justify-center">
                        <UserButton afterSignOutUrl="/" />
                      </div>
                    </>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        )}
      </div>
    </nav>
  );
}
