import { createClient } from "npm:@supabase/supabase-js@2";
import "./assistant-engine.js";

type KnowledgeRecord = {
  id: string; category: string; title: string; content: string;
  keywords: string[]; status: string; is_public: boolean; priority: number;
};
type HistoryItem = { role: string; content: string };
type EngineResult = {
  answer: string; intent: string | null; confidence: number;
  matchedKnowledgeIds: string[]; grounded: boolean;
};

const allowedOrigins = new Set([
  "https://ahmadwebworks.github.io",
  "https://rawcdn.githack.com"
]);
const CONSENT_VERSION = "2026-11-25-v1";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[+0-9() .-]{7,25}$/;

function headersFor(origin: string | null): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    "Vary": "Origin",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "apikey, content-type, x-client-info",
    "Access-Control-Max-Age": "86400"
  };
  if (origin && allowedOrigins.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function respond(body: Record<string, unknown>, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: headersFor(origin) });
}

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function safeSourcePage(value: unknown): string | null {
  const raw = cleanText(value, 600);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (!allowedOrigins.has(url.origin)) return null;
    return url.origin + url.pathname;
  } catch {
    return null;
  }
}

function getAdminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const secretMapRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
  let secretKey = "";
  if (secretMapRaw) {
    try { secretKey = JSON.parse(secretMapRaw).default || ""; } catch { /* handled below */ }
  }
  if (!secretKey) secretKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !secretKey) throw new Error("Backend credentials are not configured");
  return createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function checkPublicKey(req: Request): boolean {
  const raw = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (!raw) return false;
  try {
    const expected = JSON.parse(raw).default;
    return Boolean(expected && req.headers.get("apikey") === expected);
  } catch {
    return false;
  }
}

async function getOrCreateSession(supabase: ReturnType<typeof getAdminClient>, requestedId: unknown) {
  const candidate = cleanText(requestedId, 64);
  if (candidate && UUID_RE.test(candidate)) {
    const { data, error } = await supabase
      .from("assistant_sessions").select("id").eq("id", candidate).maybeSingle();
    if (error) throw error;
    if (data?.id) {
      await supabase.from("assistant_sessions")
        .update({ last_activity_at: new Date().toISOString() }).eq("id", candidate);
      return candidate;
    }
  }
  const { data, error } = await supabase.from("assistant_sessions")
    .insert({}).select("id").single();
  if (error || !data?.id) throw error || new Error("Session could not be created");
  return data.id as string;
}

async function enforceRateLimit(supabase: ReturnType<typeof getAdminClient>, sessionId: string, table: "assistant_messages" | "assistant_leads", limit: number, windowMinutes: number) {
  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();
  const { count, error } = await supabase.from(table)
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .gte("created_at", since);
  if (error) throw error;
  return (count || 0) < limit;
}

async function handleChat(supabase: ReturnType<typeof getAdminClient>, body: Record<string, unknown>) {
  const message = cleanText(body.message, 1000);
  if (message.length < 1) return { status: 400, body: { ok: false, error: "Please enter a question." } };
  const sessionId = await getOrCreateSession(supabase, body.sessionId);

  if (!await enforceRateLimit(supabase, sessionId, "assistant_messages", 12, 1)) {
    return { status: 429, body: { ok: false, error: "You've sent several messages. Please wait a minute and try again.", sessionId } };
  }

  const { data: recent, error: historyError } = await supabase.from("assistant_messages")
    .select("role,content").eq("session_id", sessionId)
    .order("created_at", { ascending: false }).limit(12);
  if (historyError) throw historyError;

  const { error: userInsertError } = await supabase.from("assistant_messages")
    .insert({ session_id: sessionId, role: "user", content: message });
  if (userInsertError) throw userInsertError;

  const { data: knowledge, error: knowledgeError } = await supabase.from("assistant_knowledge")
    .select("id,category,title,content,keywords,status,is_public,priority")
    .eq("status", "approved").eq("is_public", true)
    .order("priority", { ascending: false }).limit(100);
  if (knowledgeError) throw knowledgeError;

  const engine = (globalThis as typeof globalThis & {
    AWAssistantEngine?: { answerQuestion: (options: {
      question: string; knowledge: KnowledgeRecord[]; history: HistoryItem[];
    }) => EngineResult };
  }).AWAssistantEngine;
  if (!engine?.answerQuestion) throw new Error("Assistant engine is unavailable");

  const history = (recent || []).reverse() as HistoryItem[];
  const result = engine.answerQuestion({
    question: message,
    knowledge: (knowledge || []) as KnowledgeRecord[],
    history
  });

  const matchedIds = (result.matchedKnowledgeIds || []).filter((id) => UUID_RE.test(id));
  const { error: assistantInsertError } = await supabase.from("assistant_messages")
    .insert({
      session_id: sessionId,
      role: "assistant",
      content: result.answer.slice(0, 5000),
      matched_knowledge_ids: matchedIds
    });
  if (assistantInsertError) throw assistantInsertError;

  return {
    status: 200,
    body: {
      ok: true, sessionId, answer: result.answer, intent: result.intent,
      confidence: result.confidence, grounded: true
    }
  };
}

