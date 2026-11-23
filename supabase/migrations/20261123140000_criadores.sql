-- Criadores parceiros: o admin transforma uma conta em criador. O "Indique e ganhe" dele vira de criador:
-- código personalizado, mais horas por assinante (sem limite mensal), desconto para o seguidor
-- e metas que dão plano grátis enquanto ele mantiver assinantes ativos.

alter table public.profiles drop constraint if exists profiles_plan_method_check;
alter table public.profiles add constraint profiles_plan_method_check check (plan_method in ('recorrente', 'avulso', 'grupo', 'criador'));

create table if not exists public.creators (
  user_id uuid primary key references auth.users (id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z0-9]{3,16}$'),
  active boolean not null default true,
  referrer_seconds integer not null default 5 * 3600, -- horas para o criador por assinante
  referred_seconds integer not null default 2 * 3600, -- horas para o seguidor no 1º pagamento
  discount_pct integer not null default 15 check (discount_pct between 0 and 50), -- desconto do seguidor no 1º pagamento
  commission_pct integer not null default 20 check (commission_pct between 0 and 50), -- só registro (pagamento em dinheiro: fase 2)
  created_at timestamptz not null default now()
);
alter table public.creators enable row level security; -- sem políticas: só pelas funções

-- Metas: assinantes ativos que o criador trouxe
create or replace function public.creator_tier_for(p_active integer)
returns table (tier text, plan text, next_at integer)
language sql immutable as $$
  select case when p_active >= 25 then 'ouro' when p_active >= 10 then 'prata' when p_active >= 3 then 'bronze' else 'inicio' end,
         case when p_active >= 25 then 'studio' when p_active >= 10 then 'pro' when p_active >= 3 then 'criador' else null end,
         case when p_active >= 25 then null when p_active >= 10 then 25 when p_active >= 3 then 10 else 3 end
$$;

-- Seguidores que pagam e estão com plano ativo agora
create or replace function public.creator_active_subs(p_creator uuid)
returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::integer from public.profiles p
   where p.referred_by = p_creator
     and p.plan <> 'free' and p.plan_expires_at > now()
     and p.plan_method in ('recorrente', 'avulso')
$$;

