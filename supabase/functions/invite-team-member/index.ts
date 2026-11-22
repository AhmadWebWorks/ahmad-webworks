import { createClient } from "npm:@supabase/supabase-js@2";

const PROJECT_URL = Deno.env.get("SUPABASE_URL")!;
const SECRET_KEYS = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
// Prefer the legacy service-role JWT for supabase-js v2 admin calls.
// Secret API keys are not JWTs and must not be sent as Authorization: Bearer.
const SERVICE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? SECRET_KEYS.default;
const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");

if (!PROJECT_URL || !SERVICE_KEY) {
  throw new Error("Supabase server credentials are not available.");
}

const admin = createClient(PROJECT_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

/* Public key + caller JWT: database writes retain the signed-in Founder's auth.uid(). */
const PUBLIC_KEY =
  Deno.env.get("SUPABASE_ANON_KEY") ??
  "sb_publishable_egeeneg2jGd6y2yotB_Bdw_FR2XMVJB";

const SITE_ORIGIN = "https://ahmadwebworks.github.io";
const PORTAL_URL = "https://ahmadwebworks.github.io/ahmad-webworks/portal.html?flow=invite";

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

  try {
    const authorization = req.headers.get("authorization") ?? "";
    const token = authorization.replace(/^Bearer\s+/i, "");
    if (!token || token === authorization) {
      return json({ error: "A valid sign-in session is required." }, 401);
    }

    const { data: authData, error: authError } =
      await admin.auth.getUser(token);

    if (authError || !authData.user) {
      return json({ error: "Your session is invalid or expired." }, 401);
    }

    const callerId = authData.user.id;
    const { data: caller, error: callerError } = await admin
      .from("profiles")
      .select("role,account_status")
      .eq("id", callerId)
      .maybeSingle();

    if (
      callerError ||
      !caller ||
      caller.role !== "admin" ||
      caller.account_status !== "active"
    ) {
      return json({ error: "Only an active Founder administrator can invite team members." }, 403);
    }

    // Use the actual signed-in Founder JWT for RLS + auth.uid()-guarded writes.
    const founderDb = createClient(PROJECT_URL, PUBLIC_KEY, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const body = await req.json();
    const action = String(body.action ?? "");

    if (action === "repair_invitation_tracking") {
      const applicationId = String(body.application_id ?? "");
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(applicationId)) {
        return json({ error: "A valid application ID is required." }, 400);
      }

      const { data: application, error: applicationError } = await admin
        .from("employee_applications")
        .select("id,applicant_name,email,status,invited_at")
        .eq("id", applicationId)
        .maybeSingle();

      if (applicationError || !application) return json({ error: "Application not found." }, 404);
      if (application.status !== "approved" || !application.email) {
        return json({ error: "Only approved applications with a valid email can be repaired." }, 409);
      }
      if (application.invited_at) {
        return json({ ok: true, already_recorded: true, message: "Invitation tracking is already recorded. No email was sent." });
      }

      // Find the account created by the earlier successful Auth invitation.
      const { data: userPage, error: usersError } = await admin.auth.admin.listUsers({
        page: 1,
        perPage: 1000
      });
      if (usersError) {
        console.error("Invitation repair account lookup failed:", usersError.message);
        return json({ error: "Could not verify the existing account. No email was sent." }, 500);
      }

      const target = userPage.users.find(
        u => (u.email ?? "").trim().toLowerCase() === application.email.trim().toLowerCase()
      );
      if (!target) {
        return json({ error: "No existing Supabase account was found for this email. No email was sent; use the normal invitation action only if this applicant has never been invited." }, 404);
      }

      const { data: targetProfile, error: targetProfileError } = await admin
        .from("profiles")
        .select("role,account_status")
        .eq("id", target.id)
        .maybeSingle();

      if (targetProfileError || !targetProfile || targetProfile.role !== "employee" ||
          !["pending", "active"].includes(targetProfile.account_status)) {
        return json({ error: "The existing account is not an eligible pending/active employee account. No email was sent." }, 409);
      }

      const { data: repaired, error: trackingError } = await founderDb
        .from("employee_applications")
        .update({
          invited_at: new Date().toISOString(),
          invited_user_id: target.id
        })
        .eq("id", applicationId)
        .is("invited_at", null)
        .select("id")
        .maybeSingle();

      if (trackingError || !repaired) {
        console.error("Invitation tracking repair failed:", trackingError?.message ?? "No row updated");
        return json({ error: "Tracking repair failed. No email was sent; check the database policy and logs." }, 500);
      }

      return json({
        ok: true,
        repaired: true,
        message: "Existing invitation account linked successfully. No email was sent."
      });
    }

    if (action === "invite_employee") {
      const applicationId = String(body.application_id ?? "");
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(applicationId)) {
        return json({ error: "A valid application ID is required." }, 400);
      }

      const { data: application, error: applicationError } = await admin
        .from("employee_applications")
        .select("id,applicant_name,email,status,invited_at")
        .eq("id", applicationId)
        .maybeSingle();

      if (applicationError || !application) {
        return json({ error: "Application not found." }, 404);
      }
      if (application.status !== "approved") {
        return json({ error: "Approve the application before sending an invitation." }, 409);
      }
      if (!application.email) {
        return json({ error: "This applicant has no email address. Ask them to provide one first." }, 400);
      }
      if (application.invited_at) {
        return json({ error: "An invitation has already been sent for this application." }, 409);
      }

      // Prevent duplicate Auth accounts and duplicate invitations for an already-created user.
      const { data: existingUsers, error: existingUsersError } = await admin.auth.admin.listUsers({
        page: 1,
        perPage: 1000
      });
      if (existingUsersError) {
        return json({ error: "Could not verify whether this applicant already has an account. No invitation was sent." }, 500);
      }
      const existingAccount = existingUsers.users.find(
        u => (u.email ?? "").trim().toLowerCase() === application.email.trim().toLowerCase()
      );
      if (existingAccount) {
        return json({ error: "A Supabase account already exists for this email. Use 'Repair Existing Invitation (no email)' if an invitation was already sent; do not send another." }, 409);
      }

      if (!BREVO_API_KEY) {
        return json({ error: "Brevo is not configured. No invitation was sent." }, 503);
      }

      const invitationTemplateId = 4;
      const templateCheck = await fetch(
        `https://api.brevo.com/v3/smtp/templates/${invitationTemplateId}`,
        { headers: { "accept": "application/json", "api-key": BREVO_API_KEY } }
      );
      const templateInfo = await templateCheck.json().catch(() => ({}));
      if (!templateCheck.ok || templateInfo.isActive !== true) {
        return json({ error: "Brevo employee invitation template #4 is unavailable or inactive. No invitation was sent." }, 409);
      }

      const { data: priorInviteLog, error: priorInviteLogError } = await admin
        .from("employee_application_email_logs")
        .select("id,status")
        .eq("application_id", applicationId)
        .eq("template_id", invitationTemplateId)
        .maybeSingle();

      if (priorInviteLogError) return json({ error: "Could not check the previous invitation email log. Do not retry until checked." }, 500);
      if (priorInviteLog) {
        return json({ error: "An invitation email attempt is already logged for this application. Do not resend; check the email log first." }, 409);
      }

      // Generate the secure Supabase invite link without sending Supabase's default email.
      const { data: generated, error: generateError } = await admin.auth.admin.generateLink({
        type: "invite",
        email: application.email.trim().toLowerCase(),
        options: {
          redirectTo: PORTAL_URL,
          data: { full_name: application.applicant_name }
        }
      });

      if (generateError || !generated?.user?.id || !generated?.properties?.action_link) {
        console.error("Employee invite link generation failed:", generateError?.message ?? "Missing action link");
        return json({ error: generateError?.message ?? "Could not generate a secure invitation link. No email was sent." }, 409);
      }

      const { data: inviteLog, error: inviteLogError } = await admin
        .from("employee_application_email_logs")
        .insert({
          application_id: applicationId,
          template_id: invitationTemplateId,
          recipient_email: application.email.trim().toLowerCase(),
          status: "pending"
        })
        .select("id")
        .single();

      if (inviteLogError || !inviteLog) {
        console.error("Employee invitation log reservation failed:", inviteLogError?.message ?? "No log row");
        return json({ error: "Could not reserve the invitation email log. Do not retry until checked." }, 409);
      }

      const inviteResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "accept": "application/json",
          "api-key": BREVO_API_KEY,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          to: [{
            email: application.email.trim().toLowerCase(),
            name: application.applicant_name
          }],
          templateId: invitationTemplateId,
          params: {
            applicant_name: application.applicant_name,
            invitation_url: generated.properties.action_link
          }
        })
      });

      const inviteResponseBody = await inviteResponse.json().catch(() => ({}));
      if (!inviteResponse.ok) {
        const safeError = String(inviteResponseBody.message ?? inviteResponseBody.code ?? "Brevo rejected the invitation email.").slice(0, 500);
        await admin.from("employee_application_email_logs")
          .update({ status: "failed", error_message: safeError })
          .eq("id", inviteLog.id);
        console.error("Employee invitation email failed:", safeError);
        return json({ error: "The account invite link was created, but Brevo did not accept the email. Check the email log; do not resend automatically." }, 502);
      }

      const { error: inviteLogUpdateError } = await admin
        .from("employee_application_email_logs")
        .update({
          status: "sent",
          provider_message_id: inviteResponseBody.messageId ?? null,
          sent_at: new Date().toISOString(),
          error_message: null
        })
        .eq("id", inviteLog.id);

      if (inviteLogUpdateError) {
        console.error("Brevo accepted invitation, but email log update failed:", inviteLogUpdateError.message);
        return json({ ok: true, warning: "Brevo accepted the invitation, but its email log update failed. Do not resend until checked." });
      }

      const { data: tracked, error: trackingError } = await founderDb
        .from("employee_applications")
        .update({
          invited_at: new Date().toISOString(),
          invited_user_id: generated.user.id
        })
        .eq("id", applicationId)
        .is("invited_at", null)
        .select("id")
        .maybeSingle();

      if (trackingError || !tracked) {
        console.error("Invitation tracking failed:", trackingError?.message ?? "No row updated");
        return json({
          ok: true,
          warning: "Invitation email was sent, but the application tracking update failed. Do not resend until repaired."
        });
      }

      return json({
        ok: true,
        message: "Employee invitation sent through Brevo template #4. The account remains pending until the Founder activates it."
      });
    }

    if (action === "resend_setup") {
      const email = String(body.email ?? "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return json({ error: "Enter a valid account email address." }, 400);
      }

      const { data: users, error: usersError } = await admin.auth.admin.listUsers({
        page: 1,
        perPage: 1000
      });
      if (usersError) {
        console.error("Account lookup failed:", usersError.message);
        return json({ error: "Could not look up the account. Check Auth logs." }, 500);
      }

      const target = users.users.find(u => (u.email ?? "").toLowerCase() === email);
      if (!target) return json({ error: "No existing account was found for that email." }, 404);

      const { data: targetProfile, error: targetProfileError } = await admin
        .from("profiles")
        .select("role,account_status")
        .eq("id", target.id)
        .maybeSingle();

      if (targetProfileError || !targetProfile ||
          !["employee", "pa"].includes(targetProfile.role)) {
        return json({ error: "This email does not belong to an employee or PA account." }, 403);
      }

      const { error: resetError } = await admin.auth.resetPasswordForEmail(email, {
        redirectTo: PORTAL_URL
      });

      if (resetError) {
        console.error("Account setup email failed:", resetError.message, resetError.code ?? "no_code");
        return json({ error: resetError.message }, 409);
      }

      return json({
        ok: true,
        message: "A fresh account setup link has been sent. The recipient should use the newest email only."
      });
    }

    if (action === "invite_pa") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const fullName = String(body.full_name ?? "Ahmad WebWorks PA").trim();

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return json({ error: "Enter a valid PA email address." }, 400);
      }
      if (fullName.length < 2 || fullName.length > 100) {
        return json({ error: "Enter a valid PA name (2–100 characters)." }, 400);
      }

      const { data: invited, error: inviteError } =
        await admin.auth.admin.inviteUserByEmail(email, {
          redirectTo: PORTAL_URL,
          data: { full_name: fullName }
        });

      if (inviteError) {
        console.error("PA invitation rejected:", inviteError.message, inviteError.code ?? "no_code");
        return json({ error: inviteError.message }, 409);
      }

      // The auth.users trigger creates the default employee/pending profile
      // synchronously; this update changes it to the requested PA role.
      const { error: roleError } = await admin
        .from("profiles")
        .update({ role: "pa", account_status: "active" })
        .eq("id", invited.user.id);

      if (roleError) {
        console.error("PA role assignment failed:", roleError.message);
        return json({
          ok: true,
          warning: "Invitation was sent, but PA permissions could not be assigned. Keep the account inactive and contact the Founder."
        });
      }

      return json({
        ok: true,
        message: "PA invitation sent. This account can review applications only; it cannot manage employee accounts or publish portfolios."
      });
    }

    return json({ error: "Unknown action." }, 400);
  } catch (error) {
    console.error("invite-team-member:", error);
    return json({ error: "The invitation could not be processed. Check Edge Function logs." }, 500);
  }
});