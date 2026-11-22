import { createClient } from "npm:@supabase/supabase-js@2";

const PROJECT_URL = Deno.env.get("SUPABASE_URL")!;
const SECRET_KEYS = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
const SERVICE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? SECRET_KEYS.default;

const SITE_ORIGIN = "https://ahmadwebworks.github.io";

if (!PROJECT_URL || !SERVICE_KEY) {
  throw new Error("Supabase server credentials are not available.");
}

const admin = createClient(PROJECT_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const corsHeaders = {
  "Access-Control-Allow-Origin": SITE_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin"
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

function clean(value: unknown, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  const origin = req.headers.get("origin");
  if (origin && origin !== SITE_ORIGIN) {
    return json({ error: "Origin not allowed." }, 403);
  }

  if (!req.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return json({ error: "A JSON request is required." }, 415);
  }

  try {
    const body = await req.json();

    const applicant_name = clean(body.applicant_name, 100);
    const email = clean(body.email, 254).toLowerCase();
    const preferred_role = clean(body.preferred_role, 100);
    const location = clean(body.location, 150);
    const introduction = clean(body.introduction, 3000);
    const portfolio_url = clean(body.portfolio_url, 2048) || null;

    const skills = Array.isArray(body.skills)
      ? body.skills.slice(0, 30).map((skill: unknown) => clean(skill, 60)).filter(Boolean)
      : [];

    if (applicant_name.length < 2) {
      return json({ error: "Name must be between 2 and 100 characters." }, 400);
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: "Enter a valid email address." }, 400);
    }

    if (preferred_role.length < 2) {
      return json({ error: "Please enter your preferred role." }, 400);
    }

    if (introduction.length < 5) {
      return json({ error: "Please add a short introduction or experience summary." }, 400);
    }

    if (portfolio_url) {
      try {
        const parsed = new URL(portfolio_url);
        if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Invalid protocol");
      } catch {
        return json({ error: "Portfolio link must be a valid HTTP or HTTPS URL." }, 400);
      }
    }

    const { data, error } = await admin
      .from("employee_applications")
      .insert({
        applicant_name,
        email,
        preferred_role,
        location,
        skills,
        introduction,
        portfolio_url
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "P0001") {
        return json({ error: "An application from this email was submitted recently. Please wait 10 minutes before trying again." }, 429);
      }

      console.error("Application intake database error:", error.message);
      return json({ error: "We couldn't save your application. Please try again later." }, 500);
    }

    return json({ ok: true, application_id: data.id });
  } catch (error) {
    console.error("Application intake error:", error);
    return json({ error: "The application could not be processed. Please try again." }, 500);
  }
});
