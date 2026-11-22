
(() => {
  "use strict";

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

  form.addEventListener("submit", event => {

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

    const whatsappUrl =
      "https://wa.me/" +
      whatsappNumber +
      "?text=" +
      encodeURIComponent(lines.join("\n"));

    message.textContent =
      "WhatsApp is opening. Please review your application and press Send.";

    const opened = window.open(
      whatsappUrl,
      "_blank",
      "noopener,noreferrer"
    );

    // Fallback if the browser blocks the new tab.
    if (!opened) {
      window.location.href = whatsappUrl;
    }

  });

})();
