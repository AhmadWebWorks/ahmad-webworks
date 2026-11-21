
(() => {
  "use strict";

  const form = document.getElementById("employeeApplication");

  if (!form) return;

  const whatsappNumber = "923704513823";
  const message = document.getElementById("formMessage");

  form.addEventListener("submit", async event => {

    event.preventDefault();

    if (!form.reportValidity()) return;

    const data = new FormData(form);
    const clean = value => String(value || "").trim();

    const portfolio = clean(data.get("portfolio"));

    if (portfolio) {
      try {
        const parsed = new URL(portfolio);

        if (!["http:", "https:"].includes(parsed.protocol)) {
          throw new Error("Invalid URL");
        }

      } catch {
        message.textContent =
          "Please enter a valid portfolio link beginning with https://";
        return;
      }
    }

    const applicant = {
      applicant_name: clean(data.get("fullName")),
      email: clean(data.get("email")) || null,
      preferred_role: clean(data.get("role")),
      location: clean(data.get("location")),
      skills: clean(data.get("skills"))
        .split(",")
        .map(x => x.trim())
        .filter(Boolean),
      introduction: clean(data.get("experience")),
      portfolio_url: portfolio || null
    };

    const lines = [
      "AHMAD WEBWORKS — EMPLOYEE PORTFOLIO APPLICATION",
      "",
      "Name: " + applicant.applicant_name,
      "Preferred role: " + applicant.preferred_role,
      "Location: " + applicant.location,
      "Skills: " + applicant.skills.join(", "),
      "Experience / Introduction: " + applicant.introduction,
      "Portfolio / Project Link: " + (portfolio || "Not provided"),
      "Email: " + (applicant.email || "Not provided"),
      "",
      "I confirm that the information above is accurate.",
      "Please review my application."
    ];

    message.textContent = "Saving your application...";

    try {

      const { createClient } =
        await import("https://esm.sh/@supabase/supabase-js@2");

      const db = createClient(
        "https://vxdzyfbxcorxqysvlzgn.supabase.co",
        "sb_publishable_egeeneg2jGd6y2yotB_Bdw_FR2XMVJB"
      );

      const { error } = await db
        .from("employee_applications")
        .insert(applicant);

      if (error) throw error;

      message.textContent =
        "Application saved! Opening WhatsApp for confirmation...";

    } catch (error) {

      message.textContent =
        "Database saving failed: " + error.message +
        ". You can still submit through WhatsApp.";

    }

    const whatsappUrl =
      "https://wa.me/" +
      whatsappNumber +
      "?text=" +
      encodeURIComponent(lines.join("\n"));

    const opened = window.open(
      whatsappUrl,
      "_blank",
      "noopener,noreferrer"
    );

    if (!opened) {
      window.location.href = whatsappUrl;
    }

  });

})();
