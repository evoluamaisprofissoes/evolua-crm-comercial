-- ============================================================
-- EVOLUA CRM COMERCIAL
-- ATUALIZAÇÃO V1.2
-- Metas múltiplas por frente comercial
-- ============================================================
-- Esta atualização é incremental e não apaga dados existentes.

begin;

create table if not exists public.sales_goals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  reference_month date not null,
  name text not null,
  target_enrollments integer not null default 0 check (target_enrollments >= 0),
  target_generated_revenue numeric(12,2) not null default 0 check (target_generated_revenue >= 0),
  target_received_revenue numeric(12,2) not null default 0 check (target_received_revenue >= 0),
  notes text,
  active boolean not null default true,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, reference_month, name),
  constraint sales_goals_reference_month_first_day
    check (reference_month = date_trunc('month', reference_month)::date)
);

create table if not exists public.sales_goal_courses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  goal_id uuid not null references public.sales_goals(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (goal_id, course_id)
);

create index if not exists idx_sales_goals_workspace_month
  on public.sales_goals(workspace_id, reference_month);

create index if not exists idx_sales_goal_courses_goal
  on public.sales_goal_courses(goal_id);

drop trigger if exists trg_sales_goals_updated_at on public.sales_goals;
create trigger trg_sales_goals_updated_at
before update on public.sales_goals
for each row execute function public.set_updated_at();

create or replace function public.validate_sales_goal_course_workspace()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  goal_workspace uuid;
  course_workspace uuid;
begin
  select workspace_id into goal_workspace
  from public.sales_goals
  where id = new.goal_id;

  select workspace_id into course_workspace
  from public.courses
  where id = new.course_id;

  if goal_workspace is null then
    raise exception 'Meta comercial não encontrada';
  end if;

  if course_workspace is null then
    raise exception 'Curso não encontrado';
  end if;

  if new.workspace_id is distinct from goal_workspace
     or new.workspace_id is distinct from course_workspace then
    raise exception 'Meta e curso pertencem a espaços de trabalho diferentes';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_sales_goal_course on public.sales_goal_courses;
create trigger trg_validate_sales_goal_course
before insert or update on public.sales_goal_courses
for each row execute function public.validate_sales_goal_course_workspace();

alter table public.sales_goals enable row level security;
alter table public.sales_goal_courses enable row level security;

drop policy if exists sales_goals_select on public.sales_goals;
create policy sales_goals_select
on public.sales_goals for select
to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists sales_goals_insert on public.sales_goals;
create policy sales_goals_insert
on public.sales_goals for insert
to authenticated
with check (
  public.can_write_workspace(workspace_id)
  and created_by = (select auth.uid())
);

drop policy if exists sales_goals_update on public.sales_goals;
create policy sales_goals_update
on public.sales_goals for update
to authenticated
using (public.can_write_workspace(workspace_id))
with check (public.can_write_workspace(workspace_id));

drop policy if exists sales_goals_delete on public.sales_goals;
create policy sales_goals_delete
on public.sales_goals for delete
to authenticated
using (public.can_write_workspace(workspace_id));

drop policy if exists sales_goal_courses_select on public.sales_goal_courses;
create policy sales_goal_courses_select
on public.sales_goal_courses for select
to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists sales_goal_courses_insert on public.sales_goal_courses;
create policy sales_goal_courses_insert
on public.sales_goal_courses for insert
to authenticated
with check (public.can_write_workspace(workspace_id));

drop policy if exists sales_goal_courses_update on public.sales_goal_courses;
create policy sales_goal_courses_update
on public.sales_goal_courses for update
to authenticated
using (public.can_write_workspace(workspace_id))
with check (public.can_write_workspace(workspace_id));

drop policy if exists sales_goal_courses_delete on public.sales_goal_courses;
create policy sales_goal_courses_delete
on public.sales_goal_courses for delete
to authenticated
using (public.can_write_workspace(workspace_id));

grant select, insert, update, delete on public.sales_goals to authenticated;
grant select, insert, update, delete on public.sales_goal_courses to authenticated;

revoke all on public.sales_goals from anon;
revoke all on public.sales_goal_courses from anon;

commit;

-- Resultado esperado:
-- Success. No rows returned
