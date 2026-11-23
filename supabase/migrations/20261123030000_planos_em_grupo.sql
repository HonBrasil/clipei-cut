-- Planos em grupo: Duo (2), Trio (3) e Squad (4) pessoas, nos planos Criador e Pro.
-- O dono paga tudo; cada pessoa tem a própria conta e as próprias horas do plano.

-- Novo jeito de ter plano: por grupo
alter table public.profiles drop constraint if exists profiles_plan_method_check;
alter table public.profiles add constraint profiles_plan_method_check check (plan_method in ('recorrente', 'avulso', 'grupo'));

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users (id) on delete cascade,
  plan text not null check (plan in ('criador', 'pro')),
  size integer not null check (size between 2 and 4),
  period text not null check (period in ('mensal', 'anual')),
  invite_code text not null unique,
  created_at timestamptz not null default now()
);
alter table public.groups enable row level security; -- sem políticas: só pelas funções abaixo

create table if not exists public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null unique references auth.users (id) on delete cascade, -- uma pessoa, um grupo
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
alter table public.group_members enable row level security;

-- Trocas de membro feitas pelo dono (limite contra revenda de vagas)
create table if not exists public.group_removals (
  id bigserial primary key,
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid,
  created_at timestamptz not null default now()
);
alter table public.group_removals enable row level security;

create or replace function public.group_size_of(p_name text) returns integer
language sql immutable as $$ select case p_name when 'duo' then 2 when 'trio' then 3 when 'squad' then 4 end $$;

create or replace function public.new_group_code() returns text
language plpgsql as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  c text := 'GRUPO-';
begin
  for i in 1..6 loop
    c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1);
  end loop;
  return c;
end;
$$;

