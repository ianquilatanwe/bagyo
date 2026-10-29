import type { Metadata, Viewport } from "next";
import { Big_Shoulders, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const shoulders = Big_Shoulders({ variable: "--font-shoulders", subsets: ["latin"], weight: ["700", "900"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500"] });

// Absolute base for the social preview image: the Vercel production URL when deployed, localhost otherwise.
const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "http://localhost:3000";

const title = "Bagyo – Scroll Into a Typhoon (WebGL Demo)";
const description =
  "A scroll-driven WebGL study: rain bands, a turning cloud spiral and the calm eye of a typhoon, drawn by one fragment shader in Next.js. By Ian Quilatan.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  openGraph: { title, description, type: "website", siteName: "Bagyo" },
  twitter: { card: "summary_large_image", title, description },
};

export const viewport: Viewport = {
  themeColor: "#141b22",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${shoulders.variable} ${plexMono.variable} font-mono antialiased`}>{children}</body>
    </html>
  );
}
