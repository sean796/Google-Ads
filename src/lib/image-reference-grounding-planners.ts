/**
 * Grounding classification and evidence planning for Google Images reference research.
 */

import { parseJsonObjectFromModelText } from "@/lib/openrouter-vision-chat";
import {
  IMAGE_EVIDENCE_PLAN_RESPONSE_FORMAT,
  IMAGE_GROUNDING_CLASSIFICATION_RESPONSE_FORMAT,
} from "@/lib/image-grounding-classification-schema";
import { getMetaModel, getResearchModel } from "@/lib/optimization-settings-storage";
import { openRouterWebAppHeaders } from "@/lib/openrouter-attribution";
import { postOpenRouterAppChatFetch } from "@/lib/openrouter-app-api";
import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";
import {
  isWindowTreatmentImageContext,
  WINDOW_TREATMENT_IMAGE_PROMPT_RULES,
} from "@/lib/image-window-treatment-prompt-rules";
import { logFeaturedImagePipeline } from "@/lib/image-generator/featured-image-pipeline-log";
import {
  IMAGE_REF_MAX_TARGETS,
  IMAGE_REF_PLACE_FANOUT_MAX,
  IMAGE_REF_SUBJECT_FANOUT_MAX,
  parseImageEvidenceNeeds,
  parseImageGroundingClassification,
  parseQueryFanOutTargets,
  parseSubjectFanOutTargets,
  type ImageEvidencePlan,
  type ImageGroundingClassification,
  type ImageGroundingTarget,
  type ImageReferenceResearchContext,
} from "@/lib/image-reference-research-types-parsers";

function groundingClassificationFromModelPayload(args: {
  parsed?: Record<string, unknown>;
  content: string;
}): ImageGroundingClassification {
  if (args.parsed && typeof args.parsed === "object" && !Array.isArray(args.parsed)) {
    return parseImageGroundingClassification(args.parsed);
  }
  const trimmed = args.content.trim();
  if (!trimmed) {
    throw new Error("Image grounding classification returned empty output");
  }
  try {
    return parseImageGroundingClassification(parseJsonObjectFromModelText(trimmed));
  } catch (err) {
    const preview = trimmed.slice(0, 120).replace(/\s+/g, " ");
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`${detail} (preview: ${preview})`);
  }
}
/** Legacy Solo fan-out helper only (allocateSoloFanOutCaps). Intent plan path has no product count cap. */

export async function fanOutPlaceSpatialTargets(params: {
  apiKey: string;
  model?: string;
  sceneKeyword: string;
  placeTarget: ImageGroundingTarget;
  maxPlaceTargets?: number;
}): Promise<ImageGroundingTarget[]> {
  const apiKey = params.apiKey.trim();
  if (!apiKey) throw new Error("OpenRouter API key not found");
  const model = params.model || getResearchModel();
  const maxPlace = Math.max(
    1,
    Math.min(params.maxPlaceTargets ?? IMAGE_REF_PLACE_FANOUT_MAX, IMAGE_REF_PLACE_FANOUT_MAX),
  );
  const base = {
    ...params.placeTarget,
    kind: "place" as const,
    layer: params.placeTarget.layer || ("background" as const),
  };

  const system = [
    "You expand ONE place/setting into Google Images queries for spatial layout fidelity.",
    "Keep the SAME city + street + named store/building identity in every query. Do not invent new businesses.",
    "Name the place as street + store + city together: \"Jasper Avenue Save On Foods Edmonton\". Never phrase as \"by Save On Foods\".",
    "Choose additional angles that help depict what the scene keyword needs for this place.",
    "Return compact JSON only:",
    '{"queries":[{"query":"google images query","role":"why","layer":"background"|"midground"}]}',
    `Return up to ${maxPlace - 1} ADDITIONAL queries (the primary setting query already exists).`,
    "Do not invent new businesses. Do not use Avenue-by-StoreName phrasing.",
  ].join(" ");

  const res = await postOpenRouterAppChatFetch( {
    method: "POST",
    headers: openRouterWebAppHeaders(apiKey),
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `Scene keyword: ${params.sceneKeyword}\nPrimary place query: ${base.query}\nLocation: ${base.location_name || "United States"}`,
        },
      ],
      temperature: 0.2,
      max_tokens: 500,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    return [base];
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) return [base];
  try {
    return parseQueryFanOutTargets(parseJsonObjectFromModelText(content), base, maxPlace);
  } catch {
    return [base];
  }
}

/** Fan out one foreground subject (person/product) into pose/angle Google Images queries. */
export async function fanOutSubjectTargets(params: {
  apiKey: string;
  model?: string;
  sceneKeyword: string;
  subjectTarget: ImageGroundingTarget;
  maxSubjectTargets?: number;
}): Promise<ImageGroundingTarget[]> {
  const apiKey = params.apiKey.trim();
  if (!apiKey) throw new Error("OpenRouter API key not found");
  const model = params.model || getResearchModel();
  const maxSubject = Math.max(
    1,
    Math.min(
      params.maxSubjectTargets ?? IMAGE_REF_SUBJECT_FANOUT_MAX,
      IMAGE_REF_SUBJECT_FANOUT_MAX,
    ),
  );
  const base = {
    ...params.subjectTarget,
    layer: params.subjectTarget.layer || ("foreground" as const),
  };

  const system = [
    "You expand ONE foreground subject into Google Images queries for accurate depiction.",
    "Keep the SAME subject (named person, generic person, vehicle, product). Do not invent new subjects.",
    "Return compact JSON only:",
    '{"namedPerson":true|false,"queries":[{"query":"google images query","role":"identity|action|angle|primary|detail","layer":"foreground"}]}',
    `Return up to ${maxSubject} queries total in priority order.`,
    "NAMED PERSON (celebrity, public figure, or specific proper name of a real person): set namedPerson true.",
    "When namedPerson is true, queries REPLACE the primary. First query MUST be identity-only (clear face): e.g. \"Steve Buscemi portrait face\" or \"Steve Buscemi headshot\".",
    "Second query may be the person doing the named action (e.g. \"Steve Buscemi riding Segway\") or a generic action pose if needed.",
    "Do NOT return only action variants that omit a dedicated identity/portrait query.",
    "PRODUCT (blinds, vehicle, brand item): set namedPerson false. First query = primary lifestyle/hero product shot. Extra queries = side profile or close-up DETAIL of the SAME product line — role detail or angle. Do not fan out into unrelated product types. NEVER put city, street, or place names into product queries (place refs handle setting).",
    "GENERIC subject (unnamed runner): set namedPerson false. Keep the primary as first; add up to max-1 angle/pose variants.",
    'Example namedPerson: {"namedPerson":true,"queries":[{"query":"Steve Buscemi portrait face","role":"identity","layer":"foreground"},{"query":"Steve Buscemi riding Segway","role":"action","layer":"foreground"}]}',
    'Example product: {"namedPerson":false,"queries":[{"query":"Hunter Douglas blinds living room","role":"primary","layer":"foreground"},{"query":"Hunter Douglas cellular shade close up fabric","role":"detail","layer":"foreground"}]}',
    'Example generic: {"namedPerson":false,"queries":[{"query":"runner jogging toward camera outdoor","role":"angle","layer":"foreground"}]}',
    "Do not turn the subject into a place query.",
  ].join(" ");

  const res = await postOpenRouterAppChatFetch( {
    method: "POST",
    headers: openRouterWebAppHeaders(apiKey),
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `Scene keyword: ${params.sceneKeyword}\nPrimary subject query: ${base.query}\nKind: ${base.kind}`,
        },
      ],
      temperature: 0.2,
      max_tokens: 400,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) return [base];
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) return [base];
  try {
    return parseSubjectFanOutTargets(parseJsonObjectFromModelText(content), base, maxSubject);
  } catch {
    return [base];
  }
}


