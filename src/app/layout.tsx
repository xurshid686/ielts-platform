import type { Metadata } from "next";
import { SITE_NAME, SITE_URL } from "@/lib/site";
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
  // metadataBase makes every relative canonical/OpenGraph URL below resolve to
  // the ONE canonical host, whichever of the four hosts actually served the
  // page. Without it Next emits relative URLs and Google indexes duplicates.
  metadataBase: new URL(SITE_URL),
  title: {
    default: "IELTS Practice Platform",
    // Page titles become "Life on Mars? — IELTS Reading Practice · MockOnline".
    template: `%s · ${SITE_NAME}`,
  },
  description:
    "Practice IELTS Reading, Listening, Writing & Speaking. Track progress, build streaks.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: SITE_URL,
  },
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
