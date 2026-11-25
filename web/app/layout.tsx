import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { site } from "./site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://nishiki-craft.com"),
  title: {
    default: `${site.brand} — iPhone apps, made in Japan`,
    template: `%s — ${site.brand}`,
  },
  description: site.tagline,
  applicationName: site.brand,
  openGraph: {
    title: site.brand,
    description: site.tagline,
    siteName: site.brand,
    type: "website",
    locale: "ja_JP",
  },
  twitter: {
    card: "summary_large_image",
    title: site.brand,
    description: site.tagline,
  },
  icons: {
    icon: [{ url: "/favicon.png", type: "image/png" }],
    apple: [{ url: "/mark-light.jpg" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f4f6" },
    { media: "(prefers-color-scheme: dark)", color: "#121318" },
  ],
  colorScheme: "light dark",
};

// Set the saved theme before paint to avoid a flash of the wrong theme.
const themeInit = `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="ja"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        {children}
      </body>
    </html>
  );
}
