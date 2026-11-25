/* Ahmad WebWorks Assistant — connected to the secure Supabase Edge Function. */
(() => {
  "use strict";
  if (window.__ahmadWebWorksAssistantMounted) return;
  window.__ahmadWebWorksAssistantMounted = true;

  const API_URL = "https://vxdzyfbxcorxqysvlzgn.supabase.co/functions/v1/aw-assistant";
  const PUBLISHABLE_KEY = "sb_publishable_egeeneg2jGd6y2yotB_Bdw_FR2XMVJB";
  const SESSION_KEY = "awAssistantSessionId";

  function createUuid() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, value => value.toString(16).padStart(2, "0"));
    return hex.slice(0,4).join("") + "-" + hex.slice(4,6).join("") + "-" +
      hex.slice(6,8).join("") + "-" + hex.slice(8,10).join("") + "-" + hex.slice(10).join("");
  }

  let sessionId = localStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = createUuid();
    localStorage.setItem(SESSION_KEY, sessionId);
  }

  const root = document.createElement("div");
  root.className = "aw-assistant";
  root.innerHTML = `
    <button class="aw-chat-launcher" type="button" aria-label="Open Ahmad WebWorks assistant" aria-expanded="false" aria-controls="aw-chat-window">
      <span class="aw-chat-launcher-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H6l-3 2v-6.5A7.5 7.5 0 1 1 20 11.5Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 11h8M8 14.5h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></span>
      <span class="aw-chat-launcher-label">Ask us anything</span>
    </button>
    <section class="aw-chat-window" id="aw-chat-window" role="dialog" aria-label="Ahmad WebWorks chat assistant" aria-modal="false" aria-hidden="true">
      <header class="aw-chat-header"><div class="aw-chat-avatar" aria-hidden="true">AW</div><div class="aw-chat-heading"><strong>Ahmad WebWorks</strong><span class="aw-chat-status"><i class="aw-chat-status-dot"></i> Knowledge-based assistant</span></div><button class="aw-chat-close" type="button" aria-label="Close chat">×</button></header>
      <div class="aw-chat-messages" aria-live="polite" aria-relevant="additions">
        <p class="aw-chat-date">WELCOME</p>
        <div class="aw-chat-message"><p>Hi there! 👋 I'm the Ahmad WebWorks assistant. Ask me about our services, project process, portfolio, pricing approach or contact details.</p></div>
        <div class="aw-chat-message"><p>I use verified information from Ahmad WebWorks. If I don't know something, I'll tell you rather than guess.</p></div>
        <div class="aw-chat-chips" aria-label="Suggested questions"><button class="aw-chat-chip" type="button">What services do you offer?</button><button class="aw-chat-chip" type="button">How does a project start?</button><button class="aw-chat-chip" type="button">Do you have fixed packages?</button><button class="aw-chat-chip aw-chat-lead-trigger" type="button">Start a project</button></div>
      </div>
      <p class="aw-chat-notice">Please don't share passwords, payment details or other sensitive information here.</p>
      <form class="aw-chat-form"><textarea class="aw-chat-input" rows="1" maxlength="1000" aria-label="Your message" placeholder="Type your question..." required></textarea><button class="aw-chat-send" type="submit" aria-label="Send message"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m21 3-7.2 18-3.8-7-7-3.8L21 3Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 3 10 14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button></form>
      <div class="aw-chat-powered">AHMAD WEBWORKS · DIGITAL SUPPORT</div>
    </section>`;
  document.body.appendChild(root);

  const launcher = root.querySelector(".aw-chat-launcher");
  const panel = root.querySelector(".aw-chat-window");
  const close = root.querySelector(".aw-chat-close");
  const form = root.querySelector(".aw-chat-form");
  const input = root.querySelector(".aw-chat-input");
  const send = root.querySelector(".aw-chat-send");
  const messages = root.querySelector(".aw-chat-messages");

  const setOpen = (open) => {
    root.classList.toggle("is-open", open);
    launcher.setAttribute("aria-expanded", String(open));
    panel.setAttribute("aria-hidden", String(!open));
    if (open) input.focus(); else launcher.focus();
  };

  const addMessage = (value, user, extraClass) => {
    const item = document.createElement("div");
    item.className = "aw-chat-message" + (user ? " is-user" : "") + (extraClass ? " " + extraClass : "");
    const paragraph = document.createElement("p");
    const urlPattern = /(https:\/\/ahmadwebworks\.github\.io\/ahmad-webworks\/contact\.html|https:\/\/wa\.me\/923704513823)/g;
    let cursor = 0, match;
    while ((match = urlPattern.exec(String(value))) !== null) {
      paragraph.appendChild(document.createTextNode(String(value).slice(cursor, match.index).replace(/[：:]\s*$/, "")));
      const link = document.createElement("a");
      link.href = match[0];
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.className = "aw-chat-action";
      link.textContent = match[0].includes("wa.me") ? "Chat on WhatsApp" : "Request a Quote";
      paragraph.appendChild(link);
      cursor = match.index + match[0].length;
    }
    paragraph.appendChild(document.createTextNode(String(value).slice(cursor)));
    item.appendChild(paragraph);
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
    return item;
  };


  function openLeadForm() {
    const wrapper = document.createElement("div");
    wrapper.className = "aw-chat-message aw-lead-card";
    wrapper.innerHTML = `
      <form class="aw-lead-form">
        <strong class="aw-lead-title">Tell us about your project</strong>
        <label>Name *<input name="name" type="text" maxlength="120" autocomplete="name" required></label>
        <fieldset class="aw-lead-contact-group"><legend>Contact details * <span>(provide at least one)</span></legend>
          <label>Email<input name="email" type="email" maxlength="254" autocomplete="email" placeholder="you@example.com"></label>
          <label>WhatsApp / Phone<input name="phone" type="tel" maxlength="25" autocomplete="tel" placeholder="+92..."></label>
        </fieldset>
        <label>Business name (optional)<input name="businessName" type="text" maxlength="120"></label>
        <label>Project type *
          <select name="serviceInterest" required>
            <option value="">Choose a service</option>
            <option>Website design</option><option>Web development</option>
            <option>Responsive website</option><option>Website improvements</option>
            <option>Not sure yet</option>
          </select>
        </label>
        <label>Budget (optional)<input name="budgetRange" type="text" maxlength="80" placeholder="Not sure yet"></label>
        <label>Existing website (optional)<input name="existingWebsite" type="url" maxlength="300" placeholder="https://..."></label>
        <label>Project details *<textarea name="projectDetails" rows="3" minlength="10" maxlength="5000" required placeholder="What would you like us to build or improve?"></textarea></label>
        <label>Preferred contact
          <select name="preferredContact">
            <option value="either">Either email or WhatsApp</option>
            <option value="email">Email</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
        </label>
        <label class="aw-lead-consent"><input name="consent" type="checkbox" required> I agree that Ahmad WebWorks may use these details to respond to my project inquiry.</label>
        <button class="aw-lead-submit" type="submit">Send project inquiry</button>
        <p class="aw-lead-help">Please provide at least one contact method. Don't include passwords or payment details.</p>
      </form>`;
    messages.appendChild(wrapper);
    messages.scrollTop = messages.scrollHeight;
    const leadForm = wrapper.querySelector("form");
    const submitButton = wrapper.querySelector(".aw-lead-submit");
    leadForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (submitButton.disabled) return;
      const data = new FormData(leadForm);
      const emailValue = String(data.get("email") || "").trim();
      const phoneValue = String(data.get("phone") || "").trim();
      if (!emailValue && !phoneValue) {
        const note = wrapper.querySelector(".aw-lead-help");
        note.textContent = "Please provide at least one contact method: your email address or WhatsApp / phone number.";
        leadForm.querySelector('[name="email"]').focus();
        return;
      }
      const payload = {
        action: "lead", sessionId, sourcePage: window.location.href,
        name: data.get("name"), email: data.get("email"), phone: data.get("phone"),
        businessName: data.get("businessName"), serviceInterest: data.get("serviceInterest"),
        budgetRange: data.get("budgetRange"), existingWebsite: data.get("existingWebsite"),
        projectDetails: data.get("projectDetails"), preferredContact: data.get("preferredContact"),
        consent: data.get("consent") === "on"
      };
      submitButton.disabled = true;
      submitButton.textContent = "Sending…";
      try {
        const response = await fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", "apikey": PUBLISHABLE_KEY },
          body: JSON.stringify(payload)
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.ok) throw new Error(result.error || "The inquiry could not be sent.");
        wrapper.remove();
        addMessage(result.message || "Thanks! Your project inquiry has been received.", false);
      } catch (error) {
        const note = wrapper.querySelector(".aw-lead-help");
        note.textContent = error.message || "Something went wrong. Please try again.";
        submitButton.disabled = false;
        submitButton.textContent = "Try again";
      }
    });
    messages.scrollTop = messages.scrollHeight;
  }

  async function sendMessage(value) {
    addMessage(value, true);
    const pending = addMessage("Thinking…", false, "is-pending");
    send.disabled = true;
    input.disabled = true;
    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": PUBLISHABLE_KEY },
        body: JSON.stringify({ action: "chat", message: value, sessionId, sourcePage: window.location.href })
      });
      const payload = await response.json().catch(() => ({}));
      pending.remove();
      if (payload.sessionId) {
        sessionId = payload.sessionId;
        localStorage.setItem(SESSION_KEY, sessionId);
      }
      if (!response.ok || !payload.ok) {
        addMessage(payload.error || "I couldn't process that just now. Please try again or contact us on WhatsApp.", false);
      } else {
        addMessage(payload.answer || "I don't have a response for that yet.", false);
      }
    } catch (error) {
      pending.remove();
      addMessage("I'm having trouble connecting right now. Please try again or contact us on WhatsApp: https://wa.me/923704513823", false);
    } finally {
      send.disabled = false;
      input.disabled = false;
      input.focus();
    }
  }

  const setOpenHandler = (open) => setOpen(open);
  launcher.addEventListener("click", () => setOpenHandler(!root.classList.contains("is-open")));
  close.addEventListener("click", () => setOpenHandler(false));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && root.classList.contains("is-open")) setOpenHandler(false);
  });
  root.querySelectorAll(".aw-chat-chip").forEach((chip) => chip.addEventListener("click", () => {
    if (chip.classList.contains("aw-chat-lead-trigger")) {
      openLeadForm();
      return;
    }
    input.value = chip.textContent.trim();
    form.requestSubmit();
  }));
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); }
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = input.value.trim();
    if (!value || send.disabled) return;
    input.value = "";
    sendMessage(value);
  });
})();