export async function classifyImageGroundingTargets(params: {
  apiKey: string;
  model?: string;
  context: ImageReferenceResearchContext;
}): Promise<ImageGroundingClassification> {
  const apiKey = params.apiKey.trim();
  if (!apiKey) throw new Error("OpenRouter API key not found");
  /** Reasoning research models (e.g. DeepSeek) often ignore JSON mode; meta model handles json_object reliably. */
  const model = getMetaModel();
  const c = params.context;
  const lines: string[] = [];
  if (c.title?.trim()) lines.push(`Title: ${c.title.trim()}`);
  if (c.purpose?.trim()) lines.push(`Purpose: ${c.purpose.trim()}`);
  if (c.sectionHeader?.trim()) lines.push(`Section: ${c.sectionHeader.trim()}`);
  if (c.sectionContent?.trim()) {
    lines.push(`Section content: ${c.sectionContent.trim().slice(0, 800)}`);
  }
  if (c.userPrompt?.trim()) lines.push(`User prompt: ${c.userPrompt.trim().slice(0, 400)}`);
  if (c.body?.trim()) lines.push(`Body: ${c.body.trim().slice(0, 1000)}`);
  if (!lines.length) return { mode: "abstract", targets: [] };

  const system = [
    "You classify whether an AI image needs real-world Google Images reference photos for ONE coherent scene.",
    "Grounded = named places, products/brands, people/actions, or concrete how-to scenes that must look accurate.",
    "Abstract = mood, generic concepts, metaphors, or scenes that do not need a specific real entity.",
    "Return compact JSON only:",
    '{"mode":"abstract"|"grounded","targets":[{"kind":"place"|"product"|"howto"|"other","layer":"foreground"|"midground"|"background","query":"google images query","role":"why this ref","location_name":"Canada"|"United States"|"United Kingdom"|"Australia"}]}',
    `Max ${IMAGE_REF_MAX_TARGETS} targets. Prefer subject + setting when both are named.`,
    "Think like a photograph: foreground = movable subject (person, vehicle, product); background = fixed setting (place).",
    "CRITICAL: if the text names a person/action (person running, jogger, runner), emit a foreground target kind other with a searchable query.",
    "NAMED PERSON: if a specific real person is named (e.g. Steve Buscemi), the foreground query MUST include that full name (e.g. \"Steve Buscemi riding Segway\"). Do not drop the name for a generic stand-in.",
    "Only include entities EXPLICITLY named in the text. Never invent extra businesses or landmarks.",
    "CONTEXT RULE (critical): city + street + named store/building/bridge belong in ONE place/setting query together.",
    "Named stores on a street are the place itself — phrase as \"Jasper Avenue Save On Foods Edmonton\", never \"Jasper Avenue by Save On Foods\". Do not use \"by\" to detach the store from the street.",
    "Do NOT drop the foreground subject when a place is also named.",
    "Return ONLY one JSON object. No prose, markdown, code fences, or explanation before or after the JSON.",
    'Example: "person running across high level bridge when it is about to rain" →',
    '{"mode":"grounded","targets":[{"kind":"other","layer":"foreground","query":"person running jogging","role":"foreground runner","location_name":"United States"},{"kind":"place","layer":"background","query":"High Level Bridge Edmonton pedestrian walkway","role":"bridge setting","location_name":"Canada"}]}',
    'Example: "Steve Buscemi riding a Segway on Whyte Avenue Edmonton" →',
    '{"mode":"grounded","targets":[{"kind":"other","layer":"foreground","query":"Steve Buscemi riding Segway","role":"named person subject","location_name":"United States"},{"kind":"place","layer":"background","query":"Whyte Avenue Edmonton street view","role":"street setting","location_name":"Canada"}]}',
    'Example: "cyber truck in downtown edmonton jasper ave save on foods" →',
    '{"mode":"grounded","targets":[{"kind":"product","layer":"foreground","query":"Tesla Cybertruck","role":"foreground vehicle","location_name":"United States"},{"kind":"place","layer":"background","query":"Jasper Avenue Save On Foods Edmonton","role":"street setting","location_name":"Canada"}]}',
    "Set location_name to the country that best matches the place (Canada for Edmonton, etc.). Subject-only searches may use United States.",
    'If abstract, return {"mode":"abstract","targets":[]}.',
  ].join(" ");

  const { content, parsed } = await callOpenRouterChatCompletion({
    apiKey,
    model,
    system,
    user: `Classify grounding needs. Reply with JSON only.\n\n${lines.join("\n")}`,
    temperature: 0,
    maxTokens: 800,
    responseFormat: IMAGE_GROUNDING_CLASSIFICATION_RESPONSE_FORMAT,
  });
  return groundingClassificationFromModelPayload({ parsed, content });
}


function buildContextLines(
  c: ImageReferenceResearchContext,
  options?: { maxBodyChars?: number; maxSectionChars?: number },
): string[] {
  const maxBody = options?.maxBodyChars;
  const maxSection = options?.maxSectionChars ?? 800;
  const lines: string[] = [];
  if (c.title?.trim()) lines.push(`Title: ${c.title.trim()}`);
  if (c.purpose?.trim()) lines.push(`Purpose: ${c.purpose.trim()}`);
  if (c.sectionHeader?.trim()) lines.push(`Section: ${c.sectionHeader.trim()}`);
  if (c.sectionContent?.trim()) {
    const section = c.sectionContent.trim();
    lines.push(
      `Section content: ${
        section.length > maxSection ? `${section.slice(0, maxSection)}...` : section
      }`,
    );
  }
  if (c.userPrompt?.trim()) lines.push(`User prompt: ${c.userPrompt.trim()}`);
  if (c.body?.trim()) {
    const body = c.body.trim();
    if (maxBody === 0 || maxBody === undefined) {
      lines.push(`Body: ${body}`);
    } else {
      lines.push(
        `Body: ${body.length > maxBody ? `${body.slice(0, maxBody)}...` : body}`,
      );
    }
  }
  return lines;
}

/** Never throw: bad model JSON must not block featured image generation. */

function safeParseImageEvidencePlan(
  content: string,
  logLabel: string,
): ImageEvidencePlan {
  try {
    return parseImageEvidenceNeeds(parseJsonObjectFromModelText(content));
  } catch (err) {
    const parseError = err instanceof Error ? err.message : String(err);
    logFeaturedImagePipeline(`Google Image: evidence plan parse skipped (${logLabel})`, {
      parseError,
    });
    return { mode: "abstract", needs: [] };
  }
}

/**
 * Solo intent planner: read the keyword, decide what visual evidence is needed,
 * how many Google queries, and how many photos per need (no fixed quotas).
 */

export async function planImageEvidenceNeeds(params: {
  apiKey: string;
  model?: string;
  context: ImageReferenceResearchContext;
}): Promise<ImageEvidencePlan> {
  const apiKey = params.apiKey.trim();
  if (!apiKey) throw new Error("OpenRouter API key not found");
  const model = params.model || getResearchModel();
  const lines = buildContextLines(params.context, { maxBodyChars: 1000 });
  if (!lines.length) return { mode: "abstract", needs: [] };

  const system = [
    "You plan Google Images evidence for ONE photorealistic scene from the user keyword.",
    "First infer intent: what must be visually true for the final photo to match the keyword.",
    "Then decide which Google Images searches and how many photos per search are needed. You choose the volume — there is no fixed quota.",
    "Return compact JSON only:",
    '{"mode":"abstract"|"grounded","needs":[{"kind":"place"|"product"|"howto"|"other","layer":"foreground"|"midground"|"background","query":"google images search query","role":"short why","location_name":"Canada"|"United States"|"United Kingdom"|"Australia","acceptanceBrief":"what must be visibly true","pickCount":1}]}',
    "pickCount = how many distinct photos to keep for that need (integer >= 1). Set higher when more angles help.",
    "Grounded = named places, products, people, or concrete scenes. Abstract = mood/metaphor with no specific entity.",
    "Only entities EXPLICITLY named in the text. Never invent businesses or landmarks.",
    "Named store on a street: query as street + store + city together (e.g. \"Jasper Avenue Save On Foods Edmonton\"). Never \"Avenue by StoreName\".",
    "GOOGLE-USER SEARCH RULE: write queries how a real person would type them into Google Images.",
    "When product/equipment/detail is named together with a place, keep place + product in the SAME query (e.g. \"Evolve Strength downtown Edmonton squat rack\"). Never emit a bare generic product query that drops the named place.",
    "Named person: include a need whose acceptanceBrief requires that person's recognizable face when identity matters.",
    "When an action/howto is named separately from a product, keep them as separate needs when useful (action pose vs place-bound product).",
    "acceptanceBrief must state what THIS need requires based on keyword intent only. Anything not implied by the keyword is out of scope for that need.",
    "Do NOT list global reject category blacklists. Relevance is decided later per photo against acceptanceBrief + keyword intent + metadata place match.",
    "Set location_name to the country that best matches the place (Canada for Edmonton). Subject-only may use United States.",
    'Example keyword "person squatting in evolve strength downtown at a squat rack" →',
    '{"mode":"grounded","needs":[{"kind":"place","layer":"background","query":"Evolve Strength downtown Edmonton gym interior","role":"named gym","location_name":"Canada","acceptanceBrief":"Must show Evolve Strength gym interior identity.","pickCount":2},{"kind":"product","layer":"midground","query":"Evolve Strength downtown Edmonton squat rack","role":"rack at that gym","location_name":"Canada","acceptanceBrief":"Must show a squat rack at Evolve Strength (that gym). A generic unrelated gym rack does not satisfy.","pickCount":2},{"kind":"other","layer":"foreground","query":"person squatting barbell back squat","role":"squat action","location_name":"United States","acceptanceBrief":"Must show a person performing a squat as required by the keyword.","pickCount":1}]}',
    'Example keyword "tesla cyber truck in downtown edmonton on jasper ave safeway" →',
    '{"mode":"grounded","needs":[{"kind":"product","layer":"foreground","query":"Tesla Cybertruck","role":"vehicle identity","location_name":"United States","acceptanceBrief":"Must show the named vehicle clearly. Details not implied by the keyword are out of scope.","pickCount":1},{"kind":"place","layer":"background","query":"Safeway Jasper Avenue Edmonton exterior","role":"storefront place","location_name":"Canada","acceptanceBrief":"Must show the named store at the named street/city.","pickCount":2}]}',
  ].join(" ");

  const res = await postOpenRouterAppChatFetch( {
    method: "POST",
    headers: openRouterWebAppHeaders(apiKey),
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `Plan visual evidence needs for this keyword/context:\n\n${lines.join("\n")}`,
        },
      ],
      temperature: 0.2,
      max_tokens: 1200,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Evidence plan failed ${res.status}: ${errText.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    return { mode: "abstract", needs: [] };
  }
  return safeParseImageEvidencePlan(content, "solo");
}

