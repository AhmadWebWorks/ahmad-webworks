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
  assert.match(out.answer,/does not currently offer fixed packages/i);
  assert.deepEqual(out.matchedKnowledgeIds,["price"]);
});
test("combines relevant service records for a broad services question",()=>{
  const out=engine.answerQuestion({question:"What services do you offer?",knowledge});
  assert.match(out.answer,/Website design/);
  assert.match(out.answer,/Web development/);
  assert.equal(out.matchedKnowledgeIds.length,2);
});
test("answers contact questions with verified details",()=>{
  const out=engine.answerQuestion({question:"How can I contact you on WhatsApp?",knowledge});
  assert.match(out.answer,/wa.me\/923704513823/);
});
test("uses prior context for short follow-ups",()=>{
  const out=engine.answerQuestion({question:"and the price?",knowledge,history:[{role:"user",content:"Tell me about website design"}]});
  assert.equal(out.intent,"pricing");
  assert.match(out.answer,/does not currently offer fixed packages/i);
});
test("does not return private or unapproved records",()=>{
  const out=engine.answerQuestion({question:"secret contact note",knowledge});
  assert.doesNotMatch(out.answer,/private content/i);
});
test("uses a safe fallback for unrelated questions",()=>{
  const out=engine.answerQuestion({question:"Who won the football match yesterday?",knowledge});
  assert.equal(out.intent,"fallback");
  assert.match(out.answer,/don't want to guess/i);
});
test("handles greetings without needing knowledge records",()=>{
  const out=engine.answerQuestion({question:"Assalam o alaikum",knowledge:[]});
  assert.equal(out.intent,"greeting");
});
