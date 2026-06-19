// Tipos gerados do banco Supabase da JM Store
// Rodar: supabase gen types typescript --project-id guiuzbcqkvelqcuogxtd > types/database.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      usuarios: {
        Row: {
          id: string
          nome: string
          email: string | null
          role: 'admin' | 'vendedor' | 'tecnico'
          modulos_acesso: string[] | null
          permissoes: Json | null
          ultimo_acesso: string | null
          created_at: string | null
        }
        Insert: Omit<Database['public']['Tables']['usuarios']['Row'], 'created_at'>
        Update: Partial<Database['public']['Tables']['usuarios']['Insert']>
      }
      clientes: {
        Row: {
          id: number
          nome: string
          email: string | null
          telefone: string | null
          cpf_cnpj: string | null
          cpf_validado: boolean | null
          cnpj_validado: boolean | null
          data_nascimento: string | null
          endereco: string | null
          numero: string | null
          complemento: string | null
          bairro: string | null
          cidade: string | null
          estado: string | null
          cep: string | null
          tipo_cliente: 'novo' | 'recorrente' | 'vip' | null
          instagram: string | null
          origem_cliente: string | null
          observacoes: string | null
          ativo: boolean | null
          usuario_id: string | null
          created_at: string | null
        }
        Insert: Omit<Database['public']['Tables']['clientes']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['clientes']['Insert']>
      }
      vendas: {
        Row: {
          id: number
          cliente_id: number | null
          vendedor_id: string | null
          valor_venda: number
          valor_custo: number | null
          lucro: number | null
          forma_pagamento: string | null
          parcelas: number | null
          canal_venda: string | null
          desconto_valor: number | null
          desconto_motivo: string | null
          desconto_aprovado_por: string | null
          observacoes: string | null
          usuario_id: string | null
          data_venda: string | null
          created_at: string | null
          status: 'concluida' | 'cancelada' | 'pendente' | null
          numero_serie: string | null
          comissao: number | null
          produto_id: number | null
        }
        Insert: Omit<Database['public']['Tables']['vendas']['Row'], 'id' | 'lucro' | 'created_at'>
        Update: Partial<Database['public']['Tables']['vendas']['Insert']>
      }
      leads: {
        Row: {
          id: number
          nome: string | null
          telefone: string | null
          instagram: string | null
          origem: string | null
          kanban_status: 'novo' | 'contato' | 'proposta' | 'negociacao' | 'convertido' | 'perdido' | null
          responsavel_id: string | null
          convertido_em: number | null
          observacoes: string | null
          created_at: string | null
          origem_id: string | null
          ativo: boolean | null
          primeira_msg: string | null
          msgs_nao_lidas: number | null
          ultima_tratativa: string | null
          data_transferencia_funil: string | null
          ultima_mensagem_at: string | null
          produto_interessado: string | null
        }
        Insert: Omit<Database['public']['Tables']['leads']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['leads']['Insert']>
      }
      lead_mensagens: {
        Row: {
          id: number
          lead_id: number | null
          direcao: 'entrada' | 'saida'
          conteudo: string
          origem: string | null
          lida: boolean | null
          created_at: string | null
        }
        Insert: Omit<Database['public']['Tables']['lead_mensagens']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['lead_mensagens']['Insert']>
      }
      produtos: {
        Row: {
          id: number
          nome: string
          marca_id: number | null
          categoria_id: number | null
          subcategoria_id: number | null
          cores: string[] | null
          armazenamentos: string[] | null
          ativo: boolean | null
          created_at: string | null
          codigos: string | null
          categoria_tipo: string | null
        }
        Insert: Omit<Database['public']['Tables']['produtos']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['produtos']['Insert']>
      }
      inventario_unidades: {
        Row: {
          id: number
          produto_id: number | null
          imei: string | null
          imei2: string | null
          numero_serie: string | null
          bateria: string | null
          condicao: string | null
          cor: string | null
          armazenamento: string | null
          preco_custo: number | null
          preco_venda: number | null
          fornecedor_id: number | null
          observacoes: string | null
          imagem_url: string | null
          status: 'disponivel' | 'vendido' | 'reservado' | 'assistencia' | null
          usuario_id: string | null
          ativo: boolean | null
          created_at: string | null
          anatel_resultado: string | null
          tipo: 'compra' | 'seminovo' | null
          estado: 'lacrado' | 'usado' | null
          custo_reparo: number | null
          inventario_unidade_id: string | null
          cliente_id: number | null
          fotos_urls: string | null
        }
        Insert: Omit<Database['public']['Tables']['inventario_unidades']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['inventario_unidades']['Insert']>
      }
      garantias_assistencias: {
        Row: {
          id: number
          tipo: 'assistencia' | 'garantia' | null
          protocolo: string | null
          cliente_id: number | null
          produto_id: number | null
          usuario_id: string | null
          responsavel_tecnico_id: string | null
          imei_serial: string | null
          defeito_relatado: string | null
          estado_entrada: string | null
          parecer_tecnico: string | null
          orcamento_valor: number | null
          celular_reserva_fornecido: boolean | null
          modelo_reserva: string | null
          dentro_garantia: boolean | null
          dias_garantia_restantes: number | null
          status: string | null
          observacoes: string | null
          data_entrada: string | null
          created_at: string | null
          inventario_unidade_id: string | null
        }
        Insert: Omit<Database['public']['Tables']['garantias_assistencias']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['garantias_assistencias']['Insert']>
      }
      configuracoes: {
        Row: {
          id: number
          zapi_instance_id: string | null
          zapi_token: string | null
          zapi_api_url: string | null
          zapi_ativo: boolean | null
          zapi_client_token: string | null
          messenger_page_id: string | null
          messenger_token: string | null
          messenger_ativo: boolean | null
          instagram_page_id: string | null
          instagram_token: string | null
          instagram_ativo: boolean | null
          updated_at: string | null
          wl_empresa: string | null
          wl_slogan: string | null
          wl_cor: string | null
          wl_logo_url: string | null
          wl_whatsapp: string | null
        }
        Insert: Omit<Database['public']['Tables']['configuracoes']['Row'], 'id'>
        Update: Partial<Database['public']['Tables']['configuracoes']['Insert']>
      }
    }
    Views: {}
    Functions: {}
    Enums: {}
  }
}

// Atalhos úteis
export type Usuario = Database['public']['Tables']['usuarios']['Row']
export type Cliente = Database['public']['Tables']['clientes']['Row']
export type Venda = Database['public']['Tables']['vendas']['Row']
export type Lead = Database['public']['Tables']['leads']['Row']
export type LeadMensagem = Database['public']['Tables']['lead_mensagens']['Row']
export type Produto = Database['public']['Tables']['produtos']['Row']
export type InventarioUnidade = Database['public']['Tables']['inventario_unidades']['Row']
export type GarantiaAssistencia = Database['public']['Tables']['garantias_assistencias']['Row']
export type Configuracoes = Database['public']['Tables']['configuracoes']['Row']
