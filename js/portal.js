
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
    $("paStats").classList.add("hidden");

    document.querySelectorAll("#admin [data-tab]")
      .forEach(x => x.classList.remove("hidden"));

    await loadAdmin();
    document.querySelectorAll("#admin [data-tab]").forEach(x => x.classList.toggle("active", x.dataset.tab === "overview"));
    ["apps","people","work","reviews","reports"].forEach(id => $(id).classList.add("hidden"));
    $("overview").classList.remove("hidden");

  } else if (profile.role === "pa") {
    $("admin").classList.remove("hidden");
    $("employee").classList.add("hidden");
    $("paInvitePanel").classList.add("hidden");
    $("paStats").classList.remove("hidden");

    document.querySelectorAll("#admin [data-tab]").forEach(x => {
      x.classList.toggle("hidden", x.dataset.tab !== "apps");
      x.classList.toggle("active", x.dataset.tab === "apps");
    });

    ["overview","people","work","reviews","reports"].forEach(id => $(id).classList.add("hidden"));
    $("apps").classList.remove("hidden");

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

  const [apps, people, portfolios, projects, assignments, submissions, employeeProfiles] = await Promise.all([
    db.from("employee_applications").select("*").order("created_at", { ascending: false }),
    db.from("profiles").select("id,role,account_status,created_at").order("created_at", { ascending: false }),
    db.from("employee_portfolios").select("*"),
    db.from("portfolio_projects").select("*"),
    db.from("work_assignments").select("*").order("created_at", { ascending: false }),
    db.from("work_submissions").select("*").order("submitted_at", { ascending: false }),
    db.from("employee_portfolios").select("owner_id,full_name,job_title")
  ]);

  for (const result of [apps, people, portfolios, projects, assignments, submissions, employeeProfiles]) {
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
  const activeEmployeeProfiles = employeeProfiles.data.filter(p =>
    people.data.some(person => person.id === p.owner_id && person.role === "employee" && person.account_status === "active")
  );
  renderFounderWork(assignments.data, submissions.data, activeEmployeeProfiles);
  renderFounderOverview(apps.data, people.data, portfolios.data, projects.data, assignments.data, submissions.data);
  renderFounderReports(apps.data, people.data, portfolios.data, projects.data, assignments.data);

  msg("globalMsg", "Founder command centre loaded.");
}

function renderFounderWork(assignments, submissions, employeeProfiles) {
  const names = new Map(employeeProfiles.map(p => [p.owner_id, p.full_name || "Team member"]));
  $("assignmentEmployee").innerHTML = '<option value="">Choose an employee</option>' +
    employeeProfiles.map(p => '<option value="' + esc(p.owner_id) + '">' + esc(p.full_name || "Team member") + ' — ' + esc(p.job_title || "Employee") + '</option>').join("");
  $("founderAssignments").innerHTML = assignments.length ? assignments.map(task => {
    const latest = submissions.find(s => s.assignment_id === task.id);
    const derived = latest?.review_status === "pending" ? "submitted" : task.status;
    return '<article class="portal-project-card"><div class="portal-project-top"><h3>' + esc(task.title) + '</h3><span class="portal-status">' + esc(derived.replace(/_/g," ")) + '</span></div><p>' + esc(task.description || "No extra instructions.") + '</p><div class="executive-task-meta"><span>Assigned to: <b>' + esc(names.get(task.assigned_to) || "Employee") + '</b></span><span>Priority: <b class="priority-' + esc(task.priority) + '">' + esc(task.priority) + '</b></span><span>Due: ' + (task.due_at ? esc(new Date(task.due_at).toLocaleString()) : "Not set") + '</span></div><div class="actions"><select aria-label="Assignment status" id="task-status-' + esc(task.id) + '">' + ["assigned","in_progress","submitted","approved","revision_requested","cancelled"].map(s => '<option value="' + s + '"' + (task.status===s?' selected':'') + '>' + s.replace(/_/g," ") + '</option>').join("") + '</select><button class="act primary" data-action="work-status" data-id="' + esc(task.id) + '">Save status</button><button class="act danger" data-action="delete-assignment" data-id="' + esc(task.id) + '">Delete</button></div></article>';
  }).join("") : '<p class="muted">No assignments yet. Create the first task above.</p>';

  $("founderSubmissions").innerHTML = submissions.length ? submissions.map(sub => {
    const task = assignments.find(a => a.id === sub.assignment_id);
    return '<article class="portal-project-card"><div class="portal-project-top"><h3>' + esc(task?.title || "Assignment") + '</h3><span class="portal-status">' + esc(sub.review_status.replace(/_/g," ")) + '</span></div><p><b>' + esc(names.get(sub.employee_id) || "Employee") + '</b> · ' + esc(new Date(sub.submitted_at).toLocaleString()) + '</p><p>' + esc(sub.message) + '</p>' + (safeURL(sub.attachment_url) ? '<a class="portal-link" href="' + esc(safeURL(sub.attachment_url)) + '" target="_blank" rel="noopener noreferrer">Open attachment / work link ↗</a>' : '') + (sub.reviewer_feedback ? '<p><b>Previous feedback:</b> ' + esc(sub.reviewer_feedback) + '</p>' : '') + '<label>Founder feedback<textarea id="work-feedback-' + esc(sub.id) + '" rows="2" maxlength="2000">' + esc(sub.reviewer_feedback || "") + '</textarea></label><div class="actions"><button class="act primary" data-action="review-work" data-id="' + esc(sub.id) + '" data-assignment="' + esc(sub.assignment_id) + '" data-decision="approved">Approve Work</button><button class="act" data-action="review-work" data-id="' + esc(sub.id) + '" data-assignment="' + esc(sub.assignment_id) + '" data-decision="revision_requested">Request Revision</button></div></article>';
  }).join("") : '<p class="muted">No employee submissions yet.</p>';
}

function renderFounderOverview(apps, people, portfolios, projects, assignments, submissions) {
  const active = people.filter(p => p.role === "employee" && p.account_status === "active").length;
  const pending = portfolios.filter(p => p.review_status === "pending").length + projects.filter(p => p.review_status === "pending").length;
  const open = assignments.filter(a => !["approved","cancelled"].includes(a.status)).length;
  $("ceoAppKpi").textContent = apps.length;
  $("ceoEmployeeKpi").textContent = active;
  $("ceoReviewKpi").textContent = pending;
  $("ceoWorkKpi").textContent = open;
  const priorities = [];
  const newApps = apps.filter(a => ["new","under_review"].includes(a.status)).length;
  const pendingWork = submissions.filter(s => s.review_status === "pending").length;
  if (newApps) priorities.push(newApps + " application(s) need review");
  if (pendingWork) priorities.push(pendingWork + " employee work submission(s) await review");
  if (pending) priorities.push(pending + " portfolio item(s) await approval");
  $("ceoPriorityList").innerHTML = priorities.length ? priorities.map(x => '<div class="portal-project-card">' + esc(x) + '</div>').join("") : '<p class="muted">You are all caught up. No urgent reviews.</p>';
}

function renderFounderReports(apps, people, portfolios, projects, assignments) {
  const employeeCount = people.filter(p => p.role === "employee").length;
  const active = people.filter(p => p.role === "employee" && p.account_status === "active").length;
  const approvedApps = apps.filter(a => a.status === "approved").length;
  const completedTasks = assignments.filter(a => a.status === "approved").length;
  const total = assignments.length;
  $("ceoReports").innerHTML = '<div class="executive-kpis"><article class="executive-kpi"><small>Employee accounts</small><strong>' + employeeCount + '</strong><span>' + active + ' active</span></article><article class="executive-kpi"><small>Approved applications</small><strong>' + approvedApps + '</strong><span>Of ' + apps.length + ' total</span></article><article class="executive-kpi"><small>Assignments completed</small><strong>' + completedTasks + '</strong><span>Of ' + total + ' total</span></article><article class="executive-kpi"><small>Published profiles</small><strong>' + portfolios.filter(p => p.is_published).length + '</strong><span>Portfolio visibility</span></article></div><div class="portal-overview-panel"><h3>Assignment completion</h3><div class="executive-progress"><span style="width:' + (total ? Math.round(completedTasks/total*100) : 0) + '%"></span></div><p class="muted">' + (total ? Math.round(completedTasks/total*100) : 0) + '% of assignments approved by Founder.</p></div>';
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

      if (diagnostic?.ok && diagnostic?.templates?.length === 4) {
        msg(
          "globalMsg",
          "Brevo connection verified. Transactional templates #1, #2, #3 and #4 are active. No email was sent. (" +
            diagnostic.elapsed_ms + " ms)"
        );
      } else if (diagnostic?.templates?.length) {
        const status = diagnostic.templates
          .map(item => "#" + item.template_id + ": " + (item.active ? "active" : "inactive / unavailable"))
          .join("; ");
        msg(
          "globalMsg",
          "Brevo template check: " + status + ". No email was sent."
        );
      } else {
        msg(
          "globalMsg",
          "Brevo API check failed: " +
            (diagnostic?.error || "Could not verify the transactional templates.")
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

    if (action === "employee-start-work") {
      if (profile?.role !== "employee") throw new Error("Employee access required.");
      const { error } = await db.rpc("employee_start_work", { p_assignment_id: button.dataset.id });
      if (error) throw error;
      await loadEmployee();
      $("employeeWorkPanel").classList.remove("hidden");
      $("employeeWorkPanel").scrollIntoView({behavior:"smooth",block:"start"});
      msg("globalMsg","Assignment started. You can now submit progress or completed work.");
    }

    if (action === "work-status") {
      if (profile.role !== "admin") throw new Error("Founder access required.");
      const nextStatus = $("task-status-" + button.dataset.id).value;
      const { error } = await db.from("work_assignments").update({status:nextStatus,updated_at:new Date().toISOString()}).eq("id",button.dataset.id);
      if (error) throw error;
      await loadAdmin();
      msg("globalMsg","Assignment status updated.");
    }

    if (action === "delete-assignment") {
      if (profile.role !== "admin") throw new Error("Founder access required.");
      if (!confirm("Delete this assignment and its linked submissions?")) return;
      const { error } = await db.from("work_assignments").delete().eq("id",button.dataset.id);
      if (error) throw error;
      await loadAdmin();
      msg("globalMsg","Assignment deleted.");
    }

    if (action === "review-work") {
      if (profile.role !== "admin") throw new Error("Founder access required.");
      const decision = button.dataset.decision;
      const feedback = $("work-feedback-" + button.dataset.id).value.trim();
      if (decision === "revision_requested" && feedback.length < 3) throw new Error("Add clear feedback before requesting a revision.");
      const { error: reviewError } = await db.from("work_submissions").update({
        review_status:decision, reviewer_feedback:feedback, reviewed_by:user.id, reviewed_at:new Date().toISOString()
      }).eq("id",button.dataset.id);
      if (reviewError) throw reviewError;
      const taskStatus = decision === "approved" ? "approved" : "revision_requested";
      const { error: taskError } = await db.from("work_assignments").update({status:taskStatus,updated_at:new Date().toISOString()}).eq("id",button.dataset.assignment);
      if (taskError) throw taskError;
      await loadAdmin();
      msg("globalMsg", decision === "approved" ? "Work approved." : "Revision requested and feedback sent.");
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
  const formElement = event.currentTarget;
  setBusy(button, true);

  try {
    const form = new FormData(formElement);

    const result = await inviteFunction({
      action: "invite_pa",
      email: form.get("email"),
      full_name: form.get("full_name")
    });

    formElement.reset();

    msg("paInviteMsg", result.message || result.warning);
    await loadAdmin();

  } catch (error) {
    msg("paInviteMsg", error.message);
  } finally {
    setBusy(button, false);
  }
});

$("assignmentForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (profile?.role !== "admin") { msg("assignmentMsg","Founder access required."); return; }
  const formElement = event.currentTarget;
  const button = event.submitter;
  setBusy(button,true);
  try {
    const values = new FormData(formElement);
    const employeeId = String(values.get("assigned_to") || "");
    const title = String(values.get("title") || "").trim();
    if (!employeeId || title.length < 3) throw new Error("Choose an employee and enter a task title.");
    const dueRaw = String(values.get("due_at") || "");
    const { error } = await db.from("work_assignments").insert({
      title,
      description:String(values.get("description") || "").trim(),
      assigned_to:employeeId,
      assigned_by:user.id,
      priority:String(values.get("priority") || "normal"),
      due_at:dueRaw ? new Date(dueRaw).toISOString() : null
    });
    if (error) throw error;
    formElement.reset();
    msg("assignmentMsg","Assignment created and added to the employee workspace.");
    await loadAdmin();
    $("work").classList.remove("hidden");
    ["overview","apps","people","reviews","reports"].forEach(id => $(id).classList.add("hidden"));
  } catch(error) {
    msg("assignmentMsg",error.message);
  } finally { setBusy(button,false); }
});

/* NAVIGATION */

document.addEventListener("click", event => {
  const button = event.target.closest("[data-tab]");
  if (!button) return;
  if (profile?.role !== "admin" && button.dataset.tab !== "apps") return;
  const page = button.dataset.tab;
  document.querySelectorAll("#admin [data-tab]").forEach(x => x.classList.toggle("active", x.dataset.tab === page));
  ["overview","apps","people","work","reviews","reports"].forEach(id => {
    const section = $(id);
    if (section) section.classList.toggle("hidden", id !== page);
  });
});

/* EMPLOYEE PROFILE */

async function loadEmployee() {
  const { data: portfolio, error } = await db
    .from("employee_portfolios")
    .select("*")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (error) throw error;

  if (!portfolio) throw new Error("Employee profile record not found.");

  const form = $("profileForm");
  [
    "full_name", "job_title", "location", "bio",
    "website_url", "github_url", "linkedin_url"
  ].forEach(key => {
    form.elements[key].value = portfolio[key] || "";
  });
  form.elements.skills.value = (portfolio.skills || []).join(", ");

  const hasProfile = Boolean(
    portfolio.job_title || portfolio.location || portfolio.bio ||
    (portfolio.skills || []).length ||
    portfolio.website_url || portfolio.github_url || portfolio.linkedin_url
  );
  const status = String(portfolio.review_status || "draft").toLowerCase();
  const setupNeeded = !hasProfile && status !== "approved";

  $("employeeSetup").classList.toggle("hidden", !setupNeeded);
  $("employeeDashboard").classList.toggle("hidden", setupNeeded);
  $("profileForm").classList.add("hidden");
  $("profileDetailsPanel").classList.add("hidden");
  $("projectsPanel").classList.add("hidden");

  $("employeeProfileName").textContent = portfolio.full_name || "Team Member";
  $("employeeProfileDetailName").textContent = portfolio.full_name || "Team Member";
  $("employeeProfileTitle").textContent = portfolio.job_title || "Role not added yet";
  $("employeeProfileDetailTitle").textContent = portfolio.job_title || "Role not added yet";
  $("employeeProfileLocation").textContent = portfolio.location || "Location not added";
  $("employeeProfileStatus").textContent = status.replace(/_/g, " ");
  $("employeeProfileBio").textContent = portfolio.bio || "No introduction added yet.";
  $("employeeSkills").innerHTML = (portfolio.skills || []).length
    ? portfolio.skills.map(skill => '<span class="portal-chip">' + esc(skill) + '</span>').join("")
    : '<span class="muted">No skills added yet.</span>';

  const links = [
    ["Website", portfolio.website_url],
    ["GitHub", portfolio.github_url],
    ["LinkedIn", portfolio.linkedin_url]
  ].filter(([, value]) => safeURL(value));
  $("employeeProfileLinks").innerHTML = links.length
    ? links.map(([label, value]) => '<a class="portal-link" href="' + esc(safeURL(value)) + '" target="_blank" rel="noopener noreferrer">' + label + ' ↗</a>').join("")
    : '<span class="muted">No external links added.</span>';

  $("employeeStatusNote").textContent =
    status === "approved" ? "Your profile has been approved by the Founder."
    : status === "pending" ? "Your profile is waiting for Founder review."
    : status === "rejected" ? "Your profile needs changes before it can be approved."
    : "Complete your profile to submit it for Founder review.";

  $("employeeSetup").classList.toggle("hidden", !setupNeeded);

  const { data: projects, error: projectError } = await db
    .from("portfolio_projects")
    .select("*")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  if (projectError) throw projectError;

  $("employeeProjectCount").textContent = String(projects.length);
  $("employeeProjectPreview").innerHTML = projects.length
    ? projects.slice(0, 3).map(project => `
      <article class="portal-project-card">
        <div class="portal-project-top">
          <h3>${esc(project.title)}</h3>
          <span class="portal-status">${esc(project.review_status || "pending")}</span>
        </div>
        <p>${esc(project.description || "No description provided.")}</p>
      </article>
    `).join("")
    : '<p class="muted">No projects yet. Add your first project to showcase your work.</p>';

  const { data: assignments, error: assignmentsError } = await db
    .from("work_assignments").select("*").eq("assigned_to", user.id).order("created_at", {ascending:false});
  if (assignmentsError) throw assignmentsError;
  const { data: submissions, error: submissionsError } = await db
    .from("work_submissions").select("*").eq("employee_id", user.id).order("submitted_at", {ascending:false});
  if (submissionsError) throw submissionsError;
  $("employeeAssignmentCount").textContent = String(assignments.filter(a => !["approved","cancelled"].includes(a.status)).length);
  $("employeeAssignments").innerHTML = assignments.length ? assignments.map(task => {
    const latest = submissions.find(s => s.assignment_id === task.id);
    const shownStatus = latest?.review_status === "pending" ? "submitted for review" : task.status.replace(/_/g," ");
    const canStart = ["assigned","revision_requested"].includes(task.status) && latest?.review_status !== "pending";
    const canSubmit = task.status === "in_progress" && latest?.review_status !== "pending";
    return '<article class="portal-project-card"><div class="portal-project-top"><h3>' + esc(task.title) + '</h3><span class="portal-status">' + esc(shownStatus) + '</span></div><p>' + esc(task.description || "No additional instructions.") + '</p><div class="executive-task-meta"><span>Priority: <b class="priority-' + esc(task.priority) + '">' + esc(task.priority) + '</b></span><span>Deadline: ' + (task.due_at ? esc(new Date(task.due_at).toLocaleString()) : "Not specified") + '</span></div>' + (latest ? '<div class="portal-project-card"><b>Latest submission:</b><p>' + esc(latest.message) + '</p>' + (latest.reviewer_feedback ? '<p><b>Founder feedback:</b> ' + esc(latest.reviewer_feedback) + '</p>' : '') + (safeURL(latest.attachment_url) ? '<a class="portal-link" href="' + esc(safeURL(latest.attachment_url)) + '" target="_blank" rel="noopener noreferrer">Open submitted work ↗</a>' : '') + '</div>' : '') + (canStart ? '<div class="actions"><button class="act primary" data-action="employee-start-work" data-id="' + esc(task.id) + '">Start Work</button></div>' : '') + (canSubmit ? '<form class="work-submit-form portal-form" data-task="' + esc(task.id) + '"><label>Progress update / work submission<textarea name="message" rows="3" minlength="5" required placeholder="Describe your progress or submit your completed work."></textarea></label><label>Attachment or work link (optional)<input name="attachment_url" type="url" placeholder="https://..."></label><button class="btn btn-primary" type="submit">Submit Update to Founder</button><p class="msg"></p></form>' : '') + '</article>';
  }).join("") : '<p class="muted">No work has been assigned to you yet. New assignments from the Founder/CEO will appear here.</p>';

  $("myProjects").innerHTML = projects.length
    ? projects.map(project => {
        const url = safeURL(project.project_url);
        return `
          <article class="portal-project-card">
            <div class="portal-project-top">
              <h3>${esc(project.title)}</h3>
              <span class="portal-status">${esc(project.review_status || "pending")}</span>
            </div>
            <p>${esc(project.description || "No description provided.")}</p>
            ${url ? '<a class="portal-link" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">Open project ↗</a>' : ""}
          </article>`;
      }).join("")
    : '<p class="muted">No projects submitted yet.</p>';
}

function showEmployeePanel(panel) {
  $("profileDetailsPanel").classList.toggle("hidden", panel !== "profile");
  $("projectsPanel").classList.toggle("hidden", panel !== "projects");
  $("employeeWorkPanel").classList.add("hidden");
  $("profileForm").classList.add("hidden");
  if (panel === "profile") $("profileDetailsPanel").scrollIntoView({behavior:"smooth",block:"start"});
  if (panel === "projects") $("projectsPanel").scrollIntoView({behavior:"smooth",block:"start"});
}

$("viewEmployeeProfile").addEventListener("click", () => showEmployeePanel("profile"));
$("viewEmployeeProjects").addEventListener("click", () => showEmployeePanel("projects"));
$("viewEmployeeAssignments").addEventListener("click", () => {
  $("profileDetailsPanel").classList.add("hidden");
  $("projectsPanel").classList.add("hidden");
  $("employeeWorkPanel").classList.remove("hidden");
  $("employeeWorkPanel").scrollIntoView({behavior:"smooth",block:"start"});
});
$("closeEmployeeWork").addEventListener("click", () => $("employeeWorkPanel").classList.add("hidden"));
$("editEmployeeProfile").addEventListener("click", () => {
  $("profileDetailsPanel").classList.add("hidden");
  $("projectsPanel").classList.add("hidden");
  $("profileForm").classList.remove("hidden");
  $("profileForm").scrollIntoView({behavior:"smooth",block:"start"});
});
$("completeEmployeeProfile").addEventListener("click", () => {
  $("profileForm").classList.remove("hidden");
  $("profileForm").scrollIntoView({behavior:"smooth",block:"start"});
});
$("addEmployeeProject").addEventListener("click", () => {
  $("projectForm").classList.toggle("hidden");
  $("projectForm").scrollIntoView({behavior:"smooth",block:"start"});
});
$("addEmployeeProjectFromPanel").addEventListener("click", () => {
  $("projectForm").classList.remove("hidden");
  $("projectForm").scrollIntoView({behavior:"smooth",block:"start"});
});
$("closeEmployeeProfile").addEventListener("click", () => $("profileDetailsPanel").classList.add("hidden"));
$("editEmployeeProfileFromDetails").addEventListener("click", () => $("editEmployeeProfile").click());
$("cancelProfileEdit").addEventListener("click", () => $("profileForm").classList.add("hidden"));
$("cancelProjectAdd").addEventListener("click", () => $("projectForm").classList.add("hidden"));

document.addEventListener("submit", async event => {
  const form = event.target.closest(".work-submit-form");
  if (!form) return;
  event.preventDefault();
  const button = form.querySelector('button[type="submit"]');
  setBusy(button,true);
  try {
    const values = new FormData(form);
    const rawLink = String(values.get("attachment_url") || "").trim();
    const link = rawLink ? safeURL(rawLink) : null;
    if (rawLink && !link) throw new Error("Enter a valid attachment URL.");
    const { error } = await db.from("work_submissions").insert({
      assignment_id:form.dataset.task,
      employee_id:user.id,
      message:String(values.get("message") || "").trim(),
      attachment_url:link
    });
    if (error) throw error;
    await loadEmployee();
    $("employeeWorkPanel").classList.remove("hidden");
    $("employeeWorkPanel").scrollIntoView({behavior:"smooth",block:"start"});
    msg("globalMsg","Your work update has been submitted to the Founder.");
  } catch(error) {
    form.querySelector(".msg").textContent = error.message;
  } finally {
    setBusy(button,false);
  }
});

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
    $("profileForm").classList.add("hidden");

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
  const formElement = event.currentTarget;
  setBusy(button, true);

  try {
    const form = new FormData(formElement);
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

    formElement.reset();

    msg("projectMsg", "Project submitted for Founder review.");
    await loadEmployee();
    $("projectForm").classList.add("hidden");

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