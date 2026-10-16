# Achado — escrita nos contratos sem checar papel (16/10/2026)

**Gravidade: ALTA.** **Estado: aberto.** Correção imediata preparada e ensaiada,
não aplicada (`supabase/pendentes/06_contrato_modelos_escrita_dono_admin.sql`).
Sem sinal de uso nos dados (ver "Evidência").

## O problema, pela causa

Duas falhas que, juntas, viram uma só:

1. **As políticas de escrita checam a empresa, não o papel.** Em
   `contrato_modelos` (INSERT, UPDATE) e `contrato_documentos` (INSERT, UPDATE,
   DELETE) exigem só `empresa_id = get_empresa_id()`; em `contratos_venda`
   (só INSERT; não há UPDATE nem DELETE), a empresa e a loja visível. O papel
   `authenticated` tem grant de escrita nas três. A regra "só dono e admin editam o modelo" existe apenas nas rotas
   `app/api/contrato-modelo` e `app/api/contrato-documentos`
   (`requireEmpresaRoleApi(['owner','admin'])`). Qualquer membro ativo da
   empresa, inclusive vendedor, consegue escrever nessas tabelas pela API do
   Supabase, por fora das rotas.

2. **O HTML do modelo é renderizado sem sanitização, na mesma origem do app, sem
   CSP.** O texto do modelo (`texto_html`) e o endereço do fundo (`fundo_url`)
   são gravados como chegam (a rota normaliza geometria, não conteúdo) e entram
   crus no contrato montado (`lib/contrato-modelo.ts`, `renderizarModelo`). O
   contrato é impresso com `window.open('')` + `document.write`
   (`lib/contrato-tipos.ts`, `imprimirContratoHTML`): a janela herda a origem do
   app. O projeto não define Content-Security-Policy. O que estiver ativo no
   HTML roda com a sessão de quem imprime, e a sessão do Supabase fica em cookie
   legível por JavaScript.

O que entra de **dado do cliente** está protegido: todo marcador passa por
`esc()` (`lib/contrato-modelo.ts`), inclusive nome vindo do WhatsApp. O
problema é o **modelo** e o **contrato arquivado**, não o cadastro.

## Por que ALTA

Por si só, a falha fica dentro da empresa: exige uma conta ativa dela, e o
alcance é agir como quem imprime (um vendedor passar a agir como dono ou admin).

O caminho até **outras empresas** passa pelo superadmin: ele imprime contrato de
uma empresa enquanto a impersona, e a sessão dele vale para todas as empresas da
plataforma. Uma conta de vendedor de um cliente vira, nesse cenário, acesso à
plataforma inteira. É isso que eleva a gravidade.

## Evidência de não uso (16/10/2026, só leitura)

Varredura de `contratos_venda.html` (63 contratos) e `contrato_modelos.paginas`
(6 versões), descontado o `window.print()` legítimo do próprio contrato:

| | `<script>` extra | atributos `on…=` | `javascript:` | URL de fundo fora do bucket |
|---|---|---|---|---|
| 63 contratos | 0 | 0 | 0 | 0 |
| 6 modelos | 0 | 0 | 0 | 0 |

A única tag além do texto é o `<meta charset>` do documento (1 por contrato).

## Tratamento

### 1. Imediato — migração 06 (preparada, NÃO aplicada)

`supabase/pendentes/06_contrato_modelos_escrita_dono_admin.sql`: INSERT, UPDATE e
DELETE em `contrato_documentos`, e INSERT e UPDATE em `contrato_modelos`, passam
a exigir a empresa atual **e** `is_empresa_admin(empresa_id)` — a função que o
projeto já usa em `configuracoes_sistema`, `filiais` e `empresa_usuarios` (dono
ou admin ativo; superadmin só na empresa que impersona agora). SELECT não muda.
`contrato_modelos` segue sem política de DELETE, como hoje (versões só saem em
cascata com o documento).

Nenhum fluxo do app escreve nessas tabelas com sessão de vendedor: toda escrita
está nas duas rotas, atrás da trava de dono/admin; o editor, o importador de PDF
e a troca de fundo enviam arquivo ao Storage, não a estas tabelas; a emissão só
lê; nenhuma função do banco escreve nelas.

Ensaio em produção em 16/10 (um único bloco, desfeito no fim; linhas de teste
com id negativo, sem consumir sequência; conferido depois que nada sobrou), com
`supabase/testes/contratos_escrita.sql`:

| Perfil | antes da 06 | com a 06 |
|---|---|---|
| dono JM | insere, atualiza e apaga | insere, atualiza e apaga |
| admin JM | insere, atualiza e apaga | insere, atualiza e apaga |
| vendedor JM | **insere, atualiza e apaga** | recusado (42501); UPDATE/DELETE 0 linhas; SELECT continua |
| dono de outra empresa | recusado; não vê | recusado; não vê |

Antes: 23 ok, 5 falhas (todas do vendedor — o achado). Com a 06: 28 ok, 0 falhas.

**O que a 06 NÃO fecha:** `contratos_venda` continua aceitando INSERT de
vendedor, porque é ele quem emite o contrato no PDV — e o HTML arquivado é o que
a 2ª via imprime. Fechar isso é da fase CRM (abaixo).

### 2. Fase CRM

- **Sanitizar `texto_html`** ao salvar o modelo (lista branca de tags e
  atributos de formatação; nada de script, handler, `iframe`, `form`, `style`
  com URL externa).
- **Validar `fundo_url`**: aceitar só URL do bucket `contratos` na pasta da
  própria empresa.
- **Imprimir em `iframe` com `sandbox`, sem `allow-same-origin`** (só o
  necessário para imprimir), em vez de `document.write` numa janela da mesma
  origem. Vale para a emissão, a 2ª via e a prévia do editor.
- **Contrato arquivado**: tirar do navegador a montagem e a gravação do HTML em
  `contratos_venda` (emissão no servidor), ou tratar o HTML arquivado como não
  confiável na impressão (o `iframe` isolado já cobre isso).
- **Revisar se a sessão do Supabase precisa ser legível por JavaScript** (hoje
  os cookies do `@supabase/ssr` são), e avaliar uma CSP para o app.

## Regra operacional, até a fase CRM

**Não imprimir contrato (emissão, 2ª via ou prévia do modelo) enquanto estiver
impersonando uma empresa como superadmin.**

## Referências

- Diagnóstico do bucket e decisão: `docs/DECISAO-BUCKET-CONTRATOS-20261016.md`.
- Políticas atuais e ensaio: `supabase/pendentes/06_contrato_modelos_escrita_dono_admin.sql`,
  `supabase/testes/contratos_escrita.sql`.
