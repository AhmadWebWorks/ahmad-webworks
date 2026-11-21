
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const db = createClient(
  "https://vxdzyfbxcorxqysvlzgn.supabase.co",
  "sb_publishable_egeeneg2jGd6y2yotB_Bdw_FR2XMVJB"
);

const $ = id => document.getElementById(id);

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
}[c]));

let user = null;
let profile = null;
let busy = false;

function showMessage(id, value) {
  const element = $(id);
  if (element) element.textContent = value;
}

function buttonBusy(button, state) {
  button.disabled = state;
  button.dataset.originalText ||= button.textContent;
  button.textContent = state
    ? "Please wait..."
    : button.dataset.originalText;
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function validURL(value) {
  if (!value) return null;

  try {
    const url = new URL(value);

    if (!["https:", "http:"].includes(url.protocol)) {
      return null;
    }

    return url.href;
  } catch {
    return null;
  }
}

/* =====================================
   AUTHENTICATION
===================================== */

$("loginForm").addEventListener("submit", async event => {
  event.preventDefault();

  const button = event.submitter;
  buttonBusy(button, true);

  showMessage("loginMsg", "Signing in...");

  const form = new FormData(event.currentTarget);

  try {
    const { error } = await db.auth.signInWithPassword({
      email: form.get("email"),
      password: form.get("password")
    });

    if (error) throw error;

    await boot();

  } catch (error) {
    showMessage("loginMsg", error.message);
  } finally {
    buttonBusy(button, false);
  }
});

$("logout").addEventListener("click", async () => {
  await db.auth.signOut();
  location.reload();
});

/* =====================================
   START WORKSPACE
===================================== */

async function boot() {
  const {
    data: { user: currentUser },
    error
  } = await db.auth.getUser();

  if (error || !currentUser) return;

  user = currentUser;

  const { data, error: profileError } = await db
    .from("profiles")
    .select("id,role,account_status")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !data) {
    showMessage(
      "globalMsg",
      "Your account profile is unavailable. Contact the administrator."
    );
    return;
  }

  profile = data;

  if (profile.account_status !== "active") {
    showMessage(
      "globalMsg",
      "Your account is not active. Contact the administrator."
    );

    await db.auth.signOut();
    return;
  }

  $("login").classList.add("hidden");
  $("workspace").classList.remove("hidden");

  $("welcome").textContent =
    "Welcome, " + (user.email || "Team member");

  $("roleText").textContent =
    profile.role === "admin"
      ? "Founder / Administrator"
      : "Employee Workspace";

  if (profile.role === "admin") {
    $("admin").classList.remove("hidden");
    $("employee").classList.add("hidden");
    await loadAdmin();
  } else {
    $("employee").classList.remove("hidden");
    $("admin").classList.add("hidden");
    await loadEmployee();
  }
}

/* =====================================
   ADMIN DASHBOARD
===================================== */

async function loadAdmin() {
  showMessage("globalMsg", "Loading administration data...");

  const [applications, accounts, portfolios, projects] =
    await Promise.all([

      db.from("employee_applications")
        .select("*")
        .order("created_at", { ascending: false }),

      db.from("profiles")
        .select("id,role,account_status,created_at"),

      db.from("employee_portfolios")
        .select("*"),

      db.from("portfolio_projects")
        .select("*")
    ]);

  const results = [
    applications,
    accounts,
    portfolios,
    projects
  ];

  const failed = results.find(result => result.error);

  if (failed) {
    showMessage("globalMsg", failed.error.message);
    return;
  }

  const apps = applications.data || [];
  const people = accounts.data || [];
  const profiles = portfolios.data || [];
  const works = projects.data || [];

  $("appCount").textContent = apps.length;

  $("empCount").textContent = people.filter(person =>
    person.role === "employee" &&
    person.account_status === "active"
  ).length;

  $("reviewCount").textContent =
    profiles.filter(x => x.review_status === "pending").length +
    works.filter(x => x.review_status === "pending").length;

  renderApplications(apps);
  renderAccounts(people);
  renderReviews(profiles, works);

  showMessage("globalMsg", "Administration data loaded.");
}

