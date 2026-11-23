import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { GOOGLE_FONTS_HREF } from "@/lib/types";

// mrdesign.md typography (from the project's own DESIGN.md): Inter carries
// everything — headings 700, body 400/500. The Google Fonts stylesheet below
// additionally serves the live-preview font options (Manrope, Poppins, Sora,
// ...) used by generated previews.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Design Forge",
  description:
    "Turn your logo into an agent-ready design system: AI logo analysis, audience psychology research, color palettes, live component preview.",
  // Favicon/tab icon comes from src/app/icon.png (file convention).
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="stylesheet" href={GOOGLE_FONTS_HREF} />
      </head>
      <body
        className={`${inter.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
          <Toaster richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
