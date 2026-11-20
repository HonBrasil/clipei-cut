import { Icon } from "./Icon";

export function OfflineBanner() {
  return (
    <div className="offline" role="status">
      <Icon name="wifiOff" size={20} color="#ffd06b" />
      <div>
        <b>Você está sem internet.</b> Dá para abrir seus projetos, assistir e exportar clipes que já foram analisados.
        Para analisar um vídeo novo, é preciso estar conectado, porque a transcrição e a IA rodam no nosso servidor.
      </div>
    </div>
  );
}
