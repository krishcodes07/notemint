"use client";

import { SignUp } from "@clerk/nextjs";
import AuthLayout from "@/components/ui/AuthLayout";
import { useTheme } from "next-themes";
import { dark, neobrutalism } from "@clerk/themes";

export default function Page() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  return (
    <AuthLayout>
      <SignUp
        redirectUrl="/dashboard"
        appearance={{
          baseTheme: isDark ? dark : neobrutalism,
          elements: {
            card: "bg-transparent shadow-none w-full border-none p-0",

            headerTitle: isDark
              ? "text-3xl font-bold text-white"
              : "text-3xl font-bold text-black",
            headerSubtitle: isDark ? "text-zinc-400" : "text-zinc-600",

            socialButtonsBlockButton: isDark
              ? "bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-white h-10"
              : "bg-white border border-zinc-200 hover:bg-zinc-100 text-black h-10",
            socialButtonsBlockButtonText: "font-medium",

            formFieldLabel: isDark ? "text-zinc-300" : "text-zinc-800",
            formFieldInput: isDark
              ? "bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-500 focus:border-white focus:ring-white/20 h-10 rounded-md"
              : "bg-white border-zinc-300 text-black placeholder:text-zinc-500 focus:border-black focus:ring-black/10 h-10 rounded-md",

            formButtonPrimary: isDark
              ? "bg-white text-black hover:bg-zinc-200 h-10 font-bold"
              : "bg-black text-white hover:bg-zinc-800 h-10 font-bold",

            footerActionText: isDark ? "text-zinc-500" : "text-zinc-600",
            footerActionLink: isDark
              ? "text-white hover:underline underline-offset-4"
              : "text-black hover:underline underline-offset-4",

            dividerLine: isDark ? "bg-zinc-800" : "bg-zinc-300",
            dividerText: isDark ? "text-zinc-500" : "text-zinc-600",
          },
          layout: {
            socialButtonsPlacement: "top",
            showOptionalFields: false,
          },
        }}
      />
    </AuthLayout>
  );
}
