# Migrações de `supabase/pendentes/` — o que já está no banco de produção

Conferido **no banco de produção em 16/10/2026, só leitura**, procurando o que
cada arquivo cria ou muda (não a memória de quem aplicou). A data vem do
registro `supabase_migrations.schema_migrations`, gravado quando a migração foi
aplicada pela ferramenta do Supabase; a versão é em UTC (Brasília = UTC−3).

| Arquivo | Situação | Data (Brasília) | Como foi conferido |
|---|---|---|---|
| `00_instantaneo.sql` | **aplicada** | 15/10/2026 16:52 (`20261015195201 p00_instantaneo_20261015`) | as 3 tabelas existem em `backup`: `politicas_pre_20261015`, `permissoes_funcoes_pre_20261015`, `funcoes_zapintel_pre_20261015` |
| `01_sem_resposta_do_cliente.sql` | **aplicada** | 16/10/2026 13:18 (`20261016161824 p06_p01_20261016`, junto com a 06) | as 3 funções (`zapintel_dashboard`, `zapintel_dashboard_lista`, `zapintel_leads_lista`) têm a classe `sem_resposta` e não têm mais `coalesce(F.cls0, 'sem_analise')`; rodapé do dashboard conta por classe. Depois: rodapé = funil = lista (56 sem resposta, 12 sem análise, dono, 13:19) |
| `02_contratos_bucket.sql` | **aplicada** | 15/10/2026 16:52 (`20261015195220 p02_contratos_bucket_20261015`) | em `storage.objects` existem `contratos_leitura_do_tenant` e `contratos_delete_do_tenant`; `contratos_leitura` (a antiga) não existe |
| `03_rls_uma_vez_por_consulta.sql` | **pendente — pré-condição ajustada em 16/10 para 91; o ensaio de 15/10 (525 comparações) foi feito com 96, então ela precisa de novo ensaio antes de ser aplicada** | — | `backup.rls_politicas_20261015` não existe; 91 políticas de `public` ainda chamam `get_empresa_id()`/`is_super_admin()` por linha (filtro da pré-condição, 16/10). Eram 96 em 15/10: a 06 trocou 5 delas (`doc_tenant_insert/update/delete`, `modelo_tenant_insert/update`) pelas `*_dono_admin`, que já usam `(select get_empresa_id())` |
| `04_funcoes_fora_da_api.sql` | **pendente** | — | `authenticated` ainda tem EXECUTE em `preencher_filial()`; `anon` ainda tem EXECUTE em `filiais_visiveis()` |
| `05_zapintel_so_dono_admin.sql` | **aplicada** | 15/10/2026 17:34 (`20261015203436 p05_zapintel_so_dono_admin_20261015`) | `zapintel_escopo` tem o ramo novo ("ZapIntel restrito ao dono e aos administradores", 42501) e não tem mais `v_lojas := filiais_visiveis();` |
| `06_contrato_modelos_escrita_dono_admin.sql` | **aplicada** | 16/10/2026 13:18 (`20261016161824 p06_p01_20261016`, junto com a 01) | as 5 políticas `*_dono_admin` existem; as 5 antigas de escrita (`doc_tenant_insert/update/delete`, `modelo_tenant_insert/update`) não existem mais. `supabase/testes/contratos_escrita.sql` em produção: 28 ok, 0 falhas |

A 06 e a 01 entraram numa só migração pelo `apply_migration` do conector
Supabase, com conferência final em `DO`/`RAISE` (desfaz tudo se o estado não
for o esperado); backup antes: `execucao-2026-10-16_130829`. Reversão ensaiada:
volta da 01 (`01_..._volta.sql`) + bloco comentado no fim da 06.

Cada pendente só entra com autorização do Lucas, e antes dela um backup lógico
(procedimento testado em `docs/BACKUP-RESTAURACAO-20261016.md`). Ao aplicar uma,
atualizar esta tabela com a data e o marcador conferido depois.
