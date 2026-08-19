export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      acessos: {
        Row: {
          created_at: string | null
          empresa_id: number
          entrada: string
          fim_por: string | null
          id: number
          saida: string | null
          ultimo_sinal: string
          usuario_id: string
        }
        Insert: {
          created_at?: string | null
          empresa_id: number
          entrada?: string
          fim_por?: string | null
          id?: number
          saida?: string | null
          ultimo_sinal?: string
          usuario_id: string
        }
        Update: {
          created_at?: string | null
          empresa_id?: number
          entrada?: string
          fim_por?: string | null
          id?: number
          saida?: string | null
          ultimo_sinal?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "acessos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acessos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acessos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      assistente_config: {
        Row: {
          ativo: boolean
          id: number
          limite_por_min: number
          modelo: string
          system_extra: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          id?: number
          limite_por_min?: number
          modelo?: string
          system_extra?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          id?: number
          limite_por_min?: number
          modelo?: string
          system_extra?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      assistente_uso: {
        Row: {
          created_at: string
          empresa_id: number
          id: number
          tokens_in: number | null
          tokens_out: number | null
        }
        Insert: {
          created_at?: string
          empresa_id: number
          id?: never
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Update: {
          created_at?: string
          empresa_id?: number
          id?: never
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Relationships: []
      }
      automacoes: {
        Row: {
          acao: string
          ativo: boolean
          config: Json
          created_at: string
          empresa_id: number
          etapa_slug: string | null
          gatilho: string
          horas: number | null
          id: number
        }
        Insert: {
          acao: string
          ativo?: boolean
          config?: Json
          created_at?: string
          empresa_id: number
          etapa_slug?: string | null
          gatilho: string
          horas?: number | null
          id?: never
        }
        Update: {
          acao?: string
          ativo?: boolean
          config?: Json
          created_at?: string
          empresa_id?: number
          etapa_slug?: string | null
          gatilho?: string
          horas?: number | null
          id?: never
        }
        Relationships: [
          {
            foreignKeyName: "automacoes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automacoes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
        ]
      }
      avaliacoes_usados: {
        Row: {
          created_at: string | null
          empresa_id: number
          fotos_urls: string | null
          id: number
          km: number | null
          lead_id: number | null
          observacoes: string | null
          status: string
          unidade_id: number | null
          usuario_id: string | null
          valor_mercado: number | null
          valor_ofertado: number | null
          veiculo: Json | null
        }
        Insert: {
          created_at?: string | null
          empresa_id: number
          fotos_urls?: string | null
          id?: never
          km?: number | null
          lead_id?: number | null
          observacoes?: string | null
          status?: string
          unidade_id?: number | null
          usuario_id?: string | null
          valor_mercado?: number | null
          valor_ofertado?: number | null
          veiculo?: Json | null
        }
        Update: {
          created_at?: string | null
          empresa_id?: number
          fotos_urls?: string | null
          id?: never
          km?: number | null
          lead_id?: number | null
          observacoes?: string | null
          status?: string
          unidade_id?: number | null
          usuario_id?: string | null
          valor_mercado?: number | null
          valor_ofertado?: number | null
          veiculo?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "avaliacoes_usados_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avaliacoes_usados_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avaliacoes_usados_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avaliacoes_usados_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "inventario_unidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avaliacoes_usados_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "v_inventario_veiculo"
            referencedColumns: ["unidade_id"]
          },
        ]
      }
      avisos_plataforma: {
        Row: {
          alvo: string
          alvo_valor: string | null
          ativo: boolean
          corpo: string
          created_at: string
          expira_em: string | null
          id: number
          titulo: string
          tom: string
        }
        Insert: {
          alvo?: string
          alvo_valor?: string | null
          ativo?: boolean
          corpo?: string
          created_at?: string
          expira_em?: string | null
          id?: never
          titulo: string
          tom?: string
        }
        Update: {
          alvo?: string
          alvo_valor?: string | null
          ativo?: boolean
          corpo?: string
          created_at?: string
          expira_em?: string | null
          id?: never
          titulo?: string
          tom?: string
        }
        Relationships: []
      }
      cadencia_execucoes: {
        Row: {
          canal: string | null
          created_at: string | null
          empresa_id: number
          executado_por: string | null
          id: number
          inscricao_id: number
          observacao: string | null
          passo_ordem: number | null
          resultado: string | null
        }
        Insert: {
          canal?: string | null
          created_at?: string | null
          empresa_id: number
          executado_por?: string | null
          id?: never
          inscricao_id: number
          observacao?: string | null
          passo_ordem?: number | null
          resultado?: string | null
        }
        Update: {
          canal?: string | null
          created_at?: string | null
          empresa_id?: number
          executado_por?: string | null
          id?: never
          inscricao_id?: number
          observacao?: string | null
          passo_ordem?: number | null
          resultado?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cadencia_execucoes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cadencia_execucoes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cadencia_execucoes_inscricao_id_fkey"
            columns: ["inscricao_id"]
            isOneToOne: false
            referencedRelation: "cadencia_inscricoes"
            referencedColumns: ["id"]
          },
        ]
      }
      cadencia_inscricoes: {
        Row: {
          cadencia_id: number
          concluida_em: string | null
          created_at: string | null
          empresa_id: number
          id: number
          lead_id: number
          passo_ordem: number
          proxima_acao_em: string | null
          responsavel_id: string | null
          status: string
        }
        Insert: {
          cadencia_id: number
          concluida_em?: string | null
          created_at?: string | null
          empresa_id: number
          id?: never
          lead_id: number
          passo_ordem?: number
          proxima_acao_em?: string | null
          responsavel_id?: string | null
          status?: string
        }
        Update: {
          cadencia_id?: number
          concluida_em?: string | null
          created_at?: string | null
          empresa_id?: number
          id?: never
          lead_id?: number
          passo_ordem?: number
          proxima_acao_em?: string | null
          responsavel_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "cadencia_inscricoes_cadencia_id_fkey"
            columns: ["cadencia_id"]
            isOneToOne: false
            referencedRelation: "cadencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cadencia_inscricoes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cadencia_inscricoes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cadencia_inscricoes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      cadencia_passos: {
        Row: {
          cadencia_id: number
          canal: string
          created_at: string | null
          dia_offset: number
          empresa_id: number
          id: number
          ordem: number
          template_chave: string | null
          titulo: string
        }
        Insert: {
          cadencia_id: number
          canal?: string
          created_at?: string | null
          dia_offset?: number
          empresa_id: number
          id?: never
          ordem: number
          template_chave?: string | null
          titulo: string
        }
        Update: {
          cadencia_id?: number
          canal?: string
          created_at?: string | null
          dia_offset?: number
          empresa_id?: number
          id?: never
          ordem?: number
          template_chave?: string | null
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "cadencia_passos_cadencia_id_fkey"
            columns: ["cadencia_id"]
            isOneToOne: false
            referencedRelation: "cadencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cadencia_passos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cadencia_passos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
        ]
      }
      cadencias: {
        Row: {
          ativo: boolean
          created_at: string | null
          descricao: string | null
          empresa_id: number
          gatilho: string
          gatilho_etapa_slug: string | null
          id: number
          nome: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string | null
          descricao?: string | null
          empresa_id: number
          gatilho?: string
          gatilho_etapa_slug?: string | null
          id?: never
          nome: string
        }
        Update: {
          ativo?: boolean
          created_at?: string | null
          descricao?: string | null
          empresa_id?: number
          gatilho?: string
          gatilho_etapa_slug?: string | null
          id?: never
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "cadencias_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cadencias_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
        ]
      }
      campanhas_fidelidade: {
        Row: {
          ativo: boolean
          created_at: string | null
          dias: number | null
          empresa_id: number
          gatilho: string
          id: number
          nome: string
          titulo: string | null
        }
        Insert: {
          ativo?: boolean
          created_at?: string | null
          dias?: number | null
          empresa_id: number
          gatilho: string
          id?: never
          nome: string
          titulo?: string | null
        }
        Update: {
          ativo?: boolean
          created_at?: string | null
          dias?: number | null
          empresa_id?: number
          gatilho?: string
          id?: never
          nome?: string
          titulo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campanhas_fidelidade_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campanhas_fidelidade_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
        ]
      }
      canais_conectados: {
        Row: {
          access_token_enc: string | null
          coexistencia: boolean
          conectado_em: string
          created_at: string
          criado_por: string | null
          data_access_expira_em: string | null
          empresa_id: number
          external_id: string
          id: number
          ig_user_id: string | null
          nome_exibicao: string | null
          status: string
          sync_contatos_em: string | null
          sync_historico_em: string | null
          sync_historico_pct: number | null
          sync_request_ids: Json
          tipo: string
          token_expira_em: string | null
          ultima_msg_em: string | null
          ultimo_erro: string | null
          ultimo_erro_em: string | null
          updated_at: string
          waba_id: string | null
        }
        Insert: {
          access_token_enc?: string | null
          coexistencia?: boolean
          conectado_em?: string
          created_at?: string
          criado_por?: string | null
          data_access_expira_em?: string | null
          empresa_id: number
          external_id: string
          id?: number
          ig_user_id?: string | null
          nome_exibicao?: string | null
          status?: string
          sync_contatos_em?: string | null
          sync_historico_em?: string | null
          sync_historico_pct?: number | null
          sync_request_ids?: Json
          tipo: string
          token_expira_em?: string | null
          ultima_msg_em?: string | null
          ultimo_erro?: string | null
          ultimo_erro_em?: string | null
          updated_at?: string
          waba_id?: string | null
        }
        Update: {
          access_token_enc?: string | null
          coexistencia?: boolean
          conectado_em?: string
          created_at?: string
          criado_por?: string | null
          data_access_expira_em?: string | null
          empresa_id?: number
          external_id?: string
          id?: number
          ig_user_id?: string | null
          nome_exibicao?: string | null
          status?: string
          sync_contatos_em?: string | null
          sync_historico_em?: string | null
          sync_historico_pct?: number | null
          sync_request_ids?: Json
          tipo?: string
          token_expira_em?: string | null
          ultima_msg_em?: string | null
          ultimo_erro?: string | null
          ultimo_erro_em?: string | null
          updated_at?: string
          waba_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "canais_conectados_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canais_conectados_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
        ]
      }
      categorias_produtos: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          empresa_id: number
          id: number
          nome: string
          ordem: number | null
          tipo_formulario: string | null
          usuario_id: string | null
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          empresa_id: number
          id?: never
          nome: string
          ordem?: number | null
          tipo_formulario?: string | null
          usuario_id?: string | null
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          empresa_id?: number
          id?: never
          nome?: string
          ordem?: number | null
          tipo_formulario?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categorias_produtos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categorias_produtos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categorias_produtos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      chamadas: {
        Row: {
          created_at: string | null
          direcao: string
          duracao_seg: number | null
          empresa_id: number
          id: number
          lead_id: number | null
          observacao: string | null
          resultado: string
          usuario_id: string | null
        }
        Insert: {
          created_at?: string | null
          direcao?: string
          duracao_seg?: number | null
          empresa_id: number
          id?: never
          lead_id?: number | null
          observacao?: string | null
          resultado?: string
          usuario_id?: string | null
        }
        Update: {
          created_at?: string | null
          direcao?: string
          duracao_seg?: number | null
          empresa_id?: number
          id?: never
          lead_id?: number | null
          observacao?: string | null
          resultado?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chamadas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chamadas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chamadas_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      chaves_imoveis: {
        Row: {
          codigo: string | null
          com_quem: string | null
          created_at: string | null
          devolucao_prevista: string | null
          empresa_id: number
          id: number
          imovel_id: number | null
          observacoes: string | null
          retirada_em: string | null
          status: string
          usuario_id: string | null
        }
        Insert: {
          codigo?: string | null
          com_quem?: string | null
          created_at?: string | null
          devolucao_prevista?: string | null
          empresa_id: number
          id?: never
          imovel_id?: number | null
          observacoes?: string | null
          retirada_em?: string | null
          status?: string
          usuario_id?: string | null
        }
        Update: {
          codigo?: string | null
          com_quem?: string | null
          created_at?: string | null
          devolucao_prevista?: string | null
          empresa_id?: number
          id?: never
          imovel_id?: number | null
          observacoes?: string | null
          retirada_em?: string | null
          status?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chaves_imoveis_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chaves_imoveis_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chaves_imoveis_imovel_id_fkey"
            columns: ["imovel_id"]
            isOneToOne: false
            referencedRelation: "imoveis"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          ativo: boolean | null
          bairro: string | null
          cep: string | null
          cidade: string | null
          cnpj_validado: boolean | null
          complemento: string | null
          cpf_cnpj: string | null
          cpf_validado: boolean | null
          created_at: string | null
          data_nascimento: string | null
          email: string | null
          empresa_id: number
          endereco: string | null
          estado: string | null
          estado_civil: string | null
          id: number
          instagram: string | null
          nacionalidade: string | null
          nome: string
          numero: string | null
          observacoes: string | null
          origem_cliente: string | null
          profissao: string | null
          telefone: string | null
          tipo_cliente: string | null
          usuario_id: string | null
        }
        Insert: {
          ativo?: boolean | null
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          cnpj_validado?: boolean | null
          complemento?: string | null
          cpf_cnpj?: string | null
          cpf_validado?: boolean | null
          created_at?: string | null
          data_nascimento?: string | null
          email?: string | null
          empresa_id: number
          endereco?: string | null
          estado?: string | null
          estado_civil?: string | null
          id?: never
          instagram?: string | null
          nacionalidade?: string | null
          nome: string
          numero?: string | null
          observacoes?: string | null
          origem_cliente?: string | null
          profissao?: string | null
          telefone?: string | null
          tipo_cliente?: string | null
          usuario_id?: string | null
        }
        Update: {
          ativo?: boolean | null
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          cnpj_validado?: boolean | null
          complemento?: string | null
          cpf_cnpj?: string | null
          cpf_validado?: boolean | null
          created_at?: string | null
          data_nascimento?: string | null
          email?: string | null
          empresa_id?: number
          endereco?: string | null
          estado?: string | null
          estado_civil?: string | null
          id?: never
          instagram?: string | null
          nacionalidade?: string | null
          nome?: string
          numero?: string | null
          observacoes?: string | null
          origem_cliente?: string | null
          profissao?: string | null
          telefone?: string | null
          tipo_cliente?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clientes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      cobrancas: {
        Row: {
          cliente_id: number | null
          created_at: string
          descricao: string | null
          empresa_id: number
          id: number
          linha_digitavel: string | null
          link_pagamento: string | null
          metadata: Json | null
          os_id: number | null
          pago_em: string | null
          provider: string
          provider_ref: string | null
          qr_code: string | null
          qr_code_base64: string | null
          status: string
          tipo: string
          valor: number
          vencimento: string | null
          venda_id: number | null
        }
        Insert: {
          cliente_id?: number | null
          created_at?: string
          descricao?: string | null
          empresa_id: number
          id?: never
          linha_digitavel?: string | null
          link_pagamento?: string | null
          metadata?: Json | null
          os_id?: number | null
          pago_em?: string | null
          provider: string
          provider_ref?: string | null
          qr_code?: string | null
          qr_code_base64?: string | null
          status?: string
          tipo: string
          valor: number
          vencimento?: string | null
          venda_id?: number | null
        }
        Update: {
          cliente_id?: number | null
          created_at?: string
          descricao?: string | null
          empresa_id?: number
          id?: never
          linha_digitavel?: string | null
          link_pagamento?: string | null
          metadata?: Json | null
          os_id?: number | null
          pago_em?: string | null
          provider?: string
          provider_ref?: string | null
          qr_code?: string | null
          qr_code_base64?: string | null
          status?: string
          tipo?: string
          valor?: number
          vencimento?: string | null
          venda_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cobrancas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobrancas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobrancas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobrancas_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "garantias_assistencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobrancas_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      comissoes: {
        Row: {
          created_at: string | null
          data_pagamento: string | null
          empresa_id: number
          id: number
          mes_referencia: string | null
          percentual: number | null
          status: string | null
          usuario_id: string | null
          valor_comissao: number | null
          venda_id: number | null
          zerado_em: string | null
          zerado_por: string | null
        }
        Insert: {
          created_at?: string | null
          data_pagamento?: string | null
          empresa_id: number
          id?: never
          mes_referencia?: string | null
          percentual?: number | null
          status?: string | null
          usuario_id?: string | null
          valor_comissao?: number | null
          venda_id?: number | null
          zerado_em?: string | null
          zerado_por?: string | null
        }
        Update: {
          created_at?: string | null
          data_pagamento?: string | null
          empresa_id?: number
          id?: never
          mes_referencia?: string | null
          percentual?: number | null
          status?: string | null
          usuario_id?: string | null
          valor_comissao?: number | null
          venda_id?: number | null
          zerado_em?: string | null
          zerado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comissoes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_zerado_por_fkey"
            columns: ["zerado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      complementos_empresa: {
        Row: {
          atualizado_em: string
          criado_em: string
          empresa_id: number
          zapintel_ativo: boolean
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          empresa_id: number
          zapintel_ativo?: boolean
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          empresa_id?: number
          zapintel_ativo?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "tracker_addons_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: true
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracker_addons_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: true
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracoes_sistema: {
        Row: {
          chave: string
          empresa_id: number
          id: number
          updated_at: string | null
          valor: Json | null
        }
        Insert: {
          chave: string
          empresa_id: number
          id?: never
          updated_at?: string | null
          valor?: Json | null
        }
        Update: {
          chave?: string
          empresa_id?: number
          id?: never
          updated_at?: string | null
          valor?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "configuracoes_sistema_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "configuracoes_sistema_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
        ]
      }
      contrato_documentos: {
        Row: {
          arquivado: boolean
          created_at: string
          criado_por: string | null
          empresa_id: number
          id: number
          nome: string
          updated_at: string
        }
        Insert: {
          arquivado?: boolean
          created_at?: string
          criado_por?: string | null
          empresa_id: number
          id?: never
          nome: string
          updated_at?: string
        }
        Update: {
          arquivado?: boolean
          created_at?: string
          criado_por?: string | null
          empresa_id?: number
          id?: never
          nome?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contrato_documentos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_documentos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_documentos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
        ]
      }
      contrato_modelos: {
        Row: {
          ativo: boolean
          created_at: string
          criado_por: string | null
          documento_id: number
          empresa_id: number
          id: number
          paginas: Json
          versao: number
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          criado_por?: string | null
          documento_id: number
          empresa_id: number
          id?: never
          paginas?: Json
          versao: number
        }
        Update: {
          ativo?: boolean
          created_at?: string
          criado_por?: string | null
          documento_id?: number
          empresa_id?: number
          id?: never
          paginas?: Json
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "contrato_modelos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_modelos_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "contrato_documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_modelos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_modelos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
        ]
      }
      contratos_venda: {
        Row: {
          cliente_id: number | null
          created_at: string
          criado_por: string | null
          dados: Json
          documento_id: number | null
          empresa_id: number
          garantia_dias: number | null
          html: string
          id: number
          nome_documento: string | null
          venda_ids: number[]
        }
        Insert: {
          cliente_id?: number | null
          created_at?: string
          criado_por?: string | null
          dados: Json
          documento_id?: number | null
          empresa_id: number
          garantia_dias?: number | null
          html: string
          id?: never
          nome_documento?: string | null
          venda_ids: number[]
        }
        Update: {
          cliente_id?: number | null
          created_at?: string
          criado_por?: string | null
          dados?: Json
          documento_id?: number | null
          empresa_id?: number
          garantia_dias?: number | null
          html?: string
          id?: never
          nome_documento?: string | null
          venda_ids?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "contratos_venda_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_venda_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_venda_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "contrato_documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_venda_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_venda_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
        ]
      }
      diagnostico_canais: {
        Row: {
          created_at: string
          dados: Json
          empresa_id: number | null
          etapa: string
          id: number
          origem_url: string | null
        }
        Insert: {
          created_at?: string
          dados?: Json
          empresa_id?: number | null
          etapa: string
          id?: number
          origem_url?: string | null
        }
        Update: {
          created_at?: string
          dados?: Json
          empresa_id?: number | null
          etapa?: string
          id?: number
          origem_url?: string | null
        }
        Relationships: []
      }
      distribuicao_regras: {
        Row: {
          ativo: boolean
          config: Json
          created_at: string | null
          criterio: string
          destinatarios: Json
          empresa_id: number
          id: number
          nome: string
          ordem: number
          rodizio_ptr: number
        }
        Insert: {
          ativo?: boolean
          config?: Json
          created_at?: string | null
          criterio?: string
          destinatarios?: Json
          empresa_id: number
          id?: never
          nome: string
          ordem?: number
          rodizio_ptr?: number
        }
        Update: {
          ativo?: boolean
          config?: Json
          created_at?: string | null
          criterio?: string
          destinatarios?: Json
          empresa_id?: number
          id?: never
          nome?: string
          ordem?: number
          rodizio_ptr?: number
        }
        Relationships: [
          {
            foreignKeyName: "distribuicao_regras_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribuicao_regras_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
        ]
      }
      empresa_usuarios: {
        Row: {
          ativo: boolean | null
          ausente: boolean
          ausente_em: string | null
          created_at: string | null
          empresa_id: number
          id: number
          role: string
          usuario_id: string
        }
        Insert: {
          ativo?: boolean | null
          ausente?: boolean
          ausente_em?: string | null
          created_at?: string | null
          empresa_id: number
          id?: number
          role?: string
          usuario_id: string
        }
        Update: {
          ativo?: boolean | null
          ausente?: boolean
          ausente_em?: string | null
          created_at?: string | null
          empresa_id?: number
          id?: number
          role?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "empresa_usuarios_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "empresa_usuarios_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "empresa_usuarios_usuario_public_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      empresas: {
        Row: {
          bairro: string | null
          cep: string | null
          cidade: string | null
          cnpj: string | null
          complemento: string | null
          created_at: string | null
          demo: boolean | null
          email: string | null
          endereco: string | null
          estado: string | null
          id: number
          limite_leads: number | null
          limite_usuarios: number | null
          menu_config: Json | null
          menu_override: Json | null
          modulos_override: Json | null
          nome: string
          numero: string | null
          permissoes: Json | null
          plano: string
          representante_cpf: string | null
          representante_nome: string | null
          segmento: string
          slug: string
          status: string
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_status: string | null
          stripe_subscription_id: string | null
          telefone: string | null
          trial_ends_at: string | null
          updated_at: string | null
          wl_cor: string | null
          wl_logo_url: string | null
          wl_menu: Json | null
          wl_slogan: string | null
          wl_whatsapp: string | null
        }
        Insert: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          cnpj?: string | null
          complemento?: string | null
          created_at?: string | null
          demo?: boolean | null
          email?: string | null
          endereco?: string | null
          estado?: string | null
          id?: number
          limite_leads?: number | null
          limite_usuarios?: number | null
          menu_config?: Json | null
          menu_override?: Json | null
          modulos_override?: Json | null
          nome: string
          numero?: string | null
          permissoes?: Json | null
          plano?: string
          representante_cpf?: string | null
          representante_nome?: string | null
          segmento?: string
          slug: string
          status?: string
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_status?: string | null
          stripe_subscription_id?: string | null
          telefone?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
          wl_cor?: string | null
          wl_logo_url?: string | null
          wl_menu?: Json | null
          wl_slogan?: string | null
          wl_whatsapp?: string | null
        }
        Update: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          cnpj?: string | null
          complemento?: string | null
          created_at?: string | null
          demo?: boolean | null
          email?: string | null
          endereco?: string | null
          estado?: string | null
          id?: number
          limite_leads?: number | null
          limite_usuarios?: number | null
          menu_config?: Json | null
          menu_override?: Json | null
          modulos_override?: Json | null
          nome?: string
          numero?: string | null
          permissoes?: Json | null
          plano?: string
          representante_cpf?: string | null
          representante_nome?: string | null
          segmento?: string
          slug?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_status?: string | null
          stripe_subscription_id?: string | null
          telefone?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
          wl_cor?: string | null
          wl_logo_url?: string | null
          wl_menu?: Json | null
          wl_slogan?: string | null
          wl_whatsapp?: string | null
        }
        Relationships: []
      }
      fichas_financiamento: {
        Row: {
          banco: string | null
          created_at: string | null
          empresa_id: number
          entrada: number | null
          id: number
          lead_id: number | null
          observacoes: string | null
          parcelas: number | null
          status: string
          taxa: number | null
          usuario_id: string | null
          valor: number | null
        }
        Insert: {
          banco?: string | null
          created_at?: string | null
          empresa_id: number
          entrada?: number | null
          id?: never
          lead_id?: number | null
          observacoes?: string | null
          parcelas?: number | null
          status?: string
          taxa?: number | null
          usuario_id?: string | null
          valor?: number | null
        }
        Update: {
          banco?: string | null
          created_at?: string | null
          empresa_id?: number
          entrada?: number | null
          id?: never
          lead_id?: number | null
          observacoes?: string | null
          parcelas?: number | null
          status?: string
          taxa?: number | null
          usuario_id?: string | null
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fichas_financiamento_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fichas_financiamento_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fichas_financiamento_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      fipe_consultas: {
        Row: {
          ano: string
          ano_label: string | null
          codigo_fipe: string | null
          codigo_marca: number
          codigo_modelo: number
          criado_em: string | null
          id: number
          marca_nome: string | null
          mes_referencia: string | null
          modelo_nome: string | null
          referencia_codigo: number
          tipo: number
          valor: number | null
        }
        Insert: {
          ano: string
          ano_label?: string | null
          codigo_fipe?: string | null
          codigo_marca: number
          codigo_modelo: number
          criado_em?: string | null
          id?: never
          marca_nome?: string | null
          mes_referencia?: string | null
          modelo_nome?: string | null
          referencia_codigo: number
          tipo: number
          valor?: number | null
        }
        Update: {
          ano?: string
          ano_label?: string | null
          codigo_fipe?: string | null
          codigo_marca?: number
          codigo_modelo?: number
          criado_em?: string | null
          id?: never
          marca_nome?: string | null
          mes_referencia?: string | null
          modelo_nome?: string | null
          referencia_codigo?: number
          tipo?: number
          valor?: number | null
        }
        Relationships: []
      }
      fipe_referencia: {
        Row: {
          atualizado_em: string | null
          codigo: number | null
          id: number
          mes: string | null
        }
        Insert: {
          atualizado_em?: string | null
          codigo?: number | null
          id?: number
          mes?: string | null
        }
        Update: {
          atualizado_em?: string | null
          codigo?: number | null
          id?: number
          mes?: string | null
        }
        Relationships: []
      }
      followups_gerados: {
        Row: {
          chave: string
          created_at: string
          empresa_id: number
          id: number
          lead_id: number | null
          regra: string
          tarefa_id: number | null
        }
        Insert: {
          chave: string
          created_at?: string
          empresa_id: number
          id?: never
          lead_id?: number | null
          regra: string
          tarefa_id?: number | null
        }
        Update: {
          chave?: string
          created_at?: string
          empresa_id?: number
          id?: never
          lead_id?: number | null
          regra?: string
          tarefa_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "followups_gerados_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followups_gerados_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followups_gerados_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followups_gerados_tarefa_id_fkey"
            columns: ["tarefa_id"]
            isOneToOne: false
            referencedRelation: "tarefas"
            referencedColumns: ["id"]
          },
        ]
      }
      fornecedores: {
        Row: {
          ativo: boolean | null
          cnpj: string | null
          contato: string | null
          created_at: string | null
          email: string | null
          empresa_id: number
          id: number
          nome_fantasia: string
          observacoes: string | null
          razao_social: string | null
          telefone: string | null
        }
        Insert: {
          ativo?: boolean | null
          cnpj?: string | null
          contato?: string | null
          created_at?: string | null
          email?: string | null
          empresa_id: number
          id?: never
          nome_fantasia: string
          observacoes?: string | null
          razao_social?: string | null
          telefone?: string | null
        }
        Update: {
          ativo?: boolean | null
          cnpj?: string | null
          contato?: string | null
          created_at?: string | null
          email?: string | null
          empresa_id?: number
          id?: never
          nome_fantasia?: string
          observacoes?: string | null
          razao_social?: string | null
          telefone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fornecedores_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fornecedores_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
        ]
      }
      funil_etapas: {
        Row: {
          ativo: boolean
          campos_obrigatorios: Json
          cor: string
          created_at: string
          empresa_id: number
          funil_id: number | null
          id: number
          label: string
          ordem: number
          probabilidade: number
          slug: string
          tipo: string
        }
        Insert: {
          ativo?: boolean
          campos_obrigatorios?: Json
          cor?: string
          created_at?: string
          empresa_id: number
          funil_id?: number | null
          id?: number
          label: string
          ordem?: number
          probabilidade?: number
          slug: string
          tipo?: string
        }
        Update: {
          ativo?: boolean
          campos_obrigatorios?: Json
          cor?: string
          created_at?: string
          empresa_id?: number
          funil_id?: number | null
          id?: number
          label?: string
          ordem?: number
          probabilidade?: number
          slug?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "funil_etapas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funil_etapas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funil_etapas_funil_id_fkey"
            columns: ["funil_id"]
            isOneToOne: false
            referencedRelation: "funis"
            referencedColumns: ["id"]
          },
        ]
      }
      funis: {
        Row: {
          created_at: string
          empresa_id: number
          id: number
          nome: string
          padrao: boolean
        }
        Insert: {
          created_at?: string
          empresa_id: number
          id?: never
          nome: string
          padrao?: boolean
        }
        Update: {
          created_at?: string
          empresa_id?: number
          id?: never
          nome?: string
          padrao?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "funis_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funis_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
        ]
      }
      garantias_assistencias: {
        Row: {
          aprovado_em: string | null
          celular_reserva_fornecido: boolean | null
          cliente_id: number | null
          created_at: string | null
          data_entrada: string | null
          defeito_relatado: string | null
          dentro_garantia: boolean | null
          dias_garantia_restantes: number | null
          empresa_id: number
          estado_entrada: string | null
          id: number
          imei_serial: string | null
          modelo_reserva: string | null
          observacoes: string | null
          orcamento_valor: number | null
          parecer_tecnico: string | null
          produto_id: number | null
          protocolo: string | null
          recusado_em: string | null
          responsavel_tecnico_id: string | null
          status: string | null
          tipo: string | null
          token: string | null
          usuario_id: string | null
        }
        Insert: {
          aprovado_em?: string | null
          celular_reserva_fornecido?: boolean | null
          cliente_id?: number | null
          created_at?: string | null
          data_entrada?: string | null
          defeito_relatado?: string | null
          dentro_garantia?: boolean | null
          dias_garantia_restantes?: number | null
          empresa_id: number
          estado_entrada?: string | null
          id?: never
          imei_serial?: string | null
          modelo_reserva?: string | null
          observacoes?: string | null
          orcamento_valor?: number | null
          parecer_tecnico?: string | null
          produto_id?: number | null
          protocolo?: string | null
          recusado_em?: string | null
          responsavel_tecnico_id?: string | null
          status?: string | null
          tipo?: string | null
          token?: string | null
          usuario_id?: string | null
        }
        Update: {
          aprovado_em?: string | null
          celular_reserva_fornecido?: boolean | null
          cliente_id?: number | null
          created_at?: string | null
          data_entrada?: string | null
          defeito_relatado?: string | null
          dentro_garantia?: boolean | null
          dias_garantia_restantes?: number | null
          empresa_id?: number
          estado_entrada?: string | null
          id?: never
          imei_serial?: string | null
          modelo_reserva?: string | null
          observacoes?: string | null
          orcamento_valor?: number | null
          parecer_tecnico?: string | null
          produto_id?: number | null
          protocolo?: string | null
          recusado_em?: string | null
          responsavel_tecnico_id?: string | null
          status?: string | null
          tipo?: string | null
          token?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "garantias_assistencias_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "garantias_assistencias_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "garantias_assistencias_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "garantias_assistencias_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "garantias_assistencias_responsavel_tecnico_id_fkey"
            columns: ["responsavel_tecnico_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "garantias_assistencias_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      historico_bruto: {
        Row: {
          canal_id: number | null
          created_at: string
          empresa_id: number | null
          id: number
          payload: Json
          processado_em: string | null
          tipo: string
        }
        Insert: {
          canal_id?: number | null
          created_at?: string
          empresa_id?: number | null
          id?: never
          payload: Json
          processado_em?: string | null
          tipo: string
        }
        Update: {
          canal_id?: number | null
          created_at?: string
          empresa_id?: number | null
          id?: never
          payload?: Json
          processado_em?: string | null
          tipo?: string
        }
        Relationships: []
      }
      imei_consultas: {
        Row: {
          consultado_em: string
          consultado_por: string | null
          empresa_id: number
          fonte: string
          id: number
          imei: string
          motivo: string | null
          observacoes: string | null
          resultado: string
        }
        Insert: {
          consultado_em?: string
          consultado_por?: string | null
          empresa_id: number
          fonte?: string
          id?: number
          imei: string
          motivo?: string | null
          observacoes?: string | null
          resultado: string
        }
        Update: {
          consultado_em?: string
          consultado_por?: string | null
          empresa_id?: number
          fonte?: string
          id?: number
          imei?: string
          motivo?: string | null
          observacoes?: string | null
          resultado?: string
        }
        Relationships: [
          {
            foreignKeyName: "imei_consultas_consultado_por_fkey"
            columns: ["consultado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imei_consultas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imei_consultas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
        ]
      }
      imoveis: {
        Row: {
          aceita_financiamento: boolean | null
          aceita_permuta: boolean | null
          area_total: number | null
          area_util: number | null
          bairro: string | null
          banheiros: number | null
          captado_em: string | null
          captado_por: string | null
          cep: string | null
          cidade: string | null
          codigo: string | null
          complemento: string | null
          created_at: string | null
          descricao: string | null
          empresa_id: number
          finalidade: string
          fotos: Json | null
          id: number
          iptu_periodicidade: string | null
          latitude: number | null
          logradouro: string | null
          longitude: number | null
          matricula: string | null
          numero: string | null
          ocultar_numero_publico: boolean | null
          proprietario_id: number | null
          publicar_portais: boolean | null
          quartos: number | null
          status: string
          status_chaves: string | null
          suites: number | null
          tipo: string
          titulo: string | null
          uf: string | null
          updated_at: string | null
          vagas: number | null
          valor_condominio: number | null
          valor_iptu: number | null
          valor_locacao: number | null
          valor_venda: number | null
        }
        Insert: {
          aceita_financiamento?: boolean | null
          aceita_permuta?: boolean | null
          area_total?: number | null
          area_util?: number | null
          bairro?: string | null
          banheiros?: number | null
          captado_em?: string | null
          captado_por?: string | null
          cep?: string | null
          cidade?: string | null
          codigo?: string | null
          complemento?: string | null
          created_at?: string | null
          descricao?: string | null
          empresa_id: number
          finalidade?: string
          fotos?: Json | null
          id?: number
          iptu_periodicidade?: string | null
          latitude?: number | null
          logradouro?: string | null
          longitude?: number | null
          matricula?: string | null
          numero?: string | null
          ocultar_numero_publico?: boolean | null
          proprietario_id?: number | null
          publicar_portais?: boolean | null
          quartos?: number | null
          status?: string
          status_chaves?: string | null
          suites?: number | null
          tipo?: string
          titulo?: string | null
          uf?: string | null
          updated_at?: string | null
          vagas?: number | null
          valor_condominio?: number | null
          valor_iptu?: number | null
          valor_locacao?: number | null
          valor_venda?: number | null
        }
        Update: {
          aceita_financiamento?: boolean | null
          aceita_permuta?: boolean | null
          area_total?: number | null
          area_util?: number | null
          bairro?: string | null
          banheiros?: number | null
          captado_em?: string | null
          captado_por?: string | null
          cep?: string | null
          cidade?: string | null
          codigo?: string | null
          complemento?: string | null
          created_at?: string | null
          descricao?: string | null
          empresa_id?: number
          finalidade?: string
          fotos?: Json | null
          id?: number
          iptu_periodicidade?: string | null
          latitude?: number | null
          logradouro?: string | null
          longitude?: number | null
          matricula?: string | null
          numero?: string | null
          ocultar_numero_publico?: boolean | null
          proprietario_id?: number | null
          publicar_portais?: boolean | null
          quartos?: number | null
          status?: string
          status_chaves?: string | null
          suites?: number | null
          tipo?: string
          titulo?: string | null
          uf?: string | null
          updated_at?: string | null
          vagas?: number | null
          valor_condominio?: number | null
          valor_iptu?: number | null
          valor_locacao?: number | null
          valor_venda?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "imoveis_captado_por_fkey"
            columns: ["captado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imoveis_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imoveis_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imoveis_proprietario_id_fkey"
            columns: ["proprietario_id"]
            isOneToOne: false
            referencedRelation: "proprietarios"
            referencedColumns: ["id"]
          },
        ]
      }
      inventario_unidades: {
        Row: {
          anatel_resultado: string | null
          ano: number | null
          armazenamento: string | null
          ativo: boolean | null
          bateria: string | null
          chassi: string | null
          cliente_id: number | null
          condicao: string | null
          cor: string | null
          created_at: string | null
          custo_reparo: number | null
          empresa_id: number
          estado: string | null
          fornecedor_id: number | null
          fotos_urls: string | null
          grupo_pdv: string | null
          id: number
          imei: string | null
          imei2: string | null
          km: number | null
          numero_serie: string | null
          observacoes: string | null
          placa: string | null
          preco_custo: number | null
          preco_venda: number | null
          produto_id: number | null
          quantidade: number
          recebido_em: string | null
          recebido_por: string | null
          renavam: string | null
          reserva_expira_em: string | null
          reservado_em: string | null
          reservado_lead_id: number | null
          reservado_por: string | null
          status: string | null
          tipo: string | null
          usuario_id: string | null
        }
        Insert: {
          anatel_resultado?: string | null
          ano?: number | null
          armazenamento?: string | null
          ativo?: boolean | null
          bateria?: string | null
          chassi?: string | null
          cliente_id?: number | null
          condicao?: string | null
          cor?: string | null
          created_at?: string | null
          custo_reparo?: number | null
          empresa_id: number
          estado?: string | null
          fornecedor_id?: number | null
          fotos_urls?: string | null
          grupo_pdv?: string | null
          id?: number
          imei?: string | null
          imei2?: string | null
          km?: number | null
          numero_serie?: string | null
          observacoes?: string | null
          placa?: string | null
          preco_custo?: number | null
          preco_venda?: number | null
          produto_id?: number | null
          quantidade?: number
          recebido_em?: string | null
          recebido_por?: string | null
          renavam?: string | null
          reserva_expira_em?: string | null
          reservado_em?: string | null
          reservado_lead_id?: number | null
          reservado_por?: string | null
          status?: string | null
          tipo?: string | null
          usuario_id?: string | null
        }
        Update: {
          anatel_resultado?: string | null
          ano?: number | null
          armazenamento?: string | null
          ativo?: boolean | null
          bateria?: string | null
          chassi?: string | null
          cliente_id?: number | null
          condicao?: string | null
          cor?: string | null
          created_at?: string | null
          custo_reparo?: number | null
          empresa_id?: number
          estado?: string | null
          fornecedor_id?: number | null
          fotos_urls?: string | null
          grupo_pdv?: string | null
          id?: number
          imei?: string | null
          imei2?: string | null
          km?: number | null
          numero_serie?: string | null
          observacoes?: string | null
          placa?: string | null
          preco_custo?: number | null
          preco_venda?: number | null
          produto_id?: number | null
          quantidade?: number
          recebido_em?: string | null
          recebido_por?: string | null
          renavam?: string | null
          reserva_expira_em?: string | null
          reservado_em?: string | null
          reservado_lead_id?: number | null
          reservado_por?: string | null
          status?: string | null
          tipo?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventario_unidades_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_unidades_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_unidades_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_unidades_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_unidades_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_unidades_recebido_por_fkey"
            columns: ["recebido_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_unidades_reservado_lead_id_fkey"
            columns: ["reservado_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lancamentos_financeiros: {
        Row: {
          categoria: string | null
          created_at: string | null
          data_pgto: string | null
          data_venc: string
          descricao: string
          empresa_id: number
          forma_pgto: string | null
          id: number
          observacoes: string | null
          referencia_id: number | null
          referencia_tp: string | null
          status: string
          tipo: string
          updated_at: string | null
          valor: number
        }
        Insert: {
          categoria?: string | null
          created_at?: string | null
          data_pgto?: string | null
          data_venc: string
          descricao: string
          empresa_id: number
          forma_pgto?: string | null
          id?: number
          observacoes?: string | null
          referencia_id?: number | null
          referencia_tp?: string | null
          status?: string
          tipo: string
          updated_at?: string | null
          valor: number
        }
        Update: {
          categoria?: string | null
          created_at?: string | null
          data_pgto?: string | null
          data_venc?: string
          descricao?: string
          empresa_id?: number
          forma_pgto?: string | null
          id?: number
          observacoes?: string | null
          referencia_id?: number | null
          referencia_tp?: string | null
          status?: string
          tipo?: string
          updated_at?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "lancamentos_financeiros_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamentos_financeiros_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_atribuicoes: {
        Row: {
          acao: string
          created_at: string
          de_responsavel: string | null
          empresa_id: number
          id: number
          lead_id: number
          para_responsavel: string | null
          por_usuario: string | null
        }
        Insert: {
          acao: string
          created_at?: string
          de_responsavel?: string | null
          empresa_id: number
          id?: never
          lead_id: number
          para_responsavel?: string | null
          por_usuario?: string | null
        }
        Update: {
          acao?: string
          created_at?: string
          de_responsavel?: string | null
          empresa_id?: number
          id?: never
          lead_id?: number
          para_responsavel?: string | null
          por_usuario?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_atribuicoes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_atribuicoes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_atribuicoes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_mensagens: {
        Row: {
          conteudo: string
          created_at: string | null
          direcao: string
          empresa_id: number
          erro_envio: string | null
          external_id: string | null
          id: number
          lead_id: number | null
          lida: boolean | null
          midia_url: string | null
          origem: string | null
          status_em: string | null
          status_entrega: string | null
          tipo: string
          usuario_id: string | null
        }
        Insert: {
          conteudo: string
          created_at?: string | null
          direcao: string
          empresa_id: number
          erro_envio?: string | null
          external_id?: string | null
          id?: never
          lead_id?: number | null
          lida?: boolean | null
          midia_url?: string | null
          origem?: string | null
          status_em?: string | null
          status_entrega?: string | null
          tipo?: string
          usuario_id?: string | null
        }
        Update: {
          conteudo?: string
          created_at?: string | null
          direcao?: string
          empresa_id?: number
          erro_envio?: string | null
          external_id?: string | null
          id?: never
          lead_id?: number | null
          lida?: boolean | null
          midia_url?: string | null
          origem?: string | null
          status_em?: string | null
          status_entrega?: string | null
          tipo?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_mensagens_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_mensagens_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_mensagens_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_perfil_busca: {
        Row: {
          ativo: boolean
          bairros: string[]
          cidades: string[]
          created_at: string | null
          empresa_id: number
          finalidade: string | null
          id: number
          lead_id: number
          preco_max: number | null
          preco_min: number | null
          quartos_min: number | null
          tipos: string[]
          updated_at: string | null
          vagas_min: number | null
        }
        Insert: {
          ativo?: boolean
          bairros?: string[]
          cidades?: string[]
          created_at?: string | null
          empresa_id: number
          finalidade?: string | null
          id?: number
          lead_id: number
          preco_max?: number | null
          preco_min?: number | null
          quartos_min?: number | null
          tipos?: string[]
          updated_at?: string | null
          vagas_min?: number | null
        }
        Update: {
          ativo?: boolean
          bairros?: string[]
          cidades?: string[]
          created_at?: string | null
          empresa_id?: number
          finalidade?: string | null
          id?: number
          lead_id?: number
          preco_max?: number | null
          preco_min?: number | null
          quartos_min?: number | null
          tipos?: string[]
          updated_at?: string | null
          vagas_min?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_perfil_busca_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_perfil_busca_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_perfil_busca_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          anuncio: Json | null
          ativo: boolean | null
          convertido_em: number | null
          created_at: string | null
          data_transferencia_funil: string | null
          devolucoes: number
          devolvido_em: string | null
          empresa_id: number
          foto_url: string | null
          funil_id: number | null
          id: number
          instagram: string | null
          interesse: Json | null
          kanban_ordem: number | null
          kanban_status: string | null
          motivo_perda_id: number | null
          msgs_nao_lidas: number | null
          nome: string | null
          observacoes: string | null
          origem: string | null
          origem_id: string | null
          perdido_em: string | null
          primeira_msg: string | null
          produto_interessado: string | null
          responsavel_desde: string | null
          responsavel_id: string | null
          telefone: string | null
          ultima_enviada_at: string | null
          ultima_mensagem_at: string | null
          ultima_recebida_at: string | null
          ultima_tratativa: string | null
          valor_estimado: number | null
        }
        Insert: {
          anuncio?: Json | null
          ativo?: boolean | null
          convertido_em?: number | null
          created_at?: string | null
          data_transferencia_funil?: string | null
          devolucoes?: number
          devolvido_em?: string | null
          empresa_id: number
          foto_url?: string | null
          funil_id?: number | null
          id?: never
          instagram?: string | null
          interesse?: Json | null
          kanban_ordem?: number | null
          kanban_status?: string | null
          motivo_perda_id?: number | null
          msgs_nao_lidas?: number | null
          nome?: string | null
          observacoes?: string | null
          origem?: string | null
          origem_id?: string | null
          perdido_em?: string | null
          primeira_msg?: string | null
          produto_interessado?: string | null
          responsavel_desde?: string | null
          responsavel_id?: string | null
          telefone?: string | null
          ultima_enviada_at?: string | null
          ultima_mensagem_at?: string | null
          ultima_recebida_at?: string | null
          ultima_tratativa?: string | null
          valor_estimado?: number | null
        }
        Update: {
          anuncio?: Json | null
          ativo?: boolean | null
          convertido_em?: number | null
          created_at?: string | null
          data_transferencia_funil?: string | null
          devolucoes?: number
          devolvido_em?: string | null
          empresa_id?: number
          foto_url?: string | null
          funil_id?: number | null
          id?: never
          instagram?: string | null
          interesse?: Json | null
          kanban_ordem?: number | null
          kanban_status?: string | null
          motivo_perda_id?: number | null
          msgs_nao_lidas?: number | null
          nome?: string | null
          observacoes?: string | null
          origem?: string | null
          origem_id?: string | null
          perdido_em?: string | null
          primeira_msg?: string | null
          produto_interessado?: string | null
          responsavel_desde?: string | null
          responsavel_id?: string | null
          telefone?: string | null
          ultima_enviada_at?: string | null
          ultima_mensagem_at?: string | null
          ultima_recebida_at?: string | null
          ultima_tratativa?: string | null
          valor_estimado?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_convertido_em_fkey"
            columns: ["convertido_em"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_funil_id_fkey"
            columns: ["funil_id"]
            isOneToOne: false
            referencedRelation: "funis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_motivo_perda_id_fkey"
            columns: ["motivo_perda_id"]
            isOneToOne: false
            referencedRelation: "motivos_perda"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      lista_espera: {
        Row: {
          created_at: string | null
          empresa_id: number
          id: number
          nome: string
          observacao: string | null
          telefone: string | null
        }
        Insert: {
          created_at?: string | null
          empresa_id: number
          id?: never
          nome: string
          observacao?: string | null
          telefone?: string | null
        }
        Update: {
          created_at?: string | null
          empresa_id?: number
          id?: never
          nome?: string
          observacao?: string | null
          telefone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lista_espera_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lista_espera_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
        ]
      }
      marcas_produtos: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          empresa_id: number
          id: number
          nome: string
          ordem: number | null
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          empresa_id: number
          id?: never
          nome: string
          ordem?: number | null
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          empresa_id?: number
          id?: never
          nome?: string
          ordem?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "marcas_produtos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marcas_produtos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
        ]
      }
      mensagens_internas: {
        Row: {
          autor_id: string
          conteudo: string
          created_at: string | null
          destinatario_id: string | null
          empresa_id: number
          id: number
          tipo: string
        }
        Insert: {
          autor_id: string
          conteudo: string
          created_at?: string | null
          destinatario_id?: string | null
          empresa_id: number
          id?: never
          tipo?: string
        }
        Update: {
          autor_id?: string
          conteudo?: string
          created_at?: string | null
          destinatario_id?: string | null
          empresa_id?: number
          id?: never
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "mensagens_internas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagens_internas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
        ]
      }
      metas: {
        Row: {
          alvo: number
          created_at: string | null
          empresa_id: number
          escopo: string
          id: number
          periodo: string
          tipo: string
          usuario_id: string | null
        }
        Insert: {
          alvo?: number
          created_at?: string | null
          empresa_id: number
          escopo?: string
          id?: never
          periodo: string
          tipo?: string
          usuario_id?: string | null
        }
        Update: {
          alvo?: number
          created_at?: string | null
          empresa_id?: number
          escopo?: string
          id?: never
          periodo?: string
          tipo?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "metas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
        ]
      }
      metas_comissoes: {
        Row: {
          created_at: string | null
          empresa_id: number
          id: number
          mes_ano: string
          meta_vendas_qtd: number | null
          meta_vendas_valor: number | null
          percentual_comissao_padrao: number | null
          usuario_id: string | null
        }
        Insert: {
          created_at?: string | null
          empresa_id: number
          id?: never
          mes_ano: string
          meta_vendas_qtd?: number | null
          meta_vendas_valor?: number | null
          percentual_comissao_padrao?: number | null
          usuario_id?: string | null
        }
        Update: {
          created_at?: string | null
          empresa_id?: number
          id?: never
          mes_ano?: string
          meta_vendas_qtd?: number | null
          meta_vendas_valor?: number | null
          percentual_comissao_padrao?: number | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "metas_comissoes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metas_comissoes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metas_comissoes_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      modelos_mensagem: {
        Row: {
          categoria: string
          corpo: string
          created_at: string
          criado_por: string | null
          empresa_id: number
          id: number
          idioma: string
          meta_id: string | null
          motivo_recusa: string | null
          nome: string
          status: string
          ultima_sync_em: string | null
          updated_at: string
          variaveis: Json
        }
        Insert: {
          categoria?: string
          corpo: string
          created_at?: string
          criado_por?: string | null
          empresa_id: number
          id?: number
          idioma?: string
          meta_id?: string | null
          motivo_recusa?: string | null
          nome: string
          status?: string
          ultima_sync_em?: string | null
          updated_at?: string
          variaveis?: Json
        }
        Update: {
          categoria?: string
          corpo?: string
          created_at?: string
          criado_por?: string | null
          empresa_id?: number
          id?: number
          idioma?: string
          meta_id?: string | null
          motivo_recusa?: string | null
          nome?: string
          status?: string
          ultima_sync_em?: string | null
          updated_at?: string
          variaveis?: Json
        }
        Relationships: [
          {
            foreignKeyName: "modelos_mensagem_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "modelos_mensagem_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
        ]
      }
      motivos_perda: {
        Row: {
          ativo: boolean
          created_at: string
          empresa_id: number
          id: number
          label: string
          ordem: number
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          empresa_id: number
          id?: never
          label: string
          ordem?: number
        }
        Update: {
          ativo?: boolean
          created_at?: string
          empresa_id?: number
          id?: never
          label?: string
          ordem?: number
        }
        Relationships: [
          {
            foreignKeyName: "motivos_perda_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "motivos_perda_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
        ]
      }
      movimentacao_estoque: {
        Row: {
          created_at: string | null
          empresa_id: number
          id: number
          observacoes: string | null
          produto_id: number | null
          quantidade: number
          tipo_movimento: string
          usuario_id: string | null
        }
        Insert: {
          created_at?: string | null
          empresa_id: number
          id?: never
          observacoes?: string | null
          produto_id?: number | null
          quantidade: number
          tipo_movimento: string
          usuario_id?: string | null
        }
        Update: {
          created_at?: string | null
          empresa_id?: number
          id?: never
          observacoes?: string | null
          produto_id?: number | null
          quantidade?: number
          tipo_movimento?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movimentacao_estoque_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacao_estoque_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacao_estoque_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacao_estoque_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      negocios_imobiliarios: {
        Row: {
          assinado_em: string | null
          captador_id: string | null
          cashback: number
          chaves_entregues_em: string | null
          cliente_id: number | null
          comissao_captador: number | null
          comissao_paga_em: string | null
          comissao_status: string
          comissao_total: number | null
          comissao_vendedor: number | null
          corretor_id: string | null
          created_at: string
          criado_por: string | null
          empresa_id: number
          id: number
          imovel_id: number
          lead_id: number | null
          locacao_fim: string | null
          locacao_inicio: string | null
          observacoes: string | null
          percentual: number | null
          status: string
          tipo: string
          updated_at: string
          valor: number
          vistoria_em: string | null
        }
        Insert: {
          assinado_em?: string | null
          captador_id?: string | null
          cashback?: number
          chaves_entregues_em?: string | null
          cliente_id?: number | null
          comissao_captador?: number | null
          comissao_paga_em?: string | null
          comissao_status?: string
          comissao_total?: number | null
          comissao_vendedor?: number | null
          corretor_id?: string | null
          created_at?: string
          criado_por?: string | null
          empresa_id: number
          id?: number
          imovel_id: number
          lead_id?: number | null
          locacao_fim?: string | null
          locacao_inicio?: string | null
          observacoes?: string | null
          percentual?: number | null
          status?: string
          tipo: string
          updated_at?: string
          valor: number
          vistoria_em?: string | null
        }
        Update: {
          assinado_em?: string | null
          captador_id?: string | null
          cashback?: number
          chaves_entregues_em?: string | null
          cliente_id?: number | null
          comissao_captador?: number | null
          comissao_paga_em?: string | null
          comissao_status?: string
          comissao_total?: number | null
          comissao_vendedor?: number | null
          corretor_id?: string | null
          created_at?: string
          criado_por?: string | null
          empresa_id?: number
          id?: number
          imovel_id?: number
          lead_id?: number | null
          locacao_fim?: string | null
          locacao_inicio?: string | null
          observacoes?: string | null
          percentual?: number | null
          status?: string
          tipo?: string
          updated_at?: string
          valor?: number
          vistoria_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "negocios_imobiliarios_captador_id_fkey"
            columns: ["captador_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negocios_imobiliarios_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negocios_imobiliarios_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negocios_imobiliarios_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negocios_imobiliarios_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negocios_imobiliarios_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negocios_imobiliarios_imovel_id_fkey"
            columns: ["imovel_id"]
            isOneToOne: false
            referencedRelation: "imoveis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negocios_imobiliarios_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      notificacao_prefs: {
        Row: {
          prefs: Json
          updated_at: string
          usuario_id: string
        }
        Insert: {
          prefs?: Json
          updated_at?: string
          usuario_id: string
        }
        Update: {
          prefs?: Json
          updated_at?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificacao_prefs_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: true
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      orcamentos: {
        Row: {
          acerto: string | null
          aparelho: string | null
          aparelho_novo: string | null
          aparelho_usado: string | null
          aprovado_em: string | null
          cliente_id: number | null
          cliente_nome: string
          cliente_telefone: string | null
          created_at: string | null
          defeito: string | null
          empresa_id: number
          garantia_dias: number | null
          id: number
          imei: string | null
          itens: Json
          lead_id: number | null
          observacoes: string | null
          os_id: number | null
          prazo_dias: number | null
          recusado_em: string | null
          status: string
          tipo: string
          token: string
          total: number
          unidade_id: number | null
          usuario_id: string | null
          valor_devolver: number
          valor_entrada: number | null
          valor_novo: number | null
        }
        Insert: {
          acerto?: string | null
          aparelho?: string | null
          aparelho_novo?: string | null
          aparelho_usado?: string | null
          aprovado_em?: string | null
          cliente_id?: number | null
          cliente_nome: string
          cliente_telefone?: string | null
          created_at?: string | null
          defeito?: string | null
          empresa_id: number
          garantia_dias?: number | null
          id?: never
          imei?: string | null
          itens?: Json
          lead_id?: number | null
          observacoes?: string | null
          os_id?: number | null
          prazo_dias?: number | null
          recusado_em?: string | null
          status?: string
          tipo?: string
          token?: string
          total?: number
          unidade_id?: number | null
          usuario_id?: string | null
          valor_devolver?: number
          valor_entrada?: number | null
          valor_novo?: number | null
        }
        Update: {
          acerto?: string | null
          aparelho?: string | null
          aparelho_novo?: string | null
          aparelho_usado?: string | null
          aprovado_em?: string | null
          cliente_id?: number | null
          cliente_nome?: string
          cliente_telefone?: string | null
          created_at?: string | null
          defeito?: string | null
          empresa_id?: number
          garantia_dias?: number | null
          id?: never
          imei?: string | null
          itens?: Json
          lead_id?: number | null
          observacoes?: string | null
          os_id?: number | null
          prazo_dias?: number | null
          recusado_em?: string | null
          status?: string
          tipo?: string
          token?: string
          total?: number
          unidade_id?: number | null
          usuario_id?: string | null
          valor_devolver?: number
          valor_entrada?: number | null
          valor_novo?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orcamentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orcamentos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orcamentos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orcamentos_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orcamentos_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "inventario_unidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orcamentos_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "v_inventario_veiculo"
            referencedColumns: ["unidade_id"]
          },
        ]
      }
      payment_webhook_eventos: {
        Row: {
          event_type: string | null
          id: number
          processado_em: string
          provider: string
          provider_ref: string
        }
        Insert: {
          event_type?: string | null
          id?: never
          processado_em?: string
          provider: string
          provider_ref: string
        }
        Update: {
          event_type?: string | null
          id?: never
          processado_em?: string
          provider?: string
          provider_ref?: string
        }
        Relationships: []
      }
      pedidos: {
        Row: {
          cliente_nome: string | null
          created_at: string | null
          empresa_id: number
          id: number
          itens: Json
          mesa: string | null
          observacoes: string | null
          origem: string | null
          status: string
          total: number
        }
        Insert: {
          cliente_nome?: string | null
          created_at?: string | null
          empresa_id: number
          id?: never
          itens?: Json
          mesa?: string | null
          observacoes?: string | null
          origem?: string | null
          status?: string
          total?: number
        }
        Update: {
          cliente_nome?: string | null
          created_at?: string | null
          empresa_id?: number
          id?: never
          itens?: Json
          mesa?: string | null
          observacoes?: string | null
          origem?: string | null
          status?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos_compra: {
        Row: {
          created_at: string | null
          data_pedido: string | null
          descricao: string | null
          empresa_id: number
          fornecedor_id: number | null
          id: number
          observacoes: string | null
          status: string | null
          usuario_id: string | null
          valor_total: number | null
        }
        Insert: {
          created_at?: string | null
          data_pedido?: string | null
          descricao?: string | null
          empresa_id: number
          fornecedor_id?: number | null
          id?: never
          observacoes?: string | null
          status?: string | null
          usuario_id?: string | null
          valor_total?: number | null
        }
        Update: {
          created_at?: string | null
          data_pedido?: string | null
          descricao?: string | null
          empresa_id?: number
          fornecedor_id?: number | null
          id?: never
          observacoes?: string | null
          status?: string | null
          usuario_id?: string | null
          valor_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_compra_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_compra_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_compra_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_compra_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      planos_config: {
        Row: {
          ativo: boolean
          cor: string
          descricao: string | null
          destaque: boolean
          features: Json
          id: string
          limite_leads: number
          limite_usuarios: number
          nome: string
          ordem: number
          preco_centavos: number
          stripe_price_id: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cor?: string
          descricao?: string | null
          destaque?: boolean
          features?: Json
          id: string
          limite_leads?: number
          limite_usuarios?: number
          nome: string
          ordem?: number
          preco_centavos?: number
          stripe_price_id?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cor?: string
          descricao?: string | null
          destaque?: boolean
          features?: Json
          id?: string
          limite_leads?: number
          limite_usuarios?: number
          nome?: string
          ordem?: number
          preco_centavos?: number
          stripe_price_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pre_vendas: {
        Row: {
          canal_venda: string | null
          created_at: string | null
          desconto_valor: number | null
          empresa_id: number
          grupo_id: string | null
          id: number
          inventario_unidade_id: number | null
          observacoes: string | null
          produto_id: number | null
          status: string | null
          usuario_id: string | null
          valor_venda: number | null
          venda_id: number | null
          vendedor_id: string | null
        }
        Insert: {
          canal_venda?: string | null
          created_at?: string | null
          desconto_valor?: number | null
          empresa_id: number
          grupo_id?: string | null
          id?: never
          inventario_unidade_id?: number | null
          observacoes?: string | null
          produto_id?: number | null
          status?: string | null
          usuario_id?: string | null
          valor_venda?: number | null
          venda_id?: number | null
          vendedor_id?: string | null
        }
        Update: {
          canal_venda?: string | null
          created_at?: string | null
          desconto_valor?: number | null
          empresa_id?: number
          grupo_id?: string | null
          id?: never
          inventario_unidade_id?: number | null
          observacoes?: string | null
          produto_id?: number | null
          status?: string | null
          usuario_id?: string | null
          valor_venda?: number | null
          venda_id?: number | null
          vendedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pre_vendas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pre_vendas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pre_vendas_inventario_unidade_id_fkey"
            columns: ["inventario_unidade_id"]
            isOneToOne: false
            referencedRelation: "inventario_unidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pre_vendas_inventario_unidade_id_fkey"
            columns: ["inventario_unidade_id"]
            isOneToOne: false
            referencedRelation: "v_inventario_veiculo"
            referencedColumns: ["unidade_id"]
          },
          {
            foreignKeyName: "pre_vendas_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pre_vendas_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pre_vendas_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      produtos: {
        Row: {
          armazenamentos: string[] | null
          ativo: boolean | null
          categoria_id: number | null
          categoria_tipo: string | null
          codigos: string | null
          cores: string[] | null
          created_at: string | null
          descricao: string | null
          disponivel: boolean | null
          empresa_id: number
          foto_url: string | null
          garantia_dias: number | null
          id: number
          marca_id: number | null
          nome: string
          preco: number | null
          subcategoria_id: number | null
        }
        Insert: {
          armazenamentos?: string[] | null
          ativo?: boolean | null
          categoria_id?: number | null
          categoria_tipo?: string | null
          codigos?: string | null
          cores?: string[] | null
          created_at?: string | null
          descricao?: string | null
          disponivel?: boolean | null
          empresa_id: number
          foto_url?: string | null
          garantia_dias?: number | null
          id?: number
          marca_id?: number | null
          nome: string
          preco?: number | null
          subcategoria_id?: number | null
        }
        Update: {
          armazenamentos?: string[] | null
          ativo?: boolean | null
          categoria_id?: number | null
          categoria_tipo?: string | null
          codigos?: string | null
          cores?: string[] | null
          created_at?: string | null
          descricao?: string | null
          disponivel?: boolean | null
          empresa_id?: number
          foto_url?: string | null
          garantia_dias?: number | null
          id?: number
          marca_id?: number | null
          nome?: string
          preco?: number | null
          subcategoria_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "produtos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias_produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produtos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produtos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produtos_marca_id_fkey"
            columns: ["marca_id"]
            isOneToOne: false
            referencedRelation: "marcas_produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produtos_subcategoria_id_fkey"
            columns: ["subcategoria_id"]
            isOneToOne: false
            referencedRelation: "subcategorias_produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      propostas: {
        Row: {
          cliente_nome: string
          created_at: string
          empresa_id: number
          id: number
          itens: Json
          lead_id: number | null
          observacoes: string | null
          status: string
          token: string
          total: number
        }
        Insert: {
          cliente_nome?: string
          created_at?: string
          empresa_id: number
          id?: never
          itens?: Json
          lead_id?: number | null
          observacoes?: string | null
          status?: string
          token?: string
          total?: number
        }
        Update: {
          cliente_nome?: string
          created_at?: string
          empresa_id?: number
          id?: never
          itens?: Json
          lead_id?: number | null
          observacoes?: string | null
          status?: string
          token?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "propostas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propostas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propostas_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      proprietarios: {
        Row: {
          cpf_cnpj: string | null
          created_at: string | null
          email: string | null
          empresa_id: number
          id: number
          nome: string
          observacoes: string | null
          telefone: string | null
          updated_at: string | null
        }
        Insert: {
          cpf_cnpj?: string | null
          created_at?: string | null
          email?: string | null
          empresa_id: number
          id?: number
          nome: string
          observacoes?: string | null
          telefone?: string | null
          updated_at?: string | null
        }
        Update: {
          cpf_cnpj?: string | null
          created_at?: string | null
          email?: string | null
          empresa_id?: number
          id?: number
          nome?: string
          observacoes?: string | null
          telefone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proprietarios_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proprietarios_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string | null
          empresa_id: number
          endpoint: string
          id: number
          p256dh: string
          usuario_id: string
        }
        Insert: {
          auth: string
          created_at?: string | null
          empresa_id: number
          endpoint: string
          id?: never
          p256dh: string
          usuario_id: string
        }
        Update: {
          auth?: string
          created_at?: string | null
          empresa_id?: number
          endpoint?: string
          id?: never
          p256dh?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
        ]
      }
      rastreamento_config: {
        Row: {
          ativo: boolean
          atualizado_em: string
          capi_ativo: boolean
          capi_test_code: string | null
          capi_token_enc: string | null
          criado_em: string
          empresa_id: number
          meta_pixel_id: string | null
          public_token: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          capi_ativo?: boolean
          capi_test_code?: string | null
          capi_token_enc?: string | null
          criado_em?: string
          empresa_id: number
          meta_pixel_id?: string | null
          public_token?: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          capi_ativo?: boolean
          capi_test_code?: string | null
          capi_token_enc?: string | null
          criado_em?: string
          empresa_id?: number
          meta_pixel_id?: string | null
          public_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "rastreamento_config_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: true
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rastreamento_config_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: true
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
        ]
      }
      rastreamento_eventos: {
        Row: {
          capi_response: Json | null
          capi_status: string
          contato_email: string | null
          contato_fone: string | null
          criado_em: string
          empresa_id: number
          event_id: string | null
          id: number
          lead_id: number | null
          moeda: string
          order_id: string | null
          produto: string | null
          tipo: string
          valor: number | null
          visita_id: number | null
        }
        Insert: {
          capi_response?: Json | null
          capi_status?: string
          contato_email?: string | null
          contato_fone?: string | null
          criado_em?: string
          empresa_id: number
          event_id?: string | null
          id?: number
          lead_id?: number | null
          moeda?: string
          order_id?: string | null
          produto?: string | null
          tipo?: string
          valor?: number | null
          visita_id?: number | null
        }
        Update: {
          capi_response?: Json | null
          capi_status?: string
          contato_email?: string | null
          contato_fone?: string | null
          criado_em?: string
          empresa_id?: number
          event_id?: string | null
          id?: number
          lead_id?: number | null
          moeda?: string
          order_id?: string | null
          produto?: string | null
          tipo?: string
          valor?: number | null
          visita_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rastreamento_eventos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rastreamento_eventos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rastreamento_eventos_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rastreamento_eventos_visita_id_fkey"
            columns: ["visita_id"]
            isOneToOne: false
            referencedRelation: "rastreamento_visitas"
            referencedColumns: ["id"]
          },
        ]
      }
      rastreamento_links: {
        Row: {
          ativo: boolean
          atualizado_em: string
          cliques: number
          criado_em: string
          destino_url: string
          empresa_id: number
          id: number
          slug: string
          titulo: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          wa_numero: string | null
          wa_texto: string | null
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          cliques?: number
          criado_em?: string
          destino_url: string
          empresa_id: number
          id?: number
          slug: string
          titulo?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          wa_numero?: string | null
          wa_texto?: string | null
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          cliques?: number
          criado_em?: string
          destino_url?: string
          empresa_id?: number
          id?: number
          slug?: string
          titulo?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          wa_numero?: string | null
          wa_texto?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rastreamento_links_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rastreamento_links_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
        ]
      }
      rastreamento_visitas: {
        Row: {
          criado_em: string
          empresa_id: number
          fbc: string | null
          fbclid: string | null
          fbp: string | null
          gbraid: string | null
          gclid: string | null
          id: number
          ip: string | null
          lead_id: number | null
          link_id: number | null
          page_url: string | null
          referrer: string | null
          ta_cod: string | null
          tracking_id: string
          user_agent: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          visitor_code: string | null
          wbraid: string | null
        }
        Insert: {
          criado_em?: string
          empresa_id: number
          fbc?: string | null
          fbclid?: string | null
          fbp?: string | null
          gbraid?: string | null
          gclid?: string | null
          id?: number
          ip?: string | null
          lead_id?: number | null
          link_id?: number | null
          page_url?: string | null
          referrer?: string | null
          ta_cod?: string | null
          tracking_id?: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          visitor_code?: string | null
          wbraid?: string | null
        }
        Update: {
          criado_em?: string
          empresa_id?: number
          fbc?: string | null
          fbclid?: string | null
          fbp?: string | null
          gbraid?: string | null
          gclid?: string | null
          id?: number
          ip?: string | null
          lead_id?: number | null
          link_id?: number | null
          page_url?: string | null
          referrer?: string | null
          ta_cod?: string | null
          tracking_id?: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          visitor_code?: string | null
          wbraid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rastreamento_visitas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rastreamento_visitas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rastreamento_visitas_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rastreamento_visitas_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "rastreamento_links"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit: {
        Row: {
          chave: string
          contador: number
          janela: string
        }
        Insert: {
          chave: string
          contador?: number
          janela: string
        }
        Update: {
          chave?: string
          contador?: number
          janela?: string
        }
        Relationships: []
      }
      segmentos_config: {
        Row: {
          ativo: boolean
          chave: string
          created_at: string
          descricao: string | null
          funil_seed: Json
          hidden_hrefs: Json
          label: string
          label_overrides: Json
          modulos_extra: Json
          modulos_habilitados: Json | null
          ordem: number
        }
        Insert: {
          ativo?: boolean
          chave: string
          created_at?: string
          descricao?: string | null
          funil_seed?: Json
          hidden_hrefs?: Json
          label: string
          label_overrides?: Json
          modulos_extra?: Json
          modulos_habilitados?: Json | null
          ordem?: number
        }
        Update: {
          ativo?: boolean
          chave?: string
          created_at?: string
          descricao?: string | null
          funil_seed?: Json
          hidden_hrefs?: Json
          label?: string
          label_overrides?: Json
          modulos_extra?: Json
          modulos_habilitados?: Json | null
          ordem?: number
        }
        Relationships: []
      }
      servicos_reparo: {
        Row: {
          ativo: boolean
          categoria: string | null
          created_at: string
          empresa_id: number
          id: number
          nome: string
          preco: number
          tempo_estimado_min: number | null
        }
        Insert: {
          ativo?: boolean
          categoria?: string | null
          created_at?: string
          empresa_id: number
          id?: never
          nome: string
          preco?: number
          tempo_estimado_min?: number | null
        }
        Update: {
          ativo?: boolean
          categoria?: string | null
          created_at?: string
          empresa_id?: number
          id?: never
          nome?: string
          preco?: number
          tempo_estimado_min?: number | null
        }
        Relationships: []
      }
      solicitacoes_marketing: {
        Row: {
          canais: Json
          created_at: string | null
          empresa_id: number
          id: number
          item: string
          objetivo: string | null
          solicitante_id: string | null
          status: string
        }
        Insert: {
          canais?: Json
          created_at?: string | null
          empresa_id: number
          id?: never
          item: string
          objetivo?: string | null
          solicitante_id?: string | null
          status?: string
        }
        Update: {
          canais?: Json
          created_at?: string | null
          empresa_id?: number
          id?: never
          item?: string
          objetivo?: string | null
          solicitante_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "solicitacoes_marketing_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_marketing_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_eventos: {
        Row: {
          empresa_id: number | null
          id: string
          payload: Json | null
          processado_em: string | null
          tipo: string
        }
        Insert: {
          empresa_id?: number | null
          id: string
          payload?: Json | null
          processado_em?: string | null
          tipo: string
        }
        Update: {
          empresa_id?: number | null
          id?: string
          payload?: Json | null
          processado_em?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "stripe_eventos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stripe_eventos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
        ]
      }
      subcategorias_produtos: {
        Row: {
          ativo: boolean | null
          categoria_id: number | null
          created_at: string | null
          empresa_id: number
          id: number
          nome: string
          ordem: number | null
        }
        Insert: {
          ativo?: boolean | null
          categoria_id?: number | null
          created_at?: string | null
          empresa_id: number
          id?: never
          nome: string
          ordem?: number | null
        }
        Update: {
          ativo?: boolean | null
          categoria_id?: number | null
          created_at?: string | null
          empresa_id?: number
          id?: never
          nome?: string
          ordem?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "subcategorias_produtos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias_produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcategorias_produtos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcategorias_produtos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
        ]
      }
      superadmin_logs: {
        Row: {
          acao: string
          admin_user_id: string
          created_at: string
          detalhes: Json | null
          empresa_id: number | null
          id: number
        }
        Insert: {
          acao: string
          admin_user_id: string
          created_at?: string
          detalhes?: Json | null
          empresa_id?: number | null
          id?: never
        }
        Update: {
          acao?: string
          admin_user_id?: string
          created_at?: string
          detalhes?: Json | null
          empresa_id?: number | null
          id?: never
        }
        Relationships: [
          {
            foreignKeyName: "superadmin_logs_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "superadmin_logs_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "superadmin_logs_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
        ]
      }
      tabela_precos: {
        Row: {
          armazenamento: string | null
          ativo: boolean
          condicao: string
          created_at: string
          empresa_id: number
          id: number
          modelo: string
          observacoes: string | null
          preco_sugerido: number
        }
        Insert: {
          armazenamento?: string | null
          ativo?: boolean
          condicao?: string
          created_at?: string
          empresa_id: number
          id?: never
          modelo: string
          observacoes?: string | null
          preco_sugerido?: number
        }
        Update: {
          armazenamento?: string | null
          ativo?: boolean
          condicao?: string
          created_at?: string
          empresa_id?: number
          id?: never
          modelo?: string
          observacoes?: string | null
          preco_sugerido?: number
        }
        Relationships: []
      }
      tarefas: {
        Row: {
          concluida: boolean
          concluida_em: string | null
          created_at: string | null
          descricao: string | null
          empresa_id: number
          id: number
          lead_id: number | null
          responsavel_id: string | null
          tipo: string
          titulo: string
          vencimento: string | null
        }
        Insert: {
          concluida?: boolean
          concluida_em?: string | null
          created_at?: string | null
          descricao?: string | null
          empresa_id: number
          id?: number
          lead_id?: number | null
          responsavel_id?: string | null
          tipo?: string
          titulo: string
          vencimento?: string | null
        }
        Update: {
          concluida?: boolean
          concluida_em?: string | null
          created_at?: string | null
          descricao?: string | null
          empresa_id?: number
          id?: number
          lead_id?: number | null
          responsavel_id?: string | null
          tipo?: string
          titulo?: string
          vencimento?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tarefas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefas_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefas_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      taxas_pagamento: {
        Row: {
          ativo: boolean | null
          bandeira: string | null
          created_at: string | null
          empresa_id: number
          forma_pagamento: string
          id: number
          parcelas: number | null
          percentual_taxa: number | null
        }
        Insert: {
          ativo?: boolean | null
          bandeira?: string | null
          created_at?: string | null
          empresa_id: number
          forma_pagamento: string
          id?: never
          parcelas?: number | null
          percentual_taxa?: number | null
        }
        Update: {
          ativo?: boolean | null
          bandeira?: string | null
          created_at?: string | null
          empresa_id?: number
          forma_pagamento?: string
          id?: never
          parcelas?: number | null
          percentual_taxa?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "taxas_pagamento_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taxas_pagamento_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_payment_config: {
        Row: {
          ativo: boolean
          atualizado_em: string
          credenciais_cipher: string | null
          empresa_id: number
          modo: string
          provider: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          credenciais_cipher?: string | null
          empresa_id: number
          modo?: string
          provider?: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          credenciais_cipher?: string | null
          empresa_id?: number
          modo?: string
          provider?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_payment_config_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: true
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_payment_config_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: true
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
        ]
      }
      usuarios: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
          impersonando_empresa_id: number | null
          impersonando_expires_at: string | null
          is_super_admin: boolean
          modulos_acesso: string[] | null
          nome: string
          permissoes: Json | null
          role: string
          ultimo_acesso: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id: string
          impersonando_empresa_id?: number | null
          impersonando_expires_at?: string | null
          is_super_admin?: boolean
          modulos_acesso?: string[] | null
          nome: string
          permissoes?: Json | null
          role?: string
          ultimo_acesso?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          impersonando_empresa_id?: number | null
          impersonando_expires_at?: string | null
          is_super_admin?: boolean
          modulos_acesso?: string[] | null
          nome?: string
          permissoes?: Json | null
          role?: string
          ultimo_acesso?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "usuarios_impersonando_empresa_id_fkey"
            columns: ["impersonando_empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuarios_impersonando_empresa_id_fkey"
            columns: ["impersonando_empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
        ]
      }
      veiculo_dados: {
        Row: {
          ano: number | null
          chassi: string | null
          created_at: string | null
          empresa_id: number
          km: number | null
          placa: string | null
          renavam: string | null
          unidade_id: number
        }
        Insert: {
          ano?: number | null
          chassi?: string | null
          created_at?: string | null
          empresa_id: number
          km?: number | null
          placa?: string | null
          renavam?: string | null
          unidade_id: number
        }
        Update: {
          ano?: number | null
          chassi?: string | null
          created_at?: string | null
          empresa_id?: number
          km?: number | null
          placa?: string | null
          renavam?: string | null
          unidade_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "veiculo_dados_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "veiculo_dados_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "veiculo_dados_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: true
            referencedRelation: "inventario_unidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "veiculo_dados_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: true
            referencedRelation: "v_inventario_veiculo"
            referencedColumns: ["unidade_id"]
          },
        ]
      }
      vendas: {
        Row: {
          canal_venda: string | null
          cliente_id: number | null
          comanda: string | null
          comissao: number | null
          created_at: string | null
          data_venda: string | null
          desconto_aprovado_por: string | null
          desconto_motivo: string | null
          desconto_valor: number | null
          empresa_id: number
          forma_pagamento: string | null
          grupo_pdv: string | null
          id: number
          lucro: number | null
          numero_serie: string | null
          observacoes: string | null
          parcelas: number | null
          pedido_compra_id: number | null
          produto_id: number | null
          quantidade: number
          status: string | null
          unidade_id: number | null
          usuario_id: string | null
          valor_custo: number | null
          valor_venda: number
          vendedor_id: string | null
        }
        Insert: {
          canal_venda?: string | null
          cliente_id?: number | null
          comanda?: string | null
          comissao?: number | null
          created_at?: string | null
          data_venda?: string | null
          desconto_aprovado_por?: string | null
          desconto_motivo?: string | null
          desconto_valor?: number | null
          empresa_id: number
          forma_pagamento?: string | null
          grupo_pdv?: string | null
          id?: never
          lucro?: number | null
          numero_serie?: string | null
          observacoes?: string | null
          parcelas?: number | null
          pedido_compra_id?: number | null
          produto_id?: number | null
          quantidade?: number
          status?: string | null
          unidade_id?: number | null
          usuario_id?: string | null
          valor_custo?: number | null
          valor_venda: number
          vendedor_id?: string | null
        }
        Update: {
          canal_venda?: string | null
          cliente_id?: number | null
          comanda?: string | null
          comissao?: number | null
          created_at?: string | null
          data_venda?: string | null
          desconto_aprovado_por?: string | null
          desconto_motivo?: string | null
          desconto_valor?: number | null
          empresa_id?: number
          forma_pagamento?: string | null
          grupo_pdv?: string | null
          id?: never
          lucro?: number | null
          numero_serie?: string | null
          observacoes?: string | null
          parcelas?: number | null
          pedido_compra_id?: number | null
          produto_id?: number | null
          quantidade?: number
          status?: string | null
          unidade_id?: number | null
          usuario_id?: string | null
          valor_custo?: number | null
          valor_venda?: number
          vendedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_desconto_aprovado_por_fkey"
            columns: ["desconto_aprovado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_pedido_compra_id_fkey"
            columns: ["pedido_compra_id"]
            isOneToOne: false
            referencedRelation: "pedidos_compra"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "inventario_unidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "v_inventario_veiculo"
            referencedColumns: ["unidade_id"]
          },
          {
            foreignKeyName: "vendas_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      vendas_alertas: {
        Row: {
          aceito_em: string
          aceito_por: string | null
          empresa_id: number
          id: number
          mensagem: string
          tipo: string
          valor_informado: number | null
          valor_referencia: number | null
          venda_id: number
        }
        Insert: {
          aceito_em?: string
          aceito_por?: string | null
          empresa_id: number
          id?: number
          mensagem: string
          tipo: string
          valor_informado?: number | null
          valor_referencia?: number | null
          venda_id: number
        }
        Update: {
          aceito_em?: string
          aceito_por?: string | null
          empresa_id?: number
          id?: number
          mensagem?: string
          tipo?: string
          valor_informado?: number | null
          valor_referencia?: number | null
          venda_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "vendas_alertas_aceito_por_fkey"
            columns: ["aceito_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_alertas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_alertas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_alertas_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      vendas_pagamentos: {
        Row: {
          bandeira_cartao: string | null
          created_at: string | null
          empresa_id: number
          forma_pagamento: string
          id: number
          parcelas: number | null
          valor_com_juros: number | null
          valor_pago: number
          venda_id: number | null
        }
        Insert: {
          bandeira_cartao?: string | null
          created_at?: string | null
          empresa_id: number
          forma_pagamento: string
          id?: never
          parcelas?: number | null
          valor_com_juros?: number | null
          valor_pago: number
          venda_id?: number | null
        }
        Update: {
          bandeira_cartao?: string | null
          created_at?: string | null
          empresa_id?: number
          forma_pagamento?: string
          id?: never
          parcelas?: number | null
          valor_com_juros?: number | null
          valor_pago?: number
          venda_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vendas_pagamentos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_pagamentos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_pagamentos_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      vendas_termos: {
        Row: {
          arquivo_url: string | null
          assinado_em: string | null
          assinado_por: string | null
          criado_em: string
          empresa_id: number
          id: number
          status: string
          tipo: string
          venda_id: number
        }
        Insert: {
          arquivo_url?: string | null
          assinado_em?: string | null
          assinado_por?: string | null
          criado_em?: string
          empresa_id: number
          id?: number
          status?: string
          tipo: string
          venda_id: number
        }
        Update: {
          arquivo_url?: string | null
          assinado_em?: string | null
          assinado_por?: string | null
          criado_em?: string
          empresa_id?: number
          id?: number
          status?: string
          tipo?: string
          venda_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "vendas_termos_assinado_por_fkey"
            columns: ["assinado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_termos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_termos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_termos_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      visitas: {
        Row: {
          cliente_id: number | null
          corretor_id: string | null
          created_at: string | null
          data_hora: string
          empresa_id: number
          fim: string | null
          id: number
          imovel_id: number | null
          lead_id: number | null
          local: string | null
          observacoes: string | null
          participantes: string | null
          status: string
          tipo: string
          titulo: string | null
          updated_at: string | null
        }
        Insert: {
          cliente_id?: number | null
          corretor_id?: string | null
          created_at?: string | null
          data_hora: string
          empresa_id: number
          fim?: string | null
          id?: number
          imovel_id?: number | null
          lead_id?: number | null
          local?: string | null
          observacoes?: string | null
          participantes?: string | null
          status?: string
          tipo?: string
          titulo?: string | null
          updated_at?: string | null
        }
        Update: {
          cliente_id?: number | null
          corretor_id?: string | null
          created_at?: string | null
          data_hora?: string
          empresa_id?: number
          fim?: string | null
          id?: number
          imovel_id?: number | null
          lead_id?: number | null
          local?: string | null
          observacoes?: string | null
          participantes?: string | null
          status?: string
          tipo?: string
          titulo?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visitas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visitas_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visitas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visitas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visitas_imovel_id_fkey"
            columns: ["imovel_id"]
            isOneToOne: false
            referencedRelation: "imoveis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visitas_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_empresas_plano: {
        Row: {
          id: number | null
          nome: string | null
          plano: string | null
          status: string | null
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_status: string | null
          stripe_subscription_id: string | null
          trial_ends_at: string | null
        }
        Insert: {
          id?: number | null
          nome?: string | null
          plano?: string | null
          status?: string | null
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_status?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
        }
        Update: {
          id?: number | null
          nome?: string | null
          plano?: string | null
          status?: string | null
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_status?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
        }
        Relationships: []
      }
      v_inventario_veiculo: {
        Row: {
          ano: number | null
          chassi: string | null
          empresa_id: number | null
          km: number | null
          migrado: boolean | null
          placa: string | null
          renavam: string | null
          unidade_id: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventario_unidades_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_unidades_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      get_empresa_id: { Args: never; Returns: number }
      hard_delete_empresa: {
        Args: { p_empresa_id: number }
        Returns: undefined
      }
      incrementar_msgs_nao_lidas: {
        Args: { lead_id_param: number }
        Returns: undefined
      }
      is_empresa_admin: { Args: { emp: number }; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      rate_limit_bump: {
        Args: { p_chave: string; p_janela: string }
        Returns: number
      }
      refresh_status_atrasados: { Args: never; Returns: undefined }
      set_impersonation: {
        Args: { p_empresa_id: number; p_ttl_seconds?: number }
        Returns: undefined
      }
      set_super_admin: {
        Args: { p_target: string; p_value: boolean }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
