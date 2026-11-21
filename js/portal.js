
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

function message(id, value) {
  $(id).textContent = value;
}

$("loginForm").addEventListener("submit", async event => {
  event.preventDefault();

  message("loginMsg", "Signing in...");

  const form = new FormData(event.currentTarget);

  const { error } = await db.auth.signInWithPassword({
    email: form.get("email"),
    password: form.get("password")
  });

  if (error) {
    message("loginMsg", error.message);
    return;
  }

  await boot();
});

$("logout").addEventListener("click", async () => {
  await db.auth.signOut();
  location.reload();
});

async function boot() {
  const { data: { user: currentUser } } =
    await db.auth.getUser();

  if (!currentUser) return;

  user = currentUser;

  const { data, error } = await db
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error || !data) {
    message("globalMsg", "Account profile unavailable. Contact administrator.");
    return;
  }

  profile = data;

  if (profile.account_status !== "active") {
    message("globalMsg", "Your account is awaiting activation.");
    await db.auth.signOut();
    return;
  }

  $("login").classList.add("hidden");
  $("workspace").classList.remove("hidden");

  $("welcome").textContent = "Welcome, " + (user.email || "Team member");

  $("roleText").textContent =
    profile.role === "admin"
      ? "Founder / Administrator"
      : "Employee workspace";

  if (profile.role === "admin") {
    $("admin").classList.remove("hidden");
    await loadAdmin();
  } else {
    $("employee").classList.remove("hidden");
    await loadEmployee();
  }
}

async function loadAdmin() {

  const [applications, employees, portfolios, projects] =
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

  for (const result of [
    applications, employees, portfolios, projects
  ]) {
    if (result.error) {
      message("globalMsg", result.error.message);
      return;
    }
  }

  const apps = applications.data;
  const people = employees.data;
  const profiles = portfolios.data;
  const works = projects.data;

  $("appCount").textContent = apps.length;

  $("empCount").textContent = people.filter(
    x => x.role === "employee" && x.account_status === "active"
  ).length;

  $("reviewCount").textContent =
    profiles.filter(x => x.review_status === "pending").length +
    works.filter(x => x.review_status === "pending").length;

  $("appsList").innerHTML = apps.length
    ? `<table>
      <tr>
        <th>Applicant</th>
        <th>Role / Location</th>
        <th>Details</th>
        <th>Status / Actions</th>
      </tr>
      ${apps.map(x => `
        <tr>
          <td><b>${esc(x.applicant_name)}</b><br>${esc(x.email || "No email")}</td>
          <td>${esc(x.preferred_role)}<br>${esc(x.location)}</td>
          <td>
            ${esc(x.introduction)}
            <br>${esc((x.skills || []).join(", "))}
            ${x.portfolio_url
              ? `<br><a target="_blank" rel="noopener" href="${esc(x.portfolio_url)}">Portfolio ↗</a>`
              : ""}
          </td>
          <td>
            ${esc(x.status)}
            <div class="actions">
              <button class="act" data-app="${x.id}" data-status="under_review">Review</button>
              <button class="act primary" data-app="${x.id}" data-status="approved">Approve</button>
              <button class="act danger" data-app="${x.id}" data-status="rejected">Reject</button>
            </div>
          </td>
        </tr>
      `).join("")}
    </table>`
    : '<p class="muted">No applications stored yet.</p>';

  $("peopleList").innerHTML = `
    <table>
      <tr><th>User ID</th><th>Role</th><th>Status</th><th>Action</th></tr>
      ${people.map(x => `
        <tr>
          <td>${esc(x.id)}</td>
          <td>${esc(x.role)}</td>
          <td>${esc(x.account_status)}</td>
          <td>
            ${x.role === "admin"
              ? "Administrator"
              : `<button class="act"
                  data-user="${x.id}"
                  data-status="${x.account_status === "active" ? "suspended" : "active"}">
                  ${x.account_status === "active" ? "Suspend" : "Activate"}
                </button>`}
          </td>
        </tr>
      `).join("")}
    </table>
  `;

  const pending = [
    ...profiles.filter(x => x.review_status === "pending")
      .map(x => ({
        table: "employee_portfolios",
        id: x.id,
        label: "Profile: " + x.full_name + " — " + x.job_title
      })),

    ...works.filter(x => x.review_status === "pending")
      .map(x => ({
        table: "portfolio_projects",
        id: x.id,
        label: "Project: " + x.title
      }))
  ];

  $("reviewsList").innerHTML = pending.length
    ? pending.map(x => `
      <div class="stat" style="margin:10px 0">
        <b>${esc(x.label)}</b>
        <div class="actions">
          <button class="act primary"
            data-review="${x.id}"
            data-table="${x.table}"
            data-decision="approved">
            Approve & Publish
          </button>
          <button class="act danger"
            data-review="${x.id}"
            data-table="${x.table}"
            data-decision="rejected">
            Reject
          </button>
        </div>
      </div>
    `).join("")
    : '<p class="muted">No pending reviews.</p>';
}

document.querySelectorAll("[data-tab]").forEach(button => {

  button.addEventListener("click", () => {

    document.querySelectorAll("[data-tab]").forEach(item => {
      item.classList.toggle("active", item === button);
    });

    ["apps", "people", "reviews"].forEach(id => {
      $(id).classList.toggle("hidden", id !== button.dataset.tab);
    });

  });

});

document.addEventListener("click", async event => {

  const button = event.target.closest("button");

  if (!button) return;

  if (button.dataset.app) {

    const { error } = await db
      .from("employee_applications")
      .update({
        status: button.dataset.status,
        reviewed_at: new Date().toISOString()
      })
      .eq("id", button.dataset.app);

    if (error) message("globalMsg", error.message);
    else await loadAdmin();
  }

  if (button.dataset.user) {

    const { error } = await db
      .from("profiles")
      .update({
        account_status: button.dataset.status
      })
      .eq("id", button.dataset.user);

    if (error) message("globalMsg", error.message);
    else await loadAdmin();
  }

  if (button.dataset.review) {

    const { error } = await db
      .from(button.dataset.table)
      .update({
        review_status: button.dataset.decision,
        is_published: button.dataset.decision === "approved"
      })
      .eq("id", button.dataset.review);

    if (error) message("globalMsg", error.message);
    else await loadAdmin();
  }

});

async function loadEmployee() {

  const { data, error } = await db
    .from("employee_portfolios")
    .select("*")
    .eq("owner_id", user.id)
    .single();

  if (error) {
    message("globalMsg", error.message);
    return;
  }

  const form = $("profileForm");

  for (const [key, value] of Object.entries(data)) {

    if (form.elements[key]) {
      form.elements[key].value =
        Array.isArray(value)
          ? value.join(", ")
          : value || "";
    }

  }

  const { data: projects, error: projectError } = await db
    .from("portfolio_projects")
    .select("*")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  if (projectError) {
    message("globalMsg", projectError.message);
    return;
  }

  $("myProjects").innerHTML = projects.length
    ? projects.map(x => `
      <div class="stat" style="margin:10px 0">
        <b>${esc(x.title)}</b> · ${esc(x.review_status)}
        <p>${esc(x.description)}</p>
      </div>
    `).join("")
    : '<p class="muted">No projects added.</p>';
}

$("profileForm").addEventListener("submit", async event => {

  event.preventDefault();

  const form = new FormData(event.currentTarget);

  const payload = {
    full_name: form.get("full_name"),
    job_title: form.get("job_title"),
    location: form.get("location"),
    bio: form.get("bio"),
    skills: String(form.get("skills") || "")
      .split(",").map(x => x.trim()).filter(Boolean),
    website_url: form.get("website_url") || null,
    github_url: form.get("github_url") || null,
    linkedin_url: form.get("linkedin_url") || null
  };

  const { error } = await db
    .from("employee_portfolios")
    .update(payload)
    .eq("owner_id", user.id);

  message(
    "profileMsg",
    error ? error.message : "Submitted for administrator approval."
  );

});

$("projectForm").addEventListener("submit", async event => {

  event.preventDefault();

  const form = new FormData(event.currentTarget);

  const { error } = await db
    .from("portfolio_projects")
    .insert({
      owner_id: user.id,
      title: form.get("title"),
      description: form.get("description"),
      project_url: form.get("project_url") || null
    });

  message(
    "projectMsg",
    error ? error.message : "Project submitted for review."
  );

  if (!error) {
    event.currentTarget.reset();
    await loadEmployee();
  }

});

db.auth.getSession().then(({ data }) => {
  if (data.session) boot();
});
