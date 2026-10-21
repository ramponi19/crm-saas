/**
 * OS TIPOS DO BANCO QUE O APP USA.
 *
 * `database.gerado.ts` é a saída crua de `supabase gen types` — não editar, só
 * regerar (`npm run types:gen`). Este arquivo monta, por cima dele, o `Database`
 * que os clientes do Supabase recebem, com uma correção: as views de módulo do
 * core v1 (`garantias_assistencias`, `inventario_unidades`, ...) são tipadas como a
 * tabela que espelham (`views-espelho.ts`). O gerador tipa view com toda coluna
 * anulável; estas têm exatamente as colunas e restrições da tabela, e o app lê e
 * grava nelas como sempre leu e gravou (são auto-atualizáveis).
 *
 * As outras views (`leads`, `lead_mensagens`, `clientes`, `canais_conectados`,
 * ...) juntam mais de uma tabela e seguem como o gerador as entrega.
 */
import type { Database as Gerado, Json } from './database.gerado'
import type { ViewsEspelho } from './views-espelho'

type PG = Gerado['public']
type Espelhadas = { [V in keyof ViewsEspelho]: PG['Tables'][ViewsEspelho[V] & keyof PG['Tables']] }
type OutrasViews = Omit<PG['Views'], keyof ViewsEspelho>

/**
 * Nas views de compatibilidade (as que juntam tabelas e gravam por gatilho), as
 * colunas abaixo saem direto de uma coluna NOT NULL da tabela de origem
 * (`leads.id` = `negocios.id`, `clientes.id` = `contatos.id`, ...). O gerador
 * não sabe disso e as declara anuláveis. `nome` NÃO está aqui de propósito:
 * `contatos.nome` aceita nulo, e o código tem de tratar.
 */
interface ColunasObrigatorias {
  leads: 'id' | 'empresa_id' | 'created_at'
  clientes: 'id' | 'empresa_id' | 'created_at'
  lead_mensagens: 'id' | 'empresa_id' | 'direcao' | 'conteudo' | 'tipo' | 'lida' | 'created_at'
  canais_conectados: 'id' | 'empresa_id' | 'tipo' | 'status'
}
type Obrig<R, K extends string> = Omit<R, K & keyof R> & { [P in K & keyof R]-?: NonNullable<R[P]> }
type Refinadas = {
  [V in keyof ColunasObrigatorias & keyof OutrasViews]: Omit<OutrasViews[V], 'Row'> & { Row: Obrig<OutrasViews[V]['Row'], ColunasObrigatorias[V]> }
}

export type Database = Omit<Gerado, 'public'> & {
  public: Omit<PG, 'Tables' | 'Views'> & {
    Tables: PG['Tables'] & Espelhadas
    Views: Omit<OutrasViews, keyof Refinadas> & Refinadas
  }
}

export type { Json }

type S = Database['public']

export type Tables<N extends keyof S['Tables'] | keyof S['Views']> =
  N extends keyof S['Tables'] ? S['Tables'][N]['Row']
    : N extends keyof S['Views'] ? S['Views'][N]['Row']
      : never

/** Tabela, ou view que grava (as de compatibilidade gravam por gatilho INSTEAD OF). */
export type TablesInsert<N extends keyof S['Tables'] | keyof S['Views']> =
  N extends keyof S['Tables'] ? S['Tables'][N]['Insert']
    : N extends keyof S['Views'] ? (S['Views'][N] extends { Insert: infer I } ? I : never)
      : never
export type TablesUpdate<N extends keyof S['Tables'] | keyof S['Views']> =
  N extends keyof S['Tables'] ? S['Tables'][N]['Update']
    : N extends keyof S['Views'] ? (S['Views'][N] extends { Update: infer U } ? U : never)
      : never
export type Enums<N extends keyof S['Enums']> = S['Enums'][N]
