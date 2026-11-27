-- Produto de teste do admin (R$ 1,00): testa o pagamento de ponta a ponta e dá 6 minutos de horas avulsas.
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

  -- Teste de pagamento do admin: 6 minutos de horas avulsas
  if p_product = 'teste_1' then
    update public.profiles set extra_seconds = extra_seconds + 360 where id = p_user;
    return true;
  end if;

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
    perform public.group_end(p_user);
    return true;
  end if;

  insert into public.groups (owner_id, plan, size, period, invite_code, status)
  values (p_user, v_plan, v_size, v_period, public.new_group_code(), 'active')
  on conflict (owner_id) do update set plan = excluded.plan, size = excluded.size, period = excluded.period, status = 'active'
  returning * into g;
  insert into public.group_members (group_id, user_id) values (g.id, p_user) on conflict (user_id) do nothing;

  for extra in
    select user_id from public.group_members
     where group_id = g.id and user_id <> p_user
     order by joined_at asc
     offset greatest(v_size - 1, 0)
  loop
    delete from public.group_members where group_id = g.id and user_id = extra.user_id;
    perform public.group_revoke(extra.user_id);
  end loop;

  for extra in select user_id from public.group_members where group_id = g.id and user_id <> p_user loop
    perform public.group_grant(g.id, extra.user_id);
  end loop;
  return true;
end;
$$;
revoke all on function public.apply_purchase(uuid, text, text, numeric, text, text) from public, anon, authenticated;
