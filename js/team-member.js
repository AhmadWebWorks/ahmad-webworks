
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const db = createClient(
    "https://vxdzyfbxcorxqysvlzgn.supabase.co",
    "sb_publishable_egeeneg2jGd6y2yotB_Bdw_FR2XMVJB"
);

const $ = id => document.getElementById(id);

const escapeHTML = value =>
    String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);

function safeURL(value) {
    try {
        const url = new URL(value);

        return ["https:", "http:"].includes(url.protocol)
            ? url.href
            : "";
    } catch {
        return "";
    }
}

const slug = new URLSearchParams(location.search).get("slug");

async function loadPortfolio() {

    if (!slug) {
        $("memberStatus").textContent =
            "No employee portfolio was specified.";

        return;
    }

    const { data: employee, error } = await db
        .from("employee_portfolios")
        .select(`
            id,
            owner_id,
            full_name,
            job_title,
            location,
            bio,
            skills,
            avatar_url,
            website_url,
            github_url,
            linkedin_url
        `)
        .eq("slug", slug)
        .eq("review_status", "approved")
        .eq("is_published", true)
        .maybeSingle();

    if (error || !employee) {

        $("memberStatus").textContent =
            "This portfolio is unavailable or has not been published.";

        return;
    }

    document.title =
        employee.full_name + " | Ahmad WebWorks";

    $("memberName").textContent = employee.full_name;

    $("memberTitle").textContent =
        employee.job_title || "Ahmad WebWorks Team Member";

    $("memberLocation").textContent =
        employee.location || "";

    $("memberBio").textContent =
        employee.bio || "";

    const initials = employee.full_name
        .split(/\s+/)
        .slice(0, 2)
        .map(word => word[0] || "")
        .join("")
        .toUpperCase();

    const avatarURL = safeURL(employee.avatar_url);

    $("memberAvatar").innerHTML = avatarURL
        ? `<img src="${escapeHTML(avatarURL)}"
                alt="${escapeHTML(employee.full_name)}">`
        : escapeHTML(initials);

    const skills = Array.isArray(employee.skills)
        ? employee.skills
        : [];

    $("memberSkills").innerHTML = skills.map(skill =>
        `<span>${escapeHTML(skill)}</span>`
    ).join("");

    const links = [
        ["Website", employee.website_url],
        ["GitHub", employee.github_url],
        ["LinkedIn", employee.linkedin_url]
    ].map(([label, url]) => [label, safeURL(url)])
     .filter(([, url]) => url);

    $("memberLinks").innerHTML = links.map(([label, url]) =>
        `<a href="${escapeHTML(url)}"
            target="_blank"
            rel="noopener noreferrer">
            ${label} ↗
        </a>`
    ).join("");

    const { data: projects, error: projectError } = await db
        .from("portfolio_projects")
        .select(`
            title,
            description,
            project_url,
            image_url
        `)
        .eq("owner_id", employee.owner_id)
        .eq("review_status", "approved")
        .eq("is_published", true);

    if (projectError) throw projectError;

    if (!projects || projects.length === 0) {

        $("memberProjects").innerHTML =
            '<p class="member-muted">No public projects yet.</p>';

    } else {

        $("memberProjects").innerHTML = projects.map(project => {

            const imageURL = safeURL(project.image_url);
            const projectURL = safeURL(project.project_url);

            return `
                <article class="project-card">

                    ${imageURL
                        ? `<img src="${escapeHTML(imageURL)}" alt="">`
                        : ""
                    }

                    <h3>${escapeHTML(project.title)}</h3>

                    <p>
                        ${escapeHTML(project.description || "")}
                    </p>

                    ${projectURL
                        ? `<a href="${escapeHTML(projectURL)}"
                             target="_blank"
                             rel="noopener noreferrer">
                             View Project ↗
                           </a>`
                        : ""
                    }

                </article>
            `;

        }).join("");

    }

    $("memberStatus").hidden = true;
    $("memberContent").hidden = false;
}

loadPortfolio().catch(error => {

    console.error("Portfolio loading error:", error);

    $("memberStatus").textContent =
        "Unable to load this portfolio. Please try again later.";

});
