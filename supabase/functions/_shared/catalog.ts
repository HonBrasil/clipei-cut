// Catálogo oficial de preços. O app nunca define o preço: só escolhe o produto.
// Preços já incluem a taxa do Mercado Pago (ver README > Planos).
export type Product = {
  id: string;
  title: string;
  price: number; // R$
  kind: "plano" | "horas";
  period?: "mensal" | "anual";
  hours?: number;
};

export const CATALOG: Record<string, Product> = {
  criador_mensal: { id: "criador_mensal", title: "Clipei Cut Criador — mensal (15 h/mês)", price: 34.9, kind: "plano", period: "mensal" },
  pro_mensal: { id: "pro_mensal", title: "Clipei Cut Pro — mensal (50 h/mês)", price: 69.9, kind: "plano", period: "mensal" },
  studio_mensal: { id: "studio_mensal", title: "Clipei Cut Studio — mensal (150 h/mês)", price: 159.9, kind: "plano", period: "mensal" },
  criador_anual: { id: "criador_anual", title: "Clipei Cut Criador — anual (15 h/mês)", price: 349.9, kind: "plano", period: "anual" },
  pro_anual: { id: "pro_anual", title: "Clipei Cut Pro — anual (50 h/mês)", price: 699.9, kind: "plano", period: "anual" },
  studio_anual: { id: "studio_anual", title: "Clipei Cut Studio — anual (150 h/mês)", price: 1599.9, kind: "plano", period: "anual" },
  // Planos em grupo (o dono paga; cada pessoa tem as próprias horas)
  criador_duo_mensal: { id: "criador_duo_mensal", title: "Clipei Cut Criador Duo — mensal (2 pessoas, 15 h cada)", price: 62.9, kind: "plano", period: "mensal" },
  criador_trio_mensal: { id: "criador_trio_mensal", title: "Clipei Cut Criador Trio — mensal (3 pessoas, 15 h cada)", price: 89.9, kind: "plano", period: "mensal" },
  criador_squad_mensal: { id: "criador_squad_mensal", title: "Clipei Cut Criador Squad — mensal (4 pessoas, 15 h cada)", price: 111.9, kind: "plano", period: "mensal" },
  pro_duo_mensal: { id: "pro_duo_mensal", title: "Clipei Cut Pro Duo — mensal (2 pessoas, 50 h cada)", price: 125.9, kind: "plano", period: "mensal" },
  pro_trio_mensal: { id: "pro_trio_mensal", title: "Clipei Cut Pro Trio — mensal (3 pessoas, 50 h cada)", price: 179.9, kind: "plano", period: "mensal" },
  pro_squad_mensal: { id: "pro_squad_mensal", title: "Clipei Cut Pro Squad — mensal (4 pessoas, 50 h cada)", price: 224.9, kind: "plano", period: "mensal" },
  criador_duo_anual: { id: "criador_duo_anual", title: "Clipei Cut Criador Duo — anual (2 pessoas, 15 h cada)", price: 629.9, kind: "plano", period: "anual" },
  criador_trio_anual: { id: "criador_trio_anual", title: "Clipei Cut Criador Trio — anual (3 pessoas, 15 h cada)", price: 899.9, kind: "plano", period: "anual" },
  criador_squad_anual: { id: "criador_squad_anual", title: "Clipei Cut Criador Squad — anual (4 pessoas, 15 h cada)", price: 1119.9, kind: "plano", period: "anual" },
  pro_duo_anual: { id: "pro_duo_anual", title: "Clipei Cut Pro Duo — anual (2 pessoas, 50 h cada)", price: 1259.9, kind: "plano", period: "anual" },
  pro_trio_anual: { id: "pro_trio_anual", title: "Clipei Cut Pro Trio — anual (3 pessoas, 50 h cada)", price: 1799.9, kind: "plano", period: "anual" },
  pro_squad_anual: { id: "pro_squad_anual", title: "Clipei Cut Pro Squad — anual (4 pessoas, 50 h cada)", price: 2249.9, kind: "plano", period: "anual" },
  horas_5: { id: "horas_5", title: "Clipei Cut — +5 horas (não vencem)", price: 24.9, kind: "horas", hours: 5 },
  horas_20: { id: "horas_20", title: "Clipei Cut — +20 horas (não vencem)", price: 69.9, kind: "horas", hours: 20 },
};

/** external_reference: "<user_id>|<produto>" */
export function makeRef(userId: string, productId: string): string {
  return `${userId}|${productId}`;
}

export function parseRef(ref: string | null | undefined): { userId: string; product: Product } | null {
  if (!ref) return null;
  const [userId, productId] = ref.split("|");
  const product = CATALOG[productId];
  if (!userId || !product || !/^[0-9a-f-]{36}$/i.test(userId)) return null;
  return { userId, product };
}
