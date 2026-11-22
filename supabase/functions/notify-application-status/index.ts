import { createClient } from "npm:@supabase/supabase-js@2";

const PROJECT_URL = Deno.env.get("SUPABASE_URL")!;
const SECRET_KEYS = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? SECRET_KEYS.default;
const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
const SITE_ORIGIN = "https://ahmadwebworks.github.io";
const PREVIEW_ORIGIN = "https://rawcdn.githack.com";
const ALLOWED_ORIGINS = new Set([SITE_ORIGIN, PREVIEW_ORIGIN]);

if (!PROJECT_URL || !SERVICE_KEY) throw new Error("Supabase server credentials are not available.");

const admin = createClient(PROJECT_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const corsHeaders = {
  "Access-Control-Allow-Origin": SITE_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin"
};

function json(data: unknown, status = 200, origin?: string | null) {
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : SITE_ORIGIN;
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Access-Control-Allow-Origin": allowOrigin, "Content-Type": "application/json" }
  });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const respond = (data: unknown, status = 200) => json(data, status, origin);

  if (req.method === "OPTIONS") return new Response("ok", { headers: { ...corsHeaders, "Access-Control-Allow-Origin": origin && ALLOWED_ORIGINS.has(origin) ? origin : SITE_ORIGIN } });
  if (req.method !== "POST") return respond({ error: "Method not allowed." }, 405);
  if (origin && !ALLOWED_ORIGINS.has(origin)) return respond({ error: "Origin not allowed." }, 403);

  try {
    const authorization = req.headers.get("authorization") ?? "";
    const token = authorization.replace(/^Bearer\s+/i, "");
    if (!token || token === authorization) return respond({ error: "A valid sign-in session is required." }, 401);

    const body = await req.json();

    // Public transactional receipt: only sends once for a newly stored application.
    // The application ID is looked up server-side; the caller cannot choose a recipient.
    if (body.action === "application_received") {
      const applicationId = String(body.application_id ?? "");
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(applicationId)) {
        return respond({ error: "A valid application ID is required." }, 400);
      }
      if (!BREVO_API_KEY) return respond({ error: "Email service is not configured." }, 503);

      const { data: application, error: applicationError } = await admin
        .from("employee_applications")
        .select("id,applicant_name,email,status")
        .eq("id", applicationId)
        .maybeSingle();

      if (applicationError || !application) return respond({ error: "Application not found." }, 404);
      if (application.status !== "new" || !application.email ||
          !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(application.email)) {
        return respond({ error: "Only a new application with a valid email can receive a receipt." }, 409);
      }

      const recipient = application.email.trim().toLowerCase();
      const templateId = 1;

      const { data: existing, error: existingError } = await admin
        .from("employee_application_email_logs")
        .select("id,status")
        .eq("application_id", applicationId)
        .eq("template_id", templateId)
        .maybeSingle();

      if (existingError) return respond({ error: "Could not check the email log." }, 500);
      if (existing) return respond({ ok: true, already_processed: true, message: "Application receipt already processed. No duplicate email was sent." });

      // Basic abuse guard: at most one receipt per email address in 24 hours.
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count: recentCount, error: recentError } = await admin
        .from("employee_application_email_logs")
        .select("id", { count: "exact", head: true })
        .eq("template_id", templateId)
        .eq("recipient_email", recipient)
        .gte("created_at", since);

      if (recentError) return respond({ error: "Could not verify the recent email limit." }, 500);
      if ((recentCount ?? 0) >= 1) {
        return respond({ ok: false, rate_limited: true, message: "A receipt email was already processed for this address in the last 24 hours." }, 429);
      }

      const templateResponse = await fetch(
        `https://api.brevo.com/v3/smtp/templates/${templateId}`,
        { headers: { "accept": "application/json", "api-key": BREVO_API_KEY } }
      );
      const templateInfo = await templateResponse.json().catch(() => ({}));
      if (!templateResponse.ok || templateInfo.isActive !== true) {
        return respond({ error: "The application receipt template is unavailable or inactive." }, 409);
      }

      const { data: log, error: logError } = await admin
        .from("employee_application_email_logs")
        .insert({
          application_id: applicationId,
          template_id: templateId,
          recipient_email: recipient,
          status: "pending"
        })
        .select("id")
        .single();

      if (logError || !log) {
        return respond({ error: "Could not reserve the receipt email. Refresh and check before retrying." }, 409);
      }

      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "accept": "application/json",
          "api-key": BREVO_API_KEY,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          to: [{ email: recipient, name: application.applicant_name }],
          templateId,
          params: { applicant_name: application.applicant_name }
        })
      });

      const responseBody = await response.json().catch(() => ({}));
      if (!response.ok) {
        const safeError = String(responseBody.message ?? responseBody.code ?? "Brevo rejected the request.").slice(0, 500);
        await admin.from("employee_application_email_logs")
          .update({ status: "failed", error_message: safeError })
          .eq("id", log.id);
        return respond({ ok: false, error: safeError }, 502);
      }

      const { error: sentLogError } = await admin
        .from("employee_application_email_logs")
        .update({
          status: "sent",
          provider_message_id: responseBody.messageId ?? null,
          sent_at: new Date().toISOString(),
          error_message: null
        })
        .eq("id", log.id);

      if (sentLogError) {
        console.error("Brevo accepted receipt email, but logging failed:", sentLogError.message);
        return respond({ ok: true, warning: "Receipt email accepted, but its log update failed. Do not retry automatically." });
      }
      return respond({ ok: true, message: "Application receipt email sent." });
    }

    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return respond({ error: "Your session is invalid or expired." }, 401);

    const { data: caller, error: callerError } = await admin
      .from("profiles").select("role,account_status").eq("id", authData.user.id).maybeSingle();

    if (callerError || !caller || caller.role !== "admin" || caller.account_status !== "active") {
      return respond({ error: "Only an active Founder administrator can send application status emails." }, 403);
    }

    if (!BREVO_API_KEY) return respond({ error: "BREVO_API_KEY is not configured in Supabase Edge Function secrets." }, 503);

    // Safe diagnostic: verify the Brevo API key can read template 2.
    // This branch never creates a delivery log and never sends an email.
    if (body.action === "diagnose_brevo") {
      const templateId = 2;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);
      const startedAt = Date.now();

      console.log("BREVO_DIAG: template lookup started", { templateId });

      try {
        const check = await fetch(
          `https://api.brevo.com/v3/smtp/templates/${templateId}`,
          {
            headers: { "accept": "application/json", "api-key": BREVO_API_KEY },
            signal: controller.signal
          }
        );

        const responseText = await check.text();
        let templateInfo: Record<string, unknown> = {};

        try {
          templateInfo = responseText ? JSON.parse(responseText) : {};
        } catch {
          templateInfo = {};
        }

        console.log("BREVO_DIAG: template lookup completed", {
          httpStatus: check.status,
          elapsedMs: Date.now() - startedAt
        });

        return respond({
          ok: check.ok,
          stage: "template_lookup",
          http_status: check.status,
          template_id: templateId,
          template_active: templateInfo.isActive === true,
          elapsed_ms: Date.now() - startedAt,
          error: check.ok ? null : "Brevo API rejected the template lookup."
        });
      } catch (diagnosticError) {
        console.error("BREVO_DIAG: template lookup failed", {
          name: diagnosticError instanceof Error ? diagnosticError.name : "UnknownError",
          elapsedMs: Date.now() - startedAt
        });

        return respond({
          ok: false,
          stage: "template_lookup",
          error: diagnosticError instanceof Error && diagnosticError.name === "AbortError"
            ? "Brevo API request timed out."
            : "Could not connect to the Brevo API.",
          elapsed_ms: Date.now() - startedAt
        });
      } finally {
        clearTimeout(timeout);
      }
    }
    const applicationId = String(body.application_id ?? "");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(applicationId)) {
      return respond({ error: "A valid application ID is required." }, 400);
    }

    const { data: application, error: applicationError } = await admin
      .from("employee_applications").select("id,applicant_name,email,status")
      .eq("id", applicationId).maybeSingle();

    if (applicationError || !application) return respond({ error: "Application not found." }, 404);
    if (!["approved", "rejected"].includes(application.status)) {
      return respond({ error: "Only approved or rejected applications can receive a status email." }, 409);
    }
    if (!application.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(application.email)) {
      return respond({ error: "The application does not contain a valid applicant email." }, 400);
    }

    const templateId = application.status === "approved" ? 2 : 3;
    const recipient = application.email.trim().toLowerCase();

    // Never send through a template until an administrator activates it in Brevo.
    const templateResponse = await fetch(`https://api.brevo.com/v3/smtp/templates/${templateId}`, {
      headers: { "accept": "application/json", "api-key": BREVO_API_KEY }
    });
    const templateInfo = await templateResponse.json().catch(() => ({}));
    if (!templateResponse.ok) return respond({ error: "Could not verify the Brevo template status." }, 502);
    if (templateInfo.isActive !== true) {
      return respond({ error: `Brevo template ${templateId} is inactive. Activate it in Brevo before sending.` }, 409);
    }

    const { data: existing, error: existingError } = await admin
      .from("employee_application_email_logs").select("id,status,provider_message_id")
      .eq("application_id", applicationId).eq("template_id", templateId).maybeSingle();

    if (existingError) return respond({ error: "Could not check the email delivery log." }, 500);
    if (existing?.status === "sent") return respond({ ok: true, already_sent: true, message: "This status email has already been sent." });
    if (existing?.status === "pending") return respond({ error: "A status email for this application is already being processed. Check the delivery log before retrying." }, 409);

    let logId: string;
    if (existing?.id) {
      const { data: resetLog, error: resetError } = await admin
        .from("employee_application_email_logs")
        .update({ status: "pending", recipient_email: recipient, error_message: null, provider_message_id: null, sent_at: null })
        .eq("id", existing.id).eq("status", "failed").select("id").maybeSingle();
      if (resetError || !resetLog) return respond({ error: "The previous email attempt changed. Refresh and check its status before retrying." }, 409);
      logId = resetLog.id;
    } else {
      const { data: newLog, error: insertError } = await admin
        .from("employee_application_email_logs")
        .insert({ application_id: applicationId, template_id: templateId, recipient_email: recipient, status: "pending" })
        .select("id").maybeSingle();
      if (insertError || !newLog) return respond({ error: "Could not reserve a delivery log for this email. Refresh and check before retrying." }, 409);
      logId = newLog.id;
    }

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "accept": "application/json", "api-key": BREVO_API_KEY, "content-type": "application/json" },
      body: JSON.stringify({
        to: [{ email: recipient, name: application.applicant_name }],
        templateId,
        params: { applicant_name: application.applicant_name }
      })
    });

    const responseBody = await response.json().catch(() => ({}));
    if (!response.ok) {
      const safeError = String(responseBody.message ?? responseBody.code ?? "Brevo rejected the request.").slice(0, 500);
      await admin.from("employee_application_email_logs").update({ status: "failed", error_message: safeError }).eq("id", logId);
      return respond({ error: safeError, template_id: templateId }, 502);
    }

    const { error: sentLogError } = await admin.from("employee_application_email_logs")
      .update({ status: "sent", provider_message_id: responseBody.messageId ?? null, sent_at: new Date().toISOString(), error_message: null })
      .eq("id", logId);

    if (sentLogError) {
      console.error("Brevo accepted the email, but delivery logging failed.", sentLogError.message);
      return respond({ ok: true, warning: "Brevo accepted the email, but the delivery log update failed. Do not resend until checked." });
    }
    return respond({ ok: true, template_id: templateId, message: "Application status email sent." });
  } catch (error) {
    console.error("notify-application-status:", error);
    return respond({ error: "The status email could not be processed. Check Edge Function logs." }, 500);
  }
});