/** Featured blog/service images: plan DataForSEO Google Images evidence (install context required). */
export async function planFeaturedImageEvidenceNeeds(params: {
  apiKey: string;
  model?: string;
  context: ImageReferenceResearchContext;
}): Promise<ImageEvidencePlan> {
  const apiKey = params.apiKey.trim();
  if (!apiKey) throw new Error("OpenRouter API key not found");
  const lines = buildContextLines(params.context, { maxBodyChars: 0 });
  if (!lines.length) {
    return { mode: "abstract", needs: [] };
  }

  const system = [
    "You plan Google Images evidence for ONE WordPress FEATURED blog image (photoreal, 16:9).",
    "Default to grounded mode. Use abstract ONLY when the article is pure metaphor with zero physical subject to photograph.",
    "Home services, products, repairs, installations, equipment, and window/door/HVAC topics MUST be grounded.",
    "Write queries exactly how a user types them into Google Images.",
    "acceptanceBrief MUST require correct install context (e.g. blinds need visible window frame and glazing, not blinds on bare drywall).",
    "Return compact JSON only:",
    '{"mode":"abstract"|"grounded","needs":[{"kind":"place"|"product"|"howto"|"other","layer":"foreground"|"midground"|"background","query":"google images search query","role":"short why","location_name":"Canada"|"United States"|"United Kingdom"|"Australia","acceptanceBrief":"what must be visibly true","pickCount":1}]}',
    "pickCount = integer >= 1. Max 3 needs total.",
    'Example title "Window blind repair" →',
    '{"mode":"grounded","needs":[{"kind":"howto","layer":"midground","query":"white window blinds installed in window frame living room","role":"in-context install","location_name":"United States","acceptanceBrief":"Must show blinds mounted in a real window with frame and glazing; not blinds on solid wall alone.","pickCount":2}]}',
    "Return ONLY one JSON object.",
  ].join(" ");

  const systemWithTopicRules = isWindowTreatmentImageContext(lines.join("\n"))
    ? `${system} ${WINDOW_TREATMENT_IMAGE_PROMPT_RULES}`
    : system;

  /** Meta model + json_schema: DeepSeek often breaks json_object on long featured context. */
  const planModel = getMetaModel();
  try {
    const { content, parsed } = await callOpenRouterChatCompletion({
      apiKey,
      model: planModel,
      system: systemWithTopicRules,
      user: `Plan featured-image Google Images evidence:\n\n${lines.join("\n")}`,
      temperature: 0,
      maxTokens: 1200,
      responseFormat: IMAGE_EVIDENCE_PLAN_RESPONSE_FORMAT,
    });
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parseImageEvidenceNeeds(parsed);
    }
    if (typeof content === "string" && content.trim()) {
      return safeParseImageEvidencePlan(content, "featured");
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    logFeaturedImagePipeline("Google Image: evidence plan LLM failed (continuing without refs)", {
      model: planModel,
      error: detail,
    });
  }
  return { mode: "abstract", needs: [] };
}
