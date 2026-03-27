import type { Metadata } from "next";
import "./globals.css";
import { Plus_Jakarta_Sans as FontSans } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Analytics } from '@vercel/analytics/next';
import { ClerkProvider } from '@clerk/nextjs';
import { neobrutalism } from '@clerk/themes';

import { cn } from "@/lib/utils";


const fontSans = FontSans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "AM | PM Lounge - POS & Reservations",
  description:
    "The official operational system for AM | PM Lounge. Experience exceptional dining and entertainment in Northern Bypass, Thome.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider
      appearance={{
        theme: neobrutalism,
        variables: { colorPrimary: '#10b981' }, // Emerald-500 matches the app theme
      }}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/pos"
      signUpFallbackRedirectUrl="/pos"
    >
      <html lang="en" suppressHydrationWarning>
        <body
          className={cn(
            "min-h-screen bg-slate-950 font-sans antialiased",
            fontSans.variable
          )}
        >
          <ThemeProvider attribute="class" defaultTheme="dark">
          {children}
          <Analytics />
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
