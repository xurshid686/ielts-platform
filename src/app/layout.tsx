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

const DESCRIPTION =
  "Free IELTS mock tests in the real computer-delivered exam format. Practise Reading and Listening with instant band scores and answer explanations, or talk to an AI examiner for Speaking. No account needed to start.";

export const metadata: Metadata = {
  // metadataBase makes every relative canonical/OpenGraph URL below resolve to
  // the ONE canonical host, whichever of the four hosts actually served the
  // page. Without it Next emits relative URLs and Google indexes duplicates.
  metadataBase: new URL(SITE_URL),
  title: {
    // Leads with what students actually search for, and names the brand last.
    default: `Free IELTS Mock Tests & AI Speaking Practice | ${SITE_NAME}`,
    // Page titles become "Life on Mars? — IELTS Reading Practice · MockOnline".
    template: `%s · ${SITE_NAME}`,
  },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: SITE_URL,
    title: `Free IELTS Mock Tests & AI Speaking Practice | ${SITE_NAME}`,
    description: DESCRIPTION,
    locale: "en_US",
    // No `images` here on purpose: src/app/opengraph-image.tsx supplies it
    // through the file convention, and a hand-written entry would collide.
  },
  twitter: {
    card: "summary_large_image",
    title: `Free IELTS Mock Tests & AI Speaking Practice | ${SITE_NAME}`,
    description: DESCRIPTION,
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
