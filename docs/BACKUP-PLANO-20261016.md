# Backup — os três buracos de 16/10/2026: levantamento e opções (PARADO na etapa 1)

O teste de restauração de 16/10 ([BACKUP-RESTAURACAO-20261016.md](BACKUP-RESTAURACAO-20261016.md))
aprovou o backup lógico do banco, mas deixou três buracos:

1. os **arquivos do Storage** não entram no backup — só os metadados (`storage.objects`);
2. existe **uma cópia só**, no disco desta máquina (`D:\Backups-Supabase\crm-saas`);
3. a execução **depende de alguém digitar a senha do banco 5 vezes**.

Este documento é a etapa 1 (levantamento) do plano para fechar os três. **Nada foi
instalado, o script não foi alterado e nada foi agendado.** As etapas 2 a 5 (cópia do
Storage, cópia externa cifrada, execução sem senha, prova por restauração) esperam as
decisões listadas no fim.

Tudo abaixo foi conferido em 16/10/2026 com consultas de leitura ao banco de produção e
inspeção da máquina; nenhuma escrita.

## 1. Buckets do Storage

| Bucket | Público? | Objetos | Tamanho | Movimento |
|---|---|---|---|---|
| `chat-midia` | **sim** | 2.859 | 252 MB | 227 MB novos em 30 dias (135 MB nos últimos 7); 334 objetos regravados depois de criados |
| `contratos` | **sim** | 61 | 4,4 MB | nenhum objeto novo desde 03/08/2026 |
| `documentos` | não | 0 | 0 | — |
| `imoveis` | sim | 0 | 0 | — |
| `produtos` | sim | 0 | 0 | — |

- **Total hoje: ~257 MB** (a estimativa anterior, ~0,8 GB, não confere com `storage.objects`).
  A primeira cópia baixa isso; depois, ~230 MB/mês no ritmo atual, quase tudo `chat-midia`.
- Todo objeto tem `eTag` em `metadata`. Como há objetos **regravados**, a cópia incremental
  precisa comparar `updated_at`/`eTag` contra um manifesto local, não só "o arquivo existe".
- O que já está no backup lógico: as linhas de `storage.buckets` e `storage.objects` (caminho,
  tamanho, datas). Sem os arquivos, restaurar devolve links que apontam para o nada.

## 2. A máquina

| Item | Situação |
|---|---|
| rclone | **não instalado** (o scoop está disponível: seria `scoop install rclone`) |
| Supabase CLI | instalado via scoop |
| gpg, 7z | instalados via scoop |
| Credential Manager pelo PowerShell | **funciona**: Windows PowerShell 5.1 sem módulo pronto, mas `CredRead` do `advapi32` via P/Invoke compila; o cofre já guarda o login do Supabase CLI |
| Agendador de tarefas | serviço `Schedule` rodando, início automático |
| Energia | notebook com bateria — a tarefa precisa poder rodar fora da tomada |
| Senha do banco hoje | `C:\Ferramentas\claude\backup-crm-saas.ps1` (**fora do repositório**): os 5 comandos (`pg_dump` ×4, `pg_dumpall` ×1) usam `-W` e pedem a senha no terminal |
| `PGPASSWORD` / `PGPASSFILE` / `pgpass.conf` | **nenhum em uso** (processo, usuário e máquina conferidos) |

Dois limites técnicos que mudam o desenho das etapas 3 e 4:

- **Credential Manager não abre em tarefa "sem usuário conectado" sem senha guardada.** O
  cofre é protegido pela senha do Windows; o modo S4U da tarefa agendada não a tem. Opções:
  rodar a tarefa só com o usuário conectado (com "executar quando disponível", ela roda ao
  entrar se o horário passou) ou guardar a senha do Windows na própria tarefa.
- **O rclone guarda a senha do crypt no `rclone.conf` apenas embaralhada, e isso é
  reversível.** Para ela não existir em arquivo legível: cifrar o `rclone.conf` com a senha
  de configuração do rclone e entregá-la a cada execução por `--password-command`, lendo do
  Credential Manager.

## 3. Estimativa de tráfego (egress do Supabase)

O `projeto.dump` comprimido tem 42 MB, mas o `pg_dump` recebe os dados **sem compressão**
pela rede. As tabelas exportadas ocupam 141 MB em disco (com TOAST); o banco inteiro, 236 MB.
As duas maiores são `historico_bruto` (55 MB) e `integracao_eventos` (37 MB) — 92 MB juntas.

