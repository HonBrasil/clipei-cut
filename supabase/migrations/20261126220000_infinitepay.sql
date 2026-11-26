-- Pagamentos pela InfinitePay (Checkout Integrado): cada link criado vira um pedido aqui.
-- O aviso da InfinitePay não tem assinatura, então o servidor confere cada pagamento
-- direto na InfinitePay (payment_check) antes de liberar o plano.

create table if not exists public.checkout_orders (
  order_nsu text primary key,
  user_id uuid references auth.users (id) on delete set null,
  product text not null,
  amount_cents integer not null check (amount_cents >= 100),
  discount_pct integer not null default 0,
  provider text not null default 'infinitepay',
  status text not null default 'pending' check (status in ('pending', 'paid', 'refunded', 'canceled')),
  checkout_url text,
  transaction_nsu text,
  capture_method text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists checkout_orders_user_idx on public.checkout_orders (user_id, created_at desc);
alter table public.checkout_orders enable row level security; -- sem políticas: só o servidor acessa
