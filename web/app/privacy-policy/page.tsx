import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How NISHIKI LIST handles the information you create and store in the app.",
};

export default function PrivacyPolicy() {
  return (
    <div className="legal">
      <header className="legal-top">
        <div className="legal-wrap">
          <Link href="/" className="legal-home">
            ← NISHIKI CRAFT
          </Link>
        </div>
      </header>

      <main className="legal-main legal-wrap">
        <div className="legal-eyebrow">PRIVACY</div>
        <h1>Privacy Policy</h1>
        <p className="legal-intro">
          This policy explains how NISHIKI LIST handles information you create
          and use in the app.
        </p>

        <article>
          <section>
            <h2>1. Information stored by the app</h2>
            <p>
              NISHIKI LIST handles the list names, headings, and item text you
              enter, along with input history used to suggest previous entries.
              This history may include the text, how often it was used, and when
              it was last used.
            </p>
            <p>
              In the current version, this information is stored on your device.
              The app does not send it to servers operated by NISHIKI CRAFT.
            </p>
          </section>
          <section>
            <h2>2. How the information is used</h2>
            <p>
              Stored information is used to display, edit, and restore your
              lists, and to suggest items you have entered before.
            </p>
          </section>
          <section>
            <h2>3. Managing input history</h2>
            <p>
              Input history is stored separately for each list. Removing an item
              from a list does not automatically remove its history. You can
              delete individual entries from the suggestions screen.
            </p>
          </section>
          <section>
            <h2>4. On-device storage and deletion</h2>
            <p>
              App data is stored on your device. Deleting the app removes its
              data from the device. Data included in device or operating system
              backups may be handled according to your backup settings and the
              relevant service&rsquo;s policies.
            </p>
          </section>
          <section>
            <h2>5. Clipboard and sharing</h2>
            <p>
              When you copy text, the selected text is placed on your
              device&rsquo;s clipboard. When you share text, it is passed to the
              standard iOS sharing feature. Any further handling is governed by
              the privacy policy of the service you choose.
            </p>
          </section>
          <section>
            <h2>6. Sharing with third parties</h2>
            <p>
              In the current version, the app does not send your information to
              servers operated by NISHIKI CRAFT or to third parties for
              advertising or analytics. The operating system and any sharing
              services you choose handle information according to their
              providers&rsquo; policies.
            </p>
          </section>
          <section>
            <h2>7. Changes to this policy</h2>
            <p>
              This policy may be updated to reflect changes in applicable laws
              or in the app. Updates will be posted on this page.
            </p>
          </section>
          <section>
            <h2>8. Operator and contact</h2>
            <p>Operated by NISHIKI CRAFT.</p>
            <p>
              For questions, email{" "}
              <a href="mailto:hello@nishikicraft.com">hello@nishikicraft.com</a>.
            </p>
          </section>
        </article>

        <p className="legal-updated">Effective date: October 29, 2026</p>
      </main>

      <footer className="legal-footer">
        <div className="legal-wrap">© 2026 NISHIKI CRAFT</div>
      </footer>
    </div>
  );
}
