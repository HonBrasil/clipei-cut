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
