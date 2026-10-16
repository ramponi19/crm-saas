# Decisão — o bucket `contratos` continua público (16/10/2026)

## A decisão

O bucket de Storage `contratos` **permanece público**. Não vira privado nem passa
a servir por URL assinada.

Ele já não é listável de fora: desde a `supabase/pendentes/02_contratos_bucket.sql`
(15/10), as políticas de `storage.objects` só deixam listar, enviar e apagar na
pasta da própria empresa (`contratos_leitura_do_tenant`,
`contratos_upload_do_tenant`, `contratos_delete_do_tenant`), e o anônimo é
recusado ao listar. Público, aqui, quer dizer só uma coisa: quem tiver o caminho
exato do arquivo (um UUID aleatório) consegue baixá-lo.

## Por que — o que o diagnóstico de 16/10 encontrou

Conferido no banco de produção, só leitura:

- O bucket tem **61 arquivos, todos `image/jpeg`, 4,3 MB**, todos na pasta da
  JM (empresa 1), enviados entre 31/07 e 03/08/2026 — a montagem do modelo.
- São **imagens de fundo dos modelos de contrato**: capa e papel timbrado. Duas
  foram abertas e conferidas: logo da loja, fotos de produto e marca-d'água.
- **Nenhum dado de cliente entra nessas imagens, por construção.** O importador
  de PDF (`lib/contrato-importar-pdf.ts`, passo 1 do cabeçalho) **remove os
  blocos de texto do PDF** antes de renderizar o fundo; o texto vira blocos
  editáveis no modelo, nunca pixel na imagem.
- Os 63 contratos emitidos usam as **mesmas 11 imagens** (as 11 páginas do
  modelo em uso). Se houvesse dado de cliente nelas, cada contrato teria as suas.

Fechar o bucket protegeria a marca da loja, e custaria caro: o contrato emitido
é HTML que usa o fundo por URL (`lib/contrato-modelo.ts`), e os 63 contratos
arquivados em `contratos_venda.html` têm a URL pública gravada dentro. Com o
bucket privado, a 2ª via desses 63 sairia sem capa e sem papel timbrado, a menos
que a URL fosse reassinada a cada impressão. Além disso, o vendedor emite e
imprime contrato no PDV, na Encomenda, nos Termos e no Histórico, e precisa do
fundo.

## Onde o dado sensível realmente está

Na tabela **`contratos_venda`**, colunas **`dados`** (o comprador: nome, CPF,
endereço, estado civil…) e **`html`** (o contrato montado). Ela tem RLS ligada:

- `contrato_tenant_select` e `contrato_tenant_insert`: só a empresa atual
  (`get_empresa_id()`) e só as lojas visíveis ao usuário (`filiais_visiveis()`).
- Sem política de UPDATE nem de DELETE: ninguém fora do service role altera ou
  apaga um contrato arquivado.

Matriz medida em 16/10 (63 contratos: 32 na loja 3, 31 na loja 6): admin na
rede vê 63; vendedor de cada loja vê só a sua; outra empresa vê 0; superadmin
sem impersonar vê 0; anônimo é recusado. Nenhum código lê a tabela com o service
role, e nenhuma rota pública, cache ou service worker entrega esse HTML.

A escrita nas tabelas de contrato tem um problema separado, registrado em
`docs/ACHADO-CONTRATOS-ESCRITA-20261016.md`.

## Quando reavaliar (obrigatório)

Esta decisão vale **só enquanto** as duas condições abaixo forem verdadeiras.
Se qualquer uma mudar, o bucket precisa virar privado com URL assinada:

1. **O bucket guarda apenas fundos de modelo.** Se passar a guardar PDF ou
   imagem de contrato emitido, contrato assinado escaneado, documento de cliente
   ou qualquer arquivo com dado pessoal — reavaliar antes de publicar a mudança.
2. **Nenhum fluxo envia link de contrato ao cliente.** Hoje o contrato só é
   impresso pelo navegador (`imprimirContratoHTML`) e assinado no papel. Se
   surgir envio por WhatsApp, e-mail ou link — reavaliar antes de publicar.

O teste `contratos: anônimo não lista o bucket…` em `tests/banco.test.ts`
(roda com `BANCO=1`) trava o comportamento atual: listar continua bloqueado e a
URL pública do fundo continua respondendo.