-- Aplica o plano da meta ao criador (sem mexer em plano que ele mesmo paga)
create or replace function public.creator_sync(p_user uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  c public.creators%rowtype;
  p public.profiles%rowtype;
  t record;
begin
  select * into c from public.creators where user_id = p_user and active;
  if not found then return; end if;
  select * into p from public.profiles where id = p_user for update;
  -- Plano pago por ele (ou por grupo) ativo: a meta não substitui
  if p.plan <> 'free' and p.plan_method in ('recorrente', 'avulso', 'grupo') and p.plan_expires_at > now() then return; end if;
  select * into t from public.creator_tier_for(public.creator_active_subs(p_user));
  if t.plan is null then
    -- Perdeu a meta: o plano de criador acaba em até 3 dias
    if p.plan_method = 'criador' then
      update public.profiles set plan_expires_at = least(plan_expires_at, now() + interval '3 days') where id = p_user;
    end if;
    return;
  end if;
  update public.profiles
     set plan = t.plan,
         plan_period = 'mensal',
         plan_method = 'criador',
         plan_status = 'active',
         plan_expires_at = now() + interval '35 days', -- renova a cada acesso enquanto a meta valer
         credits_seconds = case
           when p.plan = t.plan and p.plan_method = 'criador' then p.credits_seconds
           when p.plan_method = 'criador' then greatest(p.credits_seconds, 0) + greatest(public.plan_allowance(t.plan) - public.plan_allowance(p.plan), 0)
           else public.plan_allowance(t.plan) end,
         cycle_start = case when p.plan_method = 'criador' then p.cycle_start else now() end
   where id = p_user;
end;
$$;

-- refresh_account agora também renova o plano de meta dos criadores
create or replace function public.refresh_account(p_user uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  p public.profiles%rowtype;
  months integer;
begin
  select * into p from public.profiles where id = p_user for update;
  if not found then return; end if;

  if p.plan <> 'free' and p.plan_expires_at is not null and p.plan_expires_at < now() then
    update public.profiles
       set plan = 'free', plan_period = null, plan_method = null, plan_status = 'expired',
           credits_seconds = 0, cycle_start = now(), mp_preapproval_id = null
     where id = p_user;
  elsif p.plan <> 'free' and now() >= p.cycle_start + interval '1 month' then
    months := (extract(year from age(now(), p.cycle_start)) * 12 + extract(month from age(now(), p.cycle_start)))::int;
    update public.profiles
       set credits_seconds = plan_allowance(p.plan),
           cycle_start = p.cycle_start + make_interval(months => greatest(months, 1))
     where id = p_user;
  end if;

  perform public.creator_sync(p_user);
end;
$$;
revoke all on function public.refresh_account(uuid) from public, anon, authenticated;

-- Código de indicação: aceita também o código personalizado de criador
create or replace function public.apply_referral(p_user uuid, p_code text, p_device text)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  p public.profiles%rowtype;
  v_ref uuid;
  v_code text := upper(trim(p_code));
begin
  select * into p from public.profiles where id = p_user for update;
  if not found then return 'conta'; end if;
  if p.referred_by is not null then return 'ja_tem'; end if;
  if exists (select 1 from public.payments where user_id = p_user and status = 'approved') then return 'ja_cliente'; end if;
  select user_id into v_ref from public.creators where code = v_code and active;
  if v_ref is null then select id into v_ref from public.profiles where referral_code = v_code; end if;
  if v_ref is null then return 'codigo_invalido'; end if;
  if v_ref = p_user then return 'proprio'; end if;
  if p_device is not null and exists (select 1 from public.trial_devices where device_hash = p_device and user_id = v_ref) then return 'mesmo_computador'; end if;
  if p_device is not null and exists (select 1 from public.profiles where id = v_ref and referral_device = p_device) then return 'mesmo_computador'; end if;
  update public.profiles set referred_by = v_ref, referred_at = now(), referral_device = p_device where id = p_user;
  return 'ok';
end;
$$;

-- Recompensa: criador usa os valores dele e não tem limite mensal
create or replace function public.grant_referral_reward(p_user uuid, p_payment_id text)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  p public.profiles%rowtype;
  r record;
  c public.creators%rowtype;
  v_month integer;
  v_ref_s integer;
  v_fr_s integer;
  v_cap integer;
begin
  select * into p from public.profiles where id = p_user;
  if not found or p.referred_by is null then return false; end if;
  if exists (select 1 from public.referral_rewards where referred_id = p_user) then return false; end if;
  select * into r from public.referral_reward_seconds();
  select * into c from public.creators where user_id = p.referred_by and active;
  if found then
    v_ref_s := c.referrer_seconds; v_fr_s := c.referred_seconds; v_cap := null;
  else
    v_ref_s := r.referrer; v_fr_s := r.referred; v_cap := r.monthly_cap;
  end if;

  select count(*) into v_month from public.referral_rewards
   where referrer_id = p.referred_by and created_at > now() - interval '30 days';
  if v_cap is not null and v_month >= v_cap then v_ref_s := 0; end if;

  insert into public.referral_rewards (referrer_id, referred_id, payment_id, referrer_seconds, referred_seconds)
  values (p.referred_by, p_user, p_payment_id, v_ref_s, v_fr_s)
  on conflict (referred_id) do nothing;
  if not found then return false; end if;

  update public.profiles set extra_seconds = extra_seconds + v_fr_s where id = p_user;
  if v_ref_s > 0 then
    update public.profiles set extra_seconds = extra_seconds + v_ref_s where id = p.referred_by;
  end if;
  perform public.creator_sync(p.referred_by);
  return true;
end;
$$;

-- Desconto do seguidor no 1º pagamento (usado pelo checkout)
create or replace function public.follower_discount(p_user uuid)
returns integer
language sql stable security definer set search_path = public as $$
  select coalesce((
    select c.discount_pct from public.profiles p join public.creators c on c.user_id = p.referred_by and c.active
     where p.id = p_user
       and not exists (select 1 from public.payments where user_id = p_user and status = 'approved')
  ), 0)
$$;

-- Tela do criador (o próprio criador)
create or replace function public.my_creator()
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  c public.creators%rowtype;
  n integer;
  t record;
begin
  if uid is null then raise exception 'nao_autenticado'; end if;
  select * into c from public.creators where user_id = uid and active;
  if not found then return jsonb_build_object('creator', false); end if;
  perform public.refresh_account(uid);
  n := public.creator_active_subs(uid);
  select * into t from public.creator_tier_for(n);
  return jsonb_build_object(
    'creator', true,
    'code', c.code,
    'discountPct', c.discount_pct,
    'referrerSeconds', c.referrer_seconds,
    'referredSeconds', c.referred_seconds,
    'activeSubs', n,
    'tier', t.tier,
    'tierPlan', t.plan,
    'nextAt', t.next_at,
    'invited', (select count(*) from public.profiles where referred_by = uid),
    'converted', (select count(*) from public.referral_rewards where referrer_id = uid),
    'earnedSeconds', (select coalesce(sum(referrer_seconds), 0) from public.referral_rewards where referrer_id = uid),
    'revenue', (select coalesce(sum(pay.amount), 0) from public.payments pay join public.profiles pr on pr.id = pay.user_id
                 where pr.referred_by = uid and pay.status = 'approved')
  );
end;
$$;

-- Lista para o painel admin
create or replace function public.admin_creators()
returns table (user_id uuid, email text, code text, active boolean, referrer_seconds integer, referred_seconds integer,
               discount_pct integer, commission_pct integer, invited bigint, converted bigint, active_subs integer, revenue numeric, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.user_id, u.email::text, c.code, c.active, c.referrer_seconds, c.referred_seconds, c.discount_pct, c.commission_pct,
         (select count(*) from public.profiles where referred_by = c.user_id),
         (select count(*) from public.referral_rewards where referrer_id = c.user_id),
         public.creator_active_subs(c.user_id),
         (select coalesce(sum(pay.amount), 0) from public.payments pay join public.profiles pr on pr.id = pay.user_id
           where pr.referred_by = c.user_id and pay.status = 'approved'),
         c.created_at
    from public.creators c join auth.users u on u.id = c.user_id
   order by c.active desc, public.creator_active_subs(c.user_id) desc, c.created_at desc
$$;

revoke all on function public.creator_sync(uuid) from public, anon, authenticated;
revoke all on function public.creator_active_subs(uuid) from public, anon, authenticated;
revoke all on function public.apply_referral(uuid, text, text) from public, anon, authenticated;
revoke all on function public.grant_referral_reward(uuid, text) from public, anon, authenticated;
revoke all on function public.follower_discount(uuid) from public, anon, authenticated;
revoke all on function public.admin_creators() from public, anon, authenticated;
revoke all on function public.my_creator() from public, anon;
grant execute on function public.my_creator() to authenticated;
grant execute on function public.follower_discount(uuid) to service_role;
grant execute on function public.admin_creators() to service_role;

-- "Indique e ganhe": informa o desconto do seguidor e se a conta é de criador
create or replace function public.my_referral()
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_code text;
  p public.profiles%rowtype;
  r record;
begin
  if uid is null then raise exception 'nao_autenticado'; end if;
  v_code := public.ensure_referral_code(uid);
  select * into p from public.profiles where id = uid;
  select * into r from public.referral_reward_seconds();
  return jsonb_build_object(
    'code', v_code,
    'invited', (select count(*) from public.profiles where referred_by = uid),
    'converted', (select count(*) from public.referral_rewards where referrer_id = uid),
    'earnedSeconds', (select coalesce(sum(referrer_seconds), 0) from public.referral_rewards where referrer_id = uid),
    'referrerSeconds', r.referrer,
    'referredSeconds', r.referred,
    'referredBy', coalesce((select code from public.creators where user_id = p.referred_by), (select referral_code from public.profiles where id = p.referred_by)),
    'canApply', p.referred_by is null and not exists (select 1 from public.payments where user_id = uid and status = 'approved'),
    'friendRewarded', exists (select 1 from public.referral_rewards where referred_id = uid),
    'followerDiscount', public.follower_discount(uid),
    'isCreator', exists (select 1 from public.creators where user_id = uid and active)
  );
end;
$$;
revoke all on function public.my_referral() from public, anon;
grant execute on function public.my_referral() to authenticated;