-- Coloca o membro no plano do grupo (mesmo vencimento do dono)
create or replace function public.group_grant(p_group uuid, p_user uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  g public.groups%rowtype;
  o public.profiles%rowtype;
begin
  select * into g from public.groups where id = p_group;
  select * into o from public.profiles where id = g.owner_id;
  update public.profiles
     set plan = g.plan,
         plan_period = g.period,
         plan_method = 'grupo',
         plan_status = 'active',
         plan_expires_at = o.plan_expires_at,
         credits_seconds = case when plan = g.plan and plan_method = 'grupo' then credits_seconds else public.plan_allowance(g.plan) end,
         cycle_start = case when plan = g.plan and plan_method = 'grupo' then cycle_start else now() end
   where id = p_user;
end;
$$;

-- Tira o membro do plano do grupo (volta para o Grátis; horas avulsas ficam)
create or replace function public.group_revoke(p_user uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.profiles
     set plan = 'free', plan_period = null, plan_method = null, plan_status = 'active',
         plan_expires_at = null, credits_seconds = 0, cycle_start = now()
   where id = p_user and plan_method = 'grupo';
end;
$$;

-- Repassa o vencimento do dono para todos os membros (renovação, troca de plano)
create or replace function public.group_sync(p_group uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  m record;
begin
  for m in select user_id from public.group_members where group_id = p_group loop
    perform public.group_grant(p_group, m.user_id);
  end loop;
end;
$$;

-- Encerra o grupo (dono trocou para plano individual): membros voltam para o Grátis
create or replace function public.group_end(p_owner uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  g public.groups%rowtype;
  m record;
begin
  select * into g from public.groups where owner_id = p_owner;
  if not found then return; end if;
  for m in select user_id from public.group_members where group_id = g.id loop
    perform public.group_revoke(m.user_id);
  end loop;
  delete from public.groups where id = g.id;
end;
$$;

-- Compra aprovada: agora entende também os planos em grupo (ex.: pro_trio_mensal)
create or replace function public.apply_purchase(
  p_user uuid, p_payment_id text, p_product text, p_amount numeric, p_method text, p_preapproval text default null
)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_plan text;
  v_period text;
  v_size integer := null;
  v_hours integer;
  p public.profiles%rowtype;
  g public.groups%rowtype;
  base timestamptz;
  extra record;
begin
  insert into public.payments (id, user_id, product, amount, status, method)
  values (p_payment_id, p_user, p_product, p_amount, 'approved', p_method)
  on conflict (id) do nothing;
  if not found then return false; end if;

  if p_product like 'horas_%' then
    v_hours := split_part(p_product, '_', 2)::int;
    update public.profiles set extra_seconds = extra_seconds + v_hours * 3600 where id = p_user;
    return true;
  end if;

  if p_product ~ '^(criador|pro)_(duo|trio|squad)_(mensal|anual)$' then
    v_plan := split_part(p_product, '_', 1);
    v_size := public.group_size_of(split_part(p_product, '_', 2));
    v_period := split_part(p_product, '_', 3);
  else
    v_plan := split_part(p_product, '_', 1);
    v_period := split_part(p_product, '_', 2);
    if v_plan not in ('criador', 'pro', 'studio') or v_period not in ('mensal', 'anual') then
      raise exception 'produto_invalido %', p_product;
    end if;
  end if;

  -- Quem é membro do grupo de outra pessoa e compra o próprio plano sai do grupo
  delete from public.group_members gm using public.groups gg
   where gm.user_id = p_user and gm.group_id = gg.id and gg.owner_id <> p_user;

  select * into p from public.profiles where id = p_user for update;
  base := case when p.plan = v_plan and p.plan_method <> 'grupo' and p.plan_expires_at > now() then p.plan_expires_at else now() end;

  update public.profiles
     set plan = v_plan,
         plan_period = v_period,
         plan_method = case when p_preapproval is not null then 'recorrente' else 'avulso' end,
         plan_status = 'active',
         plan_expires_at = base + case when v_period = 'anual' then interval '12 months' else interval '1 month' end
                                + case when p_preapproval is not null then interval '3 days' else interval '0' end,
         credits_seconds = plan_allowance(v_plan),
         cycle_start = now(),
         mp_preapproval_id = coalesce(p_preapproval, mp_preapproval_id)
   where id = p_user;

  if v_size is null then
    -- Comprou plano individual: se tinha grupo, ele acaba
    perform public.group_end(p_user);
    return true;
  end if;

  -- Cria ou atualiza o grupo do dono
  insert into public.groups (owner_id, plan, size, period, invite_code)
  values (p_user, v_plan, v_size, v_period, public.new_group_code())
  on conflict (owner_id) do update set plan = excluded.plan, size = excluded.size, period = excluded.period
  returning * into g;
  insert into public.group_members (group_id, user_id) values (g.id, p_user) on conflict (user_id) do nothing;

  -- Grupo diminuiu: os que entraram por último perdem a vaga
  for extra in
    select user_id from public.group_members
     where group_id = g.id and user_id <> p_user
     order by joined_at asc
     offset greatest(v_size - 1, 0)
  loop
    delete from public.group_members where group_id = g.id and user_id = extra.user_id;
    perform public.group_revoke(extra.user_id);
  end loop;

  -- Membros acompanham o plano e o vencimento do dono
  for extra in select user_id from public.group_members where group_id = g.id and user_id <> p_user loop
    perform public.group_grant(g.id, extra.user_id);
  end loop;
  return true;
end;
$$;

-- ---------- Funções chamadas pelo app (com o usuário logado) ----------

-- Meu grupo: sou dono, membro ou nenhum
create or replace function public.my_group()
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  g public.groups%rowtype;
  o public.profiles%rowtype;
  swaps integer;
begin
  if uid is null then raise exception 'nao_autenticado'; end if;
  select gg.* into g from public.groups gg join public.group_members gm on gm.group_id = gg.id where gm.user_id = uid;
  if not found then return jsonb_build_object('role', 'none'); end if;
  select * into o from public.profiles where id = g.owner_id;
  select count(*) into swaps from public.group_removals where group_id = g.id and created_at > now() - interval '30 days';
  return jsonb_build_object(
    'role', case when g.owner_id = uid then 'owner' else 'member' end,
    'plan', g.plan,
    'size', g.size,
    'period', g.period,
    'inviteCode', case when g.owner_id = uid then g.invite_code else null end,
    'expiresAt', o.plan_expires_at,
    'renews', o.plan_status = 'active' and o.mp_preapproval_id is not null,
    'swapsLeft', greatest(0, 2 - swaps),
    'ownerEmail', (select email from auth.users where id = g.owner_id),
    'members', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', gm.user_id,
               'email', u.email,
               'owner', gm.user_id = g.owner_id,
               'joinedAt', gm.joined_at
             ) order by gm.user_id = g.owner_id desc, gm.joined_at), '[]'::jsonb)
        from public.group_members gm join auth.users u on u.id = gm.user_id
       where gm.group_id = g.id
    )
  );
