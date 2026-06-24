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
      avaliacoes_seminovos: {
        Row: {
          avaliacao_atendente: string | null
          check_alto_falantes: boolean | null
          check_bateria: boolean | null
          check_botoes: boolean | null
          check_camera: boolean | null
          check_carregamento: boolean | null
          check_faceid: boolean | null
          check_microfone: boolean | null
          check_tela: boolean | null
          classificacao: string | null
          created_at: string | null
          empresa_id: number
          id: number
          imei_serial: string | null
          modelo_aparelho: string
          modelo_interesse: string | null
          nome_cliente: string | null
          outros_testes: string | null
          saude_bateria: number | null
          sugestao_valor_entrada: number | null
          teve_reparos_anteriores: boolean | null
          usuario_id: string | null
          whatsapp_cliente: string | null
        }
        Insert: {
          avaliacao_atendente?: string | null
          check_alto_falantes?: boolean | null
          check_bateria?: boolean | null
          check_botoes?: boolean | null
          check_camera?: boolean | null
          check_carregamento?: boolean | null
          check_faceid?: boolean | null
          check_microfone?: boolean | null
          check_tela?: boolean | null
          classificacao?: string | null
          created_at?: string | null
          empresa_id?: number
          id?: never
          imei_serial?: string | null
          modelo_aparelho: string
          modelo_interesse?: string | null
          nome_cliente?: string | null
          outros_testes?: string | null
          saude_bateria?: number | null
          sugestao_valor_entrada?: number | null
          teve_reparos_anteriores?: boolean | null
          usuario_id?: string | null
          whatsapp_cliente?: string | null
        }
        Update: {
          avaliacao_atendente?: string | null
          check_alto_falantes?: boolean | null
          check_bateria?: boolean | null
          check_botoes?: boolean | null
          check_camera?: boolean | null
          check_carregamento?: boolean | null
          check_faceid?: boolean | null
          check_microfone?: boolean | null
          check_tela?: boolean | null
          classificacao?: string | null
          created_at?: string | null
          empresa_id?: number
          id?: never
          imei_serial?: string | null
          modelo_aparelho?: string
          modelo_interesse?: string | null
          nome_cliente?: string | null
          outros_testes?: string | null
          saude_bateria?: number | null
          sugestao_valor_entrada?: number | null
          teve_reparos_anteriores?: boolean | null
          usuario_id?: string | null
          whatsapp_cliente?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "avaliacoes_seminovos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avaliacoes_seminovos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avaliacoes_seminovos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      categorias_financeiras: {
        Row: {
          cor: string | null
          created_at: string | null
          empresa_id: number
          id: number
          nome: string
          tipo: string
        }
        Insert: {
          cor?: string | null
          created_at?: string | null
          empresa_id: number
          id?: number
          nome: string
          tipo: string
        }
        Update: {
          cor?: string | null
          created_at?: string | null
          empresa_id?: number
          id?: number
          nome?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "categorias_financeiras_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categorias_financeiras_empresa_id_fkey"
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
          empresa_id?: number
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
          empresa_id?: number
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
        Relationships: []
      }
      comissoes: {
        Row: {
          created_at: string | null
          data_pagamento: string | null
          empresa_id: number
          id: number
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
          empresa_id?: number
          id?: never
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
      configuracoes: {
        Row: {
          id: number
          instagram_ativo: boolean | null
          instagram_page_id: string | null
          instagram_token: string | null
          messenger_ativo: boolean | null
          messenger_page_id: string | null
          messenger_token: string | null
          updated_at: string | null
          wl_cor: string | null
          wl_empresa: string | null
          wl_logo_url: string | null
          wl_slogan: string | null
          wl_whatsapp: string | null
          zapi_api_url: string | null
          zapi_ativo: boolean | null
          zapi_client_token: string | null
          zapi_instance_id: string | null
          zapi_token: string | null
        }
        Insert: {
          id?: never
          instagram_ativo?: boolean | null
          instagram_page_id?: string | null
          instagram_token?: string | null
          messenger_ativo?: boolean | null
          messenger_page_id?: string | null
          messenger_token?: string | null
          updated_at?: string | null
          wl_cor?: string | null
          wl_empresa?: string | null
          wl_logo_url?: string | null
          wl_slogan?: string | null
          wl_whatsapp?: string | null
          zapi_api_url?: string | null
          zapi_ativo?: boolean | null
          zapi_client_token?: string | null
          zapi_instance_id?: string | null
          zapi_token?: string | null
        }
        Update: {
          id?: never
          instagram_ativo?: boolean | null
          instagram_page_id?: string | null
          instagram_token?: string | null
          messenger_ativo?: boolean | null
          messenger_page_id?: string | null
          messenger_token?: string | null
          updated_at?: string | null
          wl_cor?: string | null
          wl_empresa?: string | null
          wl_logo_url?: string | null
          wl_slogan?: string | null
          wl_whatsapp?: string | null
          zapi_api_url?: string | null
          zapi_ativo?: boolean | null
          zapi_client_token?: string | null
          zapi_instance_id?: string | null
          zapi_token?: string | null
        }
        Relationships: []
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
      contas_a_receber: {
        Row: {
          cliente_id: number | null
          created_at: string | null
          data_recebimento: string | null
          data_vencimento: string | null
          descricao: string
          empresa_id: number
          forma_recebimento: string | null
          id: number
          observacoes: string | null
          status: string | null
          usuario_id: string | null
          valor: number
          venda_id: number | null
        }
        Insert: {
          cliente_id?: number | null
          created_at?: string | null
          data_recebimento?: string | null
          data_vencimento?: string | null
          descricao: string
          empresa_id?: number
          forma_recebimento?: string | null
          id?: never
          observacoes?: string | null
          status?: string | null
          usuario_id?: string | null
          valor: number
          venda_id?: number | null
        }
        Update: {
          cliente_id?: number | null
          created_at?: string | null
          data_recebimento?: string | null
          data_vencimento?: string | null
          descricao?: string
          empresa_id?: number
          forma_recebimento?: string | null
          id?: never
          observacoes?: string | null
          status?: string | null
          usuario_id?: string | null
          valor?: number
          venda_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contas_a_receber_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_a_receber_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_a_receber_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_a_receber_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_a_receber_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      empresa_usuarios: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          empresa_id: number
          id: number
          role: string
          usuario_id: string
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          empresa_id: number
          id?: number
          role?: string
          usuario_id: string
        }
        Update: {
          ativo?: boolean | null
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
        ]
      }
      empresas: {
        Row: {
          created_at: string | null
          id: number
          limite_leads: number | null
          limite_usuarios: number | null
          nome: string
          plano: string
          slug: string
          status: string
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_status: string | null
          stripe_subscription_id: string | null
          trial_ends_at: string | null
          updated_at: string | null
          wl_cor: string | null
          wl_logo_url: string | null
          wl_slogan: string | null
          wl_whatsapp: string | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          limite_leads?: number | null
          limite_usuarios?: number | null
          nome: string
          plano?: string
          slug: string
          status?: string
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_status?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
          wl_cor?: string | null
          wl_logo_url?: string | null
          wl_slogan?: string | null
          wl_whatsapp?: string | null
        }
        Update: {
          created_at?: string | null
          id?: number
          limite_leads?: number | null
          limite_usuarios?: number | null
          nome?: string
          plano?: string
          slug?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_status?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
          wl_cor?: string | null
          wl_logo_url?: string | null
          wl_slogan?: string | null
          wl_whatsapp?: string | null
        }
        Relationships: []
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
          empresa_id?: number
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
      garantias_assistencias: {
        Row: {
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
          inventario_unidade_id: string | null
          modelo_reserva: string | null
          observacoes: string | null
          orcamento_valor: number | null
          parecer_tecnico: string | null
          produto_id: number | null
          protocolo: string | null
          responsavel_tecnico_id: string | null
          status: string | null
          tipo: string | null
          usuario_id: string | null
        }
        Insert: {
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
          inventario_unidade_id?: string | null
          modelo_reserva?: string | null
          observacoes?: string | null
          orcamento_valor?: number | null
          parecer_tecnico?: string | null
          produto_id?: number | null
          protocolo?: string | null
          responsavel_tecnico_id?: string | null
          status?: string | null
          tipo?: string | null
          usuario_id?: string | null
        }
        Update: {
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
          inventario_unidade_id?: string | null
          modelo_reserva?: string | null
          observacoes?: string | null
          orcamento_valor?: number | null
          parecer_tecnico?: string | null
          produto_id?: number | null
          protocolo?: string | null
          responsavel_tecnico_id?: string | null
          status?: string | null
          tipo?: string | null
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
      inventario_unidades: {
        Row: {
          anatel_resultado: string | null
          armazenamento: string | null
          ativo: boolean | null
          bateria: string | null
          cliente_id: number | null
          condicao: string | null
          cor: string | null
          created_at: string | null
          custo_reparo: number | null
          empresa_id: number
          estado: string | null
          fornecedor_id: number | null
          fotos_urls: string | null
          id: number
          imagem_url: string | null
          imei: string | null
          imei2: string | null
          numero_serie: string | null
          observacoes: string | null
          preco_custo: number | null
          preco_venda: number | null
          produto_id: number | null
          status: string | null
          tipo: string | null
          usuario_id: string | null
        }
        Insert: {
          anatel_resultado?: string | null
          armazenamento?: string | null
          ativo?: boolean | null
          bateria?: string | null
          cliente_id?: number | null
          condicao?: string | null
          cor?: string | null
          created_at?: string | null
          custo_reparo?: number | null
          empresa_id: number
          estado?: string | null
          fornecedor_id?: number | null
          fotos_urls?: string | null
          id?: number
          imagem_url?: string | null
          imei?: string | null
          imei2?: string | null
          numero_serie?: string | null
          observacoes?: string | null
          preco_custo?: number | null
          preco_venda?: number | null
          produto_id?: number | null
          status?: string | null
          tipo?: string | null
          usuario_id?: string | null
        }
        Update: {
          anatel_resultado?: string | null
          armazenamento?: string | null
          ativo?: boolean | null
          bateria?: string | null
          cliente_id?: number | null
          condicao?: string | null
          cor?: string | null
          created_at?: string | null
          custo_reparo?: number | null
          empresa_id?: number
          estado?: string | null
          fornecedor_id?: number | null
          fotos_urls?: string | null
          id?: number
          imagem_url?: string | null
          imei?: string | null
          imei2?: string | null
          numero_serie?: string | null
          observacoes?: string | null
          preco_custo?: number | null
          preco_venda?: number | null
          produto_id?: number | null
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
      lead_mensagens: {
        Row: {
          conteudo: string
          created_at: string | null
          direcao: string
          empresa_id: number
          id: number
          lead_id: number | null
          lida: boolean | null
          origem: string | null
        }
        Insert: {
          conteudo: string
          created_at?: string | null
          direcao: string
          empresa_id?: number
          id?: never
          lead_id?: number | null
          lida?: boolean | null
          origem?: string | null
        }
        Update: {
          conteudo?: string
          created_at?: string | null
          direcao?: string
          empresa_id?: number
          id?: never
          lead_id?: number | null
          lida?: boolean | null
          origem?: string | null
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
      leads: {
        Row: {
          ativo: boolean | null
          convertido_em: number | null
          created_at: string | null
          data_transferencia_funil: string | null
          empresa_id: number
          id: number
          instagram: string | null
          kanban_ordem: number | null
          kanban_status: string | null
          msgs_nao_lidas: number | null
          nome: string | null
          observacoes: string | null
          origem: string | null
          origem_id: string | null
          primeira_msg: string | null
          produto_interessado: string | null
          responsavel_id: string | null
          telefone: string | null
          ultima_mensagem_at: string | null
          ultima_tratativa: string | null
        }
        Insert: {
          ativo?: boolean | null
          convertido_em?: number | null
          created_at?: string | null
          data_transferencia_funil?: string | null
          empresa_id?: number
          id?: never
          instagram?: string | null
          kanban_ordem?: number | null
          kanban_status?: string | null
          msgs_nao_lidas?: number | null
          nome?: string | null
          observacoes?: string | null
          origem?: string | null
          origem_id?: string | null
          primeira_msg?: string | null
          produto_interessado?: string | null
          responsavel_id?: string | null
          telefone?: string | null
          ultima_mensagem_at?: string | null
          ultima_tratativa?: string | null
        }
        Update: {
          ativo?: boolean | null
          convertido_em?: number | null
          created_at?: string | null
          data_transferencia_funil?: string | null
          empresa_id?: number
          id?: never
          instagram?: string | null
          kanban_ordem?: number | null
          kanban_status?: string | null
          msgs_nao_lidas?: number | null
          nome?: string | null
          observacoes?: string | null
          origem?: string | null
          origem_id?: string | null
          primeira_msg?: string | null
          produto_interessado?: string | null
          responsavel_id?: string | null
          telefone?: string | null
          ultima_mensagem_at?: string | null
          ultima_tratativa?: string | null
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
            foreignKeyName: "leads_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
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
          empresa_id?: number
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
          empresa_id?: number
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
          empresa_id?: number
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
          empresa_id?: number
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
            foreignKeyName: "pre_vendas_new_inventario_unidade_id_fkey"
            columns: ["inventario_unidade_id"]
            isOneToOne: false
            referencedRelation: "inventario_unidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pre_vendas_new_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pre_vendas_new_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pre_vendas_new_vendedor_id_fkey"
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
          empresa_id: number
          id: number
          marca_id: number | null
          nome: string
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
          empresa_id?: number
          id?: number
          marca_id?: number | null
          nome: string
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
          empresa_id?: number
          id?: number
          marca_id?: number | null
          nome?: string
          subcategoria_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "modelos_produtos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias_produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "modelos_produtos_marca_id_fkey"
            columns: ["marca_id"]
            isOneToOne: false
            referencedRelation: "marcas_produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "modelos_produtos_subcategoria_id_fkey"
            columns: ["subcategoria_id"]
            isOneToOne: false
            referencedRelation: "subcategorias_produtos"
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
          empresa_id?: number
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
      tabela_precos: {
        Row: {
          armazenamento: string | null
          ativo: boolean | null
          condicao: string | null
          cor: string | null
          created_at: string | null
          empresa_id: number
          id: number
          modelo: string
          observacoes: string | null
          preco_venda: number
        }
        Insert: {
          armazenamento?: string | null
          ativo?: boolean | null
          condicao?: string | null
          cor?: string | null
          created_at?: string | null
          empresa_id?: number
          id?: never
          modelo: string
          observacoes?: string | null
          preco_venda: number
        }
        Update: {
          armazenamento?: string | null
          ativo?: boolean | null
          condicao?: string | null
          cor?: string | null
          created_at?: string | null
          empresa_id?: number
          id?: never
          modelo?: string
          observacoes?: string | null
          preco_venda?: number
        }
        Relationships: [
          {
            foreignKeyName: "tabela_precos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tabela_precos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "v_empresas_plano"
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
          empresa_id?: number
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
          }
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
          }
        ]
      }
      usuarios: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
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
          is_super_admin?: boolean
          modulos_acesso?: string[] | null
          nome?: string
          permissoes?: Json | null
          role?: string
          ultimo_acesso?: string | null
        }
        Relationships: []
      }
      vendas: {
        Row: {
          canal_venda: string | null
          cliente_id: number | null
          comissao: number | null
          created_at: string | null
          data_venda: string | null
          desconto_aprovado_por: string | null
          desconto_motivo: string | null
          desconto_valor: number | null
          empresa_id: number
          forma_pagamento: string | null
          id: number
          lucro: number | null
          numero_serie: string | null
          observacoes: string | null
          parcelas: number | null
          produto_id: number | null
          status: string | null
          usuario_id: string | null
          valor_custo: number | null
          valor_venda: number
          vendedor_id: string | null
        }
        Insert: {
          canal_venda?: string | null
          cliente_id?: number | null
          comissao?: number | null
          created_at?: string | null
          data_venda?: string | null
          desconto_aprovado_por?: string | null
          desconto_motivo?: string | null
          desconto_valor?: number | null
          empresa_id?: number
          forma_pagamento?: string | null
          id?: never
          lucro?: number | null
          numero_serie?: string | null
          observacoes?: string | null
          parcelas?: number | null
          produto_id?: number | null
          status?: string | null
          usuario_id?: string | null
          valor_custo?: number | null
          valor_venda: number
          vendedor_id?: string | null
        }
        Update: {
          canal_venda?: string | null
          cliente_id?: number | null
          comissao?: number | null
          created_at?: string | null
          data_venda?: string | null
          desconto_aprovado_por?: string | null
          desconto_motivo?: string | null
          desconto_valor?: number | null
          empresa_id?: number
          forma_pagamento?: string | null
          id?: never
          lucro?: number | null
          numero_serie?: string | null
          observacoes?: string | null
          parcelas?: number | null
          produto_id?: number | null
          status?: string | null
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
            foreignKeyName: "vendas_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
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
          empresa_id?: number
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
    }
    Functions: {
      get_empresa_id: { Args: never; Returns: number }
      incrementar_msgs_nao_lidas: {
        Args: { lead_id_param: number }
        Returns: undefined
      }
      refresh_status_atrasados: { Args: never; Returns: undefined }
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
