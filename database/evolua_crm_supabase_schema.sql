-- ============================================================
-- EVOLUA CRM COMERCIAL
-- Banco de dados Supabase/PostgreSQL
-- Versão inicial: 2026-07-30
-- ============================================================

begin;

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- TIPOS
-- ------------------------------------------------------------

do $$ begin
  create type public.app_role as enum ('owner', 'admin', 'seller', 'viewer');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.lead_status as enum (
    'novo',
    'primeiro_contato',
    'em_atendimento',
    'qualificado',
    'proposta_enviada',
    'follow_up',
    'matriculado',
    'perdido'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.lead_temperature as enum ('frio', 'morno', 'quente');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.lead_modality as enum ('presencial', 'online', 'assinatura', 'hibrido');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.interaction_channel as enum (
    'whatsapp',
    'telefone',
    'instagram',
    'email',
    'presencial',
    'outro'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.task_type as enum (
    'follow_up',
    'ligacao',
    'reuniao',
    'visita',
    'mensagem',
    'outro'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.task_status as enum ('pendente', 'concluida', 'cancelada');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.priority_level as enum ('baixa', 'media', 'alta', 'urgente');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.enrollment_status as enum ('ativa', 'pendente', 'cancelada', 'concluida');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.payment_status as enum ('previsto', 'recebido', 'atrasado', 'cancelado');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.payment_method as enum (
    'pix',
    'dinheiro',
    'cartao_credito',
    'cartao_debito',
    'boleto',
    'transferencia',
    'outro'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.action_status as enum (
    'nao_iniciada',
    'em_andamento',
    'concluida',
    'cancelada'
  );
exception when duplicate_object then null;
end $$;

-- ------------------------------------------------------------
-- FUNÇÃO PADRÃO DE UPDATED_AT
-- ------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ------------------------------------------------------------
-- USUÁRIOS E ESPAÇOS DE TRABALHO
-- ------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null default 'seller',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

-- ------------------------------------------------------------
-- CADASTROS AUXILIARES
-- ------------------------------------------------------------

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  category text,
  modality public.lead_modality,
  list_price numeric(12,2) not null default 0 check (list_price >= 0),
  active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create table if not exists public.lead_sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
);

-- ------------------------------------------------------------
-- LEADS E HISTÓRICO
-- ------------------------------------------------------------

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  full_name text not null,
  phone text,
  whatsapp text,
  email text,
  city text,
  birth_date date,
  source_id uuid references public.lead_sources(id) on delete set null,
  campaign text,
  modality public.lead_modality,
  temperature public.lead_temperature not null default 'morno',
  status public.lead_status not null default 'novo',
  assigned_to uuid references auth.users(id) on delete set null,
  next_action text,
  next_contact_at timestamptz,
  notes text,
  lost_reason text,
  converted_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lead_interests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  notes text,
  created_at timestamptz not null default now(),
  unique (lead_id, course_id)
);

create table if not exists public.interactions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  channel public.interaction_channel not null default 'whatsapp',
  summary text not null,
  objections text,
  proposal_amount numeric(12,2) check (proposal_amount is null or proposal_amount >= 0),
  outcome text,
  next_action text,
  occurred_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lead_status_history (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  old_status public.lead_status,
  new_status public.lead_status not null,
  changed_by uuid default auth.uid() references auth.users(id),
  changed_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- AGENDA, TAREFAS E FOLLOW-UP
-- ------------------------------------------------------------

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  title text not null,
  description text,
  task_type public.task_type not null default 'follow_up',
  due_at timestamptz not null,
  completed_at timestamptz,
  status public.task_status not null default 'pendente',
  priority public.priority_level not null default 'media',
  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- MATRÍCULAS E FINANCEIRO
-- ------------------------------------------------------------

create table if not exists public.enrollments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  course_id uuid references public.courses(id) on delete set null,
  student_name text not null,
  enrollment_date date not null default current_date,
  contract_value numeric(12,2) not null default 0 check (contract_value >= 0),
  enrollment_fee numeric(12,2) not null default 0 check (enrollment_fee >= 0),
  total_contract_value numeric(12,2)
    generated always as (contract_value + enrollment_fee) stored,
  installments integer not null default 1 check (installments > 0),
  installment_value numeric(12,2) not null default 0 check (installment_value >= 0),
  payment_method public.payment_method,
  due_day integer check (due_day is null or due_day between 1 and 31),
  status public.enrollment_status not null default 'ativa',
  notes text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  description text,
  installment_number integer check (installment_number is null or installment_number > 0),
  due_date date,
  paid_at timestamptz,
  amount numeric(12,2) not null check (amount >= 0),
  status public.payment_status not null default 'previsto',
  payment_method public.payment_method,
  notes text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- PLANEJAMENTO MENSAL E 5W2H
-- ------------------------------------------------------------

create table if not exists public.monthly_plans (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  reference_month date not null,
  target_leads integer not null default 0 check (target_leads >= 0),
  target_proposals integer not null default 0 check (target_proposals >= 0),
  target_enrollments integer not null default 0 check (target_enrollments >= 0),
  target_generated_revenue numeric(12,2) not null default 0 check (target_generated_revenue >= 0),
  target_received_revenue numeric(12,2) not null default 0 check (target_received_revenue >= 0),
  target_average_ticket numeric(12,2) not null default 0 check (target_average_ticket >= 0),
  target_conversion_rate numeric(5,2) not null default 0
    check (target_conversion_rate between 0 and 100),
  priority_courses text,
  campaigns text,
  ad_budget numeric(12,2) not null default 0 check (ad_budget >= 0),
  notes text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, reference_month),
  constraint reference_month_first_day
    check (reference_month = date_trunc('month', reference_month)::date)
);

create table if not exists public.sw2h_actions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  monthly_plan_id uuid not null references public.monthly_plans(id) on delete cascade,
  what_action text not null,
  why_action text,
  where_action text,
  start_date date,
  end_date date,
  responsible text,
  how_action text,
  estimated_cost numeric(12,2) not null default 0 check (estimated_cost >= 0),
  status public.action_status not null default 'nao_iniciada',
  progress integer not null default 0 check (progress between 0 and 100),
  result text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- ÍNDICES
-- ------------------------------------------------------------

create index if not exists idx_workspace_members_user
  on public.workspace_members(user_id, active);

create index if not exists idx_courses_workspace_active
  on public.courses(workspace_id, active);

create index if not exists idx_lead_sources_workspace_active
  on public.lead_sources(workspace_id, active);

create index if not exists idx_leads_workspace_created
  on public.leads(workspace_id, created_at desc);

create index if not exists idx_leads_workspace_status
  on public.leads(workspace_id, status);

create index if not exists idx_leads_next_contact
  on public.leads(workspace_id, next_contact_at)
  where next_contact_at is not null;

create index if not exists idx_interactions_lead_date
  on public.interactions(lead_id, occurred_at desc);

create index if not exists idx_tasks_workspace_due
  on public.tasks(workspace_id, due_at);

create index if not exists idx_tasks_pending
  on public.tasks(workspace_id, status, due_at);

create index if not exists idx_enrollments_workspace_date
  on public.enrollments(workspace_id, enrollment_date desc);

create index if not exists idx_payments_workspace_paid
  on public.payments(workspace_id, paid_at)
  where paid_at is not null;

create index if not exists idx_monthly_plans_workspace_month
  on public.monthly_plans(workspace_id, reference_month desc);

-- ------------------------------------------------------------
-- TRIGGERS DE UPDATED_AT
-- ------------------------------------------------------------

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_workspaces_updated_at on public.workspaces;
create trigger trg_workspaces_updated_at
before update on public.workspaces
for each row execute function public.set_updated_at();

drop trigger if exists trg_courses_updated_at on public.courses;
create trigger trg_courses_updated_at
before update on public.courses
for each row execute function public.set_updated_at();

drop trigger if exists trg_lead_sources_updated_at on public.lead_sources;
create trigger trg_lead_sources_updated_at
before update on public.lead_sources
for each row execute function public.set_updated_at();

drop trigger if exists trg_leads_updated_at on public.leads;
create trigger trg_leads_updated_at
before update on public.leads
for each row execute function public.set_updated_at();

drop trigger if exists trg_interactions_updated_at on public.interactions;
create trigger trg_interactions_updated_at
before update on public.interactions
for each row execute function public.set_updated_at();

drop trigger if exists trg_tasks_updated_at on public.tasks;
create trigger trg_tasks_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

drop trigger if exists trg_enrollments_updated_at on public.enrollments;
create trigger trg_enrollments_updated_at
before update on public.enrollments
for each row execute function public.set_updated_at();

drop trigger if exists trg_payments_updated_at on public.payments;
create trigger trg_payments_updated_at
before update on public.payments
for each row execute function public.set_updated_at();

drop trigger if exists trg_monthly_plans_updated_at on public.monthly_plans;
create trigger trg_monthly_plans_updated_at
before update on public.monthly_plans
for each row execute function public.set_updated_at();

drop trigger if exists trg_sw2h_actions_updated_at on public.sw2h_actions;
create trigger trg_sw2h_actions_updated_at
before update on public.sw2h_actions
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- PERFIL AUTOMÁTICO AO CRIAR USUÁRIO
-- ------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    new.email
  )
  on conflict (id) do update
    set email = excluded.email;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Cria perfis para usuários que já existiam antes deste script.
insert into public.profiles (id, full_name, email)
select
  u.id,
  coalesce(u.raw_user_meta_data ->> 'full_name', split_part(coalesce(u.email, ''), '@', 1)),
  u.email
from auth.users u
on conflict (id) do update
set email = excluded.email;

-- ------------------------------------------------------------
-- FUNÇÕES DE SEGURANÇA
-- ------------------------------------------------------------

create or replace function public.is_workspace_member(target_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace
      and wm.user_id = (select auth.uid())
      and wm.active = true
  );
$$;

create or replace function public.is_workspace_admin(target_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace
      and wm.user_id = (select auth.uid())
      and wm.active = true
      and wm.role in ('owner', 'admin')
  );
$$;

create or replace function public.can_write_workspace(target_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace
      and wm.user_id = (select auth.uid())
      and wm.active = true
      and wm.role in ('owner', 'admin', 'seller')
  );
$$;

create or replace function public.shares_workspace(other_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members mine
    join public.workspace_members theirs
      on theirs.workspace_id = mine.workspace_id
    where mine.user_id = (select auth.uid())
      and mine.active = true
      and theirs.user_id = other_user
      and theirs.active = true
  );
$$;

-- ------------------------------------------------------------
-- FUNÇÃO DE CONFIGURAÇÃO INICIAL DO USUÁRIO
-- Chamada automaticamente pelo futuro sistema após o login.
-- ------------------------------------------------------------

create or replace function public.bootstrap_current_user(
  workspace_name text default 'Evolua CRM Comercial'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_workspace uuid;
begin
  if current_user_id is null then
    raise exception 'Usuário não autenticado';
  end if;

  insert into public.profiles (id, full_name, email)
  select
    u.id,
    coalesce(u.raw_user_meta_data ->> 'full_name', split_part(coalesce(u.email, ''), '@', 1)),
    u.email
  from auth.users u
  where u.id = current_user_id
  on conflict (id) do nothing;

  select wm.workspace_id
    into target_workspace
  from public.workspace_members wm
  where wm.user_id = current_user_id
    and wm.active = true
  order by wm.created_at
  limit 1;

  if target_workspace is null then
    insert into public.workspaces (name, slug, created_by)
    values (
      coalesce(nullif(trim(workspace_name), ''), 'Evolua CRM Comercial'),
      'evolua-crm-' || substr(md5(current_user_id::text || clock_timestamp()::text), 1, 10),
      current_user_id
    )
    returning id into target_workspace;

    insert into public.workspace_members (workspace_id, user_id, role)
    values (target_workspace, current_user_id, 'owner');
  end if;

  return target_workspace;
end;
$$;

-- ------------------------------------------------------------
-- HISTÓRICO AUTOMÁTICO DE MUDANÇA DO FUNIL
-- ------------------------------------------------------------

create or replace function public.set_lead_converted_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'matriculado'
     and old.status is distinct from new.status
     and new.converted_at is null then
    new.converted_at = now();
  end if;

  return new;
end;
$$;

create or replace function public.log_lead_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.lead_status_history (
      workspace_id, lead_id, old_status, new_status, changed_by
    )
    values (
      new.workspace_id, new.id, null, new.status, auth.uid()
    );
  elsif old.status is distinct from new.status then
    insert into public.lead_status_history (
      workspace_id, lead_id, old_status, new_status, changed_by
    )
    values (
      new.workspace_id, new.id, old.status, new.status, auth.uid()
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_set_lead_converted_at on public.leads;
create trigger trg_set_lead_converted_at
before update of status on public.leads
for each row execute function public.set_lead_converted_at();

drop trigger if exists trg_lead_status_history on public.leads;
create trigger trg_lead_status_history
after insert or update of status on public.leads
for each row execute function public.log_lead_status_change();

-- ------------------------------------------------------------
-- VALIDAÇÕES ENTRE TABELAS
-- ------------------------------------------------------------

create or replace function public.validate_workspace_relationships()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  related_workspace uuid;
begin
  if tg_table_name = 'lead_interests' then
    select workspace_id into related_workspace
    from public.leads where id = new.lead_id;
    if related_workspace is distinct from new.workspace_id then
      raise exception 'Lead pertence a outro espaço de trabalho';
    end if;

    select workspace_id into related_workspace
    from public.courses where id = new.course_id;
    if related_workspace is distinct from new.workspace_id then
      raise exception 'Curso pertence a outro espaço de trabalho';
    end if;

  elsif tg_table_name = 'interactions' then
    select workspace_id into related_workspace
    from public.leads where id = new.lead_id;
    if related_workspace is distinct from new.workspace_id then
      raise exception 'Lead pertence a outro espaço de trabalho';
    end if;

  elsif tg_table_name = 'tasks' and new.lead_id is not null then
    select workspace_id into related_workspace
    from public.leads where id = new.lead_id;
    if related_workspace is distinct from new.workspace_id then
      raise exception 'Lead pertence a outro espaço de trabalho';
    end if;

  elsif tg_table_name = 'payments' then
    select workspace_id into related_workspace
    from public.enrollments where id = new.enrollment_id;
    if related_workspace is distinct from new.workspace_id then
      raise exception 'Matrícula pertence a outro espaço de trabalho';
    end if;

  elsif tg_table_name = 'sw2h_actions' then
    select workspace_id into related_workspace
    from public.monthly_plans where id = new.monthly_plan_id;
    if related_workspace is distinct from new.workspace_id then
      raise exception 'Planejamento pertence a outro espaço de trabalho';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_lead_interests on public.lead_interests;
create trigger trg_validate_lead_interests
before insert or update on public.lead_interests
for each row execute function public.validate_workspace_relationships();

drop trigger if exists trg_validate_interactions on public.interactions;
create trigger trg_validate_interactions
before insert or update on public.interactions
for each row execute function public.validate_workspace_relationships();

drop trigger if exists trg_validate_tasks on public.tasks;
create trigger trg_validate_tasks
before insert or update on public.tasks
for each row execute function public.validate_workspace_relationships();

drop trigger if exists trg_validate_payments on public.payments;
create trigger trg_validate_payments
before insert or update on public.payments
for each row execute function public.validate_workspace_relationships();

drop trigger if exists trg_validate_sw2h on public.sw2h_actions;
create trigger trg_validate_sw2h
before insert or update on public.sw2h_actions
for each row execute function public.validate_workspace_relationships();

-- ------------------------------------------------------------
-- CRIA UM ESPAÇO PARA CADA USUÁRIO JÁ EXISTENTE SEM VÍNCULO
-- ------------------------------------------------------------

insert into public.workspaces (name, slug, created_by)
select
  'Evolua CRM Comercial',
  'evolua-crm-' || substr(md5(u.id::text), 1, 10),
  u.id
from auth.users u
where not exists (
  select 1
  from public.workspace_members wm
  where wm.user_id = u.id
);

insert into public.workspace_members (workspace_id, user_id, role)
select w.id, w.created_by, 'owner'::public.app_role
from public.workspaces w
where not exists (
  select 1
  from public.workspace_members wm
  where wm.workspace_id = w.id
    and wm.user_id = w.created_by
)
on conflict (workspace_id, user_id) do nothing;

-- ------------------------------------------------------------
-- DADOS INICIAIS
-- ------------------------------------------------------------

insert into public.lead_sources (workspace_id, name, created_by)
select w.id, source_name, w.created_by
from public.workspaces w
cross join (
  values
    ('WhatsApp'),
    ('Instagram'),
    ('Facebook'),
    ('Google'),
    ('Indicação'),
    ('Site'),
    ('Atendimento presencial'),
    ('Outro')
) as sources(source_name)
on conflict (workspace_id, name) do nothing;

insert into public.courses (workspace_id, name, category, modality, created_by)
select w.id, c.name, c.category, c.modality::public.lead_modality, w.created_by
from public.workspaces w
cross join (
  values
    ('Start Tech', 'Evolua Academy', 'assinatura'),
    ('Start Adm', 'Evolua Academy', 'assinatura'),
    ('Pro Tech', 'Evolua Academy', 'assinatura'),
    ('Pro Adm', 'Evolua Academy', 'assinatura'),
    ('Master', 'Evolua Academy', 'assinatura'),
    ('Family', 'Evolua Academy', 'assinatura'),
    ('Business Start', 'Evolua Academy Empresas', 'assinatura'),
    ('Business Pro', 'Evolua Academy Empresas', 'assinatura'),
    ('Business Plus', 'Evolua Academy Empresas', 'assinatura'),
    ('Business Gold', 'Evolua Academy Empresas', 'assinatura'),
    ('Operador de Informática Essencial', 'Tecnologia', 'presencial'),
    ('Operador de Informática Avançado', 'Tecnologia', 'presencial'),
    ('Excel 365', 'Tecnologia', 'hibrido'),
    ('Power BI', 'Tecnologia', 'hibrido'),
    ('Design Gráfico', 'Criatividade', 'hibrido'),
    ('Videomaker', 'Criatividade', 'hibrido'),
    ('Programação', 'Tecnologia', 'hibrido'),
    ('Assistente Administrativo', 'Administração', 'hibrido'),
    ('Atendente de Farmácia', 'Administração', 'hibrido'),
    ('Jovem Aprendiz Administrativo', 'Administração', 'hibrido'),
    ('Gestão com IA', 'Inteligência Artificial', 'hibrido'),
    ('Marketing com IA', 'Inteligência Artificial', 'hibrido'),
    ('Vendas com IA', 'Inteligência Artificial', 'hibrido'),
    ('IA Criativa', 'Inteligência Artificial', 'hibrido'),
    ('Provão Ensino Fundamental', 'Certificação', 'online'),
    ('Provão Ensino Médio', 'Certificação', 'online'),
    ('Provão Fundamental + Médio', 'Certificação', 'online'),
    ('Técnico por Competência', 'Certificação Profissional', 'online')
) as c(name, category, modality)
on conflict (workspace_id, name) do nothing;

-- ------------------------------------------------------------
-- RLS: ATIVAÇÃO
-- ------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.courses enable row level security;
alter table public.lead_sources enable row level security;
alter table public.leads enable row level security;
alter table public.lead_interests enable row level security;
alter table public.interactions enable row level security;
alter table public.lead_status_history enable row level security;
alter table public.tasks enable row level security;
alter table public.enrollments enable row level security;
alter table public.payments enable row level security;
alter table public.monthly_plans enable row level security;
alter table public.sw2h_actions enable row level security;

-- ------------------------------------------------------------
-- RLS: PROFILES
-- ------------------------------------------------------------

drop policy if exists profiles_select_team on public.profiles;
create policy profiles_select_team
on public.profiles for select
to authenticated
using (
  id = (select auth.uid())
  or public.shares_workspace(id)
);

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self
on public.profiles for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

-- ------------------------------------------------------------
-- RLS: WORKSPACES E MEMBROS
-- ------------------------------------------------------------

drop policy if exists workspaces_select_member on public.workspaces;
create policy workspaces_select_member
on public.workspaces for select
to authenticated
using (public.is_workspace_member(id));

drop policy if exists workspaces_insert_self on public.workspaces;
create policy workspaces_insert_self
on public.workspaces for insert
to authenticated
with check (created_by = (select auth.uid()));

drop policy if exists workspaces_update_admin on public.workspaces;
create policy workspaces_update_admin
on public.workspaces for update
to authenticated
using (public.is_workspace_admin(id))
with check (public.is_workspace_admin(id));

drop policy if exists workspaces_delete_owner on public.workspaces;
create policy workspaces_delete_owner
on public.workspaces for delete
to authenticated
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = id
      and wm.user_id = (select auth.uid())
      and wm.role = 'owner'
      and wm.active = true
  )
);

drop policy if exists members_select_workspace on public.workspace_members;
create policy members_select_workspace
on public.workspace_members for select
to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists members_insert_admin on public.workspace_members;
create policy members_insert_admin
on public.workspace_members for insert
to authenticated
with check (
  public.is_workspace_admin(workspace_id)
  or (
    user_id = (select auth.uid())
    and role = 'owner'
    and exists (
      select 1 from public.workspaces w
      where w.id = workspace_id
        and w.created_by = (select auth.uid())
    )
  )
);

drop policy if exists members_update_admin on public.workspace_members;
create policy members_update_admin
on public.workspace_members for update
to authenticated
using (public.is_workspace_admin(workspace_id))
with check (public.is_workspace_admin(workspace_id));

drop policy if exists members_delete_admin on public.workspace_members;
create policy members_delete_admin
on public.workspace_members for delete
to authenticated
using (public.is_workspace_admin(workspace_id));

-- ------------------------------------------------------------
-- RLS PADRÃO PARA DADOS COMERCIAIS
-- ------------------------------------------------------------

-- COURSES
drop policy if exists courses_select on public.courses;
create policy courses_select on public.courses for select to authenticated
using (public.is_workspace_member(workspace_id));
drop policy if exists courses_insert on public.courses;
create policy courses_insert on public.courses for insert to authenticated
with check (public.can_write_workspace(workspace_id));
drop policy if exists courses_update on public.courses;
create policy courses_update on public.courses for update to authenticated
using (public.can_write_workspace(workspace_id))
with check (public.can_write_workspace(workspace_id));
drop policy if exists courses_delete on public.courses;
create policy courses_delete on public.courses for delete to authenticated
using (public.is_workspace_admin(workspace_id));

-- LEAD SOURCES
drop policy if exists lead_sources_select on public.lead_sources;
create policy lead_sources_select on public.lead_sources for select to authenticated
using (public.is_workspace_member(workspace_id));
drop policy if exists lead_sources_insert on public.lead_sources;
create policy lead_sources_insert on public.lead_sources for insert to authenticated
with check (public.can_write_workspace(workspace_id));
drop policy if exists lead_sources_update on public.lead_sources;
create policy lead_sources_update on public.lead_sources for update to authenticated
using (public.can_write_workspace(workspace_id))
with check (public.can_write_workspace(workspace_id));
drop policy if exists lead_sources_delete on public.lead_sources;
create policy lead_sources_delete on public.lead_sources for delete to authenticated
using (public.is_workspace_admin(workspace_id));

-- LEADS
drop policy if exists leads_select on public.leads;
create policy leads_select on public.leads for select to authenticated
using (public.is_workspace_member(workspace_id));
drop policy if exists leads_insert on public.leads;
create policy leads_insert on public.leads for insert to authenticated
with check (
  public.can_write_workspace(workspace_id)
  and created_by = (select auth.uid())
);
drop policy if exists leads_update on public.leads;
create policy leads_update on public.leads for update to authenticated
using (public.can_write_workspace(workspace_id))
with check (public.can_write_workspace(workspace_id));
drop policy if exists leads_delete on public.leads;
create policy leads_delete on public.leads for delete to authenticated
using (public.is_workspace_admin(workspace_id));

-- LEAD INTERESTS
drop policy if exists lead_interests_select on public.lead_interests;
create policy lead_interests_select on public.lead_interests for select to authenticated
using (public.is_workspace_member(workspace_id));
drop policy if exists lead_interests_insert on public.lead_interests;
create policy lead_interests_insert on public.lead_interests for insert to authenticated
with check (public.can_write_workspace(workspace_id));
drop policy if exists lead_interests_update on public.lead_interests;
create policy lead_interests_update on public.lead_interests for update to authenticated
using (public.can_write_workspace(workspace_id))
with check (public.can_write_workspace(workspace_id));
drop policy if exists lead_interests_delete on public.lead_interests;
create policy lead_interests_delete on public.lead_interests for delete to authenticated
using (public.can_write_workspace(workspace_id));

-- INTERACTIONS
drop policy if exists interactions_select on public.interactions;
create policy interactions_select on public.interactions for select to authenticated
using (public.is_workspace_member(workspace_id));
drop policy if exists interactions_insert on public.interactions;
create policy interactions_insert on public.interactions for insert to authenticated
with check (
  public.can_write_workspace(workspace_id)
  and created_by = (select auth.uid())
);
drop policy if exists interactions_update on public.interactions;
create policy interactions_update on public.interactions for update to authenticated
using (public.can_write_workspace(workspace_id))
with check (public.can_write_workspace(workspace_id));
drop policy if exists interactions_delete on public.interactions;
create policy interactions_delete on public.interactions for delete to authenticated
using (public.can_write_workspace(workspace_id));

-- LEAD STATUS HISTORY
drop policy if exists lead_status_history_select on public.lead_status_history;
create policy lead_status_history_select
on public.lead_status_history for select to authenticated
using (public.is_workspace_member(workspace_id));

-- TASKS
drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks for select to authenticated
using (public.is_workspace_member(workspace_id));
drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks for insert to authenticated
with check (
  public.can_write_workspace(workspace_id)
  and created_by = (select auth.uid())
);
drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks for update to authenticated
using (public.can_write_workspace(workspace_id))
with check (public.can_write_workspace(workspace_id));
drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks for delete to authenticated
using (public.can_write_workspace(workspace_id));

-- ENROLLMENTS
drop policy if exists enrollments_select on public.enrollments;
create policy enrollments_select on public.enrollments for select to authenticated
using (public.is_workspace_member(workspace_id));
drop policy if exists enrollments_insert on public.enrollments;
create policy enrollments_insert on public.enrollments for insert to authenticated
with check (
  public.can_write_workspace(workspace_id)
  and created_by = (select auth.uid())
);
drop policy if exists enrollments_update on public.enrollments;
create policy enrollments_update on public.enrollments for update to authenticated
using (public.can_write_workspace(workspace_id))
with check (public.can_write_workspace(workspace_id));
drop policy if exists enrollments_delete on public.enrollments;
create policy enrollments_delete on public.enrollments for delete to authenticated
using (public.is_workspace_admin(workspace_id));

-- PAYMENTS
drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments for select to authenticated
using (public.is_workspace_member(workspace_id));
drop policy if exists payments_insert on public.payments;
create policy payments_insert on public.payments for insert to authenticated
with check (
  public.can_write_workspace(workspace_id)
  and created_by = (select auth.uid())
);
drop policy if exists payments_update on public.payments;
create policy payments_update on public.payments for update to authenticated
using (public.can_write_workspace(workspace_id))
with check (public.can_write_workspace(workspace_id));
drop policy if exists payments_delete on public.payments;
create policy payments_delete on public.payments for delete to authenticated
using (public.is_workspace_admin(workspace_id));

-- MONTHLY PLANS
drop policy if exists monthly_plans_select on public.monthly_plans;
create policy monthly_plans_select on public.monthly_plans for select to authenticated
using (public.is_workspace_member(workspace_id));
drop policy if exists monthly_plans_insert on public.monthly_plans;
create policy monthly_plans_insert on public.monthly_plans for insert to authenticated
with check (
  public.can_write_workspace(workspace_id)
  and created_by = (select auth.uid())
);
drop policy if exists monthly_plans_update on public.monthly_plans;
create policy monthly_plans_update on public.monthly_plans for update to authenticated
using (public.can_write_workspace(workspace_id))
with check (public.can_write_workspace(workspace_id));
drop policy if exists monthly_plans_delete on public.monthly_plans;
create policy monthly_plans_delete on public.monthly_plans for delete to authenticated
using (public.is_workspace_admin(workspace_id));

-- 5W2H
drop policy if exists sw2h_select on public.sw2h_actions;
create policy sw2h_select on public.sw2h_actions for select to authenticated
using (public.is_workspace_member(workspace_id));
drop policy if exists sw2h_insert on public.sw2h_actions;
create policy sw2h_insert on public.sw2h_actions for insert to authenticated
with check (
  public.can_write_workspace(workspace_id)
  and created_by = (select auth.uid())
);
drop policy if exists sw2h_update on public.sw2h_actions;
create policy sw2h_update on public.sw2h_actions for update to authenticated
using (public.can_write_workspace(workspace_id))
with check (public.can_write_workspace(workspace_id));
drop policy if exists sw2h_delete on public.sw2h_actions;
create policy sw2h_delete on public.sw2h_actions for delete to authenticated
using (public.can_write_workspace(workspace_id));

-- ------------------------------------------------------------
-- VIEWS PARA DASHBOARD
-- security_invoker faz as views respeitarem o RLS das tabelas.
-- ------------------------------------------------------------

create or replace view public.v_lead_funnel
with (security_invoker = true)
as
select
  workspace_id,
  status,
  count(*)::integer as total
from public.leads
group by workspace_id, status;

create or replace view public.v_revenue_monthly
with (security_invoker = true)
as
with generated as (
  select
    workspace_id,
    date_trunc('month', enrollment_date)::date as reference_month,
    count(*)::integer as enrollments,
    coalesce(sum(total_contract_value), 0)::numeric(14,2) as generated_revenue
  from public.enrollments
  where status <> 'cancelada'
  group by workspace_id, date_trunc('month', enrollment_date)::date
),
received as (
  select
    workspace_id,
    date_trunc('month', paid_at)::date as reference_month,
    coalesce(sum(amount), 0)::numeric(14,2) as received_revenue
  from public.payments
  where status = 'recebido'
    and paid_at is not null
  group by workspace_id, date_trunc('month', paid_at)::date
)
select
  coalesce(g.workspace_id, r.workspace_id) as workspace_id,
  coalesce(g.reference_month, r.reference_month) as reference_month,
  coalesce(g.enrollments, 0) as enrollments,
  coalesce(g.generated_revenue, 0)::numeric(14,2) as generated_revenue,
  coalesce(r.received_revenue, 0)::numeric(14,2) as received_revenue
from generated g
full join received r
  on r.workspace_id = g.workspace_id
 and r.reference_month = g.reference_month;

create or replace view public.v_course_performance
with (security_invoker = true)
as
select
  e.workspace_id,
  c.id as course_id,
  coalesce(c.name, 'Curso não informado') as course_name,
  count(e.id)::integer as enrollments,
  coalesce(sum(e.total_contract_value), 0)::numeric(14,2) as generated_revenue
from public.enrollments e
left join public.courses c on c.id = e.course_id
where e.status <> 'cancelada'
group by e.workspace_id, c.id, c.name;

create or replace view public.v_follow_up_summary
with (security_invoker = true)
as
select
  workspace_id,
  count(*) filter (
    where status = 'pendente'
      and due_at::date = current_date
  )::integer as due_today,
  count(*) filter (
    where status = 'pendente'
      and due_at::date < current_date
  )::integer as overdue,
  count(*) filter (
    where status = 'pendente'
      and due_at::date > current_date
  )::integer as upcoming
from public.tasks
group by workspace_id;

-- ------------------------------------------------------------
-- PERMISSÕES
-- ------------------------------------------------------------

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on public.v_lead_funnel to authenticated;
grant select on public.v_revenue_monthly to authenticated;
grant select on public.v_course_performance to authenticated;
grant select on public.v_follow_up_summary to authenticated;

revoke all on all tables in schema public from anon;

revoke all on function public.bootstrap_current_user(text) from public, anon;
grant execute on function public.bootstrap_current_user(text) to authenticated;

grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.is_workspace_admin(uuid) to authenticated;
grant execute on function public.can_write_workspace(uuid) to authenticated;
grant execute on function public.shares_workspace(uuid) to authenticated;

commit;

-- ============================================================
-- FIM
-- Resultado esperado: "Success. No rows returned"
-- ============================================================
