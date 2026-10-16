/** Path helpers and site-wide Edmonton SEO link-map builder + validators. */

export const MONEY = "/edmonton-seo";
export const CONTACT = "/contact";

export function normPath(input) {
  if (!input) return "";
  let path = input;
  try {
    if (input.includes("://")) path = new URL(input).pathname;
  } catch {
    path = input;
  }
  const q = path.split("?")[0].split("#")[0];
  const trimmed = q.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

export function hasHref(item, targetPath) {
  const want = normPath(targetPath);
  return (item.hrefs || []).some((h) => normPath(h.path || h.href) === want);
}

export function textHas(item, needle) {
  const n = needle.toLowerCase();
  if (Array.isArray(item.chunks) && item.chunks.length) {
    return item.chunks.some((c) => String(c).toLowerCase().includes(n));
  }
  return (item.text || "").toLowerCase().includes(n);
}

function pathOf(inventory, candidates) {
  const items = inventory.items || [];
  for (const c of candidates) {
    const n = normPath(c);
    const hit = items.find((i) => normPath(i.path) === n);
    if (hit) return normPath(hit.path);
  }
  return "";
}

function itemByPath(inventory, path) {
  const n = normPath(path);
  return (inventory.items || []).find((i) => normPath(i.path) === n) || null;
}

function row(from, to, anchor, placement, extra = {}) {
  return { from, to, anchor, placement, ...extra };
}

/**
 * Build the locked site-wide map. Edmonton SEO gets the most inbound service links.
 * @param {{ items: object[] }} inventory
 * @param {{ posts: { id: number, include: boolean, suggested_anchor: string, spoke: string }[] }} classified
 * @param {{ jobs?: { job: string, path: string }[] }} [cluster]
 */
export function buildLinkMap(inventory, classified, cluster = {}) {
  const p = (cands) => pathOf(inventory, cands);
  const home = p(["/"]);
  const about = p(["/about/"]);
  const services = p(["/our-services/"]);
  const design = p(["/website-design/"]);
  const covers = p(["/window-coverings-marketing/"]);
  const elementor = p(["/elementor-help/"]);
  const aiseo = p(["/aiseo/"]);
  const whatAiseo = p(["/aiseo/what-is-aiseo/"]);
  const content = p(["/aiseo/ai-content-optimization/"]);
  const geo = p(["/aiseo/generative-engine-optimization/"]);
  const audit = p(["/aiseo/ai-seo-audit/"]);
  const pulse = p(["/neo-pulse/", "/neo-pulse-platform/"]);
  const money = p(["/edmonton-seo/"]);
  const work = p(["/our-work/"]);
  const blind = p(["/our-work/blind-magic/"]);
  const blog = p(["/blog/"]);
  const contact = p(["/contact/"]);
  const localSeo = p(["/local-seo/"]);

  if (!money) throw new Error("Live /edmonton-seo/ missing from inventory");
  if (!contact) throw new Error("Live /contact/ missing from inventory");

  const links = [];
  const wrapable = new Set(["edmonton seo", "ai seo audit", "blind magic", "content optimization", "neo pulse"]);
  const add = (from, to, anchor, mention, sentence) => {
    if (!from || !to) return;
    const src = itemByPath(inventory, from);
    const mentionHit =
      Boolean(mention) && wrapable.has(mention.toLowerCase()) && src && textHas(src, mention);
    links.push(
      row(from, to, anchor, mentionHit ? "existing_sentence" : "one_new_sentence", {
        mention: mentionHit ? mention : "",
        sentence: mentionHit ? "" : sentence,
      }),
    );
  };

  add(home, services, "full service list", "services", "See the {{link}} for design, AISEO, and local search.");
  add(home, money, "local pack work in Edmonton", "Edmonton SEO", "We run {{link}} for businesses that need maps and service pages.");
  add(home, contact, "start a project", "contact", "Ready to talk? {{link}}.");

  add(services, home, "Neo Digital homepage", "Neo Digital", "Back to the {{link}}.");
  add(services, about, "About Neo Digital", "About", "Meet the team on {{link}}.");
  add(services, money, "Edmonton SEO program", "Edmonton SEO", "The {{link}} is the local search offer.");
  add(services, design, "website design service", "website design", "Pair search work with the {{link}}.");
  add(services, aiseo, "AISEO service pages", "AISEO", "National and technical work lives on the {{link}}.");
  add(services, covers, "window coverings marketing", "window", "Trade work sits on {{link}}.");
  add(services, elementor, "Elementor help", "Elementor", "Builder fixes sit on {{link}}.");
  add(services, contact, "book a strategy call", "contact", "{{link}} to scope the first 90 days.");

  add(design, money, "maps and service pages", "Edmonton SEO", "Local demand still needs {{link}} after the site ships.");
  add(design, aiseo, "AISEO pillar", "AISEO", "Content systems sit on the {{link}}.");
  add(design, services, "Our Services", "services", "All offers sit under {{link}}.");
  add(design, contact, "request a design brief", "contact", "{{link}} with the pages you need built.");

  add(aiseo, money, "Edmonton search visibility", "Edmonton SEO", "City-level work is the {{link}}.");
  add(aiseo, geo, "generative engine optimization", "generative", "Answer-engine work is {{link}}.");
  add(aiseo, audit, "AI SEO audit", "audit", "Start with an {{link}}.");
  add(aiseo, content, "AI content optimization", "content optimization", "Draft quality lives on {{link}}.");
  add(aiseo, pulse || services, "NEO Pulse platform", "NEO Pulse", "The operating system is {{link}}.");
  add(aiseo, services, "Our Services", "services", "{{link}} lists every offer.");
  add(aiseo, contact, "plan an AISEO sprint", "contact", "{{link}} to pick the first cluster.");

  add(geo, money, "city-level generative answers", "Edmonton", "Local GEO still points at {{link}}.");
  add(geo, aiseo, "AISEO pillar", "AISEO", "GEO sits under the {{link}}.");
  add(geo, audit, "AI SEO audit sibling", "audit", "Pair GEO with an {{link}}.");
  add(geo, contact, "ask about GEO", "contact", "{{link}} if answer engines already cite you.");

  add(audit, money, "local SEO starting point", "Edmonton", "The audit feeds the {{link}}.");
  add(audit, aiseo, "AISEO pillar", "AISEO", "Audits sit under the {{link}}.");
  add(audit, content, "AI content optimization sibling", "content", "Fix the brief on {{link}} after the audit.");
  add(audit, contact, "book the audit", "contact", "{{link}} to start the crawl.");

  add(content, money, "Edmonton content that ranks", "Edmonton", "Local pages still need {{link}}.");
  add(content, aiseo, "AISEO pillar", "AISEO", "This page sits under the {{link}}.");
  add(content, geo, "generative engine optimization sibling", "generative", "Publish then earn citations via {{link}}.");
  add(content, contact, "brief a content sprint", "contact", "{{link}} with the URLs to rewrite.");

  if (whatAiseo) {
    add(whatAiseo, aiseo, "AISEO service hub", "AISEO", "The definition sits under the {{link}}.");
    add(whatAiseo, content, "AI content optimization", "content", "See {{link}} for the production path.");
    add(whatAiseo, contact, "talk through AISEO", "contact", "{{link}} if you want this on your site.");
  }

  if (pulse) {
    add(pulse, aiseo, "AISEO pillar", "AISEO", "NEO Pulse ships the {{link}} stack.");
    add(pulse, whatAiseo || content || aiseo, "what AISEO means", "AISEO", "Read {{link}} for the definition.");
    add(pulse, contact, "see the platform on a call", "contact", "{{link}} to walk through a workspace.");
  }

  if (covers) {
    add(covers, services, "Our Services", "services", "Window-coverings work sits under {{link}}.");
    add(covers, design, "website design sibling", "website design", "Sites for coverings brands start with {{link}}.");
    add(covers, contact, "talk window-coverings marketing", "contact", "{{link}} about a coverings site.");
    const coverItem = itemByPath(inventory, covers);
    if (coverItem && textHas(coverItem, "local search")) {
      add(covers, money, "local search for coverings shops", "local search", "");
    }
  }

  if (elementor) {
    add(elementor, services, "Our Services", "services", "Elementor help sits under {{link}}.");
    add(elementor, design, "website design sibling", "website design", "Builds that need a new site go to {{link}}.");
    add(elementor, contact, "request Elementor help", "contact", "{{link}} with the broken page.");
    const elItem = itemByPath(inventory, elementor);
    if (elItem && textHas(elItem, "local search")) {
      add(elementor, money, "local search on Elementor sites", "local search", "");
    }
  }

  if (localSeo) {
    add(services, localSeo, "maps and near-me work", "local", "Pack work lives on {{link}}.");
    add(localSeo, money, "full Edmonton SEO program", "Edmonton", "The city program is {{link}}.");
    add(localSeo, aiseo || services, "AISEO service pages", "AISEO", "AI search sits on {{link}}.");
    add(localSeo, contact, "book a local SEO call", "contact", "{{link}} to start with the profile.");
  }

  add(about, money, "our Edmonton SEO team", "Edmonton", "The agency runs {{link}} from this city.");
  add(about, work, "Our Work", "work", "Proof lives on {{link}}.");
  add(about, services, "Our Services", "services", "Offers are listed under {{link}}.");
  add(about, contact, "meet the team", "contact", "{{link}} to introduce a project.");

  add(work, blind, "Blind Magic case study", "Blind Magic", "The flagship Edmonton proof is {{link}}.");
  add(work, money, "results from Edmonton SEO", "Edmonton SEO", "City search work is the {{link}}.");
  add(work, services, "Our Services", "services", "Services that produced these builds are on {{link}}.");
  add(work, contact, "start a similar project", "contact", "{{link}} if you want the same path.");

  add(blind, money, "results live in this city", "Edmonton", "Those rankings sit on {{link}}.");
  add(blind, work, "Our Work", "Our Work", "More builds sit on {{link}}.");
  add(blind, design, "website design rebuild", "website", "The rebuild used {{link}}.");
  add(blind, contact, "ask about a similar rebuild", "contact", "{{link}} to scope a YEG site.");

  add(money, design, "website design", "website design", "Most local sites still need {{link}} first.");
  add(money, audit, "AI SEO audit", "AI SEO audit", "Start with an {{link}}.");
  add(money, blind, "Blind Magic", "Blind Magic", "Proof is the {{link}} case study.");
  add(money, contact, "contact Neo Digital", "contact", "{{link}} to start the Edmonton program.");

  if (blog) {
    add(blog, money, "notes from the Edmonton program", "Edmonton SEO", "Local search writing supports the {{link}}.");
    add(blog, aiseo, "AISEO pillar", "AISEO", "Technical posts sit under {{link}}.");
    add(blog, contact, "pitch a topic", "contact", "{{link}} if you want a brief written for your site.");
  }

  const spokePath = {
    "edmonton-seo": money,
    aiseo,
    geo,
    audit,
    content,
    "website-design": design,
  };

  const included = (classified.posts || []).filter((c) => c.include);
  const byId = new Map((inventory.items || []).filter((i) => i.type === "post").map((i) => [i.id, i]));
  const usedAnchors = new Set(links.filter((l) => l.to === money).map((l) => l.anchor.toLowerCase()));

  for (const c of included) {
    const post = byId.get(c.id);
    if (!post) throw new Error(`Included post ${c.id} missing from inventory`);
    const from = normPath(post.path);
    let anchor = (c.suggested_anchor || "").trim();
    if (!anchor || usedAnchors.has(anchor.toLowerCase()) || anchor.toLowerCase() === "edmonton seo") {
      anchor = `${post.slug.replace(/-/g, " ")} path`;
    }
    if (usedAnchors.has(anchor.toLowerCase())) {
      anchor = `${post.slug} spoke`;
    }
    usedAnchors.add(anchor.toLowerCase());
    add(from, money, anchor, "Edmonton", `This article supports the {{link}}.`);
    const spoke = spokePath[c.spoke];
    if (spoke && spoke !== money) {
      add(from, spoke, c.spoke === "aiseo" ? "AISEO pillar" : `${c.spoke} playbook`, "", `Related service page: {{link}}.`);
    }
    add(from, blog || home, "the blog", "blog", "More notes live on {{link}}.");
    add(from, contact, "talk through this playbook", "contact", "{{link}} to apply it on a live site.");
  }

  const workItems = (inventory.items || []).filter((i) => i.type === "our-work" && normPath(i.path) !== work);
  for (const item of workItems) {
    const from = normPath(item.path);
    if (from === blind) continue;
    add(from, work, "Our Work", "work", "This project sits on {{link}}.");
    const local = textHas(item, "Edmonton") || textHas(item, "Alberta");
    if (local) {
      const a = `${item.title.split(":")[0].trim()} in Edmonton`;
      add(from, money, usedAnchors.has(a.toLowerCase()) ? `${item.slug} Edmonton proof` : a, "Edmonton", `Local results sit on {{link}}.`);
      usedAnchors.add(a.toLowerCase());
    } else if (textHas(item, "SEO") || textHas(item, "AISEO")) {
      add(from, aiseo, "AISEO pillar", "SEO", "The matching offer is the {{link}}.");
    } else {
      add(from, design, "website design service", "design", "The matching offer is {{link}}.");
    }
    add(from, contact, "start a similar build", "contact", "{{link}} to brief a project like this.");
  }

  const clusterJobs = Array.isArray(cluster.jobs) ? cluster.jobs : [];
  const clusterAnchors = {
    gbp: "maps and Google Business Profile",
    citations: "citations and NAP cleanup",
    links: "Edmonton link building notes",
    content: "AI search content clusters",
    tips: "local pack checklist",
    smb: "small business partner path",
  };
  const moneyInNow = links.filter((l) => normPath(l.to) === money).length;
  const moneyOutNow = links.filter((l) => normPath(l.from) === money).length;
  const extra = clusterJobs.filter((j) => {
    const to = normPath(j.path);
    return to && to !== money && Boolean(itemByPath(inventory, to));
  });
  if (extra.length && moneyInNow > moneyOutNow + extra.length) {
    for (const j of extra) {
      const to = normPath(j.path);
      if (links.some((l) => normPath(l.from) === money && normPath(l.to) === to)) continue;
      const anchor = clusterAnchors[j.job] || `${j.job} reading`;
      if (usedAnchors.has(anchor.toLowerCase())) continue;
      usedAnchors.add(anchor.toLowerCase());
      add(money, to, anchor, "", `We also cover {{link}} for local businesses.`);
    }
  }

  return {
    money,
    paths: {
      home,
      about,
      services,
      design,
      covers,
      elementor,
      aiseo,
      whatAiseo,
      content,
      geo,
      audit,
      pulse,
      money,
      work,
      blind,
      blog,
      contact,
      localSeo,
    },
    clusterJobs: Array.isArray(cluster.jobs) ? cluster.jobs : [],
    links,
  };
}

export function validateLinkMap(map, inventory) {
  const errors = [];
  const items = inventory.items || [];
  const byPath = new Map(items.map((i) => [normPath(i.path), i]));
  const money = map.money || MONEY;

  const moneyAnchors = new Map();
  for (const link of map.links) {
    if (!byPath.has(normPath(link.from))) errors.push(`unknown from ${link.from}`);
    if (!byPath.has(normPath(link.to))) errors.push(`unknown to ${link.to}`);
    if (!link.anchor || !link.anchor.trim()) errors.push(`empty anchor ${link.from} -> ${link.to}`);
    if (link.anchor.trim().toLowerCase() === "edmonton seo" && normPath(link.to) === money) {
      errors.push(`banned exact anchor from ${link.from}`);
    }
    if (normPath(link.to) === money) {
      const key = link.anchor.trim().toLowerCase();
      if (moneyAnchors.has(key)) errors.push(`duplicate money anchor "${link.anchor}"`);
      moneyAnchors.set(key, link.from);
    }
    if (link.placement === "existing_sentence" && !link.mention) {
      errors.push(`existing_sentence missing mention ${link.from} -> ${link.to}`);
    }
    if (link.placement === "one_new_sentence" && !link.sentence) {
      errors.push(`one_new_sentence missing sentence ${link.from} -> ${link.to}`);
    }
  }

  const inbound = new Map();
  const outbound = new Map();
  for (const link of map.links) {
    const to = normPath(link.to);
    const from = normPath(link.from);
    inbound.set(to, (inbound.get(to) || 0) + 1);
    outbound.set(from, (outbound.get(from) || 0) + 1);
  }
  const moneyIn = inbound.get(money) || 0;
  const moneyOut = outbound.get(money) || 0;
  if (moneyIn <= moneyOut) errors.push(`equity fail: inbound ${moneyIn} <= outbound ${moneyOut}`);

  const servicePages = [map.paths.design, map.paths.aiseo, map.paths.geo, map.paths.audit, map.paths.content].filter(Boolean);
  for (const sp of servicePages) {
    if ((inbound.get(sp) || 0) >= moneyIn) {
      errors.push(`money inbound ${moneyIn} not highest vs ${sp} (${inbound.get(sp)})`);
    }
  }

  const moneyOutTargets = new Set(
    map.links.filter((l) => normPath(l.from) === money).map((l) => normPath(l.to)),
  );
  const allowedOut = new Set(
    [map.paths.design, map.paths.audit, map.paths.blind, map.paths.contact, ...(map.clusterJobs || []).map((j) => j.path)]
      .filter(Boolean)
      .map(normPath),
  );
  for (const t of moneyOutTargets) {
    if (!allowedOut.has(t)) errors.push(`money page extra outbound ${t}`);
  }

  const inScope = Object.values(map.paths).filter(Boolean);
  for (const path of inScope) {
    const hasIn = map.links.some((l) => normPath(l.to) === path && normPath(l.from) !== path);
    if (!hasIn) errors.push(`orphan ${path}`);
  }

  if (map.paths.covers && map.links.some((l) => normPath(l.from) === map.paths.covers && normPath(l.to) === money)) {
    const item = byPath.get(map.paths.covers);
    if (item && !textHas(item, "local search")) {
      errors.push("window-coverings linked to money without local-search copy");
    }
  }

  return errors;
}

export function alreadyLinked(item, toPath) {
  return hasHref(item, toPath);
}
