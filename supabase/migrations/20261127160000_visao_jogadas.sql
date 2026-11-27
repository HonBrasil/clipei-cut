-- Detecção de jogadas: registra o uso da IA de visão (quantidade de imagens) para limitar abusos.
alter table public.usage_events drop constraint if exists usage_events_kind_check;
alter table public.usage_events add constraint usage_events_kind_check check (kind in ('transcribe', 'analyze', 'vision'));
