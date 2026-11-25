-- Criar o grupo antes de pagar: o dono escolhe plano e tamanho, recebe o código de convite e os
-- amigos já podem entrar (ficam aguardando). Quando o dono paga, todos recebem o plano na hora.

alter table public.groups add column if not exists status text not null default 'active' check (status in ('pending', 'active'));

-- Criar (ou mudar plano/tamanho de) um grupo que ainda não foi pago
create or replace function public.create_group(p_plan text, p_size integer)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  g public.groups%rowtype;
  n integer;
begin
  if uid is null then return 'nao_autenticado'; end if;
  if p_plan not in ('criador', 'pro') or p_size not between 2 and 4 then return 'invalido'; end if;
  if exists (select 1 from public.group_members gm join public.groups gg on gg.id = gm.group_id
              where gm.user_id = uid and gg.owner_id <> uid) then return 'ja_em_grupo'; end if;

  select * into g from public.groups where owner_id = uid for update;
  if found then
    if g.status = 'active' then return 'ja_tem'; end if;
    select count(*) into n from public.group_members where group_id = g.id;
    if n > p_size then return 'membros_demais'; end if;
    update public.groups set plan = p_plan, size = p_size where id = g.id;
    return 'ok';
  end if;

  insert into public.groups (owner_id, plan, size, period, invite_code, status)
  values (uid, p_plan, p_size, 'mensal', public.new_group_code(), 'pending')
  returning * into g;
  insert into public.group_members (group_id, user_id) values (g.id, uid);
  return 'ok';
end;
$$;

-- Excluir um grupo que ainda não foi pago
create or replace function public.delete_pending_group()
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  delete from public.groups where owner_id = uid and status = 'pending';
  if not found then return 'sem_grupo'; end if;
  return 'ok';
end;
$$;

-- Entrar: em grupo aguardando pagamento, a pessoa entra mas só recebe o plano quando o dono pagar
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
  select count(*) into n from public.group_members where group_id = g.id;
  if n >= g.size then return 'grupo_cheio'; end if;

  if g.status = 'pending' then
    insert into public.group_members (group_id, user_id) values (g.id, uid);
    return 'ok_aguardando';
  end if;

  select * into o from public.profiles where id = g.owner_id;
  if o.plan not in ('criador', 'pro') or o.plan_expires_at is null or o.plan_expires_at < now() then return 'grupo_inativo'; end if;
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

-- Meu grupo: agora informa se está aguardando pagamento
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
    'status', g.status,
    'plan', g.plan,
    'size', g.size,
    'period', g.period,
    'inviteCode', case when g.owner_id = uid then g.invite_code else null end,
    'expiresAt', case when g.status = 'active' then o.plan_expires_at else null end,
    'renews', g.status = 'active' and o.plan_status = 'active' and o.mp_preapproval_id is not null,
    'swapsLeft', case when g.status = 'pending' then 99 else greatest(0, 2 - swaps) end,
    'ownerEmail', (select email from auth.users where id = g.owner_id),
    'members', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', gm.user_id, 'email', u.email, 'owner', gm.user_id = g.owner_id, 'joinedAt', gm.joined_at
             ) order by gm.user_id = g.owner_id desc, gm.joined_at), '[]'::jsonb)
        from public.group_members gm join auth.users u on u.id = gm.user_id
       where gm.group_id = g.id
    )
  );
end;
$$;

-- Remover membro: em grupo aguardando pagamento não conta como troca
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
  if g.status = 'active' and (select count(*) from public.group_removals where group_id = g.id and created_at > now() - interval '30 days') >= 2 then
    return 'limite_trocas';
  end if;
  delete from public.group_members where group_id = g.id and user_id = p_member;
  if g.status = 'active' then
    insert into public.group_removals (group_id, user_id) values (g.id, p_member);
    perform public.group_revoke(p_member);
  end if;
  return 'ok';
end;
$$;

-- apply_purchase: marca o grupo como ativo ao pagar e libera o plano para quem já estava esperando
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
revoke all on function public.create_group(text, integer) from public, anon;
revoke all on function public.delete_pending_group() from public, anon;
revoke all on function public.join_group(text, boolean) from public, anon;
revoke all on function public.my_group() from public, anon;
revoke all on function public.remove_group_member(uuid) from public, anon;
grant execute on function public.create_group(text, integer) to authenticated;
grant execute on function public.delete_pending_group() to authenticated;
grant execute on function public.join_group(text, boolean) to authenticated;
grant execute on function public.my_group() to authenticated;
grant execute on function public.remove_group_member(uuid) to authenticated;
