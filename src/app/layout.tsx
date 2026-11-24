import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { GOOGLE_FONTS_HREF } from "@/lib/types";

// mrdesign.md typography (from the project's own DESIGN.md): Inter carries
// everything - headings 700, body 400/500. The Google Fonts stylesheet below
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
  title: "MrDesign.md",
  description:
    "Turn your logo into an agent-ready design system: AI logo analysis, audience psychology research, color palettes, live component preview.",
  // Favicon/tab icon comes from src/app/icon.ico (file convention).
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-accent="graphite"
      data-radius="soft"
      data-density="comfortable"
      data-uistyle="classic"
    >
      <head>
        <link rel="stylesheet" href={GOOGLE_FONTS_HREF} />
        {/* Apply the stored appearance preferences (style / accent / radius /
            density) before first paint so there is no flash of the defaults.
            Mirrors src/lib/client/appearance.ts. Color mode is handled by
            next-themes. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var a=JSON.parse(localStorage.getItem('mrdesign-appearance')||'{}');var e=document.documentElement;if(a.uiStyle)e.dataset.uistyle=a.uiStyle;if(a.accent)e.dataset.accent=a.accent;if(a.radius)e.dataset.radius=a.radius;if(a.density)e.dataset.density=a.density;}catch(_){}})()",
          }}
        />
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