**Estimativa, não medição: 150–250 MB de egress por execução completa.** Não medi o
tráfego de uma execução real; o número vem do tamanho das tabelas e da taxa típica de
compressão do dump.

| Cenário | Egress/mês (estimado) |
|---|---|
| Dump completo **diário** | **4,5–7,5 GB** |
| Arquivos do Storage (incremental) | ~0,26 GB uma vez + ~0,23 GB/mês |

O plano gratuito do Supabase inclui **5 GB de egress por mês**. O ciclo atual (até 03/11)
já estava em ~2,4 GB na última conferência (outubro). **O dump diário completo, sozinho,
passaria do limite.**

### Opções

| Opção | O que é | Egress/mês (estimado) | Custo do que se perde |
|---|---|---|---|
| **(a)** | dump diário **sem** `historico_bruto` e `integracao_eventos`; dump completo **uma vez por semana** | ~1,5–2 GB | essas duas tabelas podem ficar até 7 dias atrás numa restauração |
| **(b)** | dump completo **a cada 3 dias** | ~1,5–2,5 GB | até 3 dias de dado perdido numa restauração |
| **(c)** | dump completo **diário** | 4,5–7,5 GB | passa do plano gratuito — exige o plano Pro ou aceitar o excesso |

O Storage incremental entra nas três opções; ele é pequeno perto do dump.

## 4. Destino da cópia externa

| | Backblaze B2 | Cloudflare R2 | Google Drive |
|---|---|---|---|
| Custo para 1–5 GB | **US$ 0** (10 GB grátis; depois ~US$ 6/TB/mês; download grátis até 3× o armazenado) | US$ 0 até 10 GB/mês; depois US$ 0,015/GB/mês; download sempre grátis | 15 GB grátis, divididos com Gmail e Fotos |
| rclone + crypt | backend nativo, estável | via backend S3 | funciona |
| Para configurar | conta, um bucket e uma chave (dois valores para colar) | conta, **cartão obrigatório** para liberar o R2, token, ID e endpoint | login pelo navegador; com credencial própria em modo de teste, **a autorização expira a cada 7 dias**; com a credencial padrão do rclone, cotas compartilhadas |
| Ponto fraco | mais um login | cartão | cópia presa a uma conta pessoal e renovação que quebra |

Preços conferidos nas páginas dos fornecedores em 16/10/2026.

**Recomendado: Backblaze B2.** É o mais simples sem cartão e sem renovação semanal, e com a
retenção pedida (14 diários, 8 semanais, 6 mensais) fica abaixo de 10 GB por bem mais de um
ano: ~1,2 GB de dumps mais o espelho do Storage.

Ajuste de desenho que vale para qualquer destino: os arquivos do Storage vão para um
**espelho incremental separado** (com as versões trocadas ou apagadas guardadas pelo mesmo
calendário), não dentro de cada pasta do dia. Copiá-los em cada pasta multiplicaria os
257 MB por 28 retenções, ~7 GB.

A conta do destino deve ser criada no nome do Lucas (`lucas.souza19@hotmail.com`), como as
demais contas do projeto.

## 5. Decisões pendentes (do Lucas)

1. **Plano do Supabase:** ficar no gratuito (e escolher a opção **a** ou **b**) ou ir para o
   **Pro**, que libera a opção **c**. A cota de egress e o preço do Pro devem ser conferidos
   no painel de faturamento do Supabase antes de decidir.
2. **Destino da cópia externa:** B2 (recomendado), R2 ou Google Drive.

Depois dessas duas, ainda há duas escolhas menores:

- **Tarefa agendada:** só com o usuário conectado (recomendado) ou com a senha do Windows
  guardada na tarefa.
- **Onde vive o script:** fica em `C:\Ferramentas\claude\` ou vai para `scripts/backup/` no
  repositório (sem credenciais) e passa a ser versionado.

## 6. O que continua fora até as etapas 2–5

- Arquivos do Storage (~257 MB): **sem cópia**.
- Cópia externa: **não existe**; a única está em `D:\Backups-Supabase\crm-saas`.
- Execução: **manual, com 5 digitações de senha**; nada agendado.
- E, como já registrado no teste de restauração: sessões, vault, segredos gerenciados pelo
  Supabase e chaves do app (`CHANNEL_ENCRYPTION_KEY`, `PAYMENT_ENCRYPTION_KEY`) continuam fora
  de qualquer backup.
