export type NeoPulseLegalDocId = "terms-of-service" | "privacy-policy";

export type NeoPulseLegalSection = {
  heading?: string;
  paragraphs?: string[];
  bullets?: string[];
};

export type NeoPulseLegalDocument = {
  id: NeoPulseLegalDocId;
  title: string;
  updated: string;
  intro: string;
  sections: NeoPulseLegalSection[];
};

export const NEO_PULSE_LEGAL_DOCUMENTS: Record<NeoPulseLegalDocId, NeoPulseLegalDocument> = {
  "terms-of-service": {
    id: "terms-of-service",
    title: "Terms of Service",
    updated: "October 2, 2026",
    intro:
      'These Terms of Service ("Terms") govern access to and use of NEO Pulse, the AI content and flow manager (the "Service") operated by Neo Digital Inc. ("Neo Digital", "we", "us"). The Service is hosted on Render. By using these public policy pages or signing into the Service, you agree to these Terms.',
    sections: [
      {
        heading: "Who may use the Service",
        paragraphs: [
          "The Service is for Neo Digital team members and authorized client users. You must keep credentials confidential and are responsible for activity under your account.",
        ],
      },
      {
        heading: "Acceptable use",
        bullets: [
          "Use the Service only for lawful business purposes aligned with Neo Digital client work.",
          "Do not bypass authentication, scrape credentials, or probe systems without permission.",
          "Do not upload malware, unlawful content, or material that infringes others' rights.",
        ],
      },
      {
        heading: "Third-party services",
        paragraphs: [
          "The Service integrates with third parties (for example Google, WordPress sites, OpenRouter, Semrush, and DataForSEO). Your use of those integrations is also subject to their terms.",
        ],
      },
      {
        heading: "AI-generated output",
        paragraphs: [
          "You are responsible for reviewing AI-assisted drafts before client or public use. Neo Digital does not guarantee rankings, traffic, or business outcomes.",
        ],
      },
      {
        heading: "Disclaimer and liability",
        paragraphs: [
          'THE SERVICE IS PROVIDED "AS IS" TO THE MAXIMUM EXTENT PERMITTED BY LAW. NEO DIGITAL WILL NOT BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM USE OF THE SERVICE.',
        ],
      },
      {
        heading: "Governing law",
        paragraphs: [
          "These Terms are governed by the laws of the Province of Alberta and applicable federal laws of Canada.",
        ],
      },
      {
        heading: "Contact",
        paragraphs: ["Questions: sean@neodigital.ca"],
      },
    ],
  },
  "privacy-policy": {
    id: "privacy-policy",
    title: "Privacy Policy",
    updated: "October 2, 2026",
    intro:
      'Neo Digital Inc. ("Neo Digital", "we") operates NEO Pulse (the "Service") on Render. This policy describes how we collect, use, and protect information when you use the Service. This page is public and does not require sign-in.',
    sections: [
      {
        heading: "Information we collect",
        bullets: [
          "Account identifiers (name, email, team membership) for authentication and authorization.",
          "Integration settings and tokens you connect (for example Google OAuth, API keys stored per team policy).",
          "Workspace content you submit (site metadata, prompts, exports, optimization data).",
          "Operational logs required for security and debugging.",
        ],
      },
      {
        heading: "How we use information",
        bullets: [
          "Provide, secure, and improve the Service for authorized users.",
          "Run integrations you enable (Search Console, ads platforms, WordPress, LLM providers, SEO tools).",
          "Enforce our Terms of Service.",
        ],
      },
      {
        heading: "Sharing",
        paragraphs: [
          "We do not sell personal information. We share data with subprocessors needed to run the Service (for example Render hosting, Google, OpenRouter) and when required by law.",
        ],
      },
      {
        heading: "Retention and security",
        paragraphs: [
          "We retain data while accounts are active and as needed for legal, backup, or client contractual obligations. We use encryption, access controls, and least-privilege practices appropriate to a production SaaS deployment.",
        ],
      },
      {
        heading: "Your choices",
        paragraphs: [
          "You may disconnect integrations in settings where available. For access, correction, or deletion requests, contact sean@neodigital.ca.",
        ],
      },
      {
        heading: "Contact",
        paragraphs: ["Neo Digital Inc., Edmonton, Alberta, Canada. sean@neodigital.ca"],
      },
    ],
  },
};

export function neoPulseLegalPeerPath(id: NeoPulseLegalDocId): NeoPulseLegalDocId {
  return id === "terms-of-service" ? "privacy-policy" : "terms-of-service";
}

export function neoPulseLegalPeerLabel(id: NeoPulseLegalDocId): string {
  return id === "terms-of-service" ? "Privacy Policy" : "Terms of Service";
}
