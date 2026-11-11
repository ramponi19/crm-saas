# 07 — Troca da instância do banco: Free (Nano) → Pro + Small (2 GB)

Pedido do Lucas em 10/11/2026, depois da medição da tarde. O problema não é CPU, é memória. O banco tem
408 MB de RAM e chegou a 766 MB de swap (187% da RAM), com IOwait de 24–29%. A mesma consulta, com as mesmas
56.546 páginas em cache, levou 2,4 s e depois 31,2 s. Entre 14h25 e 14h43 houve ~70 `zapintel.tempo_esgotado`
de 30 a 146 s. Ver as notas da sessão hopeful-carson (cache-painel-e-cpu.md).

## O que muda

| | Hoje (Free) | Depois (Pro + Small) |
|---|---|---|
| Instância | Nano, até 0,5 GB, CPU compartilhada | Small, 2 GB, 2 núcleos ARM compartilhados |
| Conexões diretas / clientes do pooler | 60 / 200 | 90 / 400 |
| Disco incluído | 500 MB de banco | 8 GB |
| Custo aproximado | 0 | Pro US$ 25/mês; Small ~US$ 15/mês, menos o crédito de computação de US$ 10 do Pro |

Assinar o Pro **não** troca a instância sozinho. No Pro, a Nano é cobrada como Micro (1 GB). A troca para
Small é manual, em Settings → Compute and Disk. A Supabase diz que ela costuma levar **menos de 2 minutos fora do
ar** ("pode levar mais"), porque o Postgres reinicia. **Na nossa, em 10/11, foram ~36 minutos** (ver "Como foi" no
fim). Regra desde então (05, "Troca de instância"): só com a loja fechada, prevendo **até 40 min** fora do ar. Com
o reinício, o `pg_stat_statements` e o cache do banco são zerados.

## Antes (o Lucas faz; eu confiro)

1. **Horário:** loja fechada, fora de qualquer deploy, com **40 min de folga** antes de a loja abrir (o banco fica
   fora e a Edge `webhook-leads` não grava mensagem nenhuma nesse tempo). Ex.: depois das 22h ou antes das 7h.
