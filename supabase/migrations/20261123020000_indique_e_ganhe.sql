-- Indique e ganhe: cada conta tem um código; quando o amigo indicado faz o primeiro
-- pagamento aprovado, quem indicou ganha 2 h e o amigo ganha 1 h (horas avulsas).

alter table public.profiles add column if not exists referral_code text unique;
alter table public.profiles add column if not exists referred_by uuid references auth.users (id) on delete set null;
alter table public.profiles add column if not exists referred_at timestamptz;
alter table public.profiles add column if not exists referral_device text;

create table if not exists public.referral_rewards (
  id bigserial primary key,
  referrer_id uuid references auth.users (id) on delete set null,
  referred_id uuid unique references auth.users (id) on delete set null, -- uma recompensa por amigo, para sempre
  payment_id text,
  referrer_seconds integer not null,
  referred_seconds integer not null,
  created_at timestamptz not null default now()
);
create index if not exists referral_rewards_referrer_idx on public.referral_rewards (referrer_id, created_at desc);
alter table public.referral_rewards enable row level security; -- sem políticas: só o servidor acessa

-- Valores da recompensa e limite mensal (anti-abuso)
create or replace function public.referral_reward_seconds() returns table (referrer integer, referred integer, monthly_cap integer)
language sql immutable as $$ select 2 * 3600, 3600, 20 $$;

-- Gera (uma vez) o código da conta: parte do e-mail + 4 caracteres aleatórios, ex.: JOAO-7K2Q
create or replace function public.ensure_referral_code(p_user uuid)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_code text;
  v_base text;
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i integer;
begin
  select referral_code into v_code from public.profiles where id = p_user;
  if v_code is not null then return v_code; end if;
  select upper(regexp_replace(split_part(email, '@', 1), '[^a-zA-Z0-9]', '', 'g')) into v_base from auth.users where id = p_user;
  v_base := left(coalesce(nullif(v_base, ''), 'CLIPEI'), 8);
  for attempt in 1..20 loop
    v_code := v_base || '-';
    for i in 1..4 loop
      v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1);
    end loop;
    begin
      update public.profiles set referral_code = v_code where id = p_user and referral_code is null;
      return (select referral_code from public.profiles where id = p_user);
    exception when unique_violation then
      -- código já existe: tenta outro
    end;
  end loop;
  raise exception 'codigo_indisponivel';
end;
$$;

-- Dados da tela "Indique e ganhe" (para o próprio usuário)
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
    'referredBy', (select referral_code from public.profiles where id = p.referred_by),
    -- só quem ainda não pagou nada pode usar um código
    'canApply', p.referred_by is null and not exists (select 1 from public.payments where user_id = uid and status = 'approved'),
    'friendRewarded', exists (select 1 from public.referral_rewards where referred_id = uid)
  );
end;
$$;

-- Liga a conta a quem indicou (chamado pela Edge Function apply-referral, com o computador)
create or replace function public.apply_referral(p_user uuid, p_code text, p_device text)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  p public.profiles%rowtype;
  v_ref uuid;
begin
  select * into p from public.profiles where id = p_user for update;
  if not found then return 'conta'; end if;
  if p.referred_by is not null then return 'ja_tem'; end if;
  if exists (select 1 from public.payments where user_id = p_user and status = 'approved') then return 'ja_cliente'; end if;
  select id into v_ref from public.profiles where referral_code = upper(trim(p_code));
  if v_ref is null then return 'codigo_invalido'; end if;
  if v_ref = p_user then return 'proprio'; end if;
  -- Mesmo computador de quem indicou = autoindicação
  if p_device is not null and exists (
    select 1 from public.trial_devices where device_hash = p_device and user_id = v_ref
  ) then return 'mesmo_computador'; end if;
  if p_device is not null and exists (
    select 1 from public.profiles where id = v_ref and referral_device = p_device
  ) then return 'mesmo_computador'; end if;

  update public.profiles set referred_by = v_ref, referred_at = now(), referral_device = p_device where id = p_user;
  return 'ok';
end;
$$;

-- Recompensa: chamada a cada pagamento aprovado. Só paga na primeira vez de cada amigo.
create or replace function public.grant_referral_reward(p_user uuid, p_payment_id text)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  p public.profiles%rowtype;
  r record;
  v_month integer;
begin
  select * into p from public.profiles where id = p_user;
  if not found or p.referred_by is null then return false; end if;
  if exists (select 1 from public.referral_rewards where referred_id = p_user) then return false; end if;
  select * into r from public.referral_reward_seconds();

  -- Limite mensal de quem indicou: o amigo ganha mesmo assim
  select count(*) into v_month from public.referral_rewards
   where referrer_id = p.referred_by and created_at > now() - interval '30 days';

  insert into public.referral_rewards (referrer_id, referred_id, payment_id, referrer_seconds, referred_seconds)
  values (p.referred_by, p_user, p_payment_id, case when v_month < r.monthly_cap then r.referrer else 0 end, r.referred)
  on conflict (referred_id) do nothing;
  if not found then return false; end if;

  update public.profiles set extra_seconds = extra_seconds + r.referred where id = p_user;
  if v_month < r.monthly_cap then
    update public.profiles set extra_seconds = extra_seconds + r.referrer where id = p.referred_by;
  end if;
  return true;
end;
$$;

revoke all on function public.ensure_referral_code(uuid) from public, anon, authenticated;
revoke all on function public.apply_referral(uuid, text, text) from public, anon, authenticated;
revoke all on function public.grant_referral_reward(uuid, text) from public, anon, authenticated;
revoke all on function public.my_referral() from public, anon;
grant execute on function public.my_referral() to authenticated;
grant execute on function public.ensure_referral_code(uuid) to service_role;
grant execute on function public.apply_referral(uuid, text, text) to service_role;
grant execute on function public.grant_referral_reward(uuid, text) to service_role;