end;
$$;

-- Entrar num grupo com o código. p_force = true confirma que a pessoa já tem plano próprio.
create or replace function public.join_group(p_code text, p_force boolean default false)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  g public.groups%rowtype;
  o public.profiles%rowtype;
  me public.profiles%rowtype;
  n integer;
begin
  if uid is null then return 'nao_autenticado'; end if;
  select * into g from public.groups where invite_code = upper(trim(p_code)) for update;
  if not found then return 'codigo_invalido'; end if;
  if g.owner_id = uid then return 'ja_dono'; end if;
  if exists (select 1 from public.group_members where user_id = uid) then return 'ja_em_grupo'; end if;
  select * into o from public.profiles where id = g.owner_id;
  if o.plan not in ('criador', 'pro') or o.plan_expires_at is null or o.plan_expires_at < now() then return 'grupo_inativo'; end if;
  select count(*) into n from public.group_members where group_id = g.id;
  if n >= g.size then return 'grupo_cheio'; end if;
  perform public.refresh_account(uid);
  select * into me from public.profiles where id = uid;
  if me.plan <> 'free' and me.plan_method <> 'grupo' and me.plan_expires_at > now() and not p_force then
    return 'tem_plano';
  end if;
  insert into public.group_members (group_id, user_id) values (g.id, uid);
  perform public.group_grant(g.id, uid);
  return 'ok';
end;
$$;

-- Sair do grupo (membro)
create or replace function public.leave_group()
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  g public.groups%rowtype;
begin
  select gg.* into g from public.groups gg join public.group_members gm on gm.group_id = gg.id where gm.user_id = uid;
  if not found then return 'sem_grupo'; end if;
  if g.owner_id = uid then return 'dono'; end if;
  delete from public.group_members where user_id = uid;
  perform public.group_revoke(uid);
  return 'ok';
end;
$$;

-- Remover um membro (dono). Até 2 remoções a cada 30 dias.
create or replace function public.remove_group_member(p_member uuid)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  g public.groups%rowtype;
begin
  select * into g from public.groups where owner_id = uid;
  if not found then return 'sem_grupo'; end if;
  if p_member = uid then return 'dono'; end if;
  if not exists (select 1 from public.group_members where group_id = g.id and user_id = p_member) then return 'nao_membro'; end if;
  if (select count(*) from public.group_removals where group_id = g.id and created_at > now() - interval '30 days') >= 2 then
    return 'limite_trocas';
  end if;
  delete from public.group_members where group_id = g.id and user_id = p_member;
  insert into public.group_removals (group_id, user_id) values (g.id, p_member);
  perform public.group_revoke(p_member);
  return 'ok';
end;
$$;

-- Novo código de convite (dono), invalida o anterior
create or replace function public.new_group_invite()
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  c text;
begin
  for attempt in 1..10 loop
    c := public.new_group_code();
    begin
      update public.groups set invite_code = c where owner_id = uid;
      if not found then return null; end if;
      return c;
    exception when unique_violation then
    end;
  end loop;
  return null;
end;
$$;

revoke all on function public.group_grant(uuid, uuid) from public, anon, authenticated;
revoke all on function public.group_revoke(uuid) from public, anon, authenticated;
revoke all on function public.group_sync(uuid) from public, anon, authenticated;
revoke all on function public.group_end(uuid) from public, anon, authenticated;
revoke all on function public.apply_purchase(uuid, text, text, numeric, text, text) from public, anon, authenticated;
revoke all on function public.my_group() from public, anon;
revoke all on function public.join_group(text, boolean) from public, anon;
revoke all on function public.leave_group() from public, anon;
revoke all on function public.remove_group_member(uuid) from public, anon;
revoke all on function public.new_group_invite() from public, anon;
grant execute on function public.my_group() to authenticated;
grant execute on function public.join_group(text, boolean) to authenticated;
grant execute on function public.leave_group() to authenticated;
grant execute on function public.remove_group_member(uuid) to authenticated;
grant execute on function public.new_group_invite() to authenticated;
