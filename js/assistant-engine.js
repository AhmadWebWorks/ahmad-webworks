/* Ahmad WebWorks Assistant — deterministic, intent-first retrieval engine.
 * Answers are grounded in approved public knowledge. No paid AI API is used.
 */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AWAssistantEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const STOP_WORDS = new Set([
    "a","an","and","are","as","at","be","can","could","do","does","for","from",
    "get","give","how","i","in","is","it","me","my","of","on","or","please",
    "the","this","to","we","what","when","where","which","who","with","you",
    "your","about","tell","there","would","will","have","has","had","did"
  ]);

  const INTENTS = [
    { name:"pricing", category:"pricing", terms:["price","pricing","cost","charges","budget","quote","quotation","estimate","packages","rate","how much","afford","sufficient","enough","dollar","usd","pkr","rupees","cheap","expensive"] },
    { name:"services", category:"service", terms:["service","services","website design","web design","development","responsive","mobile friendly","redesign","website improvement","fix website"] },
    { name:"portfolio", category:"portfolio", terms:["portfolio","projects","project","work samples","examples","case study","dua boutique","online store","ecommerce","business dashboard","creative portfolio"] },
    { name:"contact", category:"contact", terms:["contact","email","whatsapp","phone","reach you","get in touch","social media","facebook"] },
    { name:"process", category:"process", terms:["start a project","get started","begin","process","workflow","steps","project inquiry","project brief","scope","deliverables"] },
    { name:"timeline", category:"pricing", terms:["timeline","how long","duration","deadline","delivery time","when finish","turnaround"] },
    { name:"location", category:"business", terms:["location","based","where are you","pakistan","overseas","international","remote","outside pakistan"] },
    { name:"founder", category:"business", terms:["founder","owner","who runs","who founded","ahmad hassan khan"] },
    { name:"trust", category:"policy", terms:["experience","reviews","testimonials","clients","results","established","agency"] },
    { name:"privacy", category:"policy", terms:["privacy","save my details","store my data","contact form","data storage","personal information"] }
  ];

  function normalize(value) {
    return String(value || "").toLowerCase()
      .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/[^a-z0-9+.#\s-]/g, " ")
      .replace(/\s+/g, " ").trim();
  }

  function tokens(value) {
    return normalize(value).split(" ").filter(word => word.length > 1 && !STOP_WORDS.has(word))
      .map(word => word.endsWith("ies") && word.length > 5 ? word.slice(0, -3) + "y" :
        word.endsWith("s") && !word.endsWith("ss") && word.length > 4 ? word.slice(0, -1) : word);
  }

  function detectIntent(question) {
    const q = normalize(question);
    if (/\b(hire|hiring|recruit|recruiting|vacanc|job opening|career|employment|internship|team member)\b/.test(q))
      return { name:"recruitment", category:"policy", score:10 };
    if (/\b(cricket|football|soccer|weather|politics|recipe|homework|exam|movie|anime|game score|stock price|election)\b/.test(q))
      return { name:"off_topic", category:null, score:10 };

    // Budget and price questions take priority over generic words such as "website" or "business".
    if (/\b(how much|how many dollars|price|pricing|cost|charge|budget|quote|quotation|estimate|packages?|rate|afford|sufficient|enough|dollars?|usd|pkr|rupees?|cheap|expensive)\b/.test(q) ||
        /(?:^|\s)(?:rs\.?|₨|\$)\s?\d/.test(q) || /\b\d+(?:\.\d+)?\s?(?:usd|dollars?|pkr|rupees?)\b/.test(q))
      return { name:"pricing", category:"pricing", score:10 };

    if (/\b(website|site)\b/.test(q) && /\b(improve|improvement|update|redesign|fix|moderni[sz]e)\b/.test(q))
      return { name:"existing_site", category:"service", score:9 };

    if (/\b(how long|timeline|deadline|delivery time|turnaround|duration|when can you deliver|when will you deliver|when do you deliver|when is it ready|delivery date)\b/.test(q))
      return { name:"timeline", category:"pricing", score:9 };

    if (/\b(do you have|show me|any|your|recent|what)\b/.test(q) &&
        /\b(project|projects|work|portfolio|website|websites|examples)\b/.test(q))
      return { name:"portfolio", category:"portfolio", score:8 };

    if (/\b(build|create|make|develop|design)\b/.test(q) && /\b(website|websites|site|store|online shop|ecommerce)\b/.test(q))
      return { name:"services", category:"service", score:8 };

    for (const intent of INTENTS.slice(1)) {
      let score = 0;
      for (const term of intent.terms) {
        const t = normalize(term);
        if (q === t) score += 5;
        else if (q.includes(t)) score += t.includes(" ") ? 4 : 2;
      }
      if (score > 0) return { name:intent.name, category:intent.category, score };
    }
    return null;
  }

  function diceSimilarity(a, b) {
    const left = new Set(tokens(a)), right = new Set(tokens(b));
    if (!left.size || !right.size) return 0;
    let overlap = 0;
    for (const word of left) if (right.has(word)) overlap++;
    return (2 * overlap) / (left.size + right.size);
  }

  function scoreRecord(question, record, intent) {
    if (!record || !record.content || !record.title) return -1;
    if (record.status && record.status !== "approved") return -1;
    if (record.is_public === false) return -1;
    // A recognised intent is a hard category boundary, not merely a small score bonus.
    if (intent && intent.category && record.category !== intent.category) return -1;
    const q = normalize(question), qTokens = new Set(tokens(q));
    const title = normalize(record.title), content = normalize(record.content);
    const keywords = Array.isArray(record.keywords) ? record.keywords : [];
    let score = 0;
    if (title && q === title) score += 12;
    if (title && q.includes(title)) score += 8;
    for (const keyword of keywords) {
      const key = normalize(keyword);
      if (!key) continue;
      if (q === key) score += 7;
      else if (q.includes(key)) score += key.includes(" ") ? 5 : 3;
      else if (tokens(key).some(word => qTokens.has(word))) score += 1.2;
    }
    for (const word of tokens(title)) if (qTokens.has(word)) score += 2.2;
    const contentTokens = new Set(tokens(content));
    let overlap = 0;
    for (const word of qTokens) if (contentTokens.has(word)) overlap++;
    score += Math.min(overlap, 5) * 0.4;
    score += diceSimilarity(q, title) * 2;
    score += diceSimilarity(q, keywords.join(" ")) * 1.5;
    score += Math.max(-1, Math.min(1, Number(record.priority || 0) / 100));
    return score;
  }

  function getPreviousUserQuestion(history) {
    if (!Array.isArray(history)) return "";
    for (let i = history.length - 1; i >= 0; i--) {
      const item = history[i];
      if (item && item.role === "user") return String(item.content || item.message || "");
    }
    return "";
  }

  function cleanSentence(text, max = 260) {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    const first = clean.split(/(?<=[.!?])\s+/)[0].trim();
    if (first.length <= max) return first;
    return first.slice(0, max - 1).trimEnd() + "…";
  }

  function result(answer, intent, confidence, ids) {
    return { answer, intent, confidence:Number(confidence.toFixed(3)), matchedKnowledgeIds:ids, grounded:true };
  }

  function answerQuestion(options) {
    const question = String(options && options.question || "").trim();
    const knowledge = Array.isArray(options && options.knowledge) ? options.knowledge : [];
    const history = Array.isArray(options && options.history) ? options.history : [];
    if (!question) return result("Please type a question and I'll do my best to help.", null, 1, []);
    const q = normalize(question);

    if (/^(hi|hello|hey|salam|assalam o alaikum|good morning|good afternoon|good evening)$/.test(q))
      return result("Hello! 👋 Welcome to Ahmad WebWorks. I can help with services, projects, pricing and getting started. What would you like to know?", "greeting", 1, []);
    if (/^(thanks|thank you|thx|jazakallah|jazak allah)$/.test(q))
      return result("You're welcome! Let me know if you'd like help with a website project.", "thanks", 1, []);

    let intent = detectIntent(question);
    let searchQuestion = question;
    const previousQuestion = getPreviousUserQuestion(history);
    const identityClaim = /^(yes|yeah|yep|that's me|that is me|correct|exactly|no[, ]+i am|i am the founder|i'm the founder|i m the founder|i am ahmad|i'm ahmad|i m ahmad|i am ahmad hassan khan|i'm ahmad hassan khan|i m ahmad hassan khan)\b/.test(q) ||
      /\b(i am|i'm|i m) (the )?(founder|owner)\b/.test(q);
    const explicitFollowUp = /^(and|also|what about|how about|tell me more|more about it|yes|yeah|yep|that's me|that is me|correct|exactly)\b/.test(q);
    if (identityClaim && (detectIntent(previousQuestion)?.name === "founder" || /\b(founder|owner)\b/.test(q))) {
      return result("I can share public information about Ahmad WebWorks, but I can't verify who is using this chat or confirm anyone's identity. The public business information lists Ahmad Hassan Khan as the founder.", "identity_boundary", 1,
        knowledge.filter(r => r && r.category === "business" && r.status === "approved" && r.is_public !== false &&
          /founded by Ahmad Hassan Khan/i.test(r.content || "")).map(r => r.id).filter(Boolean).slice(0,1));
    }
    if (!intent && explicitFollowUp && previousQuestion) {
      intent = detectIntent(previousQuestion);
      searchQuestion = question + " " + previousQuestion;
    }

    if (intent?.name === "recruitment")
      return result("I don't have verified information about current jobs or team openings at Ahmad WebWorks. Please contact us directly for updates.", "recruitment", 1, []);
    if (intent?.name === "off_topic")
      return result("That's outside my role at Ahmad WebWorks. I can help with our website services, portfolio, pricing or project inquiries.", "off_topic", 1, []);

    // Pricing answers are intentionally explicit: never let a portfolio concept win a budget question.
    if (intent?.name === "pricing") {
      const priceRecord = knowledge.find(r => r && r.category === "pricing" && r.status === "approved" && r.is_public !== false &&
        /fixed packages|quoted after|requirements are understood/i.test(r.content || ""));
      const ids = priceRecord?.id ? [priceRecord.id] : [];
      const contactRecord = knowledge.find(r => r && r.category === "contact" && r.status === "approved" && r.is_public !== false &&
        /wa\.me\/|contact page/i.test(r.content || ""));
      const contactUrl = "https://ahmadwebworks.github.io/ahmad-webworks/contact.html";
      const whatsappUrl = "https://wa.me/923704513823";
      const hasProjectRequest = /\b(i need|i want|we need|we want|looking for|require|build|create|develop|make)\b/.test(q) &&
        /\b(website|websites|site|company|business|store|online shop)\b/.test(q);
      const hasScope = /\b\d+\s*(page|pages)\b|\b(home|projects|services|team|about|contact)\b/.test(q);
      if (hasProjectRequest || hasScope) {
        return result("Yes, Ahmad WebWorks can discuss your website project. We don't publish a fixed starting price or package rate; the quote depends on the agreed pages, features and content. To request a quote, use our project inquiry page: " + contactUrl + " or WhatsApp: " + whatsappUrl, "pricing", 1, [...ids, ...(contactRecord?.id ? [contactRecord.id] : [])]);
      }
      if (/\b(sufficient|enough|afford|budget|dollars?|usd|pkr|rupees?)\b/.test(q) || /(?:^|\s)(?:rs\.?|₨|\$)\s?\d/.test(q)) {
        return result("We don't publish a standard starting price, so I can't confirm whether that budget is sufficient. Costs depend on the pages, features and content. Share your requirements through our project inquiry page: " + contactUrl, "pricing", 1, [...ids, ...(contactRecord?.id ? [contactRecord.id] : [])]);
      }
      return result("Ahmad WebWorks doesn't offer fixed packages or publish a standard starting price. Each quote depends on the pages, features and content. For a project quote, contact us here: " + contactUrl + " or WhatsApp: " + whatsappUrl, "pricing", 1, [...ids, ...(contactRecord?.id ? [contactRecord.id] : [])]);
    }

    if (intent?.name === "timeline") {
      const timeRecord = knowledge.find(r => r && r.category === "pricing" && r.status === "approved" && r.is_public !== false &&
        /timeline|estimate/i.test((r.title || "") + " " + (r.content || "")));
      if (!timeRecord) return result("The timeline is agreed after we understand the website's pages, content and features. I don't have a verified standard delivery time to quote.", "timeline", 0.9, []);
      return result("The timeline is agreed after we understand your pages, content and features. I do not have a verified standard delivery time to quote.", "timeline", 0.95, timeRecord.id ? [timeRecord.id] : []);
    }

    if (intent?.name === "existing_site") {
      const record = knowledge.find(r => r && r.category === "service" && r.status === "approved" && r.is_public !== false &&
        /existing website/i.test((r.title || "") + " " + (r.content || "")));
      return result(record ? cleanSentence(record.content, 260) : "Yes. We can review your existing website and discuss improvements to its layout, content, navigation or features.", "services", 1, record?.id ? [record.id] : []);
    }

    if (intent?.name === "services") {
      return result("We offer website design, web development, mobile-responsive design and improvements to existing websites.", "services", 1,
        knowledge.filter(r => r && r.category === "service" && r.status === "approved" && r.is_public !== false).map(r => r.id).filter(Boolean));
    }

    if (intent?.name === "portfolio") {
      const conceptName = /business dashboard/i.test(question) ? "business dashboard" :
        /creative portfolio/i.test(question) ? "creative portfolio" : "";
      if (conceptName) {
        const concept = knowledge.find(r => r && r.category === "portfolio" && r.status === "approved" && r.is_public !== false &&
          (r.title || "").toLowerCase().includes(conceptName));
        if (concept) return result(cleanSentence(concept.content, 260), "portfolio", 0.98, concept.id ? [concept.id] : []);
      }
      const dua = knowledge.find(r => r && r.category === "portfolio" && r.status === "approved" && r.is_public !== false &&
        /dua boutique/i.test((r.title || "") + " " + (r.content || "")));
      if (dua) {
        return result("Yes — Dua Boutique is a live storefront project with product sections, a shopping cart, checkout, Cash on Delivery and WhatsApp ordering. View it: https://ahmadwebworks.github.io/dua-boutique/", "portfolio", 1, dua.id ? [dua.id] : []);
      }
    }

    const candidates = knowledge
      .filter(record => record && record.content && record.title)
      .map(record => ({ record, score:scoreRecord(searchQuestion, record, intent) }))
      .filter(item => item.score >= 0)
      .sort((a,b) => b.score - a.score);

    if (!candidates.length || candidates[0].score < 4.5)
      return result("I don't have verified information about that yet. I can help with Ahmad WebWorks services, projects, pricing or project inquiries.", "fallback", 0, []);

    const best = candidates[0], second = candidates[1];
    const margin = second ? best.score - second.score : best.score;
    if (second && margin < 0.25 && best.score < 7)
      return result("I’m not sure which detail you mean. Are you asking about our services, a portfolio project or pricing?", "clarify", 0.4, []);

    return result(cleanSentence(best.record.content, 260), intent ? intent.name : best.record.category,
      Math.max(0.55, Math.min(0.98, best.score / 12)), best.record.id ? [best.record.id] : []);
  }

  return { normalize, tokens, detectIntent, diceSimilarity, scoreRecord, answerQuestion };
});
