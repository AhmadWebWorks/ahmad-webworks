
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
    "https://vxdzyfbxcorxqysvlzgn.supabase.co",
    "sb_publishable_egeeneg2jGd6y2yotB_Bdw_FR2XMVJB"
);

const container = document.getElementById("employeeTeamGrid");

const escapeHTML = value =>
    String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);

const safeURL = value => {
    try {
        const url = new URL(value);
        return ["https:", "http:"].includes(url.protocol)
            ? url.href
            : "";
    } catch {
        return "";
    }
};

async function loadEmployees() {

    if (!container) return;

    container.innerHTML =
        '<p class="employee-empty">Loading our team...</p>';

    try {

        const { data, error } = await supabase
            .from("employee_portfolios")
            .select(`
                full_name,
                job_title,
                location,
                bio,
                skills,
                avatar_url,
                slug
            `)
            .eq("review_status", "approved")
            .eq("is_published", true)
            .order("full_name");

        if (error) throw error;

        if (!data || data.length === 0) {

            container.innerHTML = `
                <div class="employee-empty">
                    <strong>We're currently a founder-led studio.</strong>
                    <br>
                    Ahmad WebWorks is growing, and we're
                    looking forward to welcoming talented
                    people to our team.
                    <br>
                    Interested in joining us?
                    <a href="join-team.html">Apply here →</a>
                </div>
            `;

            return;
        }

        container.innerHTML = data.map(employee => {

            const initials = employee.full_name
                .split(/\s+/)
                .slice(0, 2)
                .map(word => word[0] || "")
                .join("")
                .toUpperCase();

            const avatarURL = safeURL(employee.avatar_url);

            const avatar = avatarURL
                ? `<img src="${escapeHTML(avatarURL)}"
                     alt="${escapeHTML(employee.full_name)}">`
                : escapeHTML(initials);

            const skills = Array.isArray(employee.skills)
                ? employee.skills
                : [];

            const profileLink = employee.slug
                ? `team-member.html?slug=${encodeURIComponent(employee.slug)}`
                : "";

            return `
                <article class="employee-team-card">

                    <div class="employee-avatar">
                        ${avatar}
                    </div>

                    <div class="employee-card-body">

                        <span class="employee-role">
                            ${escapeHTML(employee.job_title || "Team Member")}
                        </span>

                        <h3>${escapeHTML(employee.full_name)}</h3>

                        <p>
                            ${escapeHTML(employee.location || "")}
                        </p>

                        <p>
                            ${escapeHTML(employee.bio || "")}
                        </p>

                        <div class="employee-skills">
                            ${skills.slice(0, 6).map(skill =>
                                `<span>${escapeHTML(skill)}</span>`
                            ).join("")}
                        </div>

                        ${profileLink
                            ? `<a class="employee-profile-link"
                                 href="${profileLink}">
                                 View Portfolio →
                               </a>`
                            : ""
                        }

                    </div>

                </article>
            `;

        }).join("");

    } catch (error) {

        console.error("Employee directory error:", error);

        container.innerHTML = `
            <div class="employee-empty">
                Employee profiles are temporarily unavailable.
                Please visit again later.
            </div>
        `;
    }
}

loadEmployees();
