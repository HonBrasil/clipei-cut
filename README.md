# Clipei Cut

App para Windows da **Clipei Studio Digital** que transforma lives, gameplays e podcasts em clipes verticais com IA.
O vídeo **nunca sai do PC** do usuário: só o áudio vai para a IA, que transcreve e escolhe os melhores momentos.
O corte, o layout (webcam em cima) e a legenda animada são feitos localmente com FFmpeg.

## Como funciona

```
PC do usuário (app Tauri)                         Servidor (Supabase)                IAs
─────────────────────────                         ───────────────────                ───
1. Escolhe o vídeo
2. Detecta a webcam (MediaPipe, local)
3. Extrai só o áudio (FFmpeg) ──── pedaços ────▶  transcribe ─────────────────────▶ Groq (Whisper)
                                                   └ confere e desconta créditos
4. Envia a transcrição em texto ──────────────▶  analyze ────────────────────────▶ Claude Haiku
5. Recebe os clipes sugeridos ◀────────────────── (início, fim, título, nota)
6. Corta, monta 9:16 e grava a legenda (FFmpeg + placa de vídeo)
```

As chaves das IAs ficam só no servidor e nunca dentro do app.

## Estrutura

| Pasta | O que tem |
|---|---|
| `app/` | App desktop (Tauri 2 + React + TypeScript) |
| `app/src/lib/ffmpeg.ts` | Áudio, quadros, layouts e exportação |
| `app/src/lib/detect.ts` | Detecção da webcam |
| `app/src/lib/ass.ts` | Legenda animada palavra por palavra |
| `app/src/lib/ai.ts` | Comunicação com o servidor |
| `supabase/migrations/` | Banco: perfis e créditos |
| `supabase/functions/` | `transcribe` (Groq) e `analyze` (Claude) |
| `.github/workflows/` | Gera o instalador do Windows e publica o servidor |

## Configuração (uma vez só)

### 1. Supabase
1. Crie um projeto em [supabase.com](https://supabase.com) (região São Paulo).
2. Anote, em **Project Settings › API**: a **Project URL**, a chave **anon public** e o **Reference ID**.
3. Crie um token pessoal em **Account › Access Tokens**.

### 2. Chaves das IAs
- **Groq:** [console.groq.com](https://console.groq.com) › API Keys.
- **Anthropic:** [platform.claude.com](https://platform.claude.com) › API Keys (coloque alguns dólares de crédito).

### 3. GitHub (Settings › Secrets and variables › Actions)

**Variables** (não são segredo):

| Nome | Valor |
|---|---|
| `SUPABASE_URL` | Project URL do Supabase |
| `SUPABASE_ANON_KEY` | chave anon public |
| `SUPABASE_PROJECT_REF` | Reference ID |

**Secrets** (segredo, ninguém vê depois de salvar):

| Nome | Valor |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | token pessoal do Supabase |
| `SUPABASE_DB_PASSWORD` | senha do banco definida ao criar o projeto |
| `GROQ_API_KEY` | chave do Groq |
| `ANTHROPIC_API_KEY` | chave da Anthropic |

### 4. Publicar
1. **Actions › Publicar servidor (Supabase) › Run workflow**: cria as tabelas, guarda as chaves e publica as funções.
2. **Actions › Gerar instalador Windows › Run workflow**: ao terminar, baixe o instalador em *Artifacts*.

## Como testar (checklist)
- [ ] Instalar e abrir o app (o Windows pode avisar “app desconhecido” até termos o certificado: clique em *Mais informações › Executar assim mesmo*).
- [ ] Criar conta e entrar.
- [ ] Arrastar uma gravação do OBS com webcam.
- [ ] Conferir se o retângulo da webcam ficou no lugar certo (e se dá para arrastar/redimensionar).
- [ ] Esperar a análise e ver os clipes sugeridos.
- [ ] Assistir alguns trechos, editar um título, exportar 2 ou 3 clipes.
- [ ] Abrir a pasta e ver os vídeos no celular: layout, legenda, áudio.

Ao reportar um problema, mande: print da tela, duração/resolução do vídeo e o que esperava acontecer.

## Desenvolvimento local
```bash
cd app
cp .env.example .env   # preencha com os dados do Supabase
npm install
npm run assets         # baixa o modelo de detecção de rosto
# coloque ffmpeg/ffprobe em src-tauri/binaries/ com o sufixo da plataforma (ver workflow)
npm run tauri dev
```

## Observações
- O FFmpeg empacotado é a build GPL do BtbN (usado como programa separado). Revisar a licença antes da venda comercial.
- Créditos são contados em segundos de áudio transcrito. Novos usuários ganham 1 hora no beta.
