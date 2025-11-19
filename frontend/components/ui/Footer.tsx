"use client";

import Link from "next/link";
import { useTheme } from "next-themes";
import { useState, useEffect } from "react";
import { Twitter, Linkedin, Instagram } from "lucide-react";

export default function Footer() {
  const { theme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <footer className="border-t border-zinc-200 bg-white dark:bg-black py-16" />
    );
  }

  const isDark = theme === "dark";

  return (
    <footer
      className={`border-t ${
        isDark ? "border-zinc-800 bg-black" : "border-zinc-200 bg-white"
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 py-20 grid grid-cols-1 md:grid-cols-5 gap-12 text-[15px]">
        {/* Brand & Description */}
        <div className="md:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <img src="/logo.png" alt="NoteMint" className="h-7 w-7" />
            <h3 className="text-2xl font-semibold">NoteMint</h3>
          </div>

          <p className={isDark ? "text-zinc-400" : "text-zinc-700"}>
            Transform your textbooks, PDFs and chapters into <br />
            AI-generated revision notes, flashcards, and <br />
            personalized study plans.
          </p>

          {/* Social Icons */}
          <div className="flex gap-5 mt-6">
            {[Twitter, Linkedin, Instagram].map((Icon, i) => (
              <Link
                key={i}
                href="#"
                className="transition-transform hover:scale-110 opacity-80 hover:opacity-100"
              >
                <Icon
                  size={22}
                  className={isDark ? "text-zinc-300" : "text-zinc-700"}
                />
              </Link>
            ))}
          </div>
        </div>

        {/* Product */}
        <div>
          <h4 className="font-semibold mb-4 text-[16px]">Product</h4>
          <ul className="space-y-2">
            <li><Link href="/features">Features</Link></li>
            <li><Link href="/pricing">Pricing</Link></li>
            <li><Link href="/community">Community</Link></li>
          </ul>
        </div>

        {/* Company */}
        <div>
          <h4 className="font-semibold mb-4 text-[16px]">Company</h4>
          <ul className="space-y-2">
            <li><Link href="/about">About</Link></li>
            <li><Link href="/contact">Contact</Link></li>
            <li><Link href="/blog">Blog</Link></li>
          </ul>
        </div>

        {/* Legal */}
        <div>
          <h4 className="font-semibold mb-4 text-[16px]">Legal</h4>
          <ul className="space-y-2">
            <li><Link href="/privacy">Privacy Policy</Link></li>
            <li><Link href="/terms">Terms of Service</Link></li>
          </ul>
        </div>
      </div>

      <div
        className={`py-6 text-center text-sm ${
          isDark ? "text-zinc-600" : "text-zinc-500"
        }`}
      >
        © {new Date().getFullYear()} NoteMint. All rights reserved.
      </div>
    </footer>
  );
}
