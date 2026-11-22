
import { createClient } from
"https://esm.sh/@supabase/supabase-js@2";

const db = createClient(
  "https://vxdzyfbxcorxqysvlzgn.supabase.co",
  "sb_publishable_egeeneg2jGd6y2yotB_Bdw_FR2XMVJB"
);

const $ = id => document.getElementById(id);

let user = null;
let profile = null;
let busy = false;

const invitationFlow =
  new URLSearchParams(location.search).get("flow") === "invite";

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({
  "&":"&amp;", "<":"&lt;", ">":"&gt;",
  '"':"&quot;", "'":"&#39;"
}[c]));

function msg(id, text) {
  $(id).textContent = text;
}

function setBusy(button, state) {
  if (!button) return;

  if (state) {
    button.dataset.oldText = button.textContent;
    button.disabled = true;
    button.textContent = "Please wait...";
  } else {
    button.disabled = false;

    if (button.dataset.oldText) {
      button.textContent = button.dataset.oldText;
    }

    delete button.dataset.oldText;
  }
}

function safeURL(value) {
  if (!value) return null;

  try {
    const u = new URL(value);
    return ["https:", "http:"].includes(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}

function slugify(value) {
  return String(value || "").toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function inviteFunction(body) {
  const { data, error } = await db.functions.invoke(
    "invite-team-member", { body }
  );

  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);

  return data;
}

/* INVITATION ACCEPTANCE */

async function showInvitationSetup(session) {
  $("login").classList.add("hidden");
  $("workspace").classList.add("hidden");
  $("inviteSetup").classList.remove("hidden");

  if (!session) {
    $("inviteForm").classList.add("hidden");
    msg(
      "inviteMsg",
      "This invitation link is invalid, expired, or already used. Contact the Founder for a new invitation."
    );
    return;
  }

  $("inviteEmail").value =
    session.user.email || "";

  $("inviteForm").classList.remove("hidden");
  msg("inviteMsg", "Create your password to finish accepting the invitation.");
}

$("inviteForm").addEventListener("submit", async event => {
  event.preventDefault();

  const button = event.submitter;
  setBusy(button, true);
  msg("inviteMsg", "Setting up your account...");

  try {
    const form = new FormData(event.currentTarget);

    const password = String(form.get("password") || "");
    const confirmPassword =
      String(form.get("confirm_password") || "");

    if (password.length < 8) {
      throw new Error("Password must contain at least 8 characters.");
    }

    if (password !== confirmPassword) {
      throw new Error("Passwords do not match.");
    }

    const { error } = await db.auth.updateUser({ password });

    if (error) throw error;

    $("inviteForm").classList.add("hidden");

    msg(
      "inviteDone",
      "Password created successfully! Your invitation is accepted. Your account is now waiting for Founder activation. You can sign in after the Founder activates your account."
    );

    $("inviteDone").classList.remove("hidden");

    await db.auth.signOut();

  } catch (error) {
    msg("inviteMsg", error.message);
  } finally {
    setBusy(button, false);
  }
});

/* LOGIN */

$("loginForm").addEventListener("submit", async event => {
  event.preventDefault();

  const button = event.submitter;
  setBusy(button, true);
  msg("loginMsg", "Signing in...");

  const form = new FormData(event.currentTarget);

  try {
    const { error } = await db.auth.signInWithPassword({
      email: form.get("email"),
      password: form.get("password")
    });

    if (error) throw error;

    await boot();

  } catch (error) {
    msg("loginMsg", error.message);
  } finally {
    setBusy(button, false);
  }
});

$("logout").addEventListener("click", async () => {
  await db.auth.signOut();
  location.reload();
});

/* ACCOUNT AND ROLE CHECK */

async function boot() {
  const { data: { user: currentUser }, error } =
    await db.auth.getUser();

  if (error) throw error;
  if (!currentUser) return;

  user = currentUser;

  const { data, error: profileError } = await db
    .from("profiles")
    .select("id,role,account_status")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) throw profileError;
  if (!data) throw new Error("Account profile not found.");

  profile = data;

  if (profile.account_status !== "active") {
    await db.auth.signOut();
    $("workspace").classList.add("hidden");
    $("login").classList.remove("hidden");
    msg("loginMsg", "Your account is pending or suspended. Contact the Founder.");
    return;
  }

  $("login").classList.add("hidden");
  $("inviteSetup").classList.add("hidden");
  $("workspace").classList.remove("hidden");

  const displayName =
    user.user_metadata?.full_name?.trim() ||
    (profile.role === "admin" ? "Ahmad Hassan Khan" : "Team Member");

  $("welcome").textContent = "Welcome, " + displayName;

  const roles = {
    admin: "Founder / Administrator",
    pa: "Personal Assistant",
    employee: "Employee Workspace"
  };

  $("roleText").textContent =
    roles[profile.role] || "Team Member";

  if (profile.role === "admin") {
    $("admin").classList.remove("hidden");
    $("employee").classList.add("hidden");
    $("paInvitePanel").classList.remove("hidden");

    document.querySelectorAll("[data-tab]")
      .forEach(x => x.classList.remove("hidden"));

    await loadAdmin();

  } else if (profile.role === "pa") {
    $("admin").classList.remove("hidden");
    $("employee").classList.add("hidden");
    $("paInvitePanel").classList.add("hidden");

    document.querySelectorAll(
      '[data-tab="people"],[data-tab="reviews"]'
    ).forEach(x => x.classList.add("hidden"));

    $("apps").classList.remove("hidden");
    $("people").classList.add("hidden");
    $("reviews").classList.add("hidden");

    await loadPA();

  } else if (profile.role === "employee") {
    $("employee").classList.remove("hidden");
    $("admin").classList.add("hidden");

    await loadEmployee();

  } else {
    throw new Error("Unrecognized account role.");
  }
}

/* APPLICATIONS */

function renderApplications(apps, canInvite) {
  if (!apps.length) {
    $("appsList").innerHTML =
      '<p class="muted">No applications received yet.</p>';
    return;
  }

  const diagnosticBar = canInvite ? `
    <div class="actions">
      <button class="act" data-action="diagnose-brevo">
        Check Brevo API (no email sent)
      </button>
    </div>` : "";

  $("appsList").innerHTML = `
    ${diagnosticBar}
    <table>
      <thead>
        <tr>
          <th>Applicant</th>
          <th>Role / Location</th>
          <th>Experience</th>
          <th>Review</th>
        </tr>
      </thead>

      <tbody>
      ${apps.map(app => {
        const portfolioURL = safeURL(app.portfolio_url);

        let invitation = "";

        if (app.invited_at) {
          invitation = "Invitation already sent";
        } else if (
          canInvite && app.status === "approved" && app.email
        ) {
          invitation = `
            <button class="act"
              data-action="repair-invitation-tracking"
              data-id="${esc(app.id)}">
              Repair Existing Invitation (no email)
            </button>
            <button class="act primary"
              data-action="invite-employee"
              data-id="${esc(app.id)}">
              Send Employee Invitation
            </button>`;
        }

        const deleteButton = canInvite ? `
          <button class="act danger"
            data-action="delete-application"
            data-id="${esc(app.id)}">
            Delete Application
          </button>` : "";

        const statusActions = canInvite ? `
          <button class="act"
            data-action="application-status"
            data-id="${esc(app.id)}"
            data-status="under_review">Review</button>

          <button class="act primary"
            data-action="application-status"
            data-id="${esc(app.id)}"
            data-status="approved">Approve</button>

          <button class="act danger"
            data-action="application-status"
            data-id="${esc(app.id)}"
            data-status="rejected">Reject</button>` : `
          <button class="act"
            data-action="application-status"
            data-id="${esc(app.id)}"
            data-status="under_review">Mark Under Review</button>`;

        return `
          <tr>
            <td>
              <b>${esc(app.applicant_name)}</b><br>
              ${esc(app.email || "No email")}

              ${app.email ? `
                <br>
                <button class="act"
                  data-action="copy-email"
                  data-email="${esc(app.email)}">
                  Copy Email
                </button>` : ""}
            </td>

            <td>
              ${esc(app.preferred_role)}<br>
              ${esc(app.location)}
            </td>

            <td>
              ${esc(app.introduction)}
              <br><b>Skills:</b>
              ${esc((app.skills || []).join(", "))}

              ${portfolioURL ? `
                <br><a href="${esc(portfolioURL)}"
                  target="_blank" rel="noopener noreferrer">
                  View Portfolio
                </a>` : ""}
            </td>

            <td>
              <b>${esc(app.status)}</b>
              <br>${invitation}

              <div class="actions">
                ${statusActions}
              </div>

              <label class="muted">
                Administrator Notes
                <textarea id="notes-${esc(app.id)}"
                  rows="2" maxlength="1000">${esc(app.admin_notes || "")}</textarea>
              </label>

              <button class="act"
                data-action="save-notes"
                data-id="${esc(app.id)}">Save Notes</button>

              ${deleteButton}
            </td>
          </tr>`;
      }).join("")}
      </tbody>
    </table>`;
}

/* PA DASHBOARD */

async function loadPA() {
  msg("globalMsg", "Loading applications...");

  const { data, error } = await db
    .from("employee_applications")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;

  $("appCount").textContent = data.length;
  $("empCount").textContent = "Restricted";

  $("reviewCount").textContent = data.filter(
    x => ["new", "under_review"].includes(x.status)
  ).length;

  renderApplications(data, false);
  msg("globalMsg", "PA application review access loaded.");
}

/* FOUNDER DASHBOARD */

async function loadAdmin() {
  msg("globalMsg", "Loading Founder dashboard...");

  const [apps, people, portfolios, projects] = await Promise.all([
    db.from("employee_applications")
      .select("*").order("created_at", { ascending: false }),

    db.from("profiles")
      .select("id,role,account_status,created_at")
      .order("created_at", { ascending: false }),

    db.from("employee_portfolios").select("*"),

    db.from("portfolio_projects").select("*")
  ]);

  for (const result of [apps, people, portfolios, projects]) {
    if (result.error) throw result.error;
  }

  $("appCount").textContent = apps.data.length;

  $("empCount").textContent = people.data.filter(
    x => x.role === "employee" && x.account_status === "active"
  ).length;

  $("reviewCount").textContent =
    portfolios.data.filter(x => x.review_status === "pending").length +
    projects.data.filter(x => x.review_status === "pending").length;

  renderApplications(apps.data, true);
  renderPeople(people.data);
  renderReviews(portfolios.data, projects.data);

  msg("globalMsg", "Founder dashboard loaded.");
}

/* EMPLOYEE ACCOUNT MANAGEMENT */

function renderPeople(people) {
  $("peopleList").innerHTML = people.length ? `
    <table>
      <thead>
        <tr>
          <th>User ID</th>
          <th>Role</th>
          <th>Status</th>
          <th>Action</th>
        </tr>
      </thead>

      <tbody>
      ${people.map(person => `
        <tr>
          <td>${esc(person.id)}</td>
          <td>${esc(person.role)}</td>
          <td>${esc(person.account_status)}</td>

          <td>
            ${person.role === "admin" ? "Founder" :
              person.role === "pa" ? "PA (Restricted)" : `
              <button class="act"
                data-action="account-status"
                data-id="${esc(person.id)}"
                data-status="${person.account_status === "active" ? "suspended" : "active"}">
                ${person.account_status === "active" ? "Suspend" : "Activate"}
              </button>`}
          </td>
        </tr>
      `).join("")}
      </tbody>
    </table>
  ` : '<p>No accounts found.</p>';
}

/* PORTFOLIO REVIEW */

function renderReviews(portfolios, projects) {
  const pending = [
    ...portfolios.filter(x => x.review_status === "pending")
      .map(x => ({ table: "employee_portfolios", id: x.id, label: "Employee Profile: " + x.full_name })),
    ...projects.filter(x => x.review_status === "pending")
      .map(x => ({ table: "portfolio_projects", id: x.id, label: "Project: " + x.title }))
  ];
  const published = portfolios.filter(x => x.is_published && x.review_status === "approved");

  $("reviewsList").innerHTML = `
    <h3>Pending Reviews</h3>
    ${pending.length ? pending.map(item => `
      <div class="stat">
        <b>${esc(item.label)}</b>
        <div class="actions">
          <button class="act primary" data-action="portfolio-review" data-table="${item.table}" data-id="${esc(item.id)}" data-decision="approved">Approve & Publish</button>
          <button class="act danger" data-action="portfolio-review" data-table="${item.table}" data-id="${esc(item.id)}" data-decision="rejected">Reject</button>
        </div>
      </div>`).join("") : '<p class="muted">No pending reviews.</p>'}
    <h3 style="margin-top:2rem">Published Employee Profiles</h3>
    ${published.length ? published.map(item => `
      <div class="stat">
        <b>${esc(item.full_name)}</b>
        <p class="muted">${esc(item.job_title || "Team member")} · Public on Team page</p>
        <div class="actions">
          <button class="act" data-action="unpublish-profile" data-id="${esc(item.id)}">Unpublish</button>
          <button class="act danger" data-action="delete-employee-profile" data-id="${esc(item.id)}" data-owner="${esc(item.owner_id)}">Delete Profile & Projects</button>
        </div>
      </div>`).join("") : '<p class="muted">No published employee profiles.</p>'}
  `;
}

/* ACTION HANDLER */

document.addEventListener("click", async event => {
  const button = event.target.closest("button[data-action]");

  if (!button || busy) return;

  const action = button.dataset.action;

  busy = true;
  setBusy(button, true);

  try {
    if (action === "copy-email") {
      await navigator.clipboard.writeText(button.dataset.email);
      msg("globalMsg", "Email copied.");
    }

    if (action === "diagnose-brevo") {
      if (profile.role !== "admin") {
        throw new Error("Founder access required.");
      }

      msg("globalMsg", "Checking Brevo API connection. No email will be sent.");

      const { data: diagnostic, error: diagnosticError } =
        await db.functions.invoke("notify-application-status", {
          body: { action: "diagnose_brevo" }
        });

      if (diagnosticError) throw new Error(diagnosticError.message);

      if (diagnostic?.ok && diagnostic?.template_active) {
        msg(
          "globalMsg",
          "Brevo API connection verified. Template #2 is active. No email was sent. (" +
            diagnostic.elapsed_ms + " ms)"
        );
      } else {
        msg(
          "globalMsg",
          "Brevo API check failed: " +
            (diagnostic?.error || "Template #2 is not active.") +
            (diagnostic?.http_status ? " HTTP " + diagnostic.http_status : "")
        );
      }
    }

    if (action === "application-status") {
      const nextStatus = button.dataset.status;

      if (
        profile.role !== "admin" &&
        nextStatus !== "under_review"
      ) {
        throw new Error("Only the Founder can approve or reject applications.");
      }

      const { error } = await db
        .from("employee_applications")
        .update({
          status: nextStatus,
          reviewed_at: new Date().toISOString()
        })
        .eq("id", button.dataset.id);

      if (error) throw error;

      let notificationMessage = "";

      if (
        profile.role === "admin" &&
        ["approved", "rejected"].includes(nextStatus)
      ) {
        const { data: notification, error: notificationError } =
          await db.functions.invoke("notify-application-status", {
            body: { application_id: button.dataset.id }
          });

        if (notificationError || notification?.error) {
          notificationMessage =
            " Status saved; email notification was not sent: " +
            (notification?.error || notificationError.message);
        } else {
          notificationMessage =
            notification?.message
              ? " " + notification.message
              : " Email notification processed.";
        }
      }

      if (profile.role === "admin") await loadAdmin();
      else await loadPA();

      msg("globalMsg", "Application updated." + notificationMessage);
    }

    if (action === "save-notes") {
      const notes = $("notes-" + button.dataset.id).value;

      const { error } = await db
        .from("employee_applications")
        .update({ admin_notes: notes })
        .eq("id", button.dataset.id);

      if (error) throw error;

      if (profile.role === "admin") await loadAdmin();
      else await loadPA();

      msg("globalMsg", "Notes saved.");
    }

    if (action === "delete-application") {
      if (profile.role !== "admin") {
        throw new Error("Only the Founder can delete applications.");
      }

      const row = button.closest("tr");
      const applicantName =
        row?.querySelector("td b")?.textContent || "this applicant";

      const confirmed = confirm(
        `Permanently delete ${applicantName}'s application? This cannot be undone. Any separate employee account will NOT be deleted.`
      );

      if (!confirmed) return;

      const { error } = await db
        .from("employee_applications")
        .delete()
        .eq("id", button.dataset.id);

      if (error) throw error;

      await loadAdmin();
      msg("globalMsg", "Application permanently deleted.");
    }

    if (action === "repair-invitation-tracking") {
      if (profile.role !== "admin") {
        throw new Error("Founder access required.");
      }

      if (!confirm("Repair the tracking record for an invitation that was already sent? This will NOT send another email.")) return;

      const result = await inviteFunction({
        action: "repair_invitation_tracking",
        application_id: button.dataset.id
      });

      await loadAdmin();
      msg("globalMsg", result.message || result.error || "Invitation tracking checked.");
    }

    if (action === "invite-employee") {
      if (profile.role !== "admin") {
        throw new Error("Founder access required.");
      }

      if (!confirm("Send invitation to this approved applicant?")) return;

      const result = await inviteFunction({
        action: "invite_employee",
        application_id: button.dataset.id
      });

      await loadAdmin();
      msg("globalMsg", result.message || result.warning);
    }

    if (action === "account-status") {
      if (profile.role !== "admin") {
        throw new Error("Founder access required.");
      }

      if (!confirm("Change this employee's account status?")) return;

      const { error } = await db
        .from("profiles")
        .update({ account_status: button.dataset.status })
        .eq("id", button.dataset.id);

      if (error) throw error;

      await loadAdmin();
      msg("globalMsg", "Account status updated.");
    }

    if (action === "unpublish-profile") {
      if (profile.role !== "admin") throw new Error("Founder access required.");
      if (!confirm("Remove this profile from the public Team page? The profile will remain saved and can be reviewed again later.")) return;
      const { error } = await db.from("employee_portfolios")
        .update({ is_published: false, updated_at: new Date().toISOString() })
        .eq("id", button.dataset.id);
      if (error) throw error;
      await loadAdmin();
      msg("globalMsg", "Employee profile unpublished. The employee account remains active.");
    }

    if (action === "delete-employee-profile") {
      if (profile.role !== "admin") throw new Error("Founder access required.");
      if (!confirm("Permanently delete this employee portfolio and all of this employee's portfolio projects? Their login account and employee access will NOT be deleted.")) return;
      const ownerId = button.dataset.owner;
      const { error: projectError } = await db.from("portfolio_projects").delete().eq("owner_id", ownerId);
      if (projectError) throw projectError;
      const { error: profileError } = await db.from("employee_portfolios").delete().eq("id", button.dataset.id);
      if (profileError) throw profileError;
      await loadAdmin();
      msg("globalMsg", "Portfolio and its projects deleted. Employee login account remains active.");
    }

    if (action === "portfolio-review") {
      if (profile.role !== "admin") {
        throw new Error("Founder access required.");
      }

      const decision = button.dataset.decision;

      if (!confirm("Confirm portfolio decision?")) return;

      const { error } = await db
        .from(button.dataset.table)
        .update({
          review_status: decision,
          is_published: decision === "approved",
          updated_at: new Date().toISOString()
        })
        .eq("id", button.dataset.id);

      if (error) throw error;

      await loadAdmin();
      msg("globalMsg", "Portfolio decision saved.");
    }

  } catch (error) {
    msg("globalMsg", error.message);
  } finally {
    busy = false;
    setBusy(button, false);
  }
});

/* INVITE PA */

$("paInviteForm").addEventListener("submit", async event => {
  event.preventDefault();

  if (profile?.role !== "admin") {
    msg("paInviteMsg", "Only the Founder can invite a PA.");
    return;
  }

  const button = event.submitter;
  setBusy(button, true);

  try {
    const form = new FormData(event.currentTarget);

    const result = await inviteFunction({
      action: "invite_pa",
      email: form.get("email"),
      full_name: form.get("full_name")
    });

    event.currentTarget.reset();

    msg("paInviteMsg", result.message || result.warning);
    await loadAdmin();

  } catch (error) {
    msg("paInviteMsg", error.message);
  } finally {
    setBusy(button, false);
  }
});

/* NAVIGATION */

document.querySelectorAll("[data-tab]").forEach(button => {
  button.addEventListener("click", () => {
    if (profile?.role !== "admin" &&
        button.dataset.tab !== "apps") return;

    document.querySelectorAll("[data-tab]")
      .forEach(x => x.classList.toggle("active", x === button));

    ["apps", "people", "reviews"].forEach(id => {
      $(id).classList.toggle("hidden", id !== button.dataset.tab);
    });
  });
});

/* EMPLOYEE PROFILE */

async function loadEmployee() {
  let { data: portfolio, error } = await db
    .from("employee_portfolios")
    .select("*")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (error) throw error;

  if (!portfolio) {
    const name = user.user_metadata?.full_name ||
      user.email.split("@")[0];

    const { data, error: insertError } = await db
      .from("employee_portfolios")
      .insert({
        owner_id: user.id,
        full_name: name,
        slug: slugify(name) + "-" + user.id.slice(0, 6)
      })
      .select()
      .single();

    if (insertError) throw insertError;

    portfolio = data;
  }

  const form = $("profileForm");

  [
    "full_name", "job_title", "location", "bio",
    "website_url", "github_url", "linkedin_url"
  ].forEach(key => {
    form.elements[key].value = portfolio[key] || "";
  });

  form.elements.skills.value =
    (portfolio.skills || []).join(", ");

  msg("profileMsg", "Status: " + portfolio.review_status);

  const { data: projects, error: projectError } = await db
    .from("portfolio_projects")
    .select("*")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  if (projectError) throw projectError;

  $("myProjects").innerHTML = projects.length
    ? projects.map(project => `
      <div class="stat">
        <b>${esc(project.title)}</b>
        <p>${esc(project.description)}</p>
        <p class="muted">
          Status: ${esc(project.review_status)}
        </p>
      </div>
    `).join("")
    : "<p>No projects submitted.</p>";
}

/* SAVE EMPLOYEE PROFILE */

$("profileForm").addEventListener("submit", async event => {
  event.preventDefault();

  const button = event.submitter;
  setBusy(button, true);

  try {
    const form = new FormData(event.currentTarget);
    const name = String(form.get("full_name") || "").trim();

    if (name.length < 2) {
      throw new Error("Enter your full name.");
    }

    const payload = {
      full_name: name,
      job_title: String(form.get("job_title") || "").trim(),
      location: String(form.get("location") || "").trim(),
      bio: String(form.get("bio") || "").trim(),

      skills: String(form.get("skills") || "")
        .split(",").map(x => x.trim()).filter(Boolean),

      website_url: safeURL(form.get("website_url")),
      github_url: safeURL(form.get("github_url")),
      linkedin_url: safeURL(form.get("linkedin_url")),

slug: slugify(name) + "-" + user.id.slice(0, 6)
    };

    const { error } = await db
      .from("employee_portfolios")
      .update(payload)
      .eq("owner_id", user.id);

    if (error) throw error;

    msg("profileMsg", "Profile submitted for Founder approval.");
    await loadEmployee();

  } catch (error) {
    msg("profileMsg", error.message);
  } finally {
    setBusy(button, false);
  }
});

/* ADD PROJECT */

$("projectForm").addEventListener("submit", async event => {
  event.preventDefault();

  const button = event.submitter;
  setBusy(button, true);

  try {
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") || "").trim();

    if (title.length < 2) {
      throw new Error("Enter project title.");
    }

    const rawURL = String(form.get("project_url") || "").trim();
    const projectURL = rawURL ? safeURL(rawURL) : null;

    if (rawURL && !projectURL) {
      throw new Error("Enter a valid project URL.");
    }

const { error } = await db
      .from("portfolio_projects")
      .insert({
        owner_id: user.id,
        title,
        description: String(form.get("description") || "").trim(),
        project_url: projectURL
      });

    if (error) throw error;

    event.currentTarget.reset();

    msg("projectMsg", "Project submitted for Founder review.");
    await loadEmployee();

  } catch (error) {
    msg("projectMsg", error.message);
  } finally {
    setBusy(button, false);
  }
});

/* RESTORE SESSION / HANDLE INVITATION */

async function restoreSession() {
  const { data, error } = await db.auth.getSession();

  if (error) {
    msg("globalMsg", error.message);
    return;
  }

  if (invitationFlow) {
    await showInvitationSetup(data.session);
    return;
  }

  if (data.session) {
    try {
      await boot();
    } catch (error) {
      msg("globalMsg", error.message);
    }
  }
}

restoreSession();