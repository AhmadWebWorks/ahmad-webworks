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

  // PROJECT BRIEF — opens WhatsApp; no form data is stored on this website.
  const projectBriefForm = document.getElementById("projectBriefForm");
  projectBriefForm?.addEventListener("submit", event => {
    event.preventDefault();
    if (!projectBriefForm.reportValidity()) return;
    const data = new FormData(projectBriefForm);
    const lines = [
      "Hello Ahmad WebWorks, I'd like to discuss a project.",
      "",
      "Name: " + (data.get("name") || ""),
      "Business / project: " + (data.get("business") || "Not provided"),
      "Service: " + (data.get("service") || ""),
      "Estimated budget: " + (data.get("budget") || "Prefer to discuss"),
      "Project details: " + (data.get("message") || "I'd like to discuss the requirements.")
    ];
    const url = "https://wa.me/923704513823?text=" + encodeURIComponent(lines.join("\n"));
    window.open(url, "_blank", "noopener,noreferrer");
  });

  // AUTOMATIC FOOTER YEAR
  const yearElement = document.getElementById("year");

  if (yearElement) {
    yearElement.textContent = new Date().getFullYear();
  }
})();