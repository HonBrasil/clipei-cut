-- Painel admin: buscar contas, dar/tirar horas e mudar assinaturas.
-- Tudo aqui só é chamado pela Edge Function admin-users (chave de serviço),
-- que confere o e-mail do administrador antes.

-- Histórico de tudo que a administração alterou em cada conta
create table if not exists public.admin_actions (
  id bigserial primary key,
  user_id uuid references auth.users (id) on delete set null,
  admin_email text not null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists admin_actions_user_idx on public.admin_actions (user_id, created_at desc);
alter table public.admin_actions enable row level security; -- sem políticas: só o servidor acessa

-- Busca de contas por e-mail (com filtro de plano e paginação)
create or replace function public.admin_find_users(p_query text, p_plan text, p_limit integer, p_offset integer)
returns table (
  id uuid, email text, plan text, plan_status text, plan_expires_at timestamptz,
  credits_seconds integer, extra_seconds integer, has_subscription boolean,
  created_at timestamptz, last_sign_in_at timestamptz, total bigint
)
language sql
stable
security definer set search_path = public
as $$
  select p.id, u.email::text, p.plan, p.plan_status, p.plan_expires_at,
         p.credits_seconds, p.extra_seconds, p.mp_preapproval_id is not null,
         p.created_at, u.last_sign_in_at, count(*) over ()
    from public.profiles p
    join auth.users u on u.id = p.id
   where (coalesce(p_query, '') = '' or u.email ilike '%' || p_query || '%')
     and (coalesce(p_plan, '') = '' or p.plan = p_plan)
   order by p.created_at desc
   limit least(greatest(coalesce(p_limit, 25), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- Dá (positivo) ou tira (negativo) horas. Dar vai para as horas avulsas;
-- tirar desconta primeiro das avulsas e depois das horas do plano, sem ficar negativo.
create or replace function public.admin_adjust_hours(p_user uuid, p_seconds integer, p_admin text, p_note text)
returns table (credits_seconds integer, extra_seconds integer)
language plpgsql
security definer set search_path = public
as $$
declare
  p public.profiles%rowtype;
  take_extra integer;
  take_plan integer;
begin
  perform public.refresh_account(p_user);
  select * into p from public.profiles where profiles.id = p_user for update;
  if not found then raise exception 'conta_nao_encontrada'; end if;

  if p_seconds >= 0 then
    update public.profiles set extra_seconds = profiles.extra_seconds + p_seconds where profiles.id = p_user;
  else
    take_extra := least(p.extra_seconds, -p_seconds);
    take_plan := least(p.credits_seconds, -p_seconds - take_extra);
    update public.profiles
       set extra_seconds = profiles.extra_seconds - take_extra,
           credits_seconds = profiles.credits_seconds - take_plan
     where profiles.id = p_user;
  end if;

  insert into public.admin_actions (user_id, admin_email, action, details, note)
  values (p_user, p_admin, case when p_seconds >= 0 then 'horas_adicionadas' else 'horas_removidas' end,
          jsonb_build_object('segundos', p_seconds, 'antes', p.credits_seconds + p.extra_seconds), nullif(p_note, ''));

  return query select pr.credits_seconds, pr.extra_seconds from public.profiles pr where pr.id = p_user;
end;
$$;

-- Define o plano da conta.
-- p_plan = 'free' tira a assinatura agora (mantém as horas avulsas).
-- Para planos pagos: p_days dias a partir de agora e as horas do plano recarregadas.
-- p_mode = 'extend' só soma p_days ao vencimento atual, sem mexer nas horas.
create or replace function public.admin_set_plan(p_user uuid, p_plan text, p_days integer, p_mode text, p_admin text, p_note text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  p public.profiles%rowtype;
begin
  if p_plan not in ('free', 'criador', 'pro', 'studio') then raise exception 'plano_invalido'; end if;
  perform public.refresh_account(p_user);
  select * into p from public.profiles where id = p_user for update;
  if not found then raise exception 'conta_nao_encontrada'; end if;

  if p_mode = 'extend' then
    if p.plan = 'free' then raise exception 'sem_plano_para_estender'; end if;
    update public.profiles
       set plan_expires_at = greatest(coalesce(plan_expires_at, now()), now()) + make_interval(days => greatest(p_days, 1)),
           plan_status = case when plan_status = 'expired' then 'active' else plan_status end
     where id = p_user;
  elsif p_plan = 'free' then
    update public.profiles
       set plan = 'free', plan_period = null, plan_method = null, plan_status = 'active',
           plan_expires_at = null, credits_seconds = 0, cycle_start = now(), mp_preapproval_id = null
     where id = p_user;
  else
    if coalesce(p_days, 0) < 1 or p_days > 3660 then raise exception 'dias_invalidos'; end if;
    update public.profiles
       set plan = p_plan,
           plan_period = case when p_days >= 300 then 'anual' else 'mensal' end,
           plan_method = case when mp_preapproval_id is not null then plan_method else 'avulso' end,
           plan_status = 'active',
           plan_expires_at = now() + make_interval(days => p_days),
           credits_seconds = public.plan_allowance(p_plan),
           cycle_start = now()
     where id = p_user;
  end if;

  insert into public.admin_actions (user_id, admin_email, action, details, note)
  values (p_user, p_admin,
          case when p_mode = 'extend' then 'plano_estendido' when p_plan = 'free' then 'plano_removido' else 'plano_definido' end,
          jsonb_build_object('plano', p_plan, 'dias', p_days, 'plano_antes', p.plan, 'vencimento_antes', p.plan_expires_at),
          nullif(p_note, ''));
end;
$$;

revoke all on function public.admin_find_users(text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.admin_adjust_hours(uuid, integer, text, text) from public, anon, authenticated;
revoke all on function public.admin_set_plan(uuid, text, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_find_users(text, text, integer, integer) to service_role;
grant execute on function public.admin_adjust_hours(uuid, integer, text, text) to service_role;
grant execute on function public.admin_set_plan(uuid, text, integer, text, text, text) to service_role;
