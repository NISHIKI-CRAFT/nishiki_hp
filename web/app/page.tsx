import Link from "next/link";
import KoiCanvas from "@/components/KoiCanvas";
import { site } from "./site";

export default function Home() {
  return (
    <div className="stage">
      <KoiCanvas />

      <header className="topbar">
        {/* NISHIKI. wordmark — light art; recoloured to ink for light mode via CSS */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="mark" src="/wordmark.png" alt="NISHIKI CRAFT" />
        <nav className="nav">
          <a href={site.appStoreUrl} target="_blank" rel="noreferrer">
            Apps
          </a>
          <a href={site.discordUrl} target="_blank" rel="noreferrer">
            Discord
          </a>
        </nav>
      </header>

      <main className="hero">
        {/* App-icon mark. Dark-mode source is wired up ready (dark mode itself is TODO). */}
        <picture className="logo">
          <source srcSet="/mark-dark.png" media="(prefers-color-scheme: dark)" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mark-light.jpg" alt="NISHIKI CRAFT" width={108} height={108} />
        </picture>

        <h1 className="wordmark">
          NISHIKI <span className="craft">CRAFT</span>
        </h1>

        <p className="lead">{site.tagline}</p>
        <p className="lead-ja">錦のように、ひとつずつ丁寧に。iPhoneアプリを作っています。</p>

        <div className="cta-row">
          <a
            className="btn btn-primary"
            href={site.appStoreUrl}
            target="_blank"
            rel="noreferrer"
          >
            <AppleIcon />
            App Store で見る
          </a>
          <a
            className="btn btn-secondary"
            href={site.discordUrl}
            target="_blank"
            rel="noreferrer"
          >
            <span className="btn-brand-dot" />
            Discord に参加
          </a>
        </div>

        <a
          className="app-chip"
          href={site.firstApp.url}
          target="_blank"
          rel="noreferrer"
        >
          <span className="tag">APP 01</span>
          <span className="name">{site.firstApp.name}</span>
          <span className="blurb">— {site.firstApp.blurb}</span>
          <span className="arrow" aria-hidden="true">
            →
          </span>
        </a>
      </main>

      <footer className="footer">
        <span>© {new Date().getFullYear()} NISHIKI CRAFT</span>
        <span className="links">
          <Link href="/privacy-policy">Privacy</Link>
          <a href={site.discordUrl} target="_blank" rel="noreferrer">
            Discord
          </a>
        </span>
      </footer>
    </div>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.37 1.43c.09 1.02-.32 2.01-.98 2.73-.69.75-1.78 1.33-2.84 1.25-.11-1 .37-2.03 1-2.69.69-.73 1.86-1.28 2.82-1.29zM19.9 17.1c-.5 1.16-.74 1.67-1.39 2.69-.9 1.43-2.18 3.2-3.76 3.21-1.4.01-1.76-.9-3.67-.89-1.9.01-2.3.91-3.7.9-1.58-.01-2.79-1.62-3.69-3.04C1.2 16.1.94 11.5 2.5 9.07c1.1-1.73 2.84-2.74 4.47-2.74 1.66 0 2.71.9 4.08.9 1.33 0 2.14-.9 4.06-.9 1.45 0 2.99.79 4.08 2.16-3.59 1.96-3.01 7.09.71 8.61z" />
    </svg>
  );
}
