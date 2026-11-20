import { useEffect, useState } from "react";

/**
 * Diz se há internet. Usa o aviso do sistema e confirma com uma chamada
 * leve ao servidor (o Windows às vezes diz "online" com a rede sem saída).
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    let alive = true;
    const url = `${import.meta.env.VITE_SUPABASE_URL}/auth/v1/health`;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

    async function probe() {
      if (!navigator.onLine) {
        if (alive) setOnline(false);
        return;
      }
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 6000);
        await fetch(url, { headers: { apikey: key }, signal: ctrl.signal, cache: "no-store" });
        clearTimeout(t);
        if (alive) setOnline(true);
      } catch {
        if (alive) setOnline(false);
      }
    }

    probe();
    const onChange = () => probe();
    window.addEventListener("online", onChange);
    window.addEventListener("offline", onChange);
    const timer = setInterval(probe, 30_000);
    return () => {
      alive = false;
      window.removeEventListener("online", onChange);
      window.removeEventListener("offline", onChange);
      clearInterval(timer);
    };
  }, []);

  return online;
}
