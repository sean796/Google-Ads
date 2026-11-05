import { Link, useLocation } from "react-router-dom";
import {
  NEO_PULSE_LEGAL_DOCUMENTS,
  neoPulseLegalPeerLabel,
  neoPulseLegalPeerPath,
  type NeoPulseLegalDocId,
} from "@/lib/neo-pulse-legal-documents";
import { NEO_PULSE_BRAND_LOCKUP_SRC } from "@/lib/neo-pulse-branding-assets";

function isLegalDocId(value: string | undefined): value is NeoPulseLegalDocId {
  return value === "terms-of-service" || value === "privacy-policy";
}

export default function NeoPulseLegalPage() {
  const { pathname } = useLocation();
  const docId = pathname.replace(/^\//, "");
  if (!isLegalDocId(docId)) {
    return (
      <div className="min-h-screen bg-background px-4 py-12 text-center text-base text-muted-foreground">
        Document not found.
      </div>
    );
  }

  const doc = NEO_PULSE_LEGAL_DOCUMENTS[docId];
  const peerPath = neoPulseLegalPeerPath(docId);
  const peerLabel = neoPulseLegalPeerLabel(docId);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-5 py-10">
        <header className="mb-8 space-y-3">
          <Link to="/login" className="inline-flex items-center gap-2">
            <img src={NEO_PULSE_BRAND_LOCKUP_SRC} alt="NEO Pulse" className="h-10 w-auto" />
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">{doc.title}</h1>
          <p className="text-base text-muted-foreground">Last updated: {doc.updated}</p>
        </header>

        <main className="space-y-8 text-base leading-relaxed">
          <p className="text-muted-foreground">{doc.intro}</p>
          {doc.sections.map((section) => (
            <section key={section.heading ?? section.paragraphs[0]?.slice(0, 24)}>
              {section.heading ? (
                <h2 className="mb-2 text-lg font-bold text-foreground">{section.heading}</h2>
              ) : null}
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className="mb-2 text-muted-foreground">
                  {paragraph}
                </p>
              ))}
              {section.bullets ? (
                <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                  {section.bullets.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </main>

        <footer className="mt-10 border-t border-border pt-6 text-base text-muted-foreground">
          <p>
            © Neo Digital Inc. ·{" "}
            <Link to={`/${peerPath}`} className="text-[hsl(var(--semantic-data-foreground))] hover:underline">
              {peerLabel}
            </Link>
            {" · "}
            <Link to="/login" className="text-[hsl(var(--semantic-data-foreground))] hover:underline">
              Sign in
            </Link>
          </p>
        </footer>
      </div>
    </div>
  );
}