/* =====================================
   APPLICATION MANAGEMENT
===================================== */

function renderApplications(apps) {
  if (!apps.length) {
    $("appsList").innerHTML =
      '<p class="muted">No applications received yet.</p>';
    return;
  }

  $("appsList").innerHTML = `
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
        ${apps.map(app => `
          <tr>
            <td>
              <b>${esc(app.applicant_name)}</b>
              <br>${esc(app.email || "No email")}
              <br>
              ${app.email ? `
                <button class="act"
                  data-copy-email="${esc(app.email)}">
                  Copy email
                </button>` : ""}
            </td>

            <td>
              ${esc(app.preferred_role)}
              <br>${esc(app.location)}
            </td>

            <td>
              ${esc(app.introduction)}
              <br>
              <b>Skills:</b>
              ${esc((app.skills || []).join(", "))}
              ${app.portfolio_url ? `
                <br>
                <a href="${esc(validURL(app.portfolio_url) || "#")}"
                   target="_blank"
                   rel="noopener noreferrer">
                  View portfolio ↗
                </a>` : ""}
            </td>

            <td>
              <b>${esc(app.status)}</b>

              <div class="actions">
                <button class="act"
                  data-app="${app.id}"
                  data-status="under_review">
                  Review
                </button>

                <button class="act primary"
                  data-app="${app.id}"
                  data-status="approved">
                  Approve
                </button>

                <button class="act danger"
                  data-app="${app.id}"
                  data-status="rejected">
                  Reject
                </button>
              </div>

              <label class="muted">
                Administrator notes
                <textarea
                  id="notes-${app.id}"
                  rows="2"
                  maxlength="1000">${esc(app.admin_notes || "")}</textarea>
              </label>

              <button class="act"
                data-save-notes="${app.id}">
                Save notes
              </button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

/* =====================================
   EMPLOYEE ACCOUNT MANAGEMENT
===================================== */

function renderAccounts(people) {
  $("peopleList").innerHTML = people.length ? `
    <table>
      <thead>
        <tr>
          <th>User ID</th>
          <th>Role</th>
          <th>Account status</th>
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
              ${person.role === "admin"
                ? "Administrator"
                : `
                  <button class="act"
                    data-user="${person.id}"
                    data-status="${person.account_status === "active"
                      ? "suspended" : "active"}">
                    ${person.account_status === "active"
                      ? "Suspend" : "Activate"}
                  </button>
                `}
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  ` : '<p class="muted">No employee accounts yet.</p>';

  $("peopleList").insertAdjacentHTML(
    "beforeend",
    `<p class="muted">
      New employee accounts must first be invited through
      Supabase Authentication. Activate them here after their
      account profile exists.
    </p>`
  );
}

/* =====================================
   PORTFOLIO AND PROJECT REVIEWS
===================================== */

function renderReviews(profiles, projects) {
  const pendingProfiles = profiles.filter(
    x => x.review_status === "pending"
  );

  const pendingProjects = projects.filter(
    x => x.review_status === "pending"
  );

  const items = [
    ...pendingProfiles.map(item => ({
      table: "employee_portfolios",
      id: item.id,
      label: "Employee profile: " + item.full_name
    })),

    ...pendingProjects.map(item => ({
      table: "portfolio_projects",
      id: item.id,
      label: "Project: " + item.title
    }))
  ];

  $("reviewsList").innerHTML = items.length
    ? items.map(item => `
      <div class="stat" style="margin:12px 0">
        <b>${esc(item.label)}</b>

        <div class="actions">
          <button class="act primary"
            data-review="${item.id}"
            data-table="${item.table}"
            data-decision="approved">
            Approve & Publish
          </button>

          <button class="act danger"
            data-review="${item.id}"
            data-table="${item.table}"
            data-decision="rejected">
            Reject
          </button>
        </div>
      </div>
    `).join("")
    : '<p class="muted">No pending portfolio reviews.</p>';
}

