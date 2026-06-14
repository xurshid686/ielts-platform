import type { Metadata } from "next";
import { Bricolage_Grotesque, Hanken_Grotesk, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { ReferralCapture } from "@/components/referral-capture";

// Display: warm, characterful grotesque for headings.
const display = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});
// Body: friendly, highly readable humanist sans.
const sans = Hanken_Grotesk({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "IELTS Practice Platform",
  description:
    "Practice IELTS Reading, Listening, Writing & Speaking. Track progress, build streaks.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${display.variable} ${sans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ReferralCapture />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
