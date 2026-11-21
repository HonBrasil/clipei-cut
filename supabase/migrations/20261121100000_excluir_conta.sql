-- Exclusão de conta (LGPD): os dados pessoais são apagados, mas os registros
-- de pagamento ficam (sem vínculo com a pessoa) por obrigação fiscal/contábil.
alter table public.payments alter column user_id drop not null;
alter table public.payments drop constraint if exists payments_user_id_fkey;
alter table public.payments
  add constraint payments_user_id_fkey foreign key (user_id) references auth.users (id) on delete set null;

-- Registro do aceite dos termos (versão e data)
alter table public.profiles add column if not exists terms_version text;
alter table public.profiles add column if not exists terms_accepted_at timestamptz;

-- my_account passa a informar a versão dos termos aceita
drop function if exists public.my_account();
create function public.my_account()
returns table (
  plan text, plan_period text, plan_method text, plan_status text, plan_expires_at timestamptz,
  credits_seconds integer, extra_seconds integer, allowance_seconds integer, cycle_start timestamptz,
  has_subscription boolean, trial_claimed boolean, terms_version text
)
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.refresh_account(auth.uid());
  return query
    select p.plan, p.plan_period, p.plan_method, p.plan_status, p.plan_expires_at,
           p.credits_seconds, p.extra_seconds, public.plan_allowance(p.plan), p.cycle_start,
           p.mp_preapproval_id is not null, p.trial_claimed, p.terms_version
      from public.profiles p
     where p.id = auth.uid();
end;
$$;
revoke all on function public.my_account() from public, anon;
grant execute on function public.my_account() to authenticated;
