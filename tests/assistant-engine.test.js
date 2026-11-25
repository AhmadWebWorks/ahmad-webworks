/* Run: node --test tests/assistant-engine.test.js */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const engine = require("../js/assistant-engine.js");

const knowledge = [
  {id:"price",category:"pricing",title:"Does Ahmad WebWorks have fixed packages or prices?",content:"Ahmad WebWorks does not currently offer fixed packages. Each project is quoted after its pages, features and requirements are understood.",keywords:["pricing","packages","cost","website price","quote","estimate"],priority:100,status:"approved",is_public:true},
  {id:"services",category:"service",title:"Website design",content:"Website design includes page structure, typography, colour and clear calls to action.",keywords:["web design","website layout","visual design"],priority:90,status:"approved",is_public:true},
  {id:"development",category:"service",title:"Web development",content:"Web development turns an agreed design into a working website.",keywords:["website development","coding","functional website"],priority:90,status:"approved",is_public:true},
  {id:"contact",category:"contact",title:"How can I contact Ahmad WebWorks?",content:"Contact Ahmad WebWorks through WhatsApp at https://wa.me/923704513823 or by email at ahmadhassankhan79@gmail.com.",keywords:["WhatsApp","email","contact details"],priority:100,status:"approved",is_public:true},
  {id:"private",category:"contact",title:"Private draft contact note",content:"This is private content that must never be returned.",keywords:["secret"],priority:100,status:"approved",is_public:false}
];

test("normalizes case and punctuation",()=>assert.equal(engine.normalize("  HELLO, Ahmad!  "),"hello ahmad"));
test("detects pricing intent",()=>assert.equal(engine.detectIntent("How much does a website cost?").name,"pricing"));
test("answers from approved public pricing knowledge",()=>{
  const out=engine.answerQuestion({question:"Do you have fixed website packages?",knowledge});
  assert.match(out.answer,/doesn.t offer fixed packages/i);
  assert.deepEqual(out.matchedKnowledgeIds,["price"]);
});
test("answers broad service questions in one concise sentence",()=>{
  const out=engine.answerQuestion({question:"What services do you offer?",knowledge});
  assert.match(out.answer,/website design/i);
  assert.match(out.answer,/web development/i);
  assert.ok(out.answer.length < 200);
});
test("answers contact questions with verified details",()=>{
  const out=engine.answerQuestion({question:"How can I contact you on WhatsApp?",knowledge});
  assert.match(out.answer,/wa.me\/923704513823/);
});
test("uses prior context for short follow-ups",()=>{
  const out=engine.answerQuestion({question:"and the price?",knowledge,history:[{role:"user",content:"Tell me about website design"}]});
  assert.equal(out.intent,"pricing");
  assert.match(out.answer,/doesn.t offer fixed packages/i);
});
test("does not return private or unapproved records",()=>{
  const out=engine.answerQuestion({question:"secret contact note",knowledge});
  assert.doesNotMatch(out.answer,/private content/i);
});
test("uses a safe fallback for unrelated questions",()=>{
  const out=engine.answerQuestion({question:"Who won the football match yesterday?",knowledge});
  assert.equal(out.intent,"off_topic");
  assert.match(out.answer,/outside my role/i);
});
test("handles greetings without needing knowledge records",()=>{
  const out=engine.answerQuestion({question:"Assalam o alaikum",knowledge:[]});
  assert.equal(out.intent,"greeting");
});


test("budget questions never retrieve portfolio concepts",()=>{
  const out=engine.answerQuestion({question:"I have 100 dollars. Is it sufficient for a web?",knowledge:[
    ...knowledge,
    {id:"dashboard",category:"portfolio",title:"Business Dashboard concept",content:"Business Dashboard is a visual design concept.",keywords:["business dashboard","concept"],priority:100,status:"approved",is_public:true}
  ]});
  assert.equal(out.intent,"pricing");
  assert.match(out.answer,/can't confirm whether your budget is sufficient/i);
  assert.doesNotMatch(out.answer,/dashboard/i);
  assert.deepEqual(out.matchedKnowledgeIds,["price"]);
});
test("professional website cost questions return the pricing policy",()=>{
  const out=engine.answerQuestion({question:"How much do I need for a professional business website?",knowledge});
  assert.equal(out.intent,"pricing");
  assert.match(out.answer,/doesn.t offer fixed packages/i);
  assert.match(out.answer,/pages, features and requirements/i);
});
test("a generic project question points to the live portfolio example",()=>{
  const out=engine.answerQuestion({question:"Do you have a project?",knowledge:[
    ...knowledge,
    {id:"dua",category:"portfolio",title:"Dua Boutique live project",content:"Dua Boutique is a live small-business storefront project.",keywords:["Dua Boutique","ecommerce"],priority:100,status:"approved",is_public:true}
  ]});
  assert.equal(out.intent,"portfolio");
  assert.match(out.answer,/Dua Boutique/);
  assert.match(out.answer,/ahmadwebworks.github.io\/dua-boutique/);
});
test("named dashboard concept does not get replaced by the live store",()=>{
  const out=engine.answerQuestion({question:"Tell me about the Business Dashboard concept.",knowledge:[
    {id:"dashboard",category:"portfolio",title:"Business Dashboard concept",content:"Business Dashboard is a visual design concept, not a deployed client product.",keywords:["dashboard","concept"],priority:55,status:"approved",is_public:true},
    {id:"dua",category:"portfolio",title:"Dua Boutique live project",content:"Dua Boutique is a live storefront.",keywords:["Dua Boutique"],priority:100,status:"approved",is_public:true}
  ]});
  assert.match(out.answer,/visual design concept/i);
  assert.doesNotMatch(out.answer,/Dua Boutique/);
});
test("delivery questions receive a timeline-specific answer",()=>{
  const out=engine.answerQuestion({question:"When can you deliver?",knowledge:[
    {id:"timeline",category:"pricing",title:"When are price and timeline decided?",content:"A project estimate and timeline are discussed after the requirements are understood.",keywords:["timeline","delivery time"],priority:90,status:"approved",is_public:true}
  ]});
  assert.equal(out.intent,"timeline");
  assert.match(out.answer,/timeline is agreed/i);
});
test("website-building capability questions route to services",()=>{
  const out=engine.answerQuestion({question:"Can you build a website for my business?",knowledge});
  assert.equal(out.intent,"services");
  assert.match(out.answer,/website design/i);
});
test("recruitment questions receive an honest response",()=>{
  const out=engine.answerQuestion({question:"Are you recruiting team members?",knowledge});
  assert.equal(out.intent,"recruitment");
  assert.match(out.answer,/don't have verified information/i);
});
test("unrelated cricket questions are politely redirected",()=>{
  const out=engine.answerQuestion({question:"Who won yesterday's cricket match?",knowledge});
  assert.equal(out.intent,"off_topic");
  assert.match(out.answer,/outside my role/i);
});