/* =====================================
   ADMIN ACTIONS
===================================== */

document.addEventListener("click", async event => {
  const button = event.target.closest("button");

  if (!button || busy) return;

  try {
    busy = true;
    buttonBusy(button, true);

    /* Copy applicant email */

    if (button.dataset.copyEmail) {
      await navigator.clipboard.writeText(
        button.dataset.copyEmail
      );

      showMessage("globalMsg", "Applicant email copied.");
      return;
    }

    /* Update application status */

    if (button.dataset.app) {
      const { error } = await db
        .from("employee_applications")
        .update({
          status: button.dataset.status,
          reviewed_at: new Date().toISOString()
        })
        .eq("id", button.dataset.app);

      if (error) throw error;

      showMessage(
        "globalMsg",
        "Application status updated. Approval does not automatically create an account."
      );

      await loadAdmin();
      return;
    }

    /* Save administrator notes */

    if (button.dataset.saveNotes) {
      const notes = $("notes-" + button.dataset.saveNotes).value;

      const { error } = await db
        .from("employee_applications")
        .update({ admin_notes: notes })
        .eq("id", button.dataset.saveNotes);

      if (error) throw error;

      showMessage("globalMsg", "Administrator notes saved.");
      await loadAdmin();
      return;
    }

    /* Activate or suspend employee */

    if (button.dataset.user) {
      if (!confirm("Change this employee account status?")) return;

      const { error } = await db
        .from("profiles")
        .update({
          account_status: button.dataset.status
        })
        .eq("id", button.dataset.user);

      if (error) throw error;

      showMessage("globalMsg", "Employee account status updated.");
      await loadAdmin();
      return;
    }

    /* Approve or reject portfolio / project */

    if (button.dataset.review) {
      const decision = button.dataset.decision;

      if (!confirm(
        decision === "approved"
          ? "Approve and publish this submission?"
          : "Reject this submission?"
      )) return;

      const { error } = await db
        .from(button.dataset.table)
        .update({
          review_status: decision,
          is_published: decision === "approved",
          updated_at: new Date().toISOString()
        })
        .eq("id", button.dataset.review);

      if (error) throw error;

      showMessage("globalMsg", "Review decision saved.");
      await loadAdmin();
    }

  } catch (error) {
    showMessage("globalMsg", error.message);
  } finally {
    busy = false;
    buttonBusy(button, false);
  }
});

/* =====================================
   ADMIN NAVIGATION TABS
===================================== */

document.querySelectorAll("[data-tab]").forEach(button => {
  button.addEventListener("click", () => {

    document.querySelectorAll("[data-tab]").forEach(tab => {
      tab.classList.toggle("active", tab === button);
    });

    ["apps", "people", "reviews"].forEach(id => {
      $(id).classList.toggle(
        "hidden",
        id !== button.dataset.tab
      );
    });
  });
});

/* =====================================
   EMPLOYEE WORKSPACE
===================================== */

async function loadEmployee() {
  let { data: portfolio, error } = await db
    .from("employee_portfolios")
    .select("*")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (error) throw error;

  /* Create initial portfolio for a newly invited employee */

  if (!portfolio) {
    const fullName =
      user.user_metadata?.full_name ||
      user.email?.split("@")[0] ||
      "New Employee";

    const { data, error: createError } = await db
      .from("employee_portfolios")
      .insert({
        owner_id: user.id,
        full_name: fullName,
        slug: slugify(fullName) + "-" + user.id.slice(0, 6),
        review_status: "draft",
        is_published: false
      })
      .select()
      .single();

    if (createError) throw createError;

    portfolio = data;
  }

  const form = $("profileForm");

  [
    "full_name",
    "job_title",
    "location",
    "bio",
    "website_url",
    "github_url",
    "linkedin_url"
  ].forEach(key => {
    if (form.elements[key]) {
      form.elements[key].value = portfolio[key] || "";
    }
  });

  form.elements.skills.value =
    (portfolio.skills || []).join(", ");

  showMessage(
    "profileMsg",
    "Portfolio status: " + portfolio.review_status
  );

  const { data: projects, error: projectError } = await db
    .from("portfolio_projects")
    .select("*")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  if (projectError) throw projectError;

  $("myProjects").innerHTML = projects.length
    ? projects.map(project => `
      <div class="stat" style="margin:12px 0">
        <b>${esc(project.title)}</b>
        <p>${esc(project.description)}</p>
        <p class="muted">
          Status: ${esc(project.review_status)}
          ${project.is_published ? " · Published" : ""}
        </p>
      </div>
    `).join("")
    : '<p class="muted">No projects submitted yet.</p>';
}

/* =====================================
   EMPLOYEE PROFILE SUBMISSION
===================================== */

$("profileForm").addEventListener("submit", async event => {
  event.preventDefault();

  const button = event.submitter;
  buttonBusy(button, true);

  try {
    const form = new FormData(event.currentTarget);

    const name = String(form.get("full_name") || "").trim();

    if (name.length < 2) {
      throw new Error("Please enter your full name.");
    }

    const payload = {
      full_name: name,
      job_title: String(form.get("job_title") || "").trim(),
      location: String(form.get("location") || "").trim(),
      bio: String(form.get("bio") || "").trim(),

      skills: String(form.get("skills") || "")
        .split(",")
        .map(x => x.trim())
        .filter(Boolean),

      website_url: validURL(form.get("website_url")),
      github_url: validURL(form.get("github_url")),
      linkedin_url: validURL(form.get("linkedin_url")),

      slug: slugify(name) + "-" + user.id.slice(0, 6),

      review_status: "pending",
      is_published: false,
      updated_at: new Date().toISOString()
    };

    const { error } = await db
      .from("employee_portfolios")
      .update(payload)
      .eq("owner_id", user.id);

    if (error) throw error;

    showMessage(
      "profileMsg",
      "Your profile has been submitted for administrator approval."
    );

    await loadEmployee();

  } catch (error) {
    showMessage("profileMsg", error.message);
  } finally {
    buttonBusy(button, false);
  }
});

/* =====================================
   EMPLOYEE PROJECT SUBMISSION
===================================== */

$("projectForm").addEventListener("submit", async event => {
  event.preventDefault();

  const button = event.submitter;
  buttonBusy(button, true);

  try {
    const form = new FormData(event.currentTarget);

    const title = String(form.get("title") || "").trim();

    if (title.length < 2) {
      throw new Error("Enter a valid project title.");
    }

    const projectURL = form.get("project_url")
      ? validURL(form.get("project_url"))
      : null;

    if (form.get("project_url") && !projectURL) {
      throw new Error("Please enter a valid project URL.");
    }

    const { error } = await db
      .from("portfolio_projects")
      .insert({
        owner_id: user.id,
        title,
        description: String(form.get("description") || "").trim(),
        project_url: projectURL,
        review_status: "pending",
        is_published: false
      });

    if (error) throw error;

    event.currentTarget.reset();

    showMessage(
      "projectMsg",
      "Project submitted for administrator review."
    );

    await loadEmployee();

  } catch (error) {
    showMessage("projectMsg", error.message);
  } finally {
    buttonBusy(button, false);
  }
});

/* =====================================
   INITIAL SESSION
===================================== */

db.auth.getSession().then(async ({ data, error }) => {
  if (error) {
    showMessage("globalMsg", error.message);
    return;
  }

  if (data.session) {
    try {
      await boot();
    } catch (error) {
      showMessage("globalMsg", error.message);
    }
  }
});

