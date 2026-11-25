/* Ahmad WebWorks Assistant — Step 3: deterministic retrieval engine.
 * No paid API, no model claims, and no HTML rendering. Answers come only from
 * approved knowledge records supplied by the trusted backend (Step 4).
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
    "your","about","tell","there","would","will"
  ]);

  const INTENTS = [
    { name:"pricing", category:"pricing", terms:["price","pricing","cost","charges","budget","quote","quotation","estimate","packages","rate","how much"] },
    { name:"services", category:"service", terms:["service","services","offer","provide","website design","web design","development","responsive","mobile friendly","redesign","website improvement","fix website"] },
    { name:"portfolio", category:"portfolio", terms:["portfolio","projects","work samples","examples","case study","dua boutique","online store","ecommerce","business dashboard","creative portfolio"] },
    { name:"contact", category:"contact", terms:["contact","email","whatsapp","phone","reach you","get in touch","social media","facebook"] },
    { name:"process", category:"process", terms:["start","get started","begin","process","workflow","steps","project inquiry","project brief","scope","deliverables"] },
    { name:"timeline", category:"pricing", terms:["timeline","how long","duration","deadline","delivery time","when finish","turnaround"] },
    { name:"location", category:"business", terms:["location","based","where are you","pakistan","overseas","international","remote","outside pakistan"] },
    { name:"founder", category:"business", terms:["founder","owner","who runs","who founded","ahmad hassan khan"] },
    { name:"trust", category:"policy", terms:["experience","reviews","testimonials","clients","results","established","agency"] },
    { name:"privacy", category:"policy", terms:["privacy","save my details","store my data","contact form","data storage","personal information"] }
  ];

  const FOLLOW_UP_TERMS = new Set(["and","also","what about","how about","more","that","it","those","them","price","cost","timeline","contact","examples"]);

  function normalize(value) {
    return String(value || "").toLowerCase()
      .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/[^a-z0-9+.#\s-]/g, " ")
      .replace(/\s+/g, " ").trim();
  }

  function tokens(value) {
    return normalize(value).split(" ").filter(word => word.length > 1 && !STOP_WORDS.has(word));
  }

  function detectIntent(question) {
    const q = normalize(question);
    let best = null, bestScore = 0;
    for (const intent of INTENTS) {
      let score = 0;
      for (const term of intent.terms) {
        const t = normalize(term);
        if (q === t) score += 5;
        else if (q.includes(t)) score += t.includes(" ") ? 4 : 2;
      }
      if (score > bestScore) { best = intent; bestScore = score; }
    }
    return best ? { name:best.name, category:best.category, score:bestScore } : null;
  }

  function diceSimilarity(a, b) {
    const left = new Set(tokens(a)), right = new Set(tokens(b));
    if (!left.size || !right.size) return 0;
    let overlap = 0;
    for (const word of left) if (right.has(word)) overlap++;
    return (2 * overlap) / (left.size + right.size);
  }

  function scoreRecord(question, record, intent) {
    const q = normalize(question);
    const qTokens = new Set(tokens(q));
    const title = normalize(record.title);
    const content = normalize(record.content);
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

    const titleTokens = tokens(title);
    const contentTokens = new Set(tokens(content));
    for (const word of titleTokens) if (qTokens.has(word)) score += 2.2;
    let contentOverlap = 0;
    for (const word of qTokens) if (contentTokens.has(word)) contentOverlap++;
    score += Math.min(contentOverlap, 5) * 0.55;
    score += diceSimilarity(q, title) * 3;
    score += diceSimilarity(q, keywords.join(" ")) * 2;

    if (intent && record.category === intent.category) score += 2.5;
    if (record.status && record.status !== "approved") return -1;
    if (record.is_public === false) return -1;
    score += Math.max(-1, Math.min(1, Number(record.priority || 0) / 100));
    return score;
  }

  function getContextIntent(history) {
    if (!Array.isArray(history)) return null;
    for (let i = history.length - 1; i >= 0; i--) {
      const item = history[i];
      if (item && (item.role === "user" || item.role === "assistant")) {
        const intent = detectIntent(item.content || item.message || "");
        if (intent) return intent;
      }
    }
    return null;
  }

  function answerQuestion(options) {
    const question = String(options && options.question || "").trim();
    const knowledge = Array.isArray(options && options.knowledge) ? options.knowledge : [];
    const history = Array.isArray(options && options.history) ? options.history : [];

    if (!question) return result("Please type a question and I'll do my best to help.", null, 1, []);
    const q = normalize(question);

    if (/^(hi|hello|hey|salam|assalam o alaikum|good morning|good afternoon|good evening)$/.test(q)) {
      return result("Hello! 👋 Welcome to Ahmad WebWorks. I can help with our services, project process, portfolio, pricing approach and contact details. What would you like to know?", "greeting", 1, []);
    }
    if (/^(thanks|thank you|thx|jazakallah|jazak allah)$/.test(q)) {
      return result("You're welcome! If you'd like to discuss a website project, I can help you find the right next step.", "thanks", 1, []);
    }

    let intent = detectIntent(question);
    const shortFollowUp = tokens(question).length <= 4;
    if (shortFollowUp && (!intent || FOLLOW_UP_TERMS.has(q))) {
      const context = getContextIntent(history);
      if (context && (!intent || intent.category === "pricing")) intent = context;
    }

    const ranked = knowledge
      .filter(record => record && record.content && record.title)
      .map(record => ({ record, score:scoreRecord(question, record, intent) }))
      .filter(item => item.score >= 0)
      .sort((a,b) => b.score - a.score);

    if (!ranked.length || ranked[0].score < 3.1) {
      return result("I don't have a verified answer to that in my current knowledge base, and I don't want to guess. Please contact Ahmad WebWorks through WhatsApp at https://wa.me/923704513823 or the contact page: https://ahmadwebworks.github.io/ahmad-webworks/contact.html.", "fallback", 0, []);
    }

    const best = ranked[0];
    const second = ranked[1];
    const margin = second ? best.score - second.score : best.score;
    const confidence = Math.max(0, Math.min(1, (best.score / 15) * 0.72 + (Math.max(0, margin) / 8) * 0.28));

    if (best.score < 4.2 || (second && margin < 0.35 && best.score < 6)) {
      return result("I found a few possibly related topics, but I'm not confident enough to give you a reliable answer. Could you rephrase your question or contact us directly at https://wa.me/923704513823?", "clarify", confidence, []);
    }

    let answer = String(best.record.content).trim();
    const matched = [best.record.id].filter(Boolean);

    if (intent && intent.name === "services") {
      const serviceRecords = ranked.filter(item => item.record.category === "service" && item.score >= Math.max(3.5, best.score - 3)).slice(0, 4);
      if (serviceRecords.length > 1) {
        answer = "Ahmad WebWorks can help with these website services:\n" +
          serviceRecords.map(item => "• " + item.record.title + ": " + String(item.record.content).trim()).join("\n");
        matched.splice(0, matched.length, ...serviceRecords.map(item => item.record.id).filter(Boolean));
      }
    }

    return result(answer, intent ? intent.name : best.record.category, confidence, matched);
  }

  function result(answer, intent, confidence, ids) {
    return { answer, intent, confidence:Number(confidence.toFixed(3)), matchedKnowledgeIds:ids, grounded:true };
  }

  return { normalize, tokens, detectIntent, diceSimilarity, scoreRecord, answerQuestion };
});
