
(() => {
  "use strict";

  const form = document.getElementById("employeeApplication");

  if (!form) return;

  // Ahmad WebWorks official WhatsApp number
  const whatsappNumber = "923704513823";

  const message = document.getElementById("formMessage");

  form.addEventListener("submit", event => {

    event.preventDefault();

    if (!form.reportValidity()) return;

    const data = new FormData(form);

    const clean = value => String(value || "").trim();

    const portfolio = clean(data.get("portfolio"));

    // Validate portfolio URL
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

    // Prepare application message
    const lines = [

      "AHMAD WEBWORKS — EMPLOYEE PORTFOLIO APPLICATION",

      "",

      "Name: " + clean(data.get("fullName")),

      "Preferred role: " + clean(data.get("role")),

      "Location: " + clean(data.get("location")),

      "Skills: " + clean(data.get("skills")),

      "Experience / Introduction: " +
        clean(data.get("experience")),

      "Portfolio / Project Link: " +
        (portfolio || "Not provided"),

      "Email: " +
        (clean(data.get("email")) || "Not provided"),

      "",

      "I confirm that the information above is accurate.",

      "Please review my application."

    ];

    const whatsappUrl =
      "https://wa.me/" +
      whatsappNumber +
      "?text=" +
      encodeURIComponent(lines.join("\n"));

    message.textContent =
      "WhatsApp is opening. Please review your application and press Send.";

    // Open WhatsApp
    const opened = window.open(
      whatsappUrl,
      "_blank",
      "noopener,noreferrer"
    );

    // Fallback for browsers blocking new tabs
    if (!opened) {
      window.location.href = whatsappUrl;
    }

  });

})();
