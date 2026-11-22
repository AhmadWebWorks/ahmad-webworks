
import { createClient } from
  "https://esm.sh/@supabase/supabase-js@2";

(() => {
  "use strict";

  const db = createClient(
    "https://vxdzyfbxcorxqysvlzgn.supabase.co",
    "sb_publishable_egeeneg2jGd6y2yotB_Bdw_FR2XMVJB"
  );

  const form = document.getElementById("employeeApplication");

  if (!form) return;

  const whatsappNumber = "923704513823";
  const message = document.getElementById("formMessage");

  const emailInput = document.getElementById("email");

  // Validate email while the applicant types.
  emailInput.addEventListener("input", () => {
    emailInput.setCustomValidity("");

    if (!emailInput.value.trim()) {
      emailInput.setCustomValidity(
        "Email address is required."
      );
    } else if (!emailInput.validity.valid) {
      emailInput.setCustomValidity(
        "Please enter a valid email address."
      );
    }
  });

  form.addEventListener("submit", async event => {

    event.preventDefault();

    // Validate every required field.
    if (!form.reportValidity()) return;

    const data = new FormData(form);

    const clean = value => String(value || "").trim();

    const email = clean(data.get("email")).toLowerCase();

    // Additional email validation.
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!email || !emailPattern.test(email)) {
      emailInput.setCustomValidity(
        "A valid email address is required."
      );

      emailInput.reportValidity();
      return;
    }

    emailInput.setCustomValidity("");

    const portfolio = clean(data.get("portfolio"));

    // Validate portfolio URL.
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

    // Prepare application message.
    const lines = [

      "AHMAD WEBWORKS — EMPLOYEE PORTFOLIO APPLICATION",

      "",

      "Name: " + clean(data.get("fullName")),

      "Email: " + email,

      "Preferred role: " + clean(data.get("role")),

      "Location: " + clean(data.get("location")),

      "Skills: " + clean(data.get("skills")),

      "Experience / Introduction: " +
        clean(data.get("experience")),

      "Portfolio / Project Link: " +
        (portfolio || "Not provided"),

      "",

      "I confirm that the information above is accurate.",

      "Please review my application."

    ];

    // Open a tab synchronously so mobile browsers do not block the WhatsApp handoff.
    const popup = window.open("about:blank", "_blank");
    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Submitting application...";
    }
    message.textContent = "Saving your application securely...";

    try {
      const { data: submission, error: saveError } = await db.functions.invoke(
        "submit-employee-application",
        {
          body: {
            applicant_name: clean(data.get("fullName")),
            email,
            preferred_role: clean(data.get("role")),
            location: clean(data.get("location")),
            skills: clean(data.get("skills")).split(",").map(x => x.trim()).filter(Boolean),
            introduction: clean(data.get("experience")),
            portfolio_url: portfolio || null,
            website: clean(data.get("website"), 200)
          }
        }
      );

      if (saveError) throw saveError;
      const applicationId = submission?.application_id;
      if (!applicationId) throw new Error(submission?.error || "The application was not saved. Please try again.");

      lines.push("", "Application Reference: " + applicationId);

      let receiptNote = "";
      try {
        const { data: receipt, error: receiptError } = await db.functions.invoke(
          "notify-application-status",
          {
            body: {
              action: "application_received",
              application_id: applicationId
            }
          }
        );

        if (receiptError || receipt?.error || receipt?.rate_limited) {
          receiptNote = " Your application is saved, but the receipt email could not be confirmed. Our team can still review it.";
        } else {
          receiptNote = " A receipt email has been processed for your application.";
        }
      } catch {
        receiptNote = " Your application is saved, but the receipt email could not be confirmed. Our team can still review it.";
      }

      const whatsappUrl =
        "https://wa.me/" +
        whatsappNumber +
        "?text=" +
        encodeURIComponent(lines.join("\n"));

      message.textContent =
        "Application saved. Reference: " + applicationId +
        ". WhatsApp is opening; please review the message and press Send." +
        receiptNote;

      if (popup && !popup.closed) {
        popup.opener = null;
        popup.location.href = whatsappUrl;
      } else {
        window.location.href = whatsappUrl;
      }

    } catch (error) {
      if (popup && !popup.closed) popup.close();
      message.textContent =
        "We could not save your application. Please check your connection and try again. " +
        (error?.message || "");
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "Submit Application & Continue to WhatsApp";
      }
    }

  });

})();
