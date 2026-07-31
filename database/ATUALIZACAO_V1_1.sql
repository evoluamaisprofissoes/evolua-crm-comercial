-- ============================================================
-- EVOLUA CRM COMERCIAL
-- ATUALIZAÇÃO SEGURA V1.1
-- Edição/exclusão de cadastros + tarefas inteligentes
--
-- Esta atualização NÃO apaga leads, matrículas, pagamentos
-- ou qualquer outro registro existente.
-- Execute uma única vez no SQL Editor do Supabase.
-- ============================================================

-- 1) Novo status de tarefa.
alter type public.task_status
  add value if not exists 'em_andamento' before 'concluida';

-- 2) Novos campos de lembrete e reagendamento.
alter table public.tasks
  add column if not exists reminder_at timestamptz,
  add column if not exists reminder_sent_at timestamptz,
  add column if not exists previous_due_at timestamptz,
  add column if not exists rescheduled_at timestamptz;

create index if not exists idx_tasks_reminder_pending
  on public.tasks (workspace_id, reminder_at)
  where reminder_at is not null
    and reminder_sent_at is null;

-- 3) Histórico de alterações das tarefas.
create table if not exists public.task_history (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  task_title text not null,
  action text not null,
  action_label text not null,
  old_status public.task_status,
  new_status public.task_status,
  old_due_at timestamptz,
  new_due_at timestamptz,
  details text,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);

create index if not exists idx_task_history_workspace_date
  on public.task_history (workspace_id, changed_at desc);

create index if not exists idx_task_history_task
  on public.task_history (task_id, changed_at desc);

-- 4) Ao alterar prazo ou lembrete, permite um novo aviso.
create or replace function public.reset_task_reminder()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.due_at is distinct from new.due_at
     or old.reminder_at is distinct from new.reminder_at then
    new.reminder_sent_at = null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_reset_task_reminder on public.tasks;
create trigger trg_reset_task_reminder
before update of due_at, reminder_at on public.tasks
for each row execute function public.reset_task_reminder();

-- 5) Auditoria automática de criação, edição, status,
-- reagendamento e exclusão.
create or replace function public.log_task_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  event_action text;
  event_label text;
  event_details text;
begin
  if tg_op = 'INSERT' then
    event_action := 'criada';
    event_label := 'Tarefa criada';
    event_details := 'Nova tarefa cadastrada na agenda.';

    insert into public.task_history (
      workspace_id, task_id, task_title,
      action, action_label,
      old_status, new_status,
      old_due_at, new_due_at,
      details, changed_by
    )
    values (
      new.workspace_id, new.id, new.title,
      event_action, event_label,
      null, new.status,
      null, new.due_at,
      event_details, auth.uid()
    );

    return new;
  end if;

  if tg_op = 'DELETE' then
    event_action := 'excluida';
    event_label := 'Tarefa excluída';
    event_details := 'A tarefa foi excluída do cadastro.';

    insert into public.task_history (
      workspace_id, task_id, task_title,
      action, action_label,
      old_status, new_status,
      old_due_at, new_due_at,
      details, changed_by
    )
    values (
      old.workspace_id, null, old.title,
      event_action, event_label,
      old.status, null,
      old.due_at, null,
      event_details, auth.uid()
    );

    return old;
  end if;

  if old.reminder_sent_at is distinct from new.reminder_sent_at
     and old.title is not distinct from new.title
     and old.description is not distinct from new.description
     and old.lead_id is not distinct from new.lead_id
     and old.task_type is not distinct from new.task_type
     and old.due_at is not distinct from new.due_at
     and old.reminder_at is not distinct from new.reminder_at
     and old.status is not distinct from new.status
     and old.priority is not distinct from new.priority
     and old.assigned_to is not distinct from new.assigned_to then
    return new;
  end if;

  if old.due_at is distinct from new.due_at then
    event_action := 'reagendada';
    event_label := 'Tarefa reagendada';
    event_details := 'Prazo alterado de '
      || to_char(old.due_at at time zone 'America/Cuiaba', 'DD/MM/YYYY HH24:MI')
      || ' para '
      || to_char(new.due_at at time zone 'America/Cuiaba', 'DD/MM/YYYY HH24:MI')
      || '.';
  elsif old.status is distinct from new.status then
    event_action := 'status_alterado';
    event_label := 'Status alterado';
    event_details := 'Status alterado de '
      || coalesce(old.status::text, 'sem status')
      || ' para '
      || coalesce(new.status::text, 'sem status')
      || '.';
  elsif old.reminder_at is distinct from new.reminder_at then
    event_action := 'lembrete_alterado';
    event_label := 'Lembrete alterado';
    event_details := 'Horário do lembrete atualizado.';
  else
    event_action := 'editada';
    event_label := 'Tarefa editada';
    event_details := 'Informações da tarefa atualizadas.';
  end if;

  insert into public.task_history (
    workspace_id, task_id, task_title,
    action, action_label,
    old_status, new_status,
    old_due_at, new_due_at,
    details, changed_by
  )
  values (
    new.workspace_id, new.id, new.title,
    event_action, event_label,
    old.status, new.status,
    old.due_at, new.due_at,
    event_details, auth.uid()
  );

  return new;
end;
$$;

drop trigger if exists trg_task_history on public.tasks;
create trigger trg_task_history
after insert or update or delete on public.tasks
for each row execute function public.log_task_history();

-- 6) Proteção RLS do histórico.
alter table public.task_history enable row level security;

drop policy if exists task_history_select on public.task_history;
create policy task_history_select
on public.task_history for select
to authenticated
using (public.is_workspace_member(workspace_id));

revoke insert, update, delete on public.task_history from authenticated;
grant select on public.task_history to authenticated;
revoke all on public.task_history from anon;

-- 7) Atualiza o resumo de follow-ups.
create or replace view public.v_follow_up_summary
with (security_invoker = true)
as
select
  workspace_id,
  count(*) filter (
    where status::text in ('pendente', 'em_andamento')
      and due_at::date = current_date
  )::integer as due_today,
  count(*) filter (
    where status::text in ('pendente', 'em_andamento')
      and due_at::date < current_date
  )::integer as overdue,
  count(*) filter (
    where status::text in ('pendente', 'em_andamento')
      and due_at::date > current_date
  )::integer as upcoming
from public.tasks
group by workspace_id;

grant select on public.v_follow_up_summary to authenticated;

-- ============================================================
-- RESULTADO ESPERADO:
-- Success. No rows returned
-- ============================================================
