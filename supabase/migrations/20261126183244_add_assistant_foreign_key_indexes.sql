-- Add covering indexes for assistant foreign keys flagged by Supabase's database linter.
-- These indexes improve joins and parent-row delete/update checks without changing data or access policies.

create index if not exists assistant_feedback_message_id_idx
  on public.assistant_feedback (message_id);

create index if not exists assistant_feedback_session_id_idx
  on public.assistant_feedback (session_id);

create index if not exists assistant_leads_session_id_idx
  on public.assistant_leads (session_id);
