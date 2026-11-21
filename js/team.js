
(() => {
  "use strict";

  const form = document.getElementById("employeeApplication");
  if (!form) return;

  const message = document.getElementById("formMessage");
  const submitButton = form.querySelector('[type="submit"]');

  const whatsappNumber = "923704513823";

  const SUPABASE_URL =
    "https://vxdzyfbxcorxqysvlzgn.supabase.co";

  const SUPABASE_KEY =
    "sb_publishable_egeeneg2jGd6y2yotB_Bdw_FR2XMVJB";

  let submitting = false;

  const clean = value => String(value || "").trim();

  function showMessage(text, type = "") {
    message.textContent = text;
    message.dataset.type = type;
  }

  function validURL(value) {
    if (!value) return null;

    try {
      const url = new URL(value);

      if (!["https:", "http:"].includes(url.protocol)) {
        return false;
      }

      return url.href;
    } catch {
      return false;
    }
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();

    if (submitting) return;
    if (!form.reportValidity()) return;

    const data = new FormData(form);

    const applicant = {
      applicant_name: clean(data.get("fullName")),
      email: clean(data.get("email")) || null,
      preferred_role: clean(data.get("role")),
      location: clean(data.get("location")),
      skills: clean(data.get("skills"))
        .split(",")
        .map(skill => skill.trim())
        .filter(Boolean),
      introduction: clean(data.get("experience")),
      portfolio_url: null
    };

    const portfolio = clean(data.get("portfolio"));

    if (portfolio) {
      applicant.portfolio_url = validURL(portfolio);

      if (!applicant.portfolio_url) {
        showMessage("Please enter a valid HTTP/HTTPS portfolio link.");
        return;
      }
    }

    if (
      applicant.applicant_name.length < 2 ||
      applicant.preferred_role.length < 2 ||
      applicant.introduction.length < 5
    ) {
      showMessage("Please provide complete and valid information.");
      return;
    }

    if (!document.getElementById("consent").checked) {
      showMessage("Please confirm your application details.");
      return;
    }

    const whatsappMessage = [
      "AHMAD WEBWORKS — EMPLOYEE PORTFOLIO APPLICATION",
      "",
      "Name: " + applicant.applicant_name,
      "Preferred role: " + applicant.preferred_role,
      "Location: " + applicant.location,
      "Skills: " + applicant.skills.join(", "),
      "Experience / Introduction: " + applicant.introduction,
      "Portfolio / Project Link: " +
        (applicant.portfolio_url || "Not provided"),
      "Email: " + (applicant.email || "Not provided"),
      "",
      "I confirm that the information above is accurate.",
      "Please review my application."
    ].join("\n");

    const whatsappURL =
      "https://wa.me/" + whatsappNumber +
      "?text=" + encodeURIComponent(whatsappMessage);

    submitting = true;
    submitButton.disabled = true;
    submitButton.textContent = "Submitting Application...";

    // Open the WhatsApp tab immediately to avoid popup blocking.
    const whatsappWindow = window.open("about:blank", "_blank");

    if (whatsappWindow) {
      whatsappWindow.opener = null;
    }

    try {
      showMessage("Saving your application...");

      const { createClient } =
        await import("https://esm.sh/@supabase/supabase-js@2");

      const supabase = createClient(
        SUPABASE_URL,
        SUPABASE_KEY
      );

      const { error } = await supabase
        .from("employee_applications")
        .insert(applicant);

      if (error) throw error;

      showMessage(
        "Application successfully saved! Opening WhatsApp...",
        "success"
      );

      submitButton.textContent = "Application Saved ✓";

    } catch (error) {
      console.error("Application submission:", error);

      showMessage(
        "Database submission failed: " +
        error.message +
        ". You can still submit through WhatsApp.",
        "error"
      );

      submitButton.textContent = "Continue to WhatsApp ↗";

    } finally {

      if (whatsappWindow && !whatsappWindow.closed) {
        whatsappWindow.location.href = whatsappURL;
      } else {
        window.location.href = whatsappURL;
      }

      if (!message.textContent.includes("failed")) {
        submitButton.textContent = "Application Submitted ✓";
      }

      // Prevent duplicate submissions during this page session.
      // Reload the page before submitting another application.
    }
  });

})();
