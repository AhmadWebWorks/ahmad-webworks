(() => {
  "use strict";

  const body = document.body;
  const header = document.querySelector(".site-header");
  const navToggle = document.querySelector(".nav-toggle");
  const navLinks = document.querySelector(".nav-links");
  const backdrop = document.querySelector(".nav-backdrop");
  const navClose = document.querySelector(".nav-close");

  // MOBILE NAVIGATION — reliable tap, backdrop and keyboard handling
  function closeMenu() {
    if (!navToggle || !navLinks) return;
    body.classList.remove("nav-open");
    navToggle.setAttribute("aria-expanded", "false");
    navToggle.setAttribute("aria-label", "Open navigation");
  }

  function openMenu() {
    if (!navToggle || !navLinks) return;
    body.classList.add("nav-open");
    navToggle.setAttribute("aria-expanded", "true");
    navToggle.setAttribute("aria-label", "Close navigation");
  }

  navToggle?.addEventListener("click", event => {
    event.preventDefault();
    if (body.classList.contains("nav-open")) closeMenu();
    else openMenu();
  });

  backdrop?.addEventListener("click", closeMenu);
  navClose?.addEventListener("click", closeMenu);

  navLinks?.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", closeMenu);
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeMenu();
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 768) closeMenu();
  });

  // STICKY HEADER
  function updateHeader() {
    header?.classList.toggle("scrolled", window.scrollY > 30);
  }

  window.addEventListener("scroll", updateHeader, { passive: true });
  updateHeader();

  // SCROLL REVEAL
  const revealElements = document.querySelectorAll(".reveal");

  if ("IntersectionObserver" in window) {
    const revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });

    revealElements.forEach(element => revealObserver.observe(element));
  } else {
    revealElements.forEach(element => element.classList.add("visible"));
  }

  // ACTIVE NAVIGATION LINK
  const sections = document.querySelectorAll("main section[id]");
  const pageLinks = [...document.querySelectorAll(".nav-link")];
  const sectionLinks = pageLinks.filter(link =>
    (link.getAttribute("href") || "").startsWith("#")
  );

  // Only update active states for same-page section links.
  // Dedicated page links keep their page-level active state.
  if (sectionLinks.length && "IntersectionObserver" in window) {
    const sectionObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          sectionLinks.forEach(link => {
            const active = link.getAttribute("href") === `#${entry.target.id}`;
            link.classList.toggle("active", active);
          });
        }
      });
    }, {
      rootMargin: "-30% 0px -60% 0px"
    });

    sections.forEach(section => sectionObserver.observe(section));
  }

  // PROJECT CARD TILT (DESKTOP POINTERS ONLY)
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  const finePointer = window.matchMedia(
    "(hover: hover) and (pointer: fine)"
  ).matches;

  if (!reduceMotion && finePointer) {
    document.querySelectorAll(".project-card").forEach(card => {
      card.addEventListener("mousemove", event => {
        const rect = card.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width;
        const y = (event.clientY - rect.top) / rect.height;

        const rotateY = (x - 0.5) * 5;
        const rotateX = (0.5 - y) * 5;

        card.style.transform =
          `perspective(900px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
      });

      card.addEventListener("mouseleave", () => {
        card.style.transform = "";
      });
    });
  }

  // PROJECT INQUIRY — securely saved through the existing Supabase assistant endpoint.
  const projectBriefForm = document.getElementById("projectBriefForm");
  projectBriefForm?.addEventListener("submit", async event => {
    event.preventDefault();
    if (!projectBriefForm.reportValidity()) return;

    const data = new FormData(projectBriefForm);
    const email = String(data.get("email") || "").trim();
    const phone = String(data.get("phone") || "").trim();
    const preferredContact = String(data.get("preferredContact") || "either");
    const status = document.getElementById("briefFormStatus");
    const submitButton = projectBriefForm.querySelector('button[type="submit"]');

    const showError = message => {
      if (status) status.textContent = message;
    };

    if (!email && !phone) {
      showError("Please provide at least one contact method: email or WhatsApp / phone.");
      projectBriefForm.querySelector('[name="email"]')?.focus();
      return;
    }
    if (phone && !/^[+0-9() .-]{7,25}$/.test(phone)) {
      showError("Please enter a valid phone number, including its country code if possible.");
      projectBriefForm.querySelector('[name="phone"]')?.focus();
      return;
    }
    if (preferredContact === "email" && !email) {
      showError("You selected email contact. Please enter your email address.");
      projectBriefForm.querySelector('[name="email"]')?.focus();
      return;
    }
    if (preferredContact === "whatsapp" && !phone) {
      showError("You selected WhatsApp contact. Please enter your phone number.");
      projectBriefForm.querySelector('[name="phone"]')?.focus();
      return;
    }

    const sessionKey = "awAssistantSessionId";
    let sessionId;
    try {
      sessionId = localStorage.getItem(sessionKey);
      if (!sessionId) {
        sessionId = crypto.randomUUID();
        localStorage.setItem(sessionKey, sessionId);
      }
    } catch (_) {
      sessionId = crypto.randomUUID();
    }

    const payload = {
      action: "lead",
      sessionId,
      sourcePage: window.location.href,
      name: data.get("name"),
      email,
      phone,
      businessName: data.get("business"),
      serviceInterest: data.get("service"),
      budgetRange: data.get("budget"),
      existingWebsite: data.get("existingWebsite"),
      projectDetails: data.get("message"),
      preferredContact,
      consent: data.get("consent") === "on"
    };

    const originalLabel = submitButton?.textContent || "Send project inquiry";
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Sending securely…";
    }
    showError("Sending your inquiry securely…");

    try {
      const response = await fetch("https://vxdzyfbxcorxqysvlzgn.supabase.co/functions/v1/aw-assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": "sb_publishable_egeeneg2jGd6y2yotB_Bdw_FR2XMVJB"
        },
        body: JSON.stringify(payload)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) {
        throw new Error(result.error || "Your inquiry could not be submitted. Please try again.");
      }

      projectBriefForm.reset();
      showError(result.message || "Your inquiry has been received. We'll follow up using your preferred contact method.");
      if (submitButton) submitButton.textContent = "Inquiry sent ✓";
    } catch (error) {
      showError(error.message || "Something went wrong. Please try again or contact us on WhatsApp.");
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "Try again";
      }
    }
  });

  // AUTOMATIC FOOTER YEAR
  const yearElement = document.getElementById("year");

  if (yearElement) {
    yearElement.textContent = new Date().getFullYear();
  }
})();