2. **IOwait abaixo de 10%** na aba Observability → Database (`tools/saude/iowait-recente.js`).
3. **Dump único:** `powershell -ExecutionPolicy Bypass -File tools\banco\dump-unico.ps1`. As duas senhas são
   só suas. Conferir o `SHA256.txt` e o teste do 7z que o script faz. Apagar a pasta `_claro\` se não for
   fazer a prova de restauração.
4. **Foto do "antes"**, só leitura e leve, que eu tiro: `show` de `shared_buffers`, `work_mem`,
   `effective_cache_size`, `max_connections`, `max_worker_processes`; lista do `cron.job`; replication slots;
   tabelas da publicação `supabase_realtime`; foto Q2 do pgss (texto canônico, `LEIA-ME-fotos.md`), porque o
   reinício apaga o pgss.

## A troca (o Lucas faz)

5. Organização → Billing → assinar o **Pro**. Nenhuma queda.
6. Projeto crm-saas → Settings → **Compute and Disk** → **Small** → confirmar. Anotar a hora de início e de fim.
7. Me avisar: "troca feita".

## Depois (eu confiro; só leitura, consultas leves)

| # | O quê | Como | Esperado |
|---|---|---|---|
| 1 | Instância | painel Compute and Disk; `show shared_buffers, effective_cache_size, max_connections, work_mem` | Small / 2 GB; `max_connections` 90; valores maiores que os da foto 4 |
| 2 | Memória e swap | `tools/saude/memoria-cpu-recente.js` na aba Observability (1280x1400, visível) | RAM ~2 GB; swap perto de 0 e sem crescer; commit abaixo da capacidade |
| 3 | IOwait | `tools/saude/iowait-recente.js` | abaixo de 5% parado, abaixo de 10% com uso |
| 4 | Conexões | `pg_stat_activity` agrupado por `usename`/`state` | authenticator, auth e storage reconectados; nada preso em `idle in transaction` |
| 5 | API (PostgREST) | abrir o CRM e o ZapIntel (conta do Lucas, aba isolada) | telas carregam; zero `zapintel.tempo_esgotado` |
| 6 | Realtime | `pg_replication_slots` (o slot `supabase_realtime_messages_replication_slot` ativo); publicação com as 6 tabelas (acessos, contatos, conversas, mensagens, mensagens_internas, negocios); painel do ZapIntel mostrando "Ao vivo" | slot `active = true`; 6 tabelas; ponto verde |
| 7 | Edge `webhook-leads` | última `mensagens.created_at` por canal (WhatsApp Mogi/Jaguariúna, Instagram, Messenger) depois da hora da troca; `query_logs` da Edge numa janela de ≤ 15 min, filtrado em 5xx | mensagens novas chegando em todos os canais; nenhum 5xx |
| 8 | pg_cron | `select jobname, schedule, active from cron.job` | **4 jobs** ativos: `automacoes-hora` (17 *, chama `/api/cron/automacoes` da Vercel por `net.http_get`), `zapintel-conversa-aquecer` (0 5), `retencao-diaria` (0 7), `lgpd-exportacoes-limpar` (43 *) |
| 9 | pg_cron rodando | `cron.job_run_details` depois do próximo minuto 17 e do próximo 43 | `automacoes-hora` e `lgpd-exportacoes-limpar` com status `succeeded`; o `net._http_response` da automação com 200 |
| 10 | Auth e Storage | login; abrir uma conversa com foto/áudio | entra; mídia abre |
| 11 | Crons da Vercel | nada a fazer: a URL e as chaves do Supabase não mudam | — |
| 12 | Base nova do pgss | foto Q2 logo depois da troca: `tools/saude/fotos/pgss-AAAAMMDD-HHMM-pos-troca.json` | as próximas comparações partem dela |
| 13 | A mesma consulta, 3 vezes | o `explain (analyze, timing off, buffers)` da tarde de 10/11, SÓ com a loja fechada | tempo estável entre as 3 (mesmas páginas, tempo parecido), longe dos 2,4–31 s |
| 14 | Um dia depois | `zapintel.tempo_esgotado` e `zapintel.calculo_cortado` nas 24 h; swap e IOwait no horário de pico | zero ou perto de zero; swap estável |

## Se der errado

- **Banco não volta depois de 10 min:** abrir chamado no suporte da Supabase (no Pro há suporte por e-mail) e
  avisar a loja. O dump do passo 3 é a garantia.
- **Small instável:** a troca de instância é pela mesma tela, com outra queda (em 10/11 foram ~36 min: só com a loja
  fechada, regra do 05). A Nano não existe no plano pago. Voltar para a Micro (1 GB) **não** resolve aperto de
  memória: em 11/11 o pico real com a loja aberta foi 606 MB, mais ~256 MB de `shared_buffers` (ver "Decisão" abaixo).
- **Realtime sem avisos** (slot inativo): reiniciar o Realtime em Settings → Realtime antes de mexer no banco.

## Como foi em 10/11/2026 (Nano → Small, com a loja aberta)

- **Fora do ar ~36 min, não 2.** Última mensagem gravada 15:57:16, primeira depois 16:33:48 (ritmo normal ~6 por
  minuto; 348 entre 15h e 16h). Painel de observabilidade sem dado de 15:57 a 16:34; o banco subiu às 16:33:43.
- **Edge `webhook-leads` no buraco:** 16:05–16:20 zero 200 (464 × 546, 51 × 504, 13 × 503); 16:30–16:35 80 × 500 e
  43 × 504; desde 16:35 só 200. O que a Meta não reentregou se perdeu — conferência por loja em 11/11 (06, seção 40).
- **`automacoes-hora` das 16:17 falhou** ("job startup timeout", 88 s), antes do reinício: banco já sufocado. Este
  roteiro listava 3 jobs e eram 4; corrigido no item 8.
- **Depois:** `shared_buffers` 224 → 512 MB, `effective_cache_size` 1.536 MB, `max_connections` 60 → 90, `work_mem`
  5 MB; RAM 1,79 GB, usada 305–385 MB, swap 0 (era 673–919 MB), IOwait 0,2–3,6% (era 13–89%, média ~25%);
  Realtime com os 2 slots ativos e as 6 tabelas; zero `zapintel.tempo_esgotado` (164 entre 12h e 15h55);
  dashboard do ZapIntel 848 ms a frio e 788 ms a quente (era 5,6 s ou estouro), resumo 163 ms (era 2–4,5 s).
- **pgss** zerado às 16:33:43: base pós-troca = lista vazia (`tools/saude/fotos/pgss-20261110-1633-pos-troca-reset.json`).
- **Custo** (preço oficial; ciclo 10/11–10/12, 720 h): Small US$ 0,0206/h (US$ 14,83 no mês, US$ 4,83 além do
  crédito de US$ 10 → ~US$ 29,83 com o Pro; o painel projetou US$ 29,42); Micro US$ 0,01344/h (US$ 9,68, coberto
  pelo crédito → US$ 25,00).
- **Decisão (Lucas, 11/11 ~14h, antecipada): fica na Small.** Medição de hora em hora com a loja aberta, de 10/11
  17h a 11/11 14h:
  - **Memória usada:** pico de **606 MB** (11/11 13:35); média por hora entre 387 e 471 MB, subindo ao longo do dia.
  - **Swap:** de 0 a 0,06 MB.
  - **IOwait:** média de 0,0–0,1% e máximo de 0,8%.
  - **Commit:** máximo de 2,0 GB, com capacidade de 2,79 GB.
  - **Eventos:** zero `tempo_esgotado` e zero `calculo_cortado`.
  - **Por que não volta para a Micro:** o "Used" do painel não conta o `shared_buffers`. Na Micro (~256 MB de
    `shared_buffers`), o pico daria ~860 MB de 1 GB, sem folga e no caminho do swap que derrubou a Nano.
  - **Custo:** ~US$ 29,83 no mês com o Pro.
  - Tabela hora a hora e o critério para reavaliar: 06, seção 40, "Small × Micro".
