-- Clipei Cut — planos, horas avulsas e pagamentos (Mercado Pago)
-- credits_seconds = horas do plano no ciclo atual (renovam todo mês)
-- extra_seconds   = horas avulsas compradas (não vencem)

alter table public.profiles
  add column if not exists plan text not null default 'free' check (plan in ('free', 'criador', 'pro', 'studio')),
  add column if not exists plan_period text check (plan_period in ('mensal', 'anual')),
  add column if not exists plan_method text check (plan_method in ('recorrente', 'avulso')),
  add column if not exists plan_status text not null default 'active' check (plan_status in ('active', 'cancelled', 'expired')),
  add column if not exists plan_expires_at timestamptz,
  add column if not exists cycle_start timestamptz not null default now(),
  add column if not exists extra_seconds integer not null default 0 check (extra_seconds >= 0),
  add column if not exists mp_preapproval_id text;

create table if not exists public.payments (
  id text primary key, -- id do pagamento no Mercado Pago (garante que cada pagamento é aplicado uma vez)
  user_id uuid not null references auth.users (id) on delete cascade,
  product text not null,
  amount numeric(10, 2),
  status text not null,
  method text,
  created_at timestamptz not null default now()
);
create index if not exists payments_user_idx on public.payments (user_id, created_at desc);
alter table public.payments enable row level security;
create policy "pagamentos proprios" on public.payments for select using ((select auth.uid()) = user_id);

-- Horas por mês de cada plano (em segundos)
create or replace function public.plan_allowance(p_plan text)
returns integer
language sql
immutable
set search_path = public
as $$
  select case p_plan
    when 'criador' then 15 * 3600
    when 'pro' then 50 * 3600
    when 'studio' then 150 * 3600
    else 3600
  end;
$$;

-- Vence planos expirados e renova as horas do mês quando o ciclo vira.
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

  -- Plano pago vencido (renovação não chegou ou foi cancelado): volta para o Grátis
  if p.plan <> 'free' and p.plan_expires_at is not null and p.plan_expires_at < now() then
    update public.profiles
       set plan = 'free', plan_period = null, plan_method = null, plan_status = 'expired',
           credits_seconds = plan_allowance('free'), cycle_start = now(), mp_preapproval_id = null
     where id = p_user;
    return;
  end if;

  -- Virou o mês do ciclo: recarrega as horas do plano (não acumula)
  if now() >= p.cycle_start + interval '1 month' then
    months := (extract(year from age(now(), p.cycle_start)) * 12 + extract(month from age(now(), p.cycle_start)))::int;
    update public.profiles
       set credits_seconds = plan_allowance(p.plan),
           cycle_start = p.cycle_start + make_interval(months => greatest(months, 1))
     where id = p_user;
  end if;
end;
$$;

-- Desconta primeiro as horas do plano, depois as avulsas.
create or replace function public.consume_credits(p_user uuid, p_seconds integer, p_kind text, p_provider text)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  p public.profiles%rowtype;
  from_plan integer;
begin
  perform public.refresh_account(p_user);
  select * into p from public.profiles where id = p_user for update;
  if not found or p.credits_seconds + p.extra_seconds < p_seconds then
    raise exception 'sem_creditos';
  end if;

  from_plan := least(p.credits_seconds, p_seconds);
  update public.profiles
     set credits_seconds = credits_seconds - from_plan,
         extra_seconds = extra_seconds - (p_seconds - from_plan)
   where id = p_user;

  insert into public.usage_events (user_id, kind, audio_seconds, provider)
  values (p_user, p_kind, p_seconds, p_provider);

  return p.credits_seconds + p.extra_seconds - p_seconds;
end;
$$;

-- Aplica uma compra aprovada (chamada só pelo servidor).
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
  v_hours integer;
  p public.profiles%rowtype;
  base timestamptz;
begin
  -- Idempotência: o mesmo pagamento nunca é aplicado duas vezes
  insert into public.payments (id, user_id, product, amount, status, method)
  values (p_payment_id, p_user, p_product, p_amount, 'approved', p_method)
  on conflict (id) do nothing;
  if not found then return false; end if;

  if p_product like 'horas_%' then
    v_hours := split_part(p_product, '_', 2)::int;
    update public.profiles set extra_seconds = extra_seconds + v_hours * 3600 where id = p_user;
    return true;
  end if;

  v_plan := split_part(p_product, '_', 1);
  v_period := split_part(p_product, '_', 2);
  if v_plan not in ('criador', 'pro', 'studio') or v_period not in ('mensal', 'anual') then
    raise exception 'produto_invalido %', p_product;
  end if;

  select * into p from public.profiles where id = p_user for update;
  -- Renovação do mesmo plano soma ao vencimento atual; troca de plano começa agora
  base := case when p.plan = v_plan and p.plan_expires_at > now() then p.plan_expires_at else now() end;

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
  return true;
end;
$$;

-- Dados da conta para o app (já com o mês renovado, se for o caso)
create or replace function public.my_account()
returns table (
  plan text, plan_period text, plan_method text, plan_status text, plan_expires_at timestamptz,
  credits_seconds integer, extra_seconds integer, allowance_seconds integer, cycle_start timestamptz, has_subscription boolean
)
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.refresh_account(auth.uid());
  return query
    select p.plan, p.plan_period, p.plan_method, p.plan_status, p.plan_expires_at,
           p.credits_seconds, p.extra_seconds, public.plan_allowance(p.plan), p.cycle_start,
           p.mp_preapproval_id is not null
      from public.profiles p
     where p.id = auth.uid();
end;
$$;

revoke all on function public.refresh_account(uuid) from public, anon, authenticated;
revoke all on function public.consume_credits(uuid, integer, text, text) from public, anon, authenticated;
revoke all on function public.apply_purchase(uuid, text, text, numeric, text, text) from public, anon, authenticated;
revoke all on function public.my_account() from public, anon;
grant execute on function public.my_account() to authenticated;
