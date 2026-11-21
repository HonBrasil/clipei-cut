-- Hora de teste por COMPUTADOR (não por e-mail).
-- Conta nova começa com 0 h; o app pede o teste ao entrar e o servidor só libera
-- se aquele computador nunca recebeu um teste.

alter table public.profiles add column if not exists trial_claimed boolean not null default false;
alter table public.profiles alter column credits_seconds set default 0;

-- Contas que já existiam já receberam a hora grátis
update public.profiles set trial_claimed = true where trial_claimed = false;

create table if not exists public.trial_devices (
  device_hash text primary key,
  user_id uuid references auth.users (id) on delete set null,
  ip_hash text,
  claimed_at timestamptz not null default now()
);
create index if not exists trial_devices_ip_idx on public.trial_devices (ip_hash, claimed_at desc);
alter table public.trial_devices enable row level security; -- sem políticas: só o servidor acessa

create or replace function public.claim_trial(p_user uuid, p_device text, p_ip text)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  p public.profiles%rowtype;
begin
  select * into p from public.profiles where id = p_user for update;
  if not found then return 'sem_conta'; end if;

  if p.trial_claimed then
    -- Registra o computador desta conta, para outra conta nele não ganhar teste
    insert into public.trial_devices (device_hash, user_id, ip_hash) values (p_device, p_user, p_ip)
    on conflict (device_hash) do nothing;
    return 'ja_usado';
  end if;

  if exists (select 1 from public.trial_devices where device_hash = p_device) then
    return 'dispositivo_usado';
  end if;

  if p_ip is not null and (select count(*) from public.trial_devices where ip_hash = p_ip and claimed_at > now() - interval '1 day') >= 3 then
    return 'limite_rede';
  end if;

  insert into public.trial_devices (device_hash, user_id, ip_hash) values (p_device, p_user, p_ip);
  update public.profiles set credits_seconds = credits_seconds + 3600, trial_claimed = true where id = p_user;
  return 'liberado';
end;
$$;
revoke all on function public.claim_trial(uuid, text, text) from public, anon, authenticated;

-- my_account passa a dizer se a conta já recebeu o teste
drop function if exists public.my_account();
create function public.my_account()
returns table (
  plan text, plan_period text, plan_method text, plan_status text, plan_expires_at timestamptz,
  credits_seconds integer, extra_seconds integer, allowance_seconds integer, cycle_start timestamptz,
  has_subscription boolean, trial_claimed boolean
)
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.refresh_account(auth.uid());
  return query
    select p.plan, p.plan_period, p.plan_method, p.plan_status, p.plan_expires_at,
           p.credits_seconds, p.extra_seconds, public.plan_allowance(p.plan), p.cycle_start,
           p.mp_preapproval_id is not null, p.trial_claimed
      from public.profiles p
     where p.id = auth.uid();
end;
$$;
revoke all on function public.my_account() from public, anon;
grant execute on function public.my_account() to authenticated;
