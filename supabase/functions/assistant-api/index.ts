import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import "./assistant-engine.js";
type K={id:string;category:string;title:string;content:string;keywords:string[];status:string;is_public:boolean;priority:number};
type H={role:"user"|"assistant";content:string};
type E={answerQuestion(x:{question:string;knowledge:K[];history:H[]}):{answer:string;intent:string|null;confidence:number;matchedKnowledgeIds:string[];grounded:boolean}};
const PROJECT_URL=Deno.env.get("SUPABASE_URL")??"";
const KEYS=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")??"{}");
const SECRET=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??KEYS.default;
const SITE="https://ahmadwebworks.github.io",PREVIEW="https://rawcdn.githack.com",ORIGINS=new Set([SITE,PREVIEW]);
const CONSENT_VERSION="2026-11-25-v1",UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
if(!PROJECT_URL||!SECRET)throw new Error("Supabase server credentials unavailable.");
const db=createClient(PROJECT_URL,SECRET,{auth:{persistSession:false,autoRefreshToken:false}});
const engine=(globalThis as typeof globalThis & {AWAssistantEngine?:E}).AWAssistantEngine;
if(!engine)throw new Error("Assistant engine did not load.");
function cors(origin:string|null){return {"Access-Control-Allow-Origin":origin&&ORIGINS.has(origin)?origin:SITE,"Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin","Content-Type":"application/json","Cache-Control":"no-store"};}
function send(data:unknown,status=200,origin:string|null=null){return new Response(JSON.stringify(data),{status,headers:cors(origin)});}
function clean(v:unknown,n:number){return String(v??"").trim().slice(0,n);}
function safePage(v:unknown):string|null{const s=clean(v,2048);if(!s)return null;try{const u=new URL(s);return u.protocol==="https:"&&["ahmadwebworks.github.io","rawcdn.githack.com"].includes(u.hostname)?u.origin+u.pathname:null;}catch{return null;}}
async function sessionFor(v:unknown):Promise<string>{const id=UUID.test(String(v??""))?String(v):crypto.randomUUID();const {data,error}=await db.from("assistant_sessions").select("id").eq("id",id).maybeSingle();if(error)throw error;if(data)return id;const {error:e}=await db.from("assistant_sessions").insert({id});if(e&&e.code!=="23505")throw e;return id;}
async function chat(b:Record<string,unknown>,origin:string|null){
 const question=clean(b.question,1000);if(!question)return send({error:"Please enter a question."},400,origin);if(clean(b.website,200))return send({error:"Request rejected."},400,origin);
 const session_id=await sessionFor(b.session_id),since=new Date(Date.now()-60000).toISOString();
 const {data:recent,error:re}=await db.from("assistant_messages").select("id").eq("session_id",session_id).eq("role","user").gte("created_at",since).limit(8);if(re)throw re;if((recent??[]).length>=8)return send({error:"Please wait before sending another message."},429,origin);
 const {data:knowledge,error:ke}=await db.from("assistant_knowledge").select("id,category,title,content,keywords,status,is_public,priority").eq("status","approved").eq("is_public",true).order("priority",{ascending:false}).limit(100);if(ke)throw ke;
 const {data:rows,error:he}=await db.from("assistant_messages").select("role,content").eq("session_id",session_id).in("role",["user","assistant"]).order("created_at",{ascending:false}).limit(8);if(he)throw he;
 const history=(rows??[]).reverse() as H[];
 const {error:ue}=await db.from("assistant_messages").insert({session_id,role:"user",content:question});if(ue)throw ue;
 const result=engine.answerQuestion({question,knowledge:(knowledge??[]) as K[],history});if(!result||typeof result.answer!=="string"||result.grounded!==true)throw new Error("Invalid engine response.");
 const ids=(result.matchedKnowledgeIds??[]).filter(id=>UUID.test(id));
 const {data:saved,error:se}=await db.from("assistant_messages").insert({session_id,role:"assistant",content:result.answer.slice(0,5000),matched_knowledge_ids:ids}).select("id").single();if(se)throw se;
 await db.from("assistant_sessions").update({last_activity_at:new Date().toISOString()}).eq("id",session_id);
 return send({ok:true,session_id,message_id:saved.id,answer:result.answer,intent:result.intent,confidence:result.confidence},200,origin);
}
async function lead(b:Record<string,unknown>,origin:string|null){
 if(clean(b.website,200))return send({error:"Submission rejected."},400,origin);if(b.consent!==true)return send({error:"Consent is required."},400,origin);
 const name=clean(b.name,120),email=clean(b.email,254).toLowerCase(),phone=clean(b.phone,40),business_name=clean(b.business_name,160),service_interest=clean(b.service_interest,120),budget_range=clean(b.budget_range,80),project_details=clean(b.project_details,5000),existing_website=clean(b.existing_website,2048),preferred_contact=clean(b.preferred_contact,20);
 if(name.length<2)return send({error:"Please enter your name."},400,origin);if(!email&&!phone)return send({error:"Provide an email or WhatsApp number."},400,origin);
 if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return send({error:"Enter a valid email."},400,origin);if(phone&&!/^\+?[0-9 ()-]{7,25}$/.test(phone))return send({error:"Enter a valid phone number."},400,origin);
 if(project_details.length<10)return send({error:"Describe your project in at least 10 characters."},400,origin);if(!["email","whatsapp","either"].includes(preferred_contact))return send({error:"Choose a valid contact preference."},400,origin);
 if(preferred_contact==="email"&&!email)return send({error:"Email is required for this preference."},400,origin);if(preferred_contact==="whatsapp"&&!phone)return send({error:"Phone is required for this preference."},400,origin);
 if(existing_website){try{const u=new URL(existing_website);if(!["http:","https:"].includes(u.protocol))throw new Error();}catch{return send({error:"Enter a valid website URL."},400,origin);}}
 const session_id=UUID.test(String(b.session_id??""))?String(b.session_id):null;
 if(session_id){const {data:s,error}=await db.from("assistant_sessions").select("id").eq("id",session_id).maybeSingle();if(error)throw error;if(!s)return send({error:"Chat session not found. Refresh and retry."},400,origin);const since=new Date(Date.now()-3600000).toISOString();const {data:r,error:e}=await db.from("assistant_leads").select("id").eq("session_id",session_id).gte("created_at",since).limit(3);if(e)throw e;if((r??[]).length>=3)return send({error:"Inquiry limit reached for this session."},429,origin);}
 const {data,error}=await db.from("assistant_leads").insert({session_id,name,email:email||null,phone:phone||null,business_name:business_name||null,service_interest:service_interest||null,budget_range:budget_range||null,project_details,existing_website:existing_website||null,preferred_contact,consent:true,consent_text_version:CONSENT_VERSION,source_page:safePage(b.source_page),status:"new"}).select("id").single();
 if(error){console.error("Lead insert:",error.message);throw error;}return send({ok:true,lead_id:data.id,message:"Thanks! Your project inquiry has been received."},201,origin);
}
Deno.serve(async(req:Request)=>{const origin=req.headers.get("origin");if(req.method==="OPTIONS")return origin&&!ORIGINS.has(origin)?send({error:"Origin not allowed."},403,origin):new Response("ok",{headers:cors(origin)});if(req.method!=="POST")return send({error:"Method not allowed."},405,origin);if(origin&&!ORIGINS.has(origin))return send({error:"Origin not allowed."},403,origin);if(!req.headers.get("content-type")?.toLowerCase().includes("application/json"))return send({error:"JSON required."},415,origin);try{const raw=await req.text();if(raw.length>12000)return send({error:"Request too large."},413,origin);const b=JSON.parse(raw) as Record<string,unknown>;if(b.action==="submit_lead")return await lead(b,origin);if(b.action&&b.action!=="chat")return send({error:"Unknown action."},400,origin);return await chat(b,origin);}catch(e){console.error("assistant-api:",e instanceof Error?e.message:"unknown");return send({error:"The assistant couldn't process that request right now. Please try again shortly."},500,origin);}});
