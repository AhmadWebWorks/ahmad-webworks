/* Ahmad WebWorks Assistant — Step 1: frontend shell only.
   Step 3 will replace the transparent setup response with the intelligence engine. */
(() => {
  "use strict";
  if (window.__ahmadWebWorksAssistantMounted) return;
  window.__ahmadWebWorksAssistantMounted = true;
  const root = document.createElement("div");
  root.className = "aw-assistant";
  root.innerHTML = `
    <button class="aw-chat-launcher" type="button" aria-label="Open Ahmad WebWorks assistant" aria-expanded="false" aria-controls="aw-chat-window">
      <span class="aw-chat-launcher-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H6l-3 2v-6.5A7.5 7.5 0 1 1 20 11.5Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 11h8M8 14.5h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></span>
      <span class="aw-chat-launcher-label">Ask us anything</span>
    </button>
    <section class="aw-chat-window" id="aw-chat-window" role="dialog" aria-label="Ahmad WebWorks chat assistant" aria-modal="false" aria-hidden="true">
      <header class="aw-chat-header"><div class="aw-chat-avatar" aria-hidden="true">AW</div><div class="aw-chat-heading"><strong>Ahmad WebWorks</strong><span class="aw-chat-status"><i class="aw-chat-status-dot"></i> Knowledge-based support</span></div><button class="aw-chat-close" type="button" aria-label="Close chat">×</button></header>
      <div class="aw-chat-messages" aria-live="polite" aria-relevant="additions">
        <p class="aw-chat-date">WELCOME</p>
        <div class="aw-chat-message"><p>Hi there! 👋 I'm the Ahmad WebWorks assistant. I'm being prepared to help with services, website projects and common questions.</p></div>
        <div class="aw-chat-message"><p>While my knowledge and response system is being connected, you can reach the team directly through <a href="https://wa.me/923704513823" target="_blank" rel="noopener noreferrer">WhatsApp</a> or the <a href="contact.html">contact page</a>.</p></div>
        <div class="aw-chat-chips" aria-label="Suggested questions"><button class="aw-chat-chip" type="button">What services do you offer?</button><button class="aw-chat-chip" type="button">How does a project start?</button><button class="aw-chat-chip" type="button">Can I request a quote?</button></div>
      </div>
      <p class="aw-chat-notice">Please don't share passwords, payment details or other sensitive information here.</p>
      <form class="aw-chat-form"><textarea class="aw-chat-input" rows="1" maxlength="1000" aria-label="Your message" placeholder="Type your question..." required></textarea><button class="aw-chat-send" type="submit" aria-label="Send message"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m21 3-7.2 18-3.8-7-7-3.8L21 3Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 3 10 14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button></form>
      <div class="aw-chat-powered">AHMAD WEBWORKS · DIGITAL SUPPORT</div>
    </section>`;
  document.body.appendChild(root);
  const launcher=root.querySelector(".aw-chat-launcher"),panel=root.querySelector(".aw-chat-window"),close=root.querySelector(".aw-chat-close"),form=root.querySelector(".aw-chat-form"),input=root.querySelector(".aw-chat-input"),messages=root.querySelector(".aw-chat-messages");
  const SUPABASE_URL="https://vxdzyfbxcorxqysvlzgn.supabase.co";
  const SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4ZHp5ZmJ4Y29yeHF5c3ZsemduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUyNzk4NzgsImV4cCI6MjExMDg1NTg3OH0.-cqjsxRhBceb7e_Nq3_gln-_hm1mHCW4DKXdCh_8BUE";
  const ASSISTANT_API_URL=SUPABASE_URL+"/functions/v1/assistant-api";
  const sendButton=root.querySelector(".aw-chat-send");
  let sessionId="";
  try{sessionId=localStorage.getItem("aw_assistant_session_id")||"";}catch(_){}
  const makeSessionId=()=>{if(window.crypto&&crypto.randomUUID)return crypto.randomUUID();return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,(c)=>{const r=Math.random()*16|0;return (c==="x"?r:(r&3|8)).toString(16);});};
  const getSessionId=()=>{if(!sessionId){sessionId=makeSessionId();try{localStorage.setItem("aw_assistant_session_id",sessionId);}catch(_){}}return sessionId;};
  const setOpen=(open)=>{root.classList.toggle("is-open",open);launcher.setAttribute("aria-expanded",String(open));panel.setAttribute("aria-hidden",String(!open));if(open)input.focus();else launcher.focus();};
  const addMessage=(value,user)=>{const item=document.createElement("div");item.className="aw-chat-message"+(user?" is-user":"");const paragraph=document.createElement("p");paragraph.textContent=value;item.appendChild(paragraph);messages.appendChild(item);messages.scrollTop=messages.scrollHeight;};
  launcher.addEventListener("click",()=>setOpen(!root.classList.contains("is-open")));
  close.addEventListener("click",()=>setOpen(false));
  document.addEventListener("keydown",(event)=>{if(event.key==="Escape"&&root.classList.contains("is-open"))setOpen(false);});
  root.querySelectorAll(".aw-chat-chip").forEach((chip)=>chip.addEventListener("click",()=>{input.value=chip.textContent.trim();input.focus();}));
  input.addEventListener("keydown",(event)=>{if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();form.requestSubmit();}});
  form.addEventListener("submit",async(event)=>{
    event.preventDefault();
    const value=input.value.trim();
    if(!value||sendButton.disabled)return;
    addMessage(value,true);
    input.value="";
    sendButton.disabled=true;
    input.disabled=true;
    const typing=document.createElement("div");
    typing.className="aw-chat-message";
    const typingText=document.createElement("p");
    typingText.textContent="Thinking...";
    typing.appendChild(typingText);
    messages.appendChild(typing);
    messages.scrollTop=messages.scrollHeight;
    try{
      const response=await fetch(ASSISTANT_API_URL,{
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          "apikey":SUPABASE_ANON_KEY,
          "Authorization":"Bearer "+SUPABASE_ANON_KEY
        },
        body:JSON.stringify({action:"chat",question:value,session_id:getSessionId(),website:""})
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||"The assistant is temporarily unavailable.");
      if(data.session_id){
        sessionId=data.session_id;
        try{localStorage.setItem("aw_assistant_session_id",sessionId);}catch(_){}
      }
      typing.remove();
      addMessage(typeof data.answer==="string"?data.answer:"I couldn't prepare an answer. Please contact us on WhatsApp.");
    }catch(error){
      typing.remove();
      addMessage((error&&error.message?error.message:"I couldn't connect just now.")+" You can also reach us at https://wa.me/923704513823.");
    }finally{
      sendButton.disabled=false;
      input.disabled=false;
      input.focus();
    }
  });
})();