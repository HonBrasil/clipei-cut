-- Clipei Cut — estrutura inicial do banco
-- Créditos são guardados em SEGUNDOS de vídeo/áudio analisado.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  credits_seconds integer not null default 3600 check (credits_seconds >= 0), -- 1 hora grátis no beta
  created_at timestamptz not null default now()
);

create table if not exists public.usage_events (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('transcribe', 'analyze')),
  audio_seconds integer not null default 0,
  provider text,
  created_at timestamptz not null default now()
);

create index if not exists usage_events_user_idx on public.usage_events (user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.usage_events enable row level security;

-- Cada usuário só enxerga os próprios dados. Ninguém altera créditos pelo app:
-- só as Edge Functions (com a chave de serviço) mexem no saldo.
create policy "perfil proprio" on public.profiles
  for select using ((select auth.uid()) = id);

create policy "uso proprio" on public.usage_events
  for select using ((select auth.uid()) = user_id);

-- Cria o perfil automaticamente quando alguém se cadastra
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Desconta créditos de forma atômica. Retorna o saldo restante.
-- Lança 'sem_creditos' se o saldo não for suficiente.
create or replace function public.consume_credits(p_user uuid, p_seconds integer, p_kind text, p_provider text)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  remaining integer;
begin
  update public.profiles
     set credits_seconds = credits_seconds - p_seconds
   where id = p_user and credits_seconds >= p_seconds
  returning credits_seconds into remaining;

  if remaining is null then
    raise exception 'sem_creditos';
  end if;

  insert into public.usage_events (user_id, kind, audio_seconds, provider)
  values (p_user, p_kind, p_seconds, p_provider);

  return remaining;
end;
$$;

revoke all on function public.consume_credits(uuid, integer, text, text) from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