async function handleLead(supabase: ReturnType<typeof getAdminClient>, body: Record<string, unknown>) {
  const name = cleanText(body.name, 120);
  const email = cleanText(body.email, 254).toLowerCase();
  const phone = cleanText(body.phone, 25);
  const businessName = cleanText(body.businessName, 120);
  const serviceInterest = cleanText(body.serviceInterest, 120);
  const budgetRange = cleanText(body.budgetRange, 80);
  const projectDetails = cleanText(body.projectDetails, 5000);
  const existingWebsite = cleanText(body.existingWebsite, 300);
  const preferredContact = cleanText(body.preferredContact, 20) || "either";
  const consent = body.consent === true;
  const sessionId = await getOrCreateSession(supabase, body.sessionId);

  if (name.length < 2 || projectDetails.length < 10) {
    return { status: 400, body: { ok: false, error: "Please provide your name and a little more detail about the project." } };
  }
  if (!consent) return { status: 400, body: { ok: false, error: "Please give consent before submitting your project inquiry." } };
  if ((!email && !phone) || (email && !EMAIL_RE.test(email)) || (phone && !PHONE_RE.test(phone))) {
    return { status: 400, body: { ok: false, error: "Please provide a valid email address or phone number." } };
  }
  if (!["email", "whatsapp", "either"].includes(preferredContact)) {
    return { status: 400, body: { ok: false, error: "Please choose a valid contact preference." } };
  }
  if (preferredContact === "email" && !email) {
    return { status: 400, body: { ok: false, error: "Please add an email address for email contact." } };
  }
  if (preferredContact === "whatsapp" && !phone) {
    return { status: 400, body: { ok: false, error: "Please add a phone number for WhatsApp contact." } };
  }
  if (!await enforceRateLimit(supabase, sessionId, "assistant_leads", 3, 10)) {
    return { status: 429, body: { ok: false, error: "Too many inquiries were submitted from this chat. Please try again later." } };
  }

  const { data, error } = await supabase.from("assistant_leads").insert({
    session_id: sessionId, name, email: email || null, phone: phone || null,
    business_name: businessName || null, service_interest: serviceInterest || null,
    budget_range: budgetRange || null, project_details: projectDetails,
    existing_website: existingWebsite || null, preferred_contact: preferredContact,
    consent: true, consent_text_version: CONSENT_VERSION,
    source_page: safeSourcePage(body.sourcePage), status: "new"
  }).select("id").single();
  if (error || !data?.id) throw error || new Error("Inquiry could not be saved");

  return { status: 201, body: { ok: true, leadId: data.id, message: "Your project inquiry has been received. The Ahmad WebWorks team will follow up using your preferred contact method." } };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const headers = headersFor(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }
  if (req.method !== "POST") return respond({ ok: false, error: "Method not allowed." }, 405, origin);
  if (origin && !allowedOrigins.has(origin)) return respond({ ok: false, error: "Origin not allowed." }, 403, origin);
  if (!checkPublicKey(req)) return respond({ ok: false, error: "Request could not be authenticated." }, 401, origin);

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > 12_000) return respond({ ok: false, error: "Request is too large." }, 413, origin);

  try {
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return respond({ ok: false, error: "Invalid request." }, 400, origin);
    }
    const supabase = getAdminClient();
    const action = cleanText(body.action, 20);
    const result = action === "chat"
      ? await handleChat(supabase, body)
      : action === "lead"
        ? await handleLead(supabase, body)
        : { status: 400, body: { ok: false, error: "Unknown action." } };
    return respond(result.body, result.status, origin);
  } catch (error) {
    console.error("aw-assistant request failed", error instanceof Error ? error.message : "unknown error");
    return respond({ ok: false, error: "The assistant is temporarily unavailable. Please try again or contact us on WhatsApp." }, 500, origin);
  }
});
