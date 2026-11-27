import type { Metadata, Viewport } from "next";
import { Montserrat } from "next/font/google";
import { site } from "./site";
import "./globals.css";

const montserrat = Montserrat({ subsets: ["latin"], weight: ["200", "300", "400", "500"], variable: "--font-montserrat", display: "swap" });

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
    locale: "en_US",
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
      lang="en"
      className={montserrat.variable}
      suppressHydrationWarning
    >
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        {children}
      </body>
    </html>
  );
}
