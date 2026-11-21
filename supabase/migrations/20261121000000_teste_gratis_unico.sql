-- A hora grátis vira 1 hora de TESTE, uma única vez:
-- - o plano Grátis não recarrega horas a cada mês
-- - quando um plano pago vence, a conta volta ao Grátis sem ganhar nova hora de teste
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

  -- Plano pago vencido: volta para o Grátis, mantendo só as horas avulsas
  if p.plan <> 'free' and p.plan_expires_at is not null and p.plan_expires_at < now() then
    update public.profiles
       set plan = 'free', plan_period = null, plan_method = null, plan_status = 'expired',
           credits_seconds = 0, cycle_start = now(), mp_preapproval_id = null
     where id = p_user;
    return;
  end if;

  -- Só planos pagos recarregam as horas do mês
  if p.plan <> 'free' and now() >= p.cycle_start + interval '1 month' then
    months := (extract(year from age(now(), p.cycle_start)) * 12 + extract(month from age(now(), p.cycle_start)))::int;
    update public.profiles
       set credits_seconds = plan_allowance(p.plan),
           cycle_start = p.cycle_start + make_interval(months => greatest(months, 1))
     where id = p_user;
  end if;
end;
$$;

revoke all on function public.refresh_account(uuid) from public, anon, authenticated;
