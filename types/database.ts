/**
 * OS TIPOS DO BANCO QUE O APP USA.
 *
 * `database.gerado.ts` é a saída de `supabase gen types` (no formato da CLI antiga;
 * desde 04/11/2026 ele é ajustado à mão a cada drop, só com deleções — a CLI nova
 * gera outro formato). Este arquivo exporta o `Database` e os atalhos.
 *
 * Até 05/11/2026 ele também corrigia as views de compatibilidade do corte para o
 * core v1: as 37 views de módulo eram tipadas como a tabela que espelhavam
 * (`views-espelho.ts`) e `leads`/`lead_mensagens` ganhavam colunas obrigatórias.
 * As 41 caíram (último lote: leads e lead_mensagens); no `public` sobra só a view
 * `storage_orfaos`, e o `Database` é o gerado, sem correção.
 */
import type { Database as Gerado, Json } from './database.gerado'

export type Database = Gerado

export type { Json }

type S = Database['public']

export type Tables<N extends keyof S['Tables'] | keyof S['Views']> =
  N extends keyof S['Tables'] ? S['Tables'][N]['Row']
    : N extends keyof S['Views'] ? S['Views'][N]['Row']
      : never

export type TablesInsert<N extends keyof S['Tables']> = S['Tables'][N]['Insert']
export type TablesUpdate<N extends keyof S['Tables']> = S['Tables'][N]['Update']
export type Enums<N extends keyof S['Enums']> = S['Enums'][N]
