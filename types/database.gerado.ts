
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "acessos": {
                  Row: {
                    "created_at": string | null,"empresa_id": number,"entrada": string,"fim_por": string | null,"id": number,"saida": string | null,"ultimo_sinal": string,"usuario_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string | null,"empresa_id": number,"entrada"?: string,"fim_por"?: string | null,"id"?: number,"saida"?: string | null,"ultimo_sinal"?: string,"usuario_id": string
                  }
                  Update: {
                    "created_at"?: string | null,"empresa_id"?: number,"entrada"?: string,"fim_por"?: string | null,"id"?: number,"saida"?: string | null,"ultimo_sinal"?: string,"usuario_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "acessos_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "acessos_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "acessos_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    }
                  ]
                },"assistencia_garantias": {
                  Row: {
                    "aprovado_em": string | null,"celular_reserva_fornecido": boolean | null,"cliente_id": number | null,"created_at": string | null,"data_entrada": string | null,"defeito_relatado": string | null,"dentro_garantia": boolean | null,"dias_garantia_restantes": number | null,"empresa_id": number,"estado_entrada": string | null,"filial_id": number | null,"id": number,"imei_serial": string | null,"modelo_reserva": string | null,"observacoes": string | null,"orcamento_valor": number | null,"parecer_tecnico": string | null,"produto_id": number | null,"protocolo": string | null,"recusado_em": string | null,"responsavel_tecnico_id": string | null,"status": string | null,"tipo": string | null,"token": string | null,"usuario_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "aprovado_em"?: string | null,"celular_reserva_fornecido"?: boolean | null,"cliente_id"?: number | null,"created_at"?: string | null,"data_entrada"?: string | null,"defeito_relatado"?: string | null,"dentro_garantia"?: boolean | null,"dias_garantia_restantes"?: number | null,"empresa_id": number,"estado_entrada"?: string | null,"filial_id"?: number | null,"id"?: never,"imei_serial"?: string | null,"modelo_reserva"?: string | null,"observacoes"?: string | null,"orcamento_valor"?: number | null,"parecer_tecnico"?: string | null,"produto_id"?: number | null,"protocolo"?: string | null,"recusado_em"?: string | null,"responsavel_tecnico_id"?: string | null,"status"?: string | null,"tipo"?: string | null,"token"?: string | null,"usuario_id"?: string | null
                  }
                  Update: {
                    "aprovado_em"?: string | null,"celular_reserva_fornecido"?: boolean | null,"cliente_id"?: number | null,"created_at"?: string | null,"data_entrada"?: string | null,"defeito_relatado"?: string | null,"dentro_garantia"?: boolean | null,"dias_garantia_restantes"?: number | null,"empresa_id"?: number,"estado_entrada"?: string | null,"filial_id"?: number | null,"id"?: never,"imei_serial"?: string | null,"modelo_reserva"?: string | null,"observacoes"?: string | null,"orcamento_valor"?: number | null,"parecer_tecnico"?: string | null,"produto_id"?: number | null,"protocolo"?: string | null,"recusado_em"?: string | null,"responsavel_tecnico_id"?: string | null,"status"?: string | null,"tipo"?: string | null,"token"?: string | null,"usuario_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "garantias_assistencias_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "garantias_assistencias_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "contatos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "garantias_assistencias_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "garantias_assistencias_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "garantias_assistencias_filial_id_fkey"
      columns: ["filial_id"]
isOneToOne: false
      referencedRelation: "filiais"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "garantias_assistencias_produto_id_fkey"
      columns: ["produto_id"]
isOneToOne: false
      referencedRelation: "estoque_produtos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "garantias_assistencias_produto_id_fkey"
      columns: ["produto_id"]
isOneToOne: false
      referencedRelation: "produtos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "garantias_assistencias_responsavel_tecnico_id_fkey"
      columns: ["responsavel_tecnico_id"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "garantias_assistencias_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    }
                  ]
                },"assistencia_orcamentos": {
                  Row: {
                    "acerto": string | null,"aparelho": string | null,"aparelho_novo": string | null,"aparelho_usado": string | null,"aprovado_em": string | null,"cliente_id": number | null,"cliente_nome": string,"cliente_telefone": string | null,"created_at": string | null,"defeito": string | null,"empresa_id": number,"filial_id": number | null,"garantia_dias": number | null,"id": number,"imei": string | null,"itens": NonNullable<Json>,"lead_id": number | null,"observacoes": string | null,"os_id": number | null,"prazo_dias": number | null,"recusado_em": string | null,"status": string,"tipo": string,"token": string,"total": number,"troca_cotacao_id": number | null,"unidade_id": number | null,"usuario_id": string | null,"valor_devolver": number,"valor_entrada": number | null,"valor_novo": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "acerto"?: string | null,"aparelho"?: string | null,"aparelho_novo"?: string | null,"aparelho_usado"?: string | null,"aprovado_em"?: string | null,"cliente_id"?: number | null,"cliente_nome": string,"cliente_telefone"?: string | null,"created_at"?: string | null,"defeito"?: string | null,"empresa_id": number,"filial_id"?: number | null,"garantia_dias"?: number | null,"id"?: never,"imei"?: string | null,"itens"?: NonNullable<Json>,"lead_id"?: number | null,"observacoes"?: string | null,"os_id"?: number | null,"prazo_dias"?: number | null,"recusado_em"?: string | null,"status"?: string,"tipo"?: string,"token"?: string,"total"?: number,"troca_cotacao_id"?: number | null,"unidade_id"?: number | null,"usuario_id"?: string | null,"valor_devolver"?: number,"valor_entrada"?: number | null,"valor_novo"?: number | null
                  }
                  Update: {
                    "acerto"?: string | null,"aparelho"?: string | null,"aparelho_novo"?: string | null,"aparelho_usado"?: string | null,"aprovado_em"?: string | null,"cliente_id"?: number | null,"cliente_nome"?: string,"cliente_telefone"?: string | null,"created_at"?: string | null,"defeito"?: string | null,"empresa_id"?: number,"filial_id"?: number | null,"garantia_dias"?: number | null,"id"?: never,"imei"?: string | null,"itens"?: NonNullable<Json>,"lead_id"?: number | null,"observacoes"?: string | null,"os_id"?: number | null,"prazo_dias"?: number | null,"recusado_em"?: string | null,"status"?: string,"tipo"?: string,"token"?: string,"total"?: number,"troca_cotacao_id"?: number | null,"unidade_id"?: number | null,"usuario_id"?: string | null,"valor_devolver"?: number,"valor_entrada"?: number | null,"valor_novo"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "orcamentos_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orcamentos_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "contatos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orcamentos_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orcamentos_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orcamentos_filial_id_fkey"
      columns: ["filial_id"]
isOneToOne: false
      referencedRelation: "filiais"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orcamentos_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orcamentos_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "negocios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orcamentos_troca_cotacao_id_fkey"
      columns: ["troca_cotacao_id"]
isOneToOne: false
      referencedRelation: "avaliacao_cotacoes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orcamentos_troca_cotacao_id_fkey"
      columns: ["troca_cotacao_id"]
isOneToOne: false
      referencedRelation: "troca_cotacoes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orcamentos_unidade_id_fkey"
      columns: ["unidade_id"]
isOneToOne: false
      referencedRelation: "estoque_unidades"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orcamentos_unidade_id_fkey"
      columns: ["unidade_id"]
isOneToOne: false
      referencedRelation: "inventario_unidades"
      referencedColumns: ["id"]
    }
                  ]
                },"assistencia_servicos": {
                  Row: {
                    "ativo": boolean,"categoria": string | null,"created_at": string,"empresa_id": number,"filial_id": number | null,"id": number,"nome": string,"preco": number,"tempo_estimado_min": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean,"categoria"?: string | null,"created_at"?: string,"empresa_id": number,"filial_id"?: number | null,"id"?: never,"nome": string,"preco"?: number,"tempo_estimado_min"?: number | null
                  }
                  Update: {
                    "ativo"?: boolean,"categoria"?: string | null,"created_at"?: string,"empresa_id"?: number,"filial_id"?: number | null,"id"?: never,"nome"?: string,"preco"?: number,"tempo_estimado_min"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "servicos_reparo_filial_id_fkey"
      columns: ["filial_id"]
isOneToOne: false
      referencedRelation: "filiais"
      referencedColumns: ["id"]
    }
                  ]
                },"assistente_config": {
                  Row: {
                    "ativo": boolean,"id": number,"limite_por_min": number,"modelo": string,"system_extra": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean,"id"?: number,"limite_por_min"?: number,"modelo"?: string,"system_extra"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "ativo"?: boolean,"id"?: number,"limite_por_min"?: number,"modelo"?: string,"system_extra"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"assistente_uso": {
                  Row: {
                    "created_at": string,"empresa_id": number,"id": number,"tokens_in": number | null,"tokens_out": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"empresa_id": number,"id"?: never,"tokens_in"?: number | null,"tokens_out"?: number | null
                  }
                  Update: {
                    "created_at"?: string,"empresa_id"?: number,"id"?: never,"tokens_in"?: number | null,"tokens_out"?: number | null
                  }
                  Relationships: [
                    
                  ]
                },"automacoes": {
                  Row: {
                    "acao": string,"ativo": boolean,"config": NonNullable<Json>,"created_at": string,"empresa_id": number,"etapa_id": number | null,"etapa_slug": string | null,"gatilho": string,"horas": number | null,"id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "acao": string,"ativo"?: boolean,"config"?: NonNullable<Json>,"created_at"?: string,"empresa_id": number,"etapa_id"?: number | null,"etapa_slug"?: string | null,"gatilho": string,"horas"?: number | null,"id"?: never
                  }
                  Update: {
                    "acao"?: string,"ativo"?: boolean,"config"?: NonNullable<Json>,"created_at"?: string,"empresa_id"?: number,"etapa_id"?: number | null,"etapa_slug"?: string | null,"gatilho"?: string,"horas"?: number | null,"id"?: never
                  }
                  Relationships: [
                    {
      foreignKeyName: "automacoes_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "automacoes_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "automacoes_etapa_id_fkey"
      columns: ["etapa_id"]
isOneToOne: false
      referencedRelation: "funil_etapas"
      referencedColumns: ["id"]
    }
                  ]
                },"avaliacao_cotacoes": {
                  Row: {
                    "armazenamento": string,"avarias": NonNullable<Json>,"bonus": number,"checklist": NonNullable<Json>,"cliente_id": number | null,"cliente_nome": string | null,"created_at": string,"descontos_total": number,"empresa_id": number,"filial_id": number | null,"id": number,"imei": string | null,"lead_id": number | null,"modelo": string,"na_troca": number,"numero": number | null,"observacoes": string | null,"status": string,"usada_em": string | null,"usuario_id": string | null,"valor_final": number,"venda_id": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "armazenamento"?: string,"avarias"?: NonNullable<Json>,"bonus"?: number,"checklist"?: NonNullable<Json>,"cliente_id"?: number | null,"cliente_nome"?: string | null,"created_at"?: string,"descontos_total"?: number,"empresa_id": number,"filial_id"?: number | null,"id"?: number,"imei"?: string | null,"lead_id"?: number | null,"modelo": string,"na_troca"?: number,"numero"?: number | null,"observacoes"?: string | null,"status"?: string,"usada_em"?: string | null,"usuario_id"?: string | null,"valor_final"?: number,"venda_id"?: number | null
                  }
                  Update: {
                    "armazenamento"?: string,"avarias"?: NonNullable<Json>,"bonus"?: number,"checklist"?: NonNullable<Json>,"cliente_id"?: number | null,"cliente_nome"?: string | null,"created_at"?: string,"descontos_total"?: number,"empresa_id"?: number,"filial_id"?: number | null,"id"?: number,"imei"?: string | null,"lead_id"?: number | null,"modelo"?: string,"na_troca"?: number,"numero"?: number | null,"observacoes"?: string | null,"status"?: string,"usada_em"?: string | null,"usuario_id"?: string | null,"valor_final"?: number,"venda_id"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "troca_cotacoes_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "troca_cotacoes_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "contatos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "troca_cotacoes_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "troca_cotacoes_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "troca_cotacoes_filial_id_fkey"
      columns: ["filial_id"]
isOneToOne: false
      referencedRelation: "filiais"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "troca_cotacoes_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "troca_cotacoes_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "negocios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "troca_cotacoes_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "troca_cotacoes_venda_id_fkey"
      columns: ["venda_id"]
isOneToOne: false
      referencedRelation: "vendas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "troca_cotacoes_venda_id_fkey"
      columns: ["venda_id"]
isOneToOne: false
      referencedRelation: "vendas_vendas"
      referencedColumns: ["id"]
    }
                  ]
                },"avaliacao_fipe_consultas": {
                  Row: {
                    "ano": string,"ano_label": string | null,"codigo_fipe": string | null,"codigo_marca": number,"codigo_modelo": number,"criado_em": string | null,"id": number,"marca_nome": string | null,"mes_referencia": string | null,"modelo_nome": string | null,"referencia_codigo": number,"tipo": number,"valor": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "ano": string,"ano_label"?: string | null,"codigo_fipe"?: string | null,"codigo_marca": number,"codigo_modelo": number,"criado_em"?: string | null,"id"?: never,"marca_nome"?: string | null,"mes_referencia"?: string | null,"modelo_nome"?: string | null,"referencia_codigo": number,"tipo": number,"valor"?: number | null
                  }
                  Update: {
                    "ano"?: string,"ano_label"?: string | null,"codigo_fipe"?: string | null,"codigo_marca"?: number,"codigo_modelo"?: number,"criado_em"?: string | null,"id"?: never,"marca_nome"?: string | null,"mes_referencia"?: string | null,"modelo_nome"?: string | null,"referencia_codigo"?: number,"tipo"?: number,"valor"?: number | null
                  }
                  Relationships: [
                    
                  ]
                },"avaliacao_fipe_referencia": {
                  Row: {
                    "atualizado_em": string | null,"codigo": number | null,"id": number,"mes": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "atualizado_em"?: string | null,"codigo"?: number | null,"id"?: number,"mes"?: string | null
                  }
                  Update: {
                    "atualizado_em"?: string | null,"codigo"?: number | null,"id"?: number,"mes"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"avaliacao_precos": {
                  Row: {
                    "armazenamento": string,"ativo": boolean,"atualizado_em": string,"descontos": NonNullable<Json>,"empresa_id": number,"id": number,"modelo": string,"na_troca": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "armazenamento"?: string,"ativo"?: boolean,"atualizado_em"?: string,"descontos"?: NonNullable<Json>,"empresa_id": number,"id"?: number,"modelo": string,"na_troca"?: number | null
                  }
                  Update: {
                    "armazenamento"?: string,"ativo"?: boolean,"atualizado_em"?: string,"descontos"?: NonNullable<Json>,"empresa_id"?: number,"id"?: number,"modelo"?: string,"na_troca"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "troca_precos_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "troca_precos_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    }
                  ]
                },"avaliacao_regras": {
                  Row: {
                    "atualizado_em": string,"bonus_seminovo": number,"corte_bateria": number,"empresa_id": number,"observacoes": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "atualizado_em"?: string,"bonus_seminovo"?: number,"corte_bateria"?: number,"empresa_id": number,"observacoes"?: string | null
                  }
                  Update: {
                    "atualizado_em"?: string,"bonus_seminovo"?: number,"corte_bateria"?: number,"empresa_id"?: number,"observacoes"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "troca_regras_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: true
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "troca_regras_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: true
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    }
                  ]
                },"avaliacao_usados": {
                  Row: {
                    "created_at": string | null,"empresa_id": number,"filial_id": number | null,"fotos_urls": string | null,"id": number,"km": number | null,"lead_id": number | null,"observacoes": string | null,"status": string,"unidade_id": number | null,"usuario_id": string | null,"valor_mercado": number | null,"valor_ofertado": number | null,"veiculo": Json | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string | null,"empresa_id": number,"filial_id"?: number | null,"fotos_urls"?: string | null,"id"?: never,"km"?: number | null,"lead_id"?: number | null,"observacoes"?: string | null,"status"?: string,"unidade_id"?: number | null,"usuario_id"?: string | null,"valor_mercado"?: number | null,"valor_ofertado"?: number | null,"veiculo"?: Json | null
                  }
                  Update: {
                    "created_at"?: string | null,"empresa_id"?: number,"filial_id"?: number | null,"fotos_urls"?: string | null,"id"?: never,"km"?: number | null,"lead_id"?: number | null,"observacoes"?: string | null,"status"?: string,"unidade_id"?: number | null,"usuario_id"?: string | null,"valor_mercado"?: number | null,"valor_ofertado"?: number | null,"veiculo"?: Json | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "avaliacoes_usados_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "avaliacoes_usados_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "avaliacoes_usados_filial_id_fkey"
      columns: ["filial_id"]
isOneToOne: false
      referencedRelation: "filiais"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "avaliacoes_usados_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "avaliacoes_usados_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "negocios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "avaliacoes_usados_unidade_id_fkey"
      columns: ["unidade_id"]
isOneToOne: false
      referencedRelation: "estoque_unidades"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "avaliacoes_usados_unidade_id_fkey"
      columns: ["unidade_id"]
isOneToOne: false
      referencedRelation: "inventario_unidades"
      referencedColumns: ["id"]
    }
                  ]
                },"avisos_plataforma": {
                  Row: {
                    "alvo": string,"alvo_valor": string | null,"ativo": boolean,"corpo": string,"created_at": string,"expira_em": string | null,"id": number,"titulo": string,"tom": string
                  }
                  ComputedFields: never
                  Insert: {
                    "alvo"?: string,"alvo_valor"?: string | null,"ativo"?: boolean,"corpo"?: string,"created_at"?: string,"expira_em"?: string | null,"id"?: never,"titulo": string,"tom"?: string
                  }
                  Update: {
                    "alvo"?: string,"alvo_valor"?: string | null,"ativo"?: boolean,"corpo"?: string,"created_at"?: string,"expira_em"?: string | null,"id"?: never,"titulo"?: string,"tom"?: string
                  }
                  Relationships: [
                    
                  ]
                },"cadencia_execucoes": {
                  Row: {
                    "canal": string | null,"created_at": string | null,"empresa_id": number,"executado_por": string | null,"id": number,"inscricao_id": number,"observacao": string | null,"passo_ordem": number | null,"resultado": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "canal"?: string | null,"created_at"?: string | null,"empresa_id": number,"executado_por"?: string | null,"id"?: never,"inscricao_id": number,"observacao"?: string | null,"passo_ordem"?: number | null,"resultado"?: string | null
                  }
                  Update: {
                    "canal"?: string | null,"created_at"?: string | null,"empresa_id"?: number,"executado_por"?: string | null,"id"?: never,"inscricao_id"?: number,"observacao"?: string | null,"passo_ordem"?: number | null,"resultado"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "cadencia_execucoes_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cadencia_execucoes_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cadencia_execucoes_inscricao_id_fkey"
      columns: ["inscricao_id"]
isOneToOne: false
      referencedRelation: "cadencia_inscricoes"
      referencedColumns: ["id"]
    }
                  ]
                },"cadencia_inscricoes": {
                  Row: {
                    "cadencia_id": number,"concluida_em": string | null,"created_at": string | null,"empresa_id": number,"filial_id": number | null,"id": number,"lead_id": number,"negocio_id": number | null,"passo_ordem": number,"proxima_acao_em": string | null,"responsavel_id": string | null,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cadencia_id": number,"concluida_em"?: string | null,"created_at"?: string | null,"empresa_id": number,"filial_id"?: number | null,"id"?: never,"lead_id": number,"negocio_id"?: number | null,"passo_ordem"?: number,"proxima_acao_em"?: string | null,"responsavel_id"?: string | null,"status"?: string
                  }
                  Update: {
                    "cadencia_id"?: number,"concluida_em"?: string | null,"created_at"?: string | null,"empresa_id"?: number,"filial_id"?: number | null,"id"?: never,"lead_id"?: number,"negocio_id"?: number | null,"passo_ordem"?: number,"proxima_acao_em"?: string | null,"responsavel_id"?: string | null,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cadencia_inscricoes_cadencia_id_fkey"
      columns: ["cadencia_id"]
isOneToOne: false
      referencedRelation: "cadencias"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cadencia_inscricoes_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cadencia_inscricoes_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cadencia_inscricoes_filial_id_fkey"
      columns: ["filial_id"]
isOneToOne: false
      referencedRelation: "filiais"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cadencia_inscricoes_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cadencia_inscricoes_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "negocios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cadencia_inscricoes_negocio_id_fkey"
      columns: ["negocio_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cadencia_inscricoes_negocio_id_fkey"
      columns: ["negocio_id"]
isOneToOne: false
      referencedRelation: "negocios"
      referencedColumns: ["id"]
    }
                  ]
                },"cadencia_passos": {
                  Row: {
                    "cadencia_id": number,"canal": string,"created_at": string | null,"dia_offset": number,"empresa_id": number,"id": number,"ordem": number,"template_chave": string | null,"titulo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cadencia_id": number,"canal"?: string,"created_at"?: string | null,"dia_offset"?: number,"empresa_id": number,"id"?: never,"ordem": number,"template_chave"?: string | null,"titulo": string
                  }
                  Update: {
                    "cadencia_id"?: number,"canal"?: string,"created_at"?: string | null,"dia_offset"?: number,"empresa_id"?: number,"id"?: never,"ordem"?: number,"template_chave"?: string | null,"titulo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cadencia_passos_cadencia_id_fkey"
      columns: ["cadencia_id"]
isOneToOne: false
      referencedRelation: "cadencias"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cadencia_passos_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cadencia_passos_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    }
                  ]
                },"cadencias": {
                  Row: {
                    "ativo": boolean,"created_at": string | null,"descricao": string | null,"empresa_id": number,"gatilho": string,"gatilho_etapa_id": number | null,"gatilho_etapa_slug": string | null,"id": number,"nome": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean,"created_at"?: string | null,"descricao"?: string | null,"empresa_id": number,"gatilho"?: string,"gatilho_etapa_id"?: number | null,"gatilho_etapa_slug"?: string | null,"id"?: never,"nome": string
                  }
                  Update: {
                    "ativo"?: boolean,"created_at"?: string | null,"descricao"?: string | null,"empresa_id"?: number,"gatilho"?: string,"gatilho_etapa_id"?: number | null,"gatilho_etapa_slug"?: string | null,"id"?: never,"nome"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cadencias_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cadencias_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cadencias_gatilho_etapa_id_fkey"
      columns: ["gatilho_etapa_id"]
isOneToOne: false
      referencedRelation: "funil_etapas"
      referencedColumns: ["id"]
    }
                  ]
                },"campos_personalizados": {
                  Row: {
                    "ativo": boolean,"chave": string,"created_at": string,"empresa_id": number,"entidade": string,"id": number,"modulo_dono": string | null,"obrigatorio_em_etapas": NonNullable<Json>,"opcoes": NonNullable<Json>,"ordem": number,"rotulo": string,"tipo": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean,"chave": string,"created_at"?: string,"empresa_id": number,"entidade": string,"id"?: number,"modulo_dono"?: string | null,"obrigatorio_em_etapas"?: NonNullable<Json>,"opcoes"?: NonNullable<Json>,"ordem"?: number,"rotulo": string,"tipo": string,"updated_at"?: string
                  }
                  Update: {
                    "ativo"?: boolean,"chave"?: string,"created_at"?: string,"empresa_id"?: number,"entidade"?: string,"id"?: number,"modulo_dono"?: string | null,"obrigatorio_em_etapas"?: NonNullable<Json>,"opcoes"?: NonNullable<Json>,"ordem"?: number,"rotulo"?: string,"tipo"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "campos_personalizados_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "campos_personalizados_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    }
                  ]
                },"canais": {
                  Row: {
                    "access_token_enc": string | null,"coexistencia": boolean,"conectado_em": string,"created_at": string,"criado_por": string | null,"data_access_expira_em": string | null,"empresa_id": number,"external_id": string,"filial_id": number | null,"id": number,"ig_user_id": string | null,"nome_exibicao": string | null,"status": string,"sync_contatos_em": string | null,"sync_historico_em": string | null,"sync_historico_pct": number | null,"sync_request_ids": NonNullable<Json>,"tipo": string,"token_expira_em": string | null,"ultima_msg_em": string | null,"ultimo_erro": string | null,"ultimo_erro_em": string | null,"updated_at": string,"via": string,"waba_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "access_token_enc"?: string | null,"coexistencia"?: boolean,"conectado_em"?: string,"created_at"?: string,"criado_por"?: string | null,"data_access_expira_em"?: string | null,"empresa_id": number,"external_id": string,"filial_id"?: number | null,"id"?: number,"ig_user_id"?: string | null,"nome_exibicao"?: string | null,"status"?: string,"sync_contatos_em"?: string | null,"sync_historico_em"?: string | null,"sync_historico_pct"?: number | null,"sync_request_ids"?: NonNullable<Json>,"tipo": string,"token_expira_em"?: string | null,"ultima_msg_em"?: string | null,"ultimo_erro"?: string | null,"ultimo_erro_em"?: string | null,"updated_at"?: string,"via"?: string,"waba_id"?: string | null
                  }
                  Update: {
                    "access_token_enc"?: string | null,"coexistencia"?: boolean,"conectado_em"?: string,"created_at"?: string,"criado_por"?: string | null,"data_access_expira_em"?: string | null,"empresa_id"?: number,"external_id"?: string,"filial_id"?: number | null,"id"?: number,"ig_user_id"?: string | null,"nome_exibicao"?: string | null,"status"?: string,"sync_contatos_em"?: string | null,"sync_historico_em"?: string | null,"sync_historico_pct"?: number | null,"sync_request_ids"?: NonNullable<Json>,"tipo"?: string,"token_expira_em"?: string | null,"ultima_msg_em"?: string | null,"ultimo_erro"?: string | null,"ultimo_erro_em"?: string | null,"updated_at"?: string,"via"?: string,"waba_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "canais_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "canais_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "canais_filial_id_fkey"
      columns: ["filial_id"]
isOneToOne: false
      referencedRelation: "filiais"
      referencedColumns: ["id"]
    }
                  ]
                },"chamadas": {
                  Row: {
                    "created_at": string | null,"direcao": string,"duracao_seg": number | null,"empresa_id": number,"filial_id": number | null,"id": number,"lead_id": number | null,"observacao": string | null,"resultado": string,"usuario_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string | null,"direcao"?: string,"duracao_seg"?: number | null,"empresa_id": number,"filial_id"?: number | null,"id"?: never,"lead_id"?: number | null,"observacao"?: string | null,"resultado"?: string,"usuario_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string | null,"direcao"?: string,"duracao_seg"?: number | null,"empresa_id"?: number,"filial_id"?: number | null,"id"?: never,"lead_id"?: number | null,"observacao"?: string | null,"resultado"?: string,"usuario_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "chamadas_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "chamadas_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "chamadas_filial_id_fkey"
      columns: ["filial_id"]
isOneToOne: false
      referencedRelation: "filiais"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "chamadas_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "chamadas_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "negocios"
      referencedColumns: ["id"]
    }
                  ]
                },"chat_leituras": {
                  Row: {
                    "conversa": string,"empresa_id": number,"lido_ate": string,"usuario_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "conversa": string,"empresa_id": number,"lido_ate"?: string,"usuario_id": string
                  }
                  Update: {
                    "conversa"?: string,"empresa_id"?: number,"lido_ate"?: string,"usuario_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "chat_leituras_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "chat_leituras_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "chat_leituras_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    }
                  ]
                },"configuracoes_sistema": {
                  Row: {
                    "chave": string,"empresa_id": number,"id": number,"updated_at": string | null,"valor": Json | null
                  }
                  ComputedFields: never
                  Insert: {
                    "chave": string,"empresa_id": number,"id"?: never,"updated_at"?: string | null,"valor"?: Json | null
                  }
                  Update: {
                    "chave"?: string,"empresa_id"?: number,"id"?: never,"updated_at"?: string | null,"valor"?: Json | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "configuracoes_sistema_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "configuracoes_sistema_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    }
                  ]
                },"contato_fusoes": {
                  Row: {
                    "contato_principal_id": number,"contato_removido_id": number,"em": string,"empresa_id": number,"id": number,"movido": NonNullable<Json>,"por_usuario": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "contato_principal_id": number,"contato_removido_id": number,"em"?: string,"empresa_id": number,"id"?: number,"movido"?: NonNullable<Json>,"por_usuario"?: string | null
                  }
                  Update: {
                    "contato_principal_id"?: number,"contato_removido_id"?: number,"em"?: string,"empresa_id"?: number,"id"?: number,"movido"?: NonNullable<Json>,"por_usuario"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "contato_fusoes_contato_principal_id_fkey"
      columns: ["contato_principal_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contato_fusoes_contato_principal_id_fkey"
      columns: ["contato_principal_id"]
isOneToOne: false
      referencedRelation: "contatos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contato_fusoes_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contato_fusoes_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    }
                  ]
                },"contato_identidades": {
                  Row: {
                    "canal_id": number | null,"canal_tipo": string,"contato_id": number,"created_at": string,"empresa_id": number,"external_id": string,"id": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "canal_id"?: number | null,"canal_tipo": string,"contato_id": number,"created_at"?: string,"empresa_id": number,"external_id": string,"id"?: number,"updated_at"?: string
                  }
                  Update: {
                    "canal_id"?: number | null,"canal_tipo"?: string,"contato_id"?: number,"created_at"?: string,"empresa_id"?: number,"external_id"?: string,"id"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "contato_identidades_canal_id_fkey"
      columns: ["canal_id"]
isOneToOne: false
      referencedRelation: "canais"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contato_identidades_canal_id_fkey"
      columns: ["canal_id"]
isOneToOne: false
      referencedRelation: "canais_conectados"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contato_identidades_contato_id_fkey"
      columns: ["contato_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contato_identidades_contato_id_fkey"
      columns: ["contato_id"]
isOneToOne: false
      referencedRelation: "contatos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contato_identidades_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contato_identidades_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    }
                  ]
                },"contatos": {
                  Row: {
                    "ativo": boolean,"cpf_cnpj": string | null,"created_at": string,"dados": NonNullable<Json>,"email": string | null,"empresa_id": number,"endereco": NonNullable<Json>,"filial_id": number | null,"foto_url": string | null,"id": number,"instagram": string | null,"nome": string | null,"observacoes": string | null,"origem": string | null,"origem_id": string | null,"responsavel_desde": string | null,"responsavel_id": string | null,"telefone": string | null,"telefone_e164": string | null,"tipo": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean,"cpf_cnpj"?: string | null,"created_at"?: string,"dados"?: NonNullable<Json>,"email"?: string | null,"empresa_id": number,"endereco"?: NonNullable<Json>,"filial_id"?: number | null,"foto_url"?: string | null,"id"?: number,"instagram"?: string | null,"nome"?: string | null,"observacoes"?: string | null,"origem"?: string | null,"origem_id"?: string | null,"responsavel_desde"?: string | null,"responsavel_id"?: string | null,"telefone"?: string | null,"telefone_e164"?: string | null,"tipo"?: string,"updated_at"?: string
                  }
                  Update: {
                    "ativo"?: boolean,"cpf_cnpj"?: string | null,"created_at"?: string,"dados"?: NonNullable<Json>,"email"?: string | null,"empresa_id"?: number,"endereco"?: NonNullable<Json>,"filial_id"?: number | null,"foto_url"?: string | null,"id"?: number,"instagram"?: string | null,"nome"?: string | null,"observacoes"?: string | null,"origem"?: string | null,"origem_id"?: string | null,"responsavel_desde"?: string | null,"responsavel_id"?: string | null,"telefone"?: string | null,"telefone_e164"?: string | null,"tipo"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "contatos_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contatos_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contatos_filial_id_fkey"
      columns: ["filial_id"]
isOneToOne: false
      referencedRelation: "filiais"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contatos_responsavel_id_fkey"
      columns: ["responsavel_id"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    }
                  ]
                },"conversas": {
                  Row: {
                    "canal_id": number | null,"contato_id": number,"created_at": string,"empresa_id": number,"filial_id": number | null,"id": number,"lida_ate": string | null,"nao_lidas": number,"responsavel_id": string | null,"status": string,"ultima_enviada_at": string | null,"ultima_mensagem_at": string | null,"ultima_recebida_at": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "canal_id"?: number | null,"contato_id": number,"created_at"?: string,"empresa_id": number,"filial_id"?: number | null,"id"?: number,"lida_ate"?: string | null,"nao_lidas"?: number,"responsavel_id"?: string | null,"status"?: string,"ultima_enviada_at"?: string | null,"ultima_mensagem_at"?: string | null,"ultima_recebida_at"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "canal_id"?: number | null,"contato_id"?: number,"created_at"?: string,"empresa_id"?: number,"filial_id"?: number | null,"id"?: number,"lida_ate"?: string | null,"nao_lidas"?: number,"responsavel_id"?: string | null,"status"?: string,"ultima_enviada_at"?: string | null,"ultima_mensagem_at"?: string | null,"ultima_recebida_at"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "conversas_canal_id_fkey"
      columns: ["canal_id"]
isOneToOne: false
      referencedRelation: "canais"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conversas_canal_id_fkey"
      columns: ["canal_id"]
isOneToOne: false
      referencedRelation: "canais_conectados"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conversas_contato_id_fkey"
      columns: ["contato_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conversas_contato_id_fkey"
      columns: ["contato_id"]
isOneToOne: false
      referencedRelation: "contatos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conversas_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conversas_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conversas_filial_id_fkey"
      columns: ["filial_id"]
isOneToOne: false
      referencedRelation: "filiais"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conversas_responsavel_id_fkey"
      columns: ["responsavel_id"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    }
                  ]
                },"diagnostico_canais": {
                  Row: {
                    "created_at": string,"dados": NonNullable<Json>,"empresa_id": number | null,"etapa": string,"id": number,"origem_url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"dados"?: NonNullable<Json>,"empresa_id"?: number | null,"etapa": string,"id"?: number,"origem_url"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"dados"?: NonNullable<Json>,"empresa_id"?: number | null,"etapa"?: string,"id"?: number,"origem_url"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"distribuicao_regras": {
                  Row: {
                    "ativo": boolean,"config": NonNullable<Json>,"created_at": string | null,"criterio": string,"destinatarios": NonNullable<Json>,"empresa_id": number,"id": number,"nome": string,"ordem": number,"rodizio_ptr": number
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean,"config"?: NonNullable<Json>,"created_at"?: string | null,"criterio"?: string,"destinatarios"?: NonNullable<Json>,"empresa_id": number,"id"?: never,"nome": string,"ordem"?: number,"rodizio_ptr"?: number
                  }
                  Update: {
                    "ativo"?: boolean,"config"?: NonNullable<Json>,"created_at"?: string | null,"criterio"?: string,"destinatarios"?: NonNullable<Json>,"empresa_id"?: number,"id"?: never,"nome"?: string,"ordem"?: number,"rodizio_ptr"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "distribuicao_regras_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "distribuicao_regras_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    }
                  ]
                },"empresa_branding": {
                  Row: {
                    "cor": string | null,"created_at": string,"empresa_id": number,"id": number,"logo_url": string | null,"sidebar": NonNullable<Json>,"slogan": string | null,"updated_at": string,"whatsapp": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "cor"?: string | null,"created_at"?: string,"empresa_id": number,"id"?: number,"logo_url"?: string | null,"sidebar"?: NonNullable<Json>,"slogan"?: string | null,"updated_at"?: string,"whatsapp"?: string | null
                  }
                  Update: {
                    "cor"?: string | null,"created_at"?: string,"empresa_id"?: number,"id"?: number,"logo_url"?: string | null,"sidebar"?: NonNullable<Json>,"slogan"?: string | null,"updated_at"?: string,"whatsapp"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "empresa_branding_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: true
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "empresa_branding_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: true
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    }
                  ]
                },"empresa_dados_contrato": {
                  Row: {
                    "banco_agencia": string | null,"banco_conta": string | null,"banco_nome": string | null,"banco_pix": string | null,"created_at": string,"empresa_id": number,"id": number,"representante_cpf": string | null,"representante_estado_civil": string | null,"representante_nacionalidade": string | null,"representante_nome": string | null,"representante_profissao": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "banco_agencia"?: string | null,"banco_conta"?: string | null,"banco_nome"?: string | null,"banco_pix"?: string | null,"created_at"?: string,"empresa_id": number,"id"?: number,"representante_cpf"?: string | null,"representante_estado_civil"?: string | null,"representante_nacionalidade"?: string | null,"representante_nome"?: string | null,"representante_profissao"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "banco_agencia"?: string | null,"banco_conta"?: string | null,"banco_nome"?: string | null,"banco_pix"?: string | null,"created_at"?: string,"empresa_id"?: number,"id"?: number,"representante_cpf"?: string | null,"representante_estado_civil"?: string | null,"representante_nacionalidade"?: string | null,"representante_nome"?: string | null,"representante_profissao"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "empresa_dados_contrato_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: true
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "empresa_dados_contrato_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: true
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    }
                  ]
                },"empresa_menu": {
                  Row: {
                    "created_at": string,"empresa_id": number,"id": number,"itens": NonNullable<Json>,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"empresa_id": number,"id"?: number,"itens"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"empresa_id"?: number,"id"?: number,"itens"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "empresa_menu_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: true
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "empresa_menu_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: true
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    }
                  ]
                },"empresa_modulos": {
                  Row: {
                    "ativo": boolean,"config": NonNullable<Json>,"created_at": string,"empresa_id": number,"instalado_em": string,"instalado_por": string | null,"modulo": string,"origem": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean,"config"?: NonNullable<Json>,"created_at"?: string,"empresa_id": number,"instalado_em"?: string,"instalado_por"?: string | null,"modulo": string,"origem"?: string,"updated_at"?: string
                  }
                  Update: {
                    "ativo"?: boolean,"config"?: NonNullable<Json>,"created_at"?: string,"empresa_id"?: number,"instalado_em"?: string,"instalado_por"?: string | null,"modulo"?: string,"origem"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "empresa_modulos_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "empresa_modulos_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "empresa_modulos_instalado_por_fkey"
      columns: ["instalado_por"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    }
                  ]
                },"empresa_usuarios": {
                  Row: {
                    "ativo": boolean | null,"ausente": boolean,"ausente_em": string | null,"created_at": string | null,"empresa_id": number,"filial_id": number | null,"id": number,"role": string,"usuario_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean | null,"ausente"?: boolean,"ausente_em"?: string | null,"created_at"?: string | null,"empresa_id": number,"filial_id"?: number | null,"id"?: number,"role"?: string,"usuario_id": string
                  }
                  Update: {
                    "ativo"?: boolean | null,"ausente"?: boolean,"ausente_em"?: string | null,"created_at"?: string | null,"empresa_id"?: number,"filial_id"?: number | null,"id"?: number,"role"?: string,"usuario_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "empresa_usuarios_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "empresa_usuarios_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "empresa_usuarios_filial_id_fkey"
      columns: ["filial_id"]
isOneToOne: false
      referencedRelation: "filiais"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "empresa_usuarios_usuario_public_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    }
                  ]
                },"empresas": {
                  Row: {
                    "bairro": string | null,"cep": string | null,"cidade": string | null,"cnpj": string | null,"complemento": string | null,"created_at": string | null,"demo": boolean | null,"email": string | null,"endereco": string | null,"estado": string | null,"id": number,"limite_leads": number | null,"limite_usuarios": number | null,"nome": string,"numero": string | null,"permissoes": Json | null,"plano": string,"preset_onboarding": string | null,"slug": string,"status": string,"stripe_customer_id": string | null,"stripe_price_id": string | null,"stripe_status": string | null,"stripe_subscription_id": string | null,"telefone": string | null,"trial_ends_at": string | null,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "bairro"?: string | null,"cep"?: string | null,"cidade"?: string | null,"cnpj"?: string | null,"complemento"?: string | null,"created_at"?: string | null,"demo"?: boolean | null,"email"?: string | null,"endereco"?: string | null,"estado"?: string | null,"id"?: number,"limite_leads"?: number | null,"limite_usuarios"?: number | null,"nome": string,"numero"?: string | null,"permissoes"?: Json | null,"plano"?: string,"preset_onboarding"?: string | null,"slug": string,"status"?: string,"stripe_customer_id"?: string | null,"stripe_price_id"?: string | null,"stripe_status"?: string | null,"stripe_subscription_id"?: string | null,"telefone"?: string | null,"trial_ends_at"?: string | null,"updated_at"?: string | null
                  }
                  Update: {
                    "bairro"?: string | null,"cep"?: string | null,"cidade"?: string | null,"cnpj"?: string | null,"complemento"?: string | null,"created_at"?: string | null,"demo"?: boolean | null,"email"?: string | null,"endereco"?: string | null,"estado"?: string | null,"id"?: number,"limite_leads"?: number | null,"limite_usuarios"?: number | null,"nome"?: string,"numero"?: string | null,"permissoes"?: Json | null,"plano"?: string,"preset_onboarding"?: string | null,"slug"?: string,"status"?: string,"stripe_customer_id"?: string | null,"stripe_price_id"?: string | null,"stripe_status"?: string | null,"stripe_subscription_id"?: string | null,"telefone"?: string | null,"trial_ends_at"?: string | null,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "empresas_preset_onboarding_fkey"
      columns: ["preset_onboarding"]
isOneToOne: false
      referencedRelation: "presets_onboarding"
      referencedColumns: ["chave"]
    }
                  ]
                },"estoque_categorias": {
                  Row: {
                    "ativo": boolean | null,"created_at": string | null,"empresa_id": number,"id": number,"nome": string,"ordem": number | null,"tipo_formulario": string | null,"usuario_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean | null,"created_at"?: string | null,"empresa_id": number,"id"?: never,"nome": string,"ordem"?: number | null,"tipo_formulario"?: string | null,"usuario_id"?: string | null
                  }
                  Update: {
                    "ativo"?: boolean | null,"created_at"?: string | null,"empresa_id"?: number,"id"?: never,"nome"?: string,"ordem"?: number | null,"tipo_formulario"?: string | null,"usuario_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "categorias_produtos_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "categorias_produtos_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "categorias_produtos_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    }
                  ]
                },"estoque_fornecedores": {
                  Row: {
                    "ativo": boolean | null,"cnpj": string | null,"contato": string | null,"created_at": string | null,"email": string | null,"empresa_id": number,"id": number,"nome_fantasia": string,"observacoes": string | null,"razao_social": string | null,"telefone": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean | null,"cnpj"?: string | null,"contato"?: string | null,"created_at"?: string | null,"email"?: string | null,"empresa_id": number,"id"?: never,"nome_fantasia": string,"observacoes"?: string | null,"razao_social"?: string | null,"telefone"?: string | null
                  }
                  Update: {
                    "ativo"?: boolean | null,"cnpj"?: string | null,"contato"?: string | null,"created_at"?: string | null,"email"?: string | null,"empresa_id"?: number,"id"?: never,"nome_fantasia"?: string,"observacoes"?: string | null,"razao_social"?: string | null,"telefone"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "fornecedores_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fornecedores_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    }
                  ]
                },"estoque_imei_consultas": {
                  Row: {
                    "consultado_em": string,"consultado_por": string | null,"empresa_id": number,"fonte": string,"id": number,"imei": string,"motivo": string | null,"observacoes": string | null,"resultado": string
                  }
                  ComputedFields: never
                  Insert: {
                    "consultado_em"?: string,"consultado_por"?: string | null,"empresa_id": number,"fonte"?: string,"id"?: number,"imei": string,"motivo"?: string | null,"observacoes"?: string | null,"resultado": string
                  }
                  Update: {
                    "consultado_em"?: string,"consultado_por"?: string | null,"empresa_id"?: number,"fonte"?: string,"id"?: number,"imei"?: string,"motivo"?: string | null,"observacoes"?: string | null,"resultado"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "imei_consultas_consultado_por_fkey"
      columns: ["consultado_por"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "imei_consultas_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "imei_consultas_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    }
                  ]
                },"estoque_marcas": {
                  Row: {
                    "ativo": boolean | null,"created_at": string | null,"empresa_id": number,"id": number,"nome": string,"ordem": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean | null,"created_at"?: string | null,"empresa_id": number,"id"?: never,"nome": string,"ordem"?: number | null
                  }
                  Update: {
                    "ativo"?: boolean | null,"created_at"?: string | null,"empresa_id"?: number,"id"?: never,"nome"?: string,"ordem"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "marcas_produtos_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "marcas_produtos_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    }
                  ]
                },"estoque_movimentacoes": {
                  Row: {
                    "created_at": string | null,"empresa_id": number,"filial_id": number | null,"id": number,"observacoes": string | null,"produto_id": number | null,"quantidade": number,"tipo_movimento": string,"usuario_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string | null,"empresa_id": number,"filial_id"?: number | null,"id"?: never,"observacoes"?: string | null,"produto_id"?: number | null,"quantidade": number,"tipo_movimento": string,"usuario_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string | null,"empresa_id"?: number,"filial_id"?: number | null,"id"?: never,"observacoes"?: string | null,"produto_id"?: number | null,"quantidade"?: number,"tipo_movimento"?: string,"usuario_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "movimentacao_estoque_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movimentacao_estoque_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movimentacao_estoque_filial_id_fkey"
      columns: ["filial_id"]
isOneToOne: false
      referencedRelation: "filiais"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movimentacao_estoque_produto_id_fkey"
      columns: ["produto_id"]
isOneToOne: false
      referencedRelation: "estoque_produtos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movimentacao_estoque_produto_id_fkey"
      columns: ["produto_id"]
isOneToOne: false
      referencedRelation: "produtos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movimentacao_estoque_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    }
                  ]
                },"estoque_produtos": {
                  Row: {
                    "armazenamentos": (string)[] | null,"ativo": boolean | null,"categoria_id": number | null,"categoria_tipo": string | null,"codigos": string | null,"cores": (string)[] | null,"created_at": string | null,"descricao": string | null,"disponivel": boolean | null,"empresa_id": number,"foto_url": string | null,"garantia_dias": number | null,"id": number,"marca_id": number | null,"nome": string,"preco": number | null,"subcategoria_id": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "armazenamentos"?: (string)[] | null,"ativo"?: boolean | null,"categoria_id"?: number | null,"categoria_tipo"?: string | null,"codigos"?: string | null,"cores"?: (string)[] | null,"created_at"?: string | null,"descricao"?: string | null,"disponivel"?: boolean | null,"empresa_id": number,"foto_url"?: string | null,"garantia_dias"?: number | null,"id"?: number,"marca_id"?: number | null,"nome": string,"preco"?: number | null,"subcategoria_id"?: number | null
                  }
                  Update: {
                    "armazenamentos"?: (string)[] | null,"ativo"?: boolean | null,"categoria_id"?: number | null,"categoria_tipo"?: string | null,"codigos"?: string | null,"cores"?: (string)[] | null,"created_at"?: string | null,"descricao"?: string | null,"disponivel"?: boolean | null,"empresa_id"?: number,"foto_url"?: string | null,"garantia_dias"?: number | null,"id"?: number,"marca_id"?: number | null,"nome"?: string,"preco"?: number | null,"subcategoria_id"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "produtos_categoria_id_fkey"
      columns: ["categoria_id"]
isOneToOne: false
      referencedRelation: "categorias_produtos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "produtos_categoria_id_fkey"
      columns: ["categoria_id"]
isOneToOne: false
      referencedRelation: "estoque_categorias"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "produtos_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "produtos_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "produtos_marca_id_fkey"
      columns: ["marca_id"]
isOneToOne: false
      referencedRelation: "estoque_marcas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "produtos_marca_id_fkey"
      columns: ["marca_id"]
isOneToOne: false
      referencedRelation: "marcas_produtos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "produtos_subcategoria_id_fkey"
      columns: ["subcategoria_id"]
isOneToOne: false
      referencedRelation: "estoque_subcategorias"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "produtos_subcategoria_id_fkey"
      columns: ["subcategoria_id"]
isOneToOne: false
      referencedRelation: "subcategorias_produtos"
      referencedColumns: ["id"]
    }
                  ]
                },"estoque_subcategorias": {
                  Row: {
                    "ativo": boolean | null,"categoria_id": number | null,"created_at": string | null,"empresa_id": number,"id": number,"nome": string,"ordem": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean | null,"categoria_id"?: number | null,"created_at"?: string | null,"empresa_id": number,"id"?: never,"nome": string,"ordem"?: number | null
                  }
                  Update: {
                    "ativo"?: boolean | null,"categoria_id"?: number | null,"created_at"?: string | null,"empresa_id"?: number,"id"?: never,"nome"?: string,"ordem"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "subcategorias_produtos_categoria_id_fkey"
      columns: ["categoria_id"]
isOneToOne: false
      referencedRelation: "categorias_produtos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subcategorias_produtos_categoria_id_fkey"
      columns: ["categoria_id"]
isOneToOne: false
      referencedRelation: "estoque_categorias"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subcategorias_produtos_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subcategorias_produtos_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    }
                  ]
                },"estoque_tabela_precos": {
                  Row: {
                    "armazenamento": string | null,"ativo": boolean,"condicao": string,"created_at": string,"empresa_id": number,"id": number,"modelo": string,"observacoes": string | null,"preco_sugerido": number
                  }
                  ComputedFields: never
                  Insert: {
                    "armazenamento"?: string | null,"ativo"?: boolean,"condicao"?: string,"created_at"?: string,"empresa_id": number,"id"?: never,"modelo": string,"observacoes"?: string | null,"preco_sugerido"?: number
                  }
                  Update: {
                    "armazenamento"?: string | null,"ativo"?: boolean,"condicao"?: string,"created_at"?: string,"empresa_id"?: number,"id"?: never,"modelo"?: string,"observacoes"?: string | null,"preco_sugerido"?: number
                  }
                  Relationships: [
                    
                  ]
                },"estoque_unidades": {
                  Row: {
                    "anatel_resultado": string | null,"ano": number | null,"armazenamento": string | null,"ativo": boolean | null,"bateria": string | null,"chassi": string | null,"cliente_id": number | null,"condicao": string | null,"cor": string | null,"created_at": string | null,"custo_reparo": number | null,"empresa_id": number,"estado": string | null,"filial_id": number | null,"fornecedor_id": number | null,"fotos_urls": string | null,"grupo_pdv": string | null,"id": number,"imei": string | null,"imei2": string | null,"km": number | null,"numero_serie": string | null,"observacoes": string | null,"placa": string | null,"preco_custo": number | null,"preco_venda": number | null,"produto_id": number | null,"quantidade": number,"recebido_em": string | null,"recebido_por": string | null,"renavam": string | null,"reserva_expira_em": string | null,"reservado_em": string | null,"reservado_lead_id": number | null,"reservado_por": string | null,"status": string | null,"tipo": string | null,"usuario_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "anatel_resultado"?: string | null,"ano"?: number | null,"armazenamento"?: string | null,"ativo"?: boolean | null,"bateria"?: string | null,"chassi"?: string | null,"cliente_id"?: number | null,"condicao"?: string | null,"cor"?: string | null,"created_at"?: string | null,"custo_reparo"?: number | null,"empresa_id": number,"estado"?: string | null,"filial_id"?: number | null,"fornecedor_id"?: number | null,"fotos_urls"?: string | null,"grupo_pdv"?: string | null,"id"?: number,"imei"?: string | null,"imei2"?: string | null,"km"?: number | null,"numero_serie"?: string | null,"observacoes"?: string | null,"placa"?: string | null,"preco_custo"?: number | null,"preco_venda"?: number | null,"produto_id"?: number | null,"quantidade"?: number,"recebido_em"?: string | null,"recebido_por"?: string | null,"renavam"?: string | null,"reserva_expira_em"?: string | null,"reservado_em"?: string | null,"reservado_lead_id"?: number | null,"reservado_por"?: string | null,"status"?: string | null,"tipo"?: string | null,"usuario_id"?: string | null
                  }
                  Update: {
                    "anatel_resultado"?: string | null,"ano"?: number | null,"armazenamento"?: string | null,"ativo"?: boolean | null,"bateria"?: string | null,"chassi"?: string | null,"cliente_id"?: number | null,"condicao"?: string | null,"cor"?: string | null,"created_at"?: string | null,"custo_reparo"?: number | null,"empresa_id"?: number,"estado"?: string | null,"filial_id"?: number | null,"fornecedor_id"?: number | null,"fotos_urls"?: string | null,"grupo_pdv"?: string | null,"id"?: number,"imei"?: string | null,"imei2"?: string | null,"km"?: number | null,"numero_serie"?: string | null,"observacoes"?: string | null,"placa"?: string | null,"preco_custo"?: number | null,"preco_venda"?: number | null,"produto_id"?: number | null,"quantidade"?: number,"recebido_em"?: string | null,"recebido_por"?: string | null,"renavam"?: string | null,"reserva_expira_em"?: string | null,"reservado_em"?: string | null,"reservado_lead_id"?: number | null,"reservado_por"?: string | null,"status"?: string | null,"tipo"?: string | null,"usuario_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "inventario_unidades_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventario_unidades_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "contatos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventario_unidades_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventario_unidades_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventario_unidades_filial_id_fkey"
      columns: ["filial_id"]
isOneToOne: false
      referencedRelation: "filiais"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventario_unidades_fornecedor_id_fkey"
      columns: ["fornecedor_id"]
isOneToOne: false
      referencedRelation: "estoque_fornecedores"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventario_unidades_fornecedor_id_fkey"
      columns: ["fornecedor_id"]
isOneToOne: false
      referencedRelation: "fornecedores"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventario_unidades_produto_id_fkey"
      columns: ["produto_id"]
isOneToOne: false
      referencedRelation: "estoque_produtos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventario_unidades_produto_id_fkey"
      columns: ["produto_id"]
isOneToOne: false
      referencedRelation: "produtos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventario_unidades_recebido_por_fkey"
      columns: ["recebido_por"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventario_unidades_reservado_lead_id_fkey"
      columns: ["reservado_lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventario_unidades_reservado_lead_id_fkey"
      columns: ["reservado_lead_id"]
isOneToOne: false
      referencedRelation: "negocios"
      referencedColumns: ["id"]
    }
                  ]
                },"estoque_veiculo_dados": {
                  Row: {
                    "ano": number | null,"chassi": string | null,"created_at": string | null,"empresa_id": number,"km": number | null,"placa": string | null,"renavam": string | null,"unidade_id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "ano"?: number | null,"chassi"?: string | null,"created_at"?: string | null,"empresa_id": number,"km"?: number | null,"placa"?: string | null,"renavam"?: string | null,"unidade_id": number
                  }
                  Update: {
                    "ano"?: number | null,"chassi"?: string | null,"created_at"?: string | null,"empresa_id"?: number,"km"?: number | null,"placa"?: string | null,"renavam"?: string | null,"unidade_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "veiculo_dados_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "veiculo_dados_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "veiculo_dados_unidade_id_fkey"
      columns: ["unidade_id"]
isOneToOne: true
      referencedRelation: "estoque_unidades"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "veiculo_dados_unidade_id_fkey"
      columns: ["unidade_id"]
isOneToOne: true
      referencedRelation: "inventario_unidades"
      referencedColumns: ["id"]
    }
                  ]
                },"eventos": {
                  Row: {
                    "dados": NonNullable<Json>,"em": string,"empresa_id": number,"entidade": string | null,"entidade_id": number | null,"filial_id": number | null,"id": number,"por_usuario": string | null,"tipo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "dados"?: NonNullable<Json>,"em"?: string,"empresa_id": number,"entidade"?: string | null,"entidade_id"?: number | null,"filial_id"?: number | null,"id"?: number,"por_usuario"?: string | null,"tipo": string
                  }
                  Update: {
                    "dados"?: NonNullable<Json>,"em"?: string,"empresa_id"?: number,"entidade"?: string | null,"entidade_id"?: number | null,"filial_id"?: number | null,"id"?: number,"por_usuario"?: string | null,"tipo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "eventos_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "eventos_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "eventos_filial_id_fkey"
      columns: ["filial_id"]
isOneToOne: false
      referencedRelation: "filiais"
      referencedColumns: ["id"]
    }
                  ]
                },"filiais": {
                  Row: {
                    "ativo": boolean,"bairro": string | null,"cep": string | null,"cidade": string | null,"cnpj": string | null,"complemento": string | null,"created_at": string,"email": string | null,"empresa_id": number,"endereco": string | null,"estado": string | null,"id": number,"matriz": boolean,"nome": string,"numero": string | null,"representante_cpf": string | null,"representante_nome": string | null,"telefone": string | null,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean,"bairro"?: string | null,"cep"?: string | null,"cidade"?: string | null,"cnpj"?: string | null,"complemento"?: string | null,"created_at"?: string,"email"?: string | null,"empresa_id": number,"endereco"?: string | null,"estado"?: string | null,"id"?: number,"matriz"?: boolean,"nome": string,"numero"?: string | null,"representante_cpf"?: string | null,"representante_nome"?: string | null,"telefone"?: string | null,"updated_at"?: string | null
                  }
                  Update: {
                    "ativo"?: boolean,"bairro"?: string | null,"cep"?: string | null,"cidade"?: string | null,"cnpj"?: string | null,"complemento"?: string | null,"created_at"?: string,"email"?: string | null,"empresa_id"?: number,"endereco"?: string | null,"estado"?: string | null,"id"?: number,"matriz"?: boolean,"nome"?: string,"numero"?: string | null,"representante_cpf"?: string | null,"representante_nome"?: string | null,"telefone"?: string | null,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "filiais_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "filiais_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    }
                  ]
                },"financeiro_cobrancas": {
                  Row: {
                    "cliente_id": number | null,"created_at": string,"descricao": string | null,"empresa_id": number,"filial_id": number | null,"id": number,"linha_digitavel": string | null,"link_pagamento": string | null,"metadata": Json | null,"os_id": number | null,"pago_em": string | null,"provider": string,"provider_ref": string | null,"qr_code": string | null,"qr_code_base64": string | null,"status": string,"tipo": string,"valor": number,"vencimento": string | null,"venda_id": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "cliente_id"?: number | null,"created_at"?: string,"descricao"?: string | null,"empresa_id": number,"filial_id"?: number | null,"id"?: never,"linha_digitavel"?: string | null,"link_pagamento"?: string | null,"metadata"?: Json | null,"os_id"?: number | null,"pago_em"?: string | null,"provider": string,"provider_ref"?: string | null,"qr_code"?: string | null,"qr_code_base64"?: string | null,"status"?: string,"tipo": string,"valor": number,"vencimento"?: string | null,"venda_id"?: number | null
                  }
                  Update: {
                    "cliente_id"?: number | null,"created_at"?: string,"descricao"?: string | null,"empresa_id"?: number,"filial_id"?: number | null,"id"?: never,"linha_digitavel"?: string | null,"link_pagamento"?: string | null,"metadata"?: Json | null,"os_id"?: number | null,"pago_em"?: string | null,"provider"?: string,"provider_ref"?: string | null,"qr_code"?: string | null,"qr_code_base64"?: string | null,"status"?: string,"tipo"?: string,"valor"?: number,"vencimento"?: string | null,"venda_id"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "cobrancas_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cobrancas_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "contatos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cobrancas_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cobrancas_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cobrancas_filial_id_fkey"
      columns: ["filial_id"]
isOneToOne: false
      referencedRelation: "filiais"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cobrancas_os_id_fkey"
      columns: ["os_id"]
isOneToOne: false
      referencedRelation: "assistencia_garantias"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cobrancas_os_id_fkey"
      columns: ["os_id"]
isOneToOne: false
      referencedRelation: "garantias_assistencias"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cobrancas_venda_id_fkey"
      columns: ["venda_id"]
isOneToOne: false
      referencedRelation: "vendas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cobrancas_venda_id_fkey"
      columns: ["venda_id"]
isOneToOne: false
      referencedRelation: "vendas_vendas"
      referencedColumns: ["id"]
    }
                  ]
                },"financeiro_config_pagamento": {
                  Row: {
                    "ativo": boolean,"atualizado_em": string,"credenciais_cipher": string | null,"empresa_id": number,"modo": string,"provider": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean,"atualizado_em"?: string,"credenciais_cipher"?: string | null,"empresa_id": number,"modo"?: string,"provider"?: string
                  }
                  Update: {
                    "ativo"?: boolean,"atualizado_em"?: string,"credenciais_cipher"?: string | null,"empresa_id"?: number,"modo"?: string,"provider"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tenant_payment_config_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: true
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tenant_payment_config_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: true
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    }
                  ]
                },"financeiro_lancamentos": {
                  Row: {
                    "categoria": string | null,"created_at": string | null,"data_pgto": string | null,"data_venc": string,"descricao": string,"empresa_id": number,"filial_id": number | null,"forma_pgto": string | null,"id": number,"observacoes": string | null,"referencia_id": number | null,"referencia_tp": string | null,"status": string,"tipo": string,"updated_at": string | null,"valor": number
                  }
                  ComputedFields: never
                  Insert: {
                    "categoria"?: string | null,"created_at"?: string | null,"data_pgto"?: string | null,"data_venc": string,"descricao": string,"empresa_id": number,"filial_id"?: number | null,"forma_pgto"?: string | null,"id"?: number,"observacoes"?: string | null,"referencia_id"?: number | null,"referencia_tp"?: string | null,"status"?: string,"tipo": string,"updated_at"?: string | null,"valor": number
                  }
                  Update: {
                    "categoria"?: string | null,"created_at"?: string | null,"data_pgto"?: string | null,"data_venc"?: string,"descricao"?: string,"empresa_id"?: number,"filial_id"?: number | null,"forma_pgto"?: string | null,"id"?: number,"observacoes"?: string | null,"referencia_id"?: number | null,"referencia_tp"?: string | null,"status"?: string,"tipo"?: string,"updated_at"?: string | null,"valor"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "lancamentos_financeiros_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lancamentos_financeiros_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lancamentos_financeiros_filial_id_fkey"
      columns: ["filial_id"]
isOneToOne: false
      referencedRelation: "filiais"
      referencedColumns: ["id"]
    }
                  ]
                },"financeiro_taxas": {
                  Row: {
                    "ativo": boolean | null,"bandeira": string | null,"created_at": string | null,"empresa_id": number,"forma_pagamento": string,"id": number,"parcelas": number | null,"percentual_taxa": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean | null,"bandeira"?: string | null,"created_at"?: string | null,"empresa_id": number,"forma_pagamento": string,"id"?: never,"parcelas"?: number | null,"percentual_taxa"?: number | null
                  }
                  Update: {
                    "ativo"?: boolean | null,"bandeira"?: string | null,"created_at"?: string | null,"empresa_id"?: number,"forma_pagamento"?: string,"id"?: never,"parcelas"?: number | null,"percentual_taxa"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "taxas_pagamento_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "taxas_pagamento_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    }
                  ]
                },"financeiro_webhook_eventos": {
                  Row: {
                    "event_type": string | null,"id": number,"processado_em": string,"provider": string,"provider_ref": string
                  }
                  ComputedFields: never
                  Insert: {
                    "event_type"?: string | null,"id"?: never,"processado_em"?: string,"provider": string,"provider_ref": string
                  }
                  Update: {
                    "event_type"?: string | null,"id"?: never,"processado_em"?: string,"provider"?: string,"provider_ref"?: string
                  }
                  Relationships: [
                    
                  ]
                },"funil_etapas": {
                  Row: {
                    "ativo": boolean,"campos_obrigatorios": NonNullable<Json>,"cor": string,"created_at": string,"empresa_id": number,"funil_id": number | null,"id": number,"label": string,"ordem": number,"probabilidade": number,"slug": string,"tipo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean,"campos_obrigatorios"?: NonNullable<Json>,"cor"?: string,"created_at"?: string,"empresa_id": number,"funil_id"?: number | null,"id"?: number,"label": string,"ordem"?: number,"probabilidade"?: number,"slug": string,"tipo"?: string
                  }
                  Update: {
                    "ativo"?: boolean,"campos_obrigatorios"?: NonNullable<Json>,"cor"?: string,"created_at"?: string,"empresa_id"?: number,"funil_id"?: number | null,"id"?: number,"label"?: string,"ordem"?: number,"probabilidade"?: number,"slug"?: string,"tipo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "funil_etapas_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "funil_etapas_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "funil_etapas_funil_id_fkey"
      columns: ["funil_id"]
isOneToOne: false
      referencedRelation: "funis"
      referencedColumns: ["id"]
    }
                  ]
                },"funis": {
                  Row: {
                    "created_at": string,"empresa_id": number,"id": number,"interno": boolean,"nome": string,"padrao": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"empresa_id": number,"id"?: never,"interno"?: boolean,"nome": string,"padrao"?: boolean
                  }
                  Update: {
                    "created_at"?: string,"empresa_id"?: number,"id"?: never,"interno"?: boolean,"nome"?: string,"padrao"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "funis_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "funis_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    }
                  ]
                },"historico_bruto": {
                  Row: {
                    "canal_id": number | null,"created_at": string,"empresa_id": number | null,"id": number,"payload": NonNullable<Json>,"processado_em": string | null,"tipo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "canal_id"?: number | null,"created_at"?: string,"empresa_id"?: number | null,"id"?: never,"payload": NonNullable<Json>,"processado_em"?: string | null,"tipo": string
                  }
                  Update: {
                    "canal_id"?: number | null,"created_at"?: string,"empresa_id"?: number | null,"id"?: never,"payload"?: NonNullable<Json>,"processado_em"?: string | null,"tipo"?: string
                  }
                  Relationships: [
                    
                  ]
                },"imoveis_chaves": {
                  Row: {
                    "codigo": string | null,"com_quem": string | null,"created_at": string | null,"devolucao_prevista": string | null,"empresa_id": number,"id": number,"imovel_id": number | null,"observacoes": string | null,"retirada_em": string | null,"status": string,"usuario_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "codigo"?: string | null,"com_quem"?: string | null,"created_at"?: string | null,"devolucao_prevista"?: string | null,"empresa_id": number,"id"?: never,"imovel_id"?: number | null,"observacoes"?: string | null,"retirada_em"?: string | null,"status"?: string,"usuario_id"?: string | null
                  }
                  Update: {
                    "codigo"?: string | null,"com_quem"?: string | null,"created_at"?: string | null,"devolucao_prevista"?: string | null,"empresa_id"?: number,"id"?: never,"imovel_id"?: number | null,"observacoes"?: string | null,"retirada_em"?: string | null,"status"?: string,"usuario_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "chaves_imoveis_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "chaves_imoveis_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "chaves_imoveis_imovel_id_fkey"
      columns: ["imovel_id"]
isOneToOne: false
      referencedRelation: "imoveis"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "chaves_imoveis_imovel_id_fkey"
      columns: ["imovel_id"]
isOneToOne: false
      referencedRelation: "imoveis_imoveis"
      referencedColumns: ["id"]
    }
                  ]
                },"imoveis_imoveis": {
                  Row: {
                    "aceita_financiamento": boolean | null,"aceita_permuta": boolean | null,"area_total": number | null,"area_util": number | null,"bairro": string | null,"banheiros": number | null,"captado_em": string | null,"captado_por": string | null,"cep": string | null,"cidade": string | null,"codigo": string | null,"complemento": string | null,"created_at": string | null,"descricao": string | null,"empresa_id": number,"finalidade": string,"fotos": Json | null,"id": number,"iptu_periodicidade": string | null,"latitude": number | null,"logradouro": string | null,"longitude": number | null,"matricula": string | null,"numero": string | null,"ocultar_numero_publico": boolean | null,"proprietario_id": number | null,"publicar_portais": boolean | null,"quartos": number | null,"status": string,"suites": number | null,"tipo": string,"titulo": string | null,"uf": string | null,"updated_at": string | null,"vagas": number | null,"valor_condominio": number | null,"valor_iptu": number | null,"valor_locacao": number | null,"valor_venda": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "aceita_financiamento"?: boolean | null,"aceita_permuta"?: boolean | null,"area_total"?: number | null,"area_util"?: number | null,"bairro"?: string | null,"banheiros"?: number | null,"captado_em"?: string | null,"captado_por"?: string | null,"cep"?: string | null,"cidade"?: string | null,"codigo"?: string | null,"complemento"?: string | null,"created_at"?: string | null,"descricao"?: string | null,"empresa_id": number,"finalidade"?: string,"fotos"?: Json | null,"id"?: number,"iptu_periodicidade"?: string | null,"latitude"?: number | null,"logradouro"?: string | null,"longitude"?: number | null,"matricula"?: string | null,"numero"?: string | null,"ocultar_numero_publico"?: boolean | null,"proprietario_id"?: number | null,"publicar_portais"?: boolean | null,"quartos"?: number | null,"status"?: string,"suites"?: number | null,"tipo"?: string,"titulo"?: string | null,"uf"?: string | null,"updated_at"?: string | null,"vagas"?: number | null,"valor_condominio"?: number | null,"valor_iptu"?: number | null,"valor_locacao"?: number | null,"valor_venda"?: number | null
                  }
                  Update: {
                    "aceita_financiamento"?: boolean | null,"aceita_permuta"?: boolean | null,"area_total"?: number | null,"area_util"?: number | null,"bairro"?: string | null,"banheiros"?: number | null,"captado_em"?: string | null,"captado_por"?: string | null,"cep"?: string | null,"cidade"?: string | null,"codigo"?: string | null,"complemento"?: string | null,"created_at"?: string | null,"descricao"?: string | null,"empresa_id"?: number,"finalidade"?: string,"fotos"?: Json | null,"id"?: number,"iptu_periodicidade"?: string | null,"latitude"?: number | null,"logradouro"?: string | null,"longitude"?: number | null,"matricula"?: string | null,"numero"?: string | null,"ocultar_numero_publico"?: boolean | null,"proprietario_id"?: number | null,"publicar_portais"?: boolean | null,"quartos"?: number | null,"status"?: string,"suites"?: number | null,"tipo"?: string,"titulo"?: string | null,"uf"?: string | null,"updated_at"?: string | null,"vagas"?: number | null,"valor_condominio"?: number | null,"valor_iptu"?: number | null,"valor_locacao"?: number | null,"valor_venda"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "imoveis_captado_por_fkey"
      columns: ["captado_por"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "imoveis_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "imoveis_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "imoveis_proprietario_id_fkey"
      columns: ["proprietario_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "imoveis_proprietario_id_fkey"
      columns: ["proprietario_id"]
isOneToOne: false
      referencedRelation: "contatos"
      referencedColumns: ["id"]
    }
                  ]
                },"imoveis_negocios": {
                  Row: {
                    "assinado_em": string | null,"captador_id": string | null,"cashback": number,"cashback_percentual": number | null,"chaves_entregues_em": string | null,"cliente_id": number | null,"cliente_nome": string | null,"comissao_aprovada_em": string | null,"comissao_captador": number | null,"comissao_paga_em": string | null,"comissao_status": string,"comissao_total": number | null,"comissao_vendedor": number | null,"corretor_id": string | null,"created_at": string,"criado_por": string | null,"empresa_id": number,"id": number,"imovel_codigo": string | null,"imovel_id": number | null,"lead_id": number | null,"locacao_fim": string | null,"locacao_inicio": string | null,"observacoes": string | null,"origem": string,"percentual": number | null,"status": string,"tipo": string,"updated_at": string,"valor": number,"vistoria_em": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "assinado_em"?: string | null,"captador_id"?: string | null,"cashback"?: number,"cashback_percentual"?: number | null,"chaves_entregues_em"?: string | null,"cliente_id"?: number | null,"cliente_nome"?: string | null,"comissao_aprovada_em"?: string | null,"comissao_captador"?: number | null,"comissao_paga_em"?: string | null,"comissao_status"?: string,"comissao_total"?: number | null,"comissao_vendedor"?: number | null,"corretor_id"?: string | null,"created_at"?: string,"criado_por"?: string | null,"empresa_id": number,"id"?: number,"imovel_codigo"?: string | null,"imovel_id"?: number | null,"lead_id"?: number | null,"locacao_fim"?: string | null,"locacao_inicio"?: string | null,"observacoes"?: string | null,"origem"?: string,"percentual"?: number | null,"status"?: string,"tipo": string,"updated_at"?: string,"valor": number,"vistoria_em"?: string | null
                  }
                  Update: {
                    "assinado_em"?: string | null,"captador_id"?: string | null,"cashback"?: number,"cashback_percentual"?: number | null,"chaves_entregues_em"?: string | null,"cliente_id"?: number | null,"cliente_nome"?: string | null,"comissao_aprovada_em"?: string | null,"comissao_captador"?: number | null,"comissao_paga_em"?: string | null,"comissao_status"?: string,"comissao_total"?: number | null,"comissao_vendedor"?: number | null,"corretor_id"?: string | null,"created_at"?: string,"criado_por"?: string | null,"empresa_id"?: number,"id"?: number,"imovel_codigo"?: string | null,"imovel_id"?: number | null,"lead_id"?: number | null,"locacao_fim"?: string | null,"locacao_inicio"?: string | null,"observacoes"?: string | null,"origem"?: string,"percentual"?: number | null,"status"?: string,"tipo"?: string,"updated_at"?: string,"valor"?: number,"vistoria_em"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "negocios_imobiliarios_captador_id_fkey"
      columns: ["captador_id"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "negocios_imobiliarios_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "negocios_imobiliarios_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "contatos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "negocios_imobiliarios_corretor_id_fkey"
      columns: ["corretor_id"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "negocios_imobiliarios_criado_por_fkey"
      columns: ["criado_por"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "negocios_imobiliarios_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "negocios_imobiliarios_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "negocios_imobiliarios_imovel_id_fkey"
      columns: ["imovel_id"]
isOneToOne: false
      referencedRelation: "imoveis"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "negocios_imobiliarios_imovel_id_fkey"
      columns: ["imovel_id"]
isOneToOne: false
      referencedRelation: "imoveis_imoveis"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "negocios_imobiliarios_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "negocios_imobiliarios_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "negocios"
      referencedColumns: ["id"]
    }
                  ]
                },"imoveis_perfis_busca": {
                  Row: {
                    "area_max": number | null,"area_min": number | null,"ativo": boolean,"bairros": (string)[],"caracteristicas": (string)[] | null,"cidades": (string)[],"cliente_id": number | null,"created_at": string | null,"empresa_id": number,"filial_id": number | null,"finalidade": string | null,"id": number,"lead_id": number | null,"observacoes": string | null,"preco_max": number | null,"preco_min": number | null,"quartos_max": number | null,"quartos_min": number | null,"suites_min": number | null,"tipos": (string)[],"updated_at": string | null,"vagas_min": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "area_max"?: number | null,"area_min"?: number | null,"ativo"?: boolean,"bairros"?: (string)[],"caracteristicas"?: (string)[] | null,"cidades"?: (string)[],"cliente_id"?: number | null,"created_at"?: string | null,"empresa_id": number,"filial_id"?: number | null,"finalidade"?: string | null,"id"?: number,"lead_id"?: number | null,"observacoes"?: string | null,"preco_max"?: number | null,"preco_min"?: number | null,"quartos_max"?: number | null,"quartos_min"?: number | null,"suites_min"?: number | null,"tipos"?: (string)[],"updated_at"?: string | null,"vagas_min"?: number | null
                  }
                  Update: {
                    "area_max"?: number | null,"area_min"?: number | null,"ativo"?: boolean,"bairros"?: (string)[],"caracteristicas"?: (string)[] | null,"cidades"?: (string)[],"cliente_id"?: number | null,"created_at"?: string | null,"empresa_id"?: number,"filial_id"?: number | null,"finalidade"?: string | null,"id"?: number,"lead_id"?: number | null,"observacoes"?: string | null,"preco_max"?: number | null,"preco_min"?: number | null,"quartos_max"?: number | null,"quartos_min"?: number | null,"suites_min"?: number | null,"tipos"?: (string)[],"updated_at"?: string | null,"vagas_min"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "lead_perfil_busca_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lead_perfil_busca_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "contatos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lead_perfil_busca_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lead_perfil_busca_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lead_perfil_busca_filial_id_fkey"
      columns: ["filial_id"]
isOneToOne: false
      referencedRelation: "filiais"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lead_perfil_busca_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: true
      referencedRelation: "leads"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lead_perfil_busca_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: true
      referencedRelation: "negocios"
      referencedColumns: ["id"]
    }
                  ]
                },"integracao_eventos": {
                  Row: {
                    "acao": string | null,"created_at": string,"detalhes": string | null,"empresa_id": number,"externo_id": string | null,"id": number,"lead_id": number | null,"origem": string,"payload": Json | null,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "acao"?: string | null,"created_at"?: string,"detalhes"?: string | null,"empresa_id": number,"externo_id"?: string | null,"id"?: number,"lead_id"?: number | null,"origem": string,"payload"?: Json | null,"status": string
                  }
                  Update: {
                    "acao"?: string | null,"created_at"?: string,"detalhes"?: string | null,"empresa_id"?: number,"externo_id"?: string | null,"id"?: number,"lead_id"?: number | null,"origem"?: string,"payload"?: Json | null,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "integracao_eventos_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "integracao_eventos_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "integracao_eventos_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "integracao_eventos_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "negocios"
      referencedColumns: ["id"]
    }
                  ]
                },"itens": {
                  Row: {
                    "codigo": string | null,"created_at": string,"custo": number | null,"dados": NonNullable<Json>,"empresa_id": number,"filial_id": number | null,"id": number,"identificador": string | null,"modulo_dono": string,"preco": number | null,"ref_id": number | null,"ref_tabela": string | null,"status": string | null,"tipo": string,"titulo": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "codigo"?: string | null,"created_at"?: string,"custo"?: number | null,"dados"?: NonNullable<Json>,"empresa_id": number,"filial_id"?: number | null,"id"?: number,"identificador"?: string | null,"modulo_dono": string,"preco"?: number | null,"ref_id"?: number | null,"ref_tabela"?: string | null,"status"?: string | null,"tipo": string,"titulo": string,"updated_at"?: string
                  }
                  Update: {
                    "codigo"?: string | null,"created_at"?: string,"custo"?: number | null,"dados"?: NonNullable<Json>,"empresa_id"?: number,"filial_id"?: number | null,"id"?: number,"identificador"?: string | null,"modulo_dono"?: string,"preco"?: number | null,"ref_id"?: number | null,"ref_tabela"?: string | null,"status"?: string | null,"tipo"?: string,"titulo"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "itens_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "itens_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "itens_filial_id_fkey"
      columns: ["filial_id"]
isOneToOne: false
      referencedRelation: "filiais"
      referencedColumns: ["id"]
    }
                  ]
                },"mensagens": {
                  Row: {
                    "canal_id": number | null,"contato_id": number,"conteudo": string,"conversa_id": number,"created_at": string,"direcao": string,"empresa_id": number,"erro_envio": string | null,"external_id": string | null,"filial_id": number | null,"id": number,"lida": boolean,"midia_retida_em": string | null,"midia_url": string | null,"origem": string | null,"status_em": string | null,"status_entrega": string | null,"tipo": string,"transcricao": string | null,"updated_at": string,"usuario_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "canal_id"?: number | null,"contato_id": number,"conteudo"?: string,"conversa_id": number,"created_at"?: string,"direcao": string,"empresa_id": number,"erro_envio"?: string | null,"external_id"?: string | null,"filial_id"?: number | null,"id"?: number,"lida"?: boolean,"midia_retida_em"?: string | null,"midia_url"?: string | null,"origem"?: string | null,"status_em"?: string | null,"status_entrega"?: string | null,"tipo"?: string,"transcricao"?: string | null,"updated_at"?: string,"usuario_id"?: string | null
                  }
                  Update: {
                    "canal_id"?: number | null,"contato_id"?: number,"conteudo"?: string,"conversa_id"?: number,"created_at"?: string,"direcao"?: string,"empresa_id"?: number,"erro_envio"?: string | null,"external_id"?: string | null,"filial_id"?: number | null,"id"?: number,"lida"?: boolean,"midia_retida_em"?: string | null,"midia_url"?: string | null,"origem"?: string | null,"status_em"?: string | null,"status_entrega"?: string | null,"tipo"?: string,"transcricao"?: string | null,"updated_at"?: string,"usuario_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "mensagens_canal_id_fkey"
      columns: ["canal_id"]
isOneToOne: false
      referencedRelation: "canais"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "mensagens_canal_id_fkey"
      columns: ["canal_id"]
isOneToOne: false
      referencedRelation: "canais_conectados"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "mensagens_contato_id_fkey"
      columns: ["contato_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "mensagens_contato_id_fkey"
      columns: ["contato_id"]
isOneToOne: false
      referencedRelation: "contatos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "mensagens_conversa_id_fkey"
      columns: ["conversa_id"]
isOneToOne: false
      referencedRelation: "conversas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "mensagens_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "mensagens_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "mensagens_filial_id_fkey"
      columns: ["filial_id"]
isOneToOne: false
      referencedRelation: "filiais"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "mensagens_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    }
                  ]
                },"mensagens_internas": {
                  Row: {
                    "autor_id": string,"conteudo": string,"created_at": string | null,"destinatario_id": string | null,"empresa_id": number,"id": number,"tipo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "autor_id": string,"conteudo": string,"created_at"?: string | null,"destinatario_id"?: string | null,"empresa_id": number,"id"?: never,"tipo"?: string
                  }
                  Update: {
                    "autor_id"?: string,"conteudo"?: string,"created_at"?: string | null,"destinatario_id"?: string | null,"empresa_id"?: number,"id"?: never,"tipo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "mensagens_internas_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "mensagens_internas_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    }
                  ]
                },"metas": {
                  Row: {
                    "alvo": number,"created_at": string | null,"empresa_id": number,"escopo": string,"filial_id": number | null,"id": number,"periodo": string,"tipo": string,"usuario_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "alvo"?: number,"created_at"?: string | null,"empresa_id": number,"escopo"?: string,"filial_id"?: number | null,"id"?: never,"periodo": string,"tipo"?: string,"usuario_id"?: string | null
                  }
                  Update: {
                    "alvo"?: number,"created_at"?: string | null,"empresa_id"?: number,"escopo"?: string,"filial_id"?: number | null,"id"?: never,"periodo"?: string,"tipo"?: string,"usuario_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "metas_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "metas_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "metas_filial_id_fkey"
      columns: ["filial_id"]
isOneToOne: false
      referencedRelation: "filiais"
      referencedColumns: ["id"]
    }
                  ]
                },"metas_comissoes": {
                  Row: {
                    "created_at": string | null,"empresa_id": number,"filial_id": number | null,"id": number,"mes_ano": string,"meta_vendas_qtd": number | null,"meta_vendas_valor": number | null,"percentual_comissao_padrao": number | null,"usuario_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string | null,"empresa_id": number,"filial_id"?: number | null,"id"?: never,"mes_ano": string,"meta_vendas_qtd"?: number | null,"meta_vendas_valor"?: number | null,"percentual_comissao_padrao"?: number | null,"usuario_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string | null,"empresa_id"?: number,"filial_id"?: number | null,"id"?: never,"mes_ano"?: string,"meta_vendas_qtd"?: number | null,"meta_vendas_valor"?: number | null,"percentual_comissao_padrao"?: number | null,"usuario_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "metas_comissoes_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "metas_comissoes_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "metas_comissoes_filial_id_fkey"
      columns: ["filial_id"]
isOneToOne: false
      referencedRelation: "filiais"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "metas_comissoes_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    }
                  ]
                },"modelos_mensagem": {
                  Row: {
                    "categoria": string,"corpo": string,"created_at": string,"criado_por": string | null,"empresa_id": number,"id": number,"idioma": string,"meta_id": string | null,"motivo_recusa": string | null,"nome": string,"status": string,"ultima_sync_em": string | null,"updated_at": string,"variaveis": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "categoria"?: string,"corpo": string,"created_at"?: string,"criado_por"?: string | null,"empresa_id": number,"id"?: number,"idioma"?: string,"meta_id"?: string | null,"motivo_recusa"?: string | null,"nome": string,"status"?: string,"ultima_sync_em"?: string | null,"updated_at"?: string,"variaveis"?: NonNullable<Json>
                  }
                  Update: {
                    "categoria"?: string,"corpo"?: string,"created_at"?: string,"criado_por"?: string | null,"empresa_id"?: number,"id"?: number,"idioma"?: string,"meta_id"?: string | null,"motivo_recusa"?: string | null,"nome"?: string,"status"?: string,"ultima_sync_em"?: string | null,"updated_at"?: string,"variaveis"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "modelos_mensagem_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "modelos_mensagem_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    }
                  ]
                },"modulo_pedidos": {
                  Row: {
                    "atendido_em": string | null,"atendido_por": string | null,"empresa_id": number,"id": number,"modulo": string,"pedido_em": string,"pedido_por": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "atendido_em"?: string | null,"atendido_por"?: string | null,"empresa_id": number,"id"?: never,"modulo": string,"pedido_em"?: string,"pedido_por"?: string | null
                  }
                  Update: {
                    "atendido_em"?: string | null,"atendido_por"?: string | null,"empresa_id"?: number,"id"?: never,"modulo"?: string,"pedido_em"?: string,"pedido_por"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "modulo_pedidos_atendido_por_fkey"
      columns: ["atendido_por"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "modulo_pedidos_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "modulo_pedidos_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "modulo_pedidos_pedido_por_fkey"
      columns: ["pedido_por"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    }
                  ]
                },"motivos_perda": {
                  Row: {
                    "ativo": boolean,"created_at": string,"empresa_id": number,"id": number,"label": string,"ordem": number
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean,"created_at"?: string,"empresa_id": number,"id"?: never,"label": string,"ordem"?: number
                  }
                  Update: {
                    "ativo"?: boolean,"created_at"?: string,"empresa_id"?: number,"id"?: never,"label"?: string,"ordem"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "motivos_perda_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "motivos_perda_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    }
                  ]
                },"negocio_historico": {
                  Row: {
                    "acao": string,"de_etapa_id": number | null,"de_responsavel": string | null,"em": string,"empresa_id": number,"id": number,"negocio_id": number,"para_etapa_id": number | null,"para_responsavel": string | null,"por_usuario": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "acao": string,"de_etapa_id"?: number | null,"de_responsavel"?: string | null,"em"?: string,"empresa_id": number,"id"?: number,"negocio_id": number,"para_etapa_id"?: number | null,"para_responsavel"?: string | null,"por_usuario"?: string | null
                  }
                  Update: {
                    "acao"?: string,"de_etapa_id"?: number | null,"de_responsavel"?: string | null,"em"?: string,"empresa_id"?: number,"id"?: number,"negocio_id"?: number,"para_etapa_id"?: number | null,"para_responsavel"?: string | null,"por_usuario"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "negocio_historico_de_etapa_id_fkey"
      columns: ["de_etapa_id"]
isOneToOne: false
      referencedRelation: "funil_etapas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "negocio_historico_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "negocio_historico_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "negocio_historico_negocio_id_fkey"
      columns: ["negocio_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "negocio_historico_negocio_id_fkey"
      columns: ["negocio_id"]
isOneToOne: false
      referencedRelation: "negocios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "negocio_historico_para_etapa_id_fkey"
      columns: ["para_etapa_id"]
isOneToOne: false
      referencedRelation: "funil_etapas"
      referencedColumns: ["id"]
    }
                  ]
                },"negocios": {
                  Row: {
                    "contato_id": number,"created_at": string,"dados": NonNullable<Json>,"devolucoes": number,"devolvido_em": string | null,"empresa_id": number,"entrou_etapa_em": string | null,"etapa_id": number | null,"filial_id": number | null,"funil_id": number | null,"ganho_em": string | null,"id": number,"motivo_perda_id": number | null,"ordem": number,"perdido_em": string | null,"responsavel_id": string | null,"status": string,"titulo": string | null,"updated_at": string,"valor_estimado": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "contato_id": number,"created_at"?: string,"dados"?: NonNullable<Json>,"devolucoes"?: number,"devolvido_em"?: string | null,"empresa_id": number,"entrou_etapa_em"?: string | null,"etapa_id"?: number | null,"filial_id"?: number | null,"funil_id"?: number | null,"ganho_em"?: string | null,"id"?: number,"motivo_perda_id"?: number | null,"ordem"?: number,"perdido_em"?: string | null,"responsavel_id"?: string | null,"status"?: string,"titulo"?: string | null,"updated_at"?: string,"valor_estimado"?: number | null
                  }
                  Update: {
                    "contato_id"?: number,"created_at"?: string,"dados"?: NonNullable<Json>,"devolucoes"?: number,"devolvido_em"?: string | null,"empresa_id"?: number,"entrou_etapa_em"?: string | null,"etapa_id"?: number | null,"filial_id"?: number | null,"funil_id"?: number | null,"ganho_em"?: string | null,"id"?: number,"motivo_perda_id"?: number | null,"ordem"?: number,"perdido_em"?: string | null,"responsavel_id"?: string | null,"status"?: string,"titulo"?: string | null,"updated_at"?: string,"valor_estimado"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "negocios_contato_id_fkey"
      columns: ["contato_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "negocios_contato_id_fkey"
      columns: ["contato_id"]
isOneToOne: false
      referencedRelation: "contatos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "negocios_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "negocios_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "negocios_etapa_id_fkey"
      columns: ["etapa_id"]
isOneToOne: false
      referencedRelation: "funil_etapas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "negocios_filial_id_fkey"
      columns: ["filial_id"]
isOneToOne: false
      referencedRelation: "filiais"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "negocios_funil_id_fkey"
      columns: ["funil_id"]
isOneToOne: false
      referencedRelation: "funis"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "negocios_motivo_perda_id_fkey"
      columns: ["motivo_perda_id"]
isOneToOne: false
      referencedRelation: "motivos_perda"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "negocios_responsavel_id_fkey"
      columns: ["responsavel_id"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    }
                  ]
                },"notificacao_prefs": {
                  Row: {
                    "prefs": NonNullable<Json>,"updated_at": string,"usuario_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "prefs"?: NonNullable<Json>,"updated_at"?: string,"usuario_id": string
                  }
                  Update: {
                    "prefs"?: NonNullable<Json>,"updated_at"?: string,"usuario_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notificacao_prefs_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: true
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    }
                  ]
                },"pedidos": {
                  Row: {
                    "cliente_nome": string | null,"created_at": string | null,"empresa_id": number,"filial_id": number | null,"id": number,"itens": NonNullable<Json>,"mesa": string | null,"observacoes": string | null,"origem": string | null,"status": string,"total": number
                  }
                  ComputedFields: never
                  Insert: {
                    "cliente_nome"?: string | null,"created_at"?: string | null,"empresa_id": number,"filial_id"?: number | null,"id"?: never,"itens"?: NonNullable<Json>,"mesa"?: string | null,"observacoes"?: string | null,"origem"?: string | null,"status"?: string,"total"?: number
                  }
                  Update: {
                    "cliente_nome"?: string | null,"created_at"?: string | null,"empresa_id"?: number,"filial_id"?: number | null,"id"?: never,"itens"?: NonNullable<Json>,"mesa"?: string | null,"observacoes"?: string | null,"origem"?: string | null,"status"?: string,"total"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "pedidos_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pedidos_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pedidos_filial_id_fkey"
      columns: ["filial_id"]
isOneToOne: false
      referencedRelation: "filiais"
      referencedColumns: ["id"]
    }
                  ]
                },"planos_config": {
                  Row: {
                    "ativo": boolean,"cor": string,"descricao": string | null,"destaque": boolean,"features": NonNullable<Json>,"id": string,"limite_leads": number,"limite_usuarios": number,"nome": string,"ordem": number,"preco_centavos": number,"stripe_price_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean,"cor"?: string,"descricao"?: string | null,"destaque"?: boolean,"features"?: NonNullable<Json>,"id": string,"limite_leads"?: number,"limite_usuarios"?: number,"nome": string,"ordem"?: number,"preco_centavos"?: number,"stripe_price_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "ativo"?: boolean,"cor"?: string,"descricao"?: string | null,"destaque"?: boolean,"features"?: NonNullable<Json>,"id"?: string,"limite_leads"?: number,"limite_usuarios"?: number,"nome"?: string,"ordem"?: number,"preco_centavos"?: number,"stripe_price_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"presets_onboarding": {
                  Row: {
                    "ativo": boolean,"campos": NonNullable<Json>,"chave": string,"created_at": string,"descricao": string | null,"etapas": NonNullable<Json>,"modulos": NonNullable<Json>,"motivos_perda": NonNullable<Json>,"nome": string,"rotulos": NonNullable<Json>,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean,"campos"?: NonNullable<Json>,"chave": string,"created_at"?: string,"descricao"?: string | null,"etapas"?: NonNullable<Json>,"modulos"?: NonNullable<Json>,"motivos_perda"?: NonNullable<Json>,"nome": string,"rotulos"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Update: {
                    "ativo"?: boolean,"campos"?: NonNullable<Json>,"chave"?: string,"created_at"?: string,"descricao"?: string | null,"etapas"?: NonNullable<Json>,"modulos"?: NonNullable<Json>,"motivos_perda"?: NonNullable<Json>,"nome"?: string,"rotulos"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"push_subscriptions": {
                  Row: {
                    "auth": string,"created_at": string | null,"empresa_id": number,"endpoint": string,"id": number,"p256dh": string,"usuario_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "auth": string,"created_at"?: string | null,"empresa_id": number,"endpoint": string,"id"?: never,"p256dh": string,"usuario_id": string
                  }
                  Update: {
                    "auth"?: string,"created_at"?: string | null,"empresa_id"?: number,"endpoint"?: string,"id"?: never,"p256dh"?: string,"usuario_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "push_subscriptions_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "push_subscriptions_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    }
                  ]
                },"rastreamento_config": {
                  Row: {
                    "ativo": boolean,"atualizado_em": string,"capi_ativo": boolean,"capi_test_code": string | null,"capi_token_enc": string | null,"criado_em": string,"empresa_id": number,"meta_pixel_id": string | null,"public_token": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean,"atualizado_em"?: string,"capi_ativo"?: boolean,"capi_test_code"?: string | null,"capi_token_enc"?: string | null,"criado_em"?: string,"empresa_id": number,"meta_pixel_id"?: string | null,"public_token"?: string
                  }
                  Update: {
                    "ativo"?: boolean,"atualizado_em"?: string,"capi_ativo"?: boolean,"capi_test_code"?: string | null,"capi_token_enc"?: string | null,"criado_em"?: string,"empresa_id"?: number,"meta_pixel_id"?: string | null,"public_token"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "rastreamento_config_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: true
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rastreamento_config_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: true
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    }
                  ]
                },"rastreamento_eventos": {
                  Row: {
                    "capi_response": Json | null,"capi_status": string,"contato_email": string | null,"contato_fone": string | null,"criado_em": string,"empresa_id": number,"event_id": string | null,"id": number,"lead_id": number | null,"moeda": string,"order_id": string | null,"produto": string | null,"tipo": string,"valor": number | null,"visita_id": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "capi_response"?: Json | null,"capi_status"?: string,"contato_email"?: string | null,"contato_fone"?: string | null,"criado_em"?: string,"empresa_id": number,"event_id"?: string | null,"id"?: number,"lead_id"?: number | null,"moeda"?: string,"order_id"?: string | null,"produto"?: string | null,"tipo"?: string,"valor"?: number | null,"visita_id"?: number | null
                  }
                  Update: {
                    "capi_response"?: Json | null,"capi_status"?: string,"contato_email"?: string | null,"contato_fone"?: string | null,"criado_em"?: string,"empresa_id"?: number,"event_id"?: string | null,"id"?: number,"lead_id"?: number | null,"moeda"?: string,"order_id"?: string | null,"produto"?: string | null,"tipo"?: string,"valor"?: number | null,"visita_id"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "rastreamento_eventos_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rastreamento_eventos_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rastreamento_eventos_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rastreamento_eventos_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "negocios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rastreamento_eventos_visita_id_fkey"
      columns: ["visita_id"]
isOneToOne: false
      referencedRelation: "rastreamento_visitas"
      referencedColumns: ["id"]
    }
                  ]
                },"rastreamento_links": {
                  Row: {
                    "ativo": boolean,"atualizado_em": string,"cliques": number,"criado_em": string,"destino_url": string,"empresa_id": number,"id": number,"slug": string,"titulo": string | null,"utm_campaign": string | null,"utm_content": string | null,"utm_medium": string | null,"utm_source": string | null,"utm_term": string | null,"wa_numero": string | null,"wa_texto": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean,"atualizado_em"?: string,"cliques"?: number,"criado_em"?: string,"destino_url": string,"empresa_id": number,"id"?: number,"slug": string,"titulo"?: string | null,"utm_campaign"?: string | null,"utm_content"?: string | null,"utm_medium"?: string | null,"utm_source"?: string | null,"utm_term"?: string | null,"wa_numero"?: string | null,"wa_texto"?: string | null
                  }
                  Update: {
                    "ativo"?: boolean,"atualizado_em"?: string,"cliques"?: number,"criado_em"?: string,"destino_url"?: string,"empresa_id"?: number,"id"?: number,"slug"?: string,"titulo"?: string | null,"utm_campaign"?: string | null,"utm_content"?: string | null,"utm_medium"?: string | null,"utm_source"?: string | null,"utm_term"?: string | null,"wa_numero"?: string | null,"wa_texto"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "rastreamento_links_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rastreamento_links_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    }
                  ]
                },"rastreamento_visitas": {
                  Row: {
                    "criado_em": string,"empresa_id": number,"fbc": string | null,"fbclid": string | null,"fbp": string | null,"gbraid": string | null,"gclid": string | null,"id": number,"ip": string | null,"lead_id": number | null,"link_id": number | null,"page_url": string | null,"referrer": string | null,"ta_cod": string | null,"tracking_id": string,"user_agent": string | null,"utm_campaign": string | null,"utm_content": string | null,"utm_medium": string | null,"utm_source": string | null,"utm_term": string | null,"visitor_code": string | null,"wbraid": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "criado_em"?: string,"empresa_id": number,"fbc"?: string | null,"fbclid"?: string | null,"fbp"?: string | null,"gbraid"?: string | null,"gclid"?: string | null,"id"?: number,"ip"?: string | null,"lead_id"?: number | null,"link_id"?: number | null,"page_url"?: string | null,"referrer"?: string | null,"ta_cod"?: string | null,"tracking_id"?: string,"user_agent"?: string | null,"utm_campaign"?: string | null,"utm_content"?: string | null,"utm_medium"?: string | null,"utm_source"?: string | null,"utm_term"?: string | null,"visitor_code"?: string | null,"wbraid"?: string | null
                  }
                  Update: {
                    "criado_em"?: string,"empresa_id"?: number,"fbc"?: string | null,"fbclid"?: string | null,"fbp"?: string | null,"gbraid"?: string | null,"gclid"?: string | null,"id"?: number,"ip"?: string | null,"lead_id"?: number | null,"link_id"?: number | null,"page_url"?: string | null,"referrer"?: string | null,"ta_cod"?: string | null,"tracking_id"?: string,"user_agent"?: string | null,"utm_campaign"?: string | null,"utm_content"?: string | null,"utm_medium"?: string | null,"utm_source"?: string | null,"utm_term"?: string | null,"visitor_code"?: string | null,"wbraid"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "rastreamento_visitas_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rastreamento_visitas_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rastreamento_visitas_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rastreamento_visitas_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "negocios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rastreamento_visitas_link_id_fkey"
      columns: ["link_id"]
isOneToOne: false
      referencedRelation: "rastreamento_links"
      referencedColumns: ["id"]
    }
                  ]
                },"rate_limit": {
                  Row: {
                    "chave": string,"contador": number,"janela": string
                  }
                  ComputedFields: never
                  Insert: {
                    "chave": string,"contador"?: number,"janela": string
                  }
                  Update: {
                    "chave"?: string,"contador"?: number,"janela"?: string
                  }
                  Relationships: [
                    
                  ]
                },"stripe_eventos": {
                  Row: {
                    "empresa_id": number | null,"id": string,"payload": Json | null,"processado_em": string | null,"tipo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "empresa_id"?: number | null,"id": string,"payload"?: Json | null,"processado_em"?: string | null,"tipo": string
                  }
                  Update: {
                    "empresa_id"?: number | null,"id"?: string,"payload"?: Json | null,"processado_em"?: string | null,"tipo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "stripe_eventos_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stripe_eventos_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    }
                  ]
                },"superadmin_logs": {
                  Row: {
                    "acao": string,"admin_user_id": string,"created_at": string,"detalhes": Json | null,"empresa_id": number | null,"id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "acao": string,"admin_user_id": string,"created_at"?: string,"detalhes"?: Json | null,"empresa_id"?: number | null,"id"?: never
                  }
                  Update: {
                    "acao"?: string,"admin_user_id"?: string,"created_at"?: string,"detalhes"?: Json | null,"empresa_id"?: number | null,"id"?: never
                  }
                  Relationships: [
                    {
      foreignKeyName: "superadmin_logs_admin_user_id_fkey"
      columns: ["admin_user_id"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "superadmin_logs_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "superadmin_logs_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    }
                  ]
                },"tarefas": {
                  Row: {
                    "concluida": boolean,"concluida_em": string | null,"contato_id": number | null,"created_at": string | null,"descricao": string | null,"empresa_id": number,"filial_id": number | null,"id": number,"lead_id": number | null,"negocio_id": number | null,"origem": string,"responsavel_id": string | null,"tipo": string,"titulo": string,"vencimento": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "concluida"?: boolean,"concluida_em"?: string | null,"contato_id"?: number | null,"created_at"?: string | null,"descricao"?: string | null,"empresa_id": number,"filial_id"?: number | null,"id"?: number,"lead_id"?: number | null,"negocio_id"?: number | null,"origem"?: string,"responsavel_id"?: string | null,"tipo"?: string,"titulo": string,"vencimento"?: string | null
                  }
                  Update: {
                    "concluida"?: boolean,"concluida_em"?: string | null,"contato_id"?: number | null,"created_at"?: string | null,"descricao"?: string | null,"empresa_id"?: number,"filial_id"?: number | null,"id"?: number,"lead_id"?: number | null,"negocio_id"?: number | null,"origem"?: string,"responsavel_id"?: string | null,"tipo"?: string,"titulo"?: string,"vencimento"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "tarefas_contato_id_fkey"
      columns: ["contato_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tarefas_contato_id_fkey"
      columns: ["contato_id"]
isOneToOne: false
      referencedRelation: "contatos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tarefas_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tarefas_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tarefas_filial_id_fkey"
      columns: ["filial_id"]
isOneToOne: false
      referencedRelation: "filiais"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tarefas_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tarefas_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "negocios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tarefas_negocio_id_fkey"
      columns: ["negocio_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tarefas_negocio_id_fkey"
      columns: ["negocio_id"]
isOneToOne: false
      referencedRelation: "negocios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tarefas_responsavel_id_fkey"
      columns: ["responsavel_id"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    }
                  ]
                },"usuarios": {
                  Row: {
                    "created_at": string | null,"email": string | null,"filial_atual_id": number | null,"id": string,"impersonando_empresa_id": number | null,"impersonando_expires_at": string | null,"is_super_admin": boolean,"modulos_acesso": (string)[] | null,"nome": string,"permissoes": Json | null,"role": string,"ultimo_acesso": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string | null,"email"?: string | null,"filial_atual_id"?: number | null,"id": string,"impersonando_empresa_id"?: number | null,"impersonando_expires_at"?: string | null,"is_super_admin"?: boolean,"modulos_acesso"?: (string)[] | null,"nome": string,"permissoes"?: Json | null,"role"?: string,"ultimo_acesso"?: string | null
                  }
                  Update: {
                    "created_at"?: string | null,"email"?: string | null,"filial_atual_id"?: number | null,"id"?: string,"impersonando_empresa_id"?: number | null,"impersonando_expires_at"?: string | null,"is_super_admin"?: boolean,"modulos_acesso"?: (string)[] | null,"nome"?: string,"permissoes"?: Json | null,"role"?: string,"ultimo_acesso"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "usuarios_filial_atual_id_fkey"
      columns: ["filial_atual_id"]
isOneToOne: false
      referencedRelation: "filiais"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "usuarios_impersonando_empresa_id_fkey"
      columns: ["impersonando_empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "usuarios_impersonando_empresa_id_fkey"
      columns: ["impersonando_empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    }
                  ]
                },"vendas_alertas": {
                  Row: {
                    "aceito_em": string,"aceito_por": string | null,"empresa_id": number,"filial_id": number | null,"id": number,"mensagem": string,"tipo": string,"valor_informado": number | null,"valor_referencia": number | null,"venda_id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "aceito_em"?: string,"aceito_por"?: string | null,"empresa_id": number,"filial_id"?: number | null,"id"?: number,"mensagem": string,"tipo": string,"valor_informado"?: number | null,"valor_referencia"?: number | null,"venda_id": number
                  }
                  Update: {
                    "aceito_em"?: string,"aceito_por"?: string | null,"empresa_id"?: number,"filial_id"?: number | null,"id"?: number,"mensagem"?: string,"tipo"?: string,"valor_informado"?: number | null,"valor_referencia"?: number | null,"venda_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "vendas_alertas_aceito_por_fkey"
      columns: ["aceito_por"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vendas_alertas_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vendas_alertas_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vendas_alertas_filial_id_fkey"
      columns: ["filial_id"]
isOneToOne: false
      referencedRelation: "filiais"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vendas_alertas_venda_id_fkey"
      columns: ["venda_id"]
isOneToOne: false
      referencedRelation: "vendas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vendas_alertas_venda_id_fkey"
      columns: ["venda_id"]
isOneToOne: false
      referencedRelation: "vendas_vendas"
      referencedColumns: ["id"]
    }
                  ]
                },"vendas_comissoes": {
                  Row: {
                    "created_at": string | null,"data_pagamento": string | null,"empresa_id": number,"filial_id": number | null,"id": number,"mes_referencia": string | null,"percentual": number | null,"status": string | null,"usuario_id": string | null,"valor_comissao": number | null,"venda_id": number | null,"zerado_em": string | null,"zerado_por": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string | null,"data_pagamento"?: string | null,"empresa_id": number,"filial_id"?: number | null,"id"?: never,"mes_referencia"?: string | null,"percentual"?: number | null,"status"?: string | null,"usuario_id"?: string | null,"valor_comissao"?: number | null,"venda_id"?: number | null,"zerado_em"?: string | null,"zerado_por"?: string | null
                  }
                  Update: {
                    "created_at"?: string | null,"data_pagamento"?: string | null,"empresa_id"?: number,"filial_id"?: number | null,"id"?: never,"mes_referencia"?: string | null,"percentual"?: number | null,"status"?: string | null,"usuario_id"?: string | null,"valor_comissao"?: number | null,"venda_id"?: number | null,"zerado_em"?: string | null,"zerado_por"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "comissoes_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comissoes_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comissoes_filial_id_fkey"
      columns: ["filial_id"]
isOneToOne: false
      referencedRelation: "filiais"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comissoes_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comissoes_venda_id_fkey"
      columns: ["venda_id"]
isOneToOne: false
      referencedRelation: "vendas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comissoes_venda_id_fkey"
      columns: ["venda_id"]
isOneToOne: false
      referencedRelation: "vendas_vendas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comissoes_zerado_por_fkey"
      columns: ["zerado_por"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    }
                  ]
                },"vendas_contrato_documentos": {
                  Row: {
                    "arquivado": boolean,"created_at": string,"criado_por": string | null,"empresa_id": number,"id": number,"nome": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "arquivado"?: boolean,"created_at"?: string,"criado_por"?: string | null,"empresa_id": number,"id"?: never,"nome": string,"updated_at"?: string
                  }
                  Update: {
                    "arquivado"?: boolean,"created_at"?: string,"criado_por"?: string | null,"empresa_id"?: number,"id"?: never,"nome"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "contrato_documentos_criado_por_fkey"
      columns: ["criado_por"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contrato_documentos_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contrato_documentos_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    }
                  ]
                },"vendas_contrato_modelos": {
                  Row: {
                    "ativo": boolean,"created_at": string,"criado_por": string | null,"documento_id": number,"empresa_id": number,"id": number,"paginas": NonNullable<Json>,"versao": number
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean,"created_at"?: string,"criado_por"?: string | null,"documento_id": number,"empresa_id": number,"id"?: never,"paginas"?: NonNullable<Json>,"versao": number
                  }
                  Update: {
                    "ativo"?: boolean,"created_at"?: string,"criado_por"?: string | null,"documento_id"?: number,"empresa_id"?: number,"id"?: never,"paginas"?: NonNullable<Json>,"versao"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "contrato_modelos_criado_por_fkey"
      columns: ["criado_por"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contrato_modelos_documento_id_fkey"
      columns: ["documento_id"]
isOneToOne: false
      referencedRelation: "contrato_documentos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contrato_modelos_documento_id_fkey"
      columns: ["documento_id"]
isOneToOne: false
      referencedRelation: "vendas_contrato_documentos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contrato_modelos_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contrato_modelos_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    }
                  ]
                },"vendas_contratos": {
                  Row: {
                    "cliente_id": number | null,"created_at": string,"criado_por": string | null,"dados": NonNullable<Json>,"documento_id": number | null,"empresa_id": number,"filial_id": number | null,"garantia_dias": number | null,"html": string,"id": number,"nome_documento": string | null,"venda_ids": (number)[]
                  }
                  ComputedFields: never
                  Insert: {
                    "cliente_id"?: number | null,"created_at"?: string,"criado_por"?: string | null,"dados": NonNullable<Json>,"documento_id"?: number | null,"empresa_id": number,"filial_id"?: number | null,"garantia_dias"?: number | null,"html": string,"id"?: never,"nome_documento"?: string | null,"venda_ids": (number)[]
                  }
                  Update: {
                    "cliente_id"?: number | null,"created_at"?: string,"criado_por"?: string | null,"dados"?: NonNullable<Json>,"documento_id"?: number | null,"empresa_id"?: number,"filial_id"?: number | null,"garantia_dias"?: number | null,"html"?: string,"id"?: never,"nome_documento"?: string | null,"venda_ids"?: (number)[]
                  }
                  Relationships: [
                    {
      foreignKeyName: "contratos_venda_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contratos_venda_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "contatos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contratos_venda_criado_por_fkey"
      columns: ["criado_por"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contratos_venda_documento_id_fkey"
      columns: ["documento_id"]
isOneToOne: false
      referencedRelation: "contrato_documentos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contratos_venda_documento_id_fkey"
      columns: ["documento_id"]
isOneToOne: false
      referencedRelation: "vendas_contrato_documentos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contratos_venda_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contratos_venda_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contratos_venda_filial_id_fkey"
      columns: ["filial_id"]
isOneToOne: false
      referencedRelation: "filiais"
      referencedColumns: ["id"]
    }
                  ]
                },"vendas_fichas_financiamento": {
                  Row: {
                    "banco": string | null,"created_at": string | null,"empresa_id": number,"entrada": number | null,"filial_id": number | null,"id": number,"lead_id": number | null,"observacoes": string | null,"parcelas": number | null,"status": string,"taxa": number | null,"usuario_id": string | null,"valor": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "banco"?: string | null,"created_at"?: string | null,"empresa_id": number,"entrada"?: number | null,"filial_id"?: number | null,"id"?: never,"lead_id"?: number | null,"observacoes"?: string | null,"parcelas"?: number | null,"status"?: string,"taxa"?: number | null,"usuario_id"?: string | null,"valor"?: number | null
                  }
                  Update: {
                    "banco"?: string | null,"created_at"?: string | null,"empresa_id"?: number,"entrada"?: number | null,"filial_id"?: number | null,"id"?: never,"lead_id"?: number | null,"observacoes"?: string | null,"parcelas"?: number | null,"status"?: string,"taxa"?: number | null,"usuario_id"?: string | null,"valor"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "fichas_financiamento_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fichas_financiamento_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fichas_financiamento_filial_id_fkey"
      columns: ["filial_id"]
isOneToOne: false
      referencedRelation: "filiais"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fichas_financiamento_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fichas_financiamento_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "negocios"
      referencedColumns: ["id"]
    }
                  ]
                },"vendas_pagamentos": {
                  Row: {
                    "bandeira_cartao": string | null,"created_at": string | null,"empresa_id": number,"filial_id": number | null,"forma_pagamento": string,"id": number,"parcelas": number | null,"valor_com_juros": number | null,"valor_pago": number,"venda_id": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "bandeira_cartao"?: string | null,"created_at"?: string | null,"empresa_id": number,"filial_id"?: number | null,"forma_pagamento": string,"id"?: never,"parcelas"?: number | null,"valor_com_juros"?: number | null,"valor_pago": number,"venda_id"?: number | null
                  }
                  Update: {
                    "bandeira_cartao"?: string | null,"created_at"?: string | null,"empresa_id"?: number,"filial_id"?: number | null,"forma_pagamento"?: string,"id"?: never,"parcelas"?: number | null,"valor_com_juros"?: number | null,"valor_pago"?: number,"venda_id"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "vendas_pagamentos_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vendas_pagamentos_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vendas_pagamentos_filial_id_fkey"
      columns: ["filial_id"]
isOneToOne: false
      referencedRelation: "filiais"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vendas_pagamentos_venda_id_fkey"
      columns: ["venda_id"]
isOneToOne: false
      referencedRelation: "vendas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vendas_pagamentos_venda_id_fkey"
      columns: ["venda_id"]
isOneToOne: false
      referencedRelation: "vendas_vendas"
      referencedColumns: ["id"]
    }
                  ]
                },"vendas_pedidos_compra": {
                  Row: {
                    "created_at": string | null,"data_pedido": string | null,"descricao": string | null,"empresa_id": number,"filial_id": number | null,"fornecedor_id": number | null,"id": number,"observacoes": string | null,"solicitado_em": string | null,"solicitado_por": string | null,"status": string | null,"usuario_id": string | null,"valor_total": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string | null,"data_pedido"?: string | null,"descricao"?: string | null,"empresa_id": number,"filial_id"?: number | null,"fornecedor_id"?: number | null,"id"?: never,"observacoes"?: string | null,"solicitado_em"?: string | null,"solicitado_por"?: string | null,"status"?: string | null,"usuario_id"?: string | null,"valor_total"?: number | null
                  }
                  Update: {
                    "created_at"?: string | null,"data_pedido"?: string | null,"descricao"?: string | null,"empresa_id"?: number,"filial_id"?: number | null,"fornecedor_id"?: number | null,"id"?: never,"observacoes"?: string | null,"solicitado_em"?: string | null,"solicitado_por"?: string | null,"status"?: string | null,"usuario_id"?: string | null,"valor_total"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "pedidos_compra_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pedidos_compra_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pedidos_compra_filial_id_fkey"
      columns: ["filial_id"]
isOneToOne: false
      referencedRelation: "filiais"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pedidos_compra_fornecedor_id_fkey"
      columns: ["fornecedor_id"]
isOneToOne: false
      referencedRelation: "estoque_fornecedores"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pedidos_compra_fornecedor_id_fkey"
      columns: ["fornecedor_id"]
isOneToOne: false
      referencedRelation: "fornecedores"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pedidos_compra_solicitado_por_fkey"
      columns: ["solicitado_por"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pedidos_compra_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    }
                  ]
                },"vendas_pre_vendas": {
                  Row: {
                    "canal_venda": string | null,"created_at": string | null,"desconto_valor": number | null,"empresa_id": number,"filial_id": number | null,"grupo_id": string | null,"id": number,"inventario_unidade_id": number | null,"observacoes": string | null,"produto_id": number | null,"status": string | null,"usuario_id": string | null,"valor_venda": number | null,"venda_id": number | null,"vendedor_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "canal_venda"?: string | null,"created_at"?: string | null,"desconto_valor"?: number | null,"empresa_id": number,"filial_id"?: number | null,"grupo_id"?: string | null,"id"?: never,"inventario_unidade_id"?: number | null,"observacoes"?: string | null,"produto_id"?: number | null,"status"?: string | null,"usuario_id"?: string | null,"valor_venda"?: number | null,"venda_id"?: number | null,"vendedor_id"?: string | null
                  }
                  Update: {
                    "canal_venda"?: string | null,"created_at"?: string | null,"desconto_valor"?: number | null,"empresa_id"?: number,"filial_id"?: number | null,"grupo_id"?: string | null,"id"?: never,"inventario_unidade_id"?: number | null,"observacoes"?: string | null,"produto_id"?: number | null,"status"?: string | null,"usuario_id"?: string | null,"valor_venda"?: number | null,"venda_id"?: number | null,"vendedor_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "pre_vendas_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pre_vendas_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pre_vendas_filial_id_fkey"
      columns: ["filial_id"]
isOneToOne: false
      referencedRelation: "filiais"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pre_vendas_inventario_unidade_id_fkey"
      columns: ["inventario_unidade_id"]
isOneToOne: false
      referencedRelation: "estoque_unidades"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pre_vendas_inventario_unidade_id_fkey"
      columns: ["inventario_unidade_id"]
isOneToOne: false
      referencedRelation: "inventario_unidades"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pre_vendas_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pre_vendas_venda_id_fkey"
      columns: ["venda_id"]
isOneToOne: false
      referencedRelation: "vendas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pre_vendas_venda_id_fkey"
      columns: ["venda_id"]
isOneToOne: false
      referencedRelation: "vendas_vendas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pre_vendas_vendedor_id_fkey"
      columns: ["vendedor_id"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    }
                  ]
                },"vendas_propostas": {
                  Row: {
                    "cliente_nome": string,"created_at": string,"empresa_id": number,"filial_id": number | null,"id": number,"itens": NonNullable<Json>,"lead_id": number | null,"observacoes": string | null,"status": string,"token": string,"total": number
                  }
                  ComputedFields: never
                  Insert: {
                    "cliente_nome"?: string,"created_at"?: string,"empresa_id": number,"filial_id"?: number | null,"id"?: never,"itens"?: NonNullable<Json>,"lead_id"?: number | null,"observacoes"?: string | null,"status"?: string,"token"?: string,"total"?: number
                  }
                  Update: {
                    "cliente_nome"?: string,"created_at"?: string,"empresa_id"?: number,"filial_id"?: number | null,"id"?: never,"itens"?: NonNullable<Json>,"lead_id"?: number | null,"observacoes"?: string | null,"status"?: string,"token"?: string,"total"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "propostas_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "propostas_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "propostas_filial_id_fkey"
      columns: ["filial_id"]
isOneToOne: false
      referencedRelation: "filiais"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "propostas_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "propostas_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "negocios"
      referencedColumns: ["id"]
    }
                  ]
                },"vendas_termos": {
                  Row: {
                    "arquivo_url": string | null,"assinado_em": string | null,"assinado_por": string | null,"criado_em": string,"empresa_id": number,"filial_id": number | null,"id": number,"status": string,"tipo": string,"venda_id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "arquivo_url"?: string | null,"assinado_em"?: string | null,"assinado_por"?: string | null,"criado_em"?: string,"empresa_id": number,"filial_id"?: number | null,"id"?: number,"status"?: string,"tipo": string,"venda_id": number
                  }
                  Update: {
                    "arquivo_url"?: string | null,"assinado_em"?: string | null,"assinado_por"?: string | null,"criado_em"?: string,"empresa_id"?: number,"filial_id"?: number | null,"id"?: number,"status"?: string,"tipo"?: string,"venda_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "vendas_termos_assinado_por_fkey"
      columns: ["assinado_por"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vendas_termos_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vendas_termos_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vendas_termos_filial_id_fkey"
      columns: ["filial_id"]
isOneToOne: false
      referencedRelation: "filiais"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vendas_termos_venda_id_fkey"
      columns: ["venda_id"]
isOneToOne: false
      referencedRelation: "vendas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vendas_termos_venda_id_fkey"
      columns: ["venda_id"]
isOneToOne: false
      referencedRelation: "vendas_vendas"
      referencedColumns: ["id"]
    }
                  ]
                },"vendas_vendas": {
                  Row: {
                    "canal_venda": string | null,"cliente_id": number | null,"comanda": string | null,"comissao": number | null,"created_at": string | null,"data_venda": string | null,"desconto_aprovado_por": string | null,"desconto_motivo": string | null,"desconto_valor": number | null,"empresa_id": number,"filial_id": number | null,"forma_pagamento": string | null,"grupo_pdv": string | null,"id": number,"lucro": number | null,"numero_serie": string | null,"observacoes": string | null,"parcelas": number | null,"pedido_compra_id": number | null,"previsao_entrega": string | null,"produto_id": number | null,"quantidade": number,"status": string | null,"unidade_id": number | null,"usuario_id": string | null,"valor_custo": number | null,"valor_venda": number,"vendedor_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "canal_venda"?: string | null,"cliente_id"?: number | null,"comanda"?: string | null,"comissao"?: number | null,"created_at"?: string | null,"data_venda"?: string | null,"desconto_aprovado_por"?: string | null,"desconto_motivo"?: string | null,"desconto_valor"?: number | null,"empresa_id": number,"filial_id"?: number | null,"forma_pagamento"?: string | null,"grupo_pdv"?: string | null,"id"?: never,"lucro"?: never,"numero_serie"?: string | null,"observacoes"?: string | null,"parcelas"?: number | null,"pedido_compra_id"?: number | null,"previsao_entrega"?: string | null,"produto_id"?: number | null,"quantidade"?: number,"status"?: string | null,"unidade_id"?: number | null,"usuario_id"?: string | null,"valor_custo"?: number | null,"valor_venda": number,"vendedor_id"?: string | null
                  }
                  Update: {
                    "canal_venda"?: string | null,"cliente_id"?: number | null,"comanda"?: string | null,"comissao"?: number | null,"created_at"?: string | null,"data_venda"?: string | null,"desconto_aprovado_por"?: string | null,"desconto_motivo"?: string | null,"desconto_valor"?: number | null,"empresa_id"?: number,"filial_id"?: number | null,"forma_pagamento"?: string | null,"grupo_pdv"?: string | null,"id"?: never,"lucro"?: never,"numero_serie"?: string | null,"observacoes"?: string | null,"parcelas"?: number | null,"pedido_compra_id"?: number | null,"previsao_entrega"?: string | null,"produto_id"?: number | null,"quantidade"?: number,"status"?: string | null,"unidade_id"?: number | null,"usuario_id"?: string | null,"valor_custo"?: number | null,"valor_venda"?: number,"vendedor_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "vendas_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vendas_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "contatos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vendas_desconto_aprovado_por_fkey"
      columns: ["desconto_aprovado_por"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vendas_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vendas_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vendas_filial_id_fkey"
      columns: ["filial_id"]
isOneToOne: false
      referencedRelation: "filiais"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vendas_pedido_compra_id_fkey"
      columns: ["pedido_compra_id"]
isOneToOne: false
      referencedRelation: "pedidos_compra"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vendas_pedido_compra_id_fkey"
      columns: ["pedido_compra_id"]
isOneToOne: false
      referencedRelation: "vendas_pedidos_compra"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vendas_produto_id_fkey"
      columns: ["produto_id"]
isOneToOne: false
      referencedRelation: "estoque_produtos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vendas_produto_id_fkey"
      columns: ["produto_id"]
isOneToOne: false
      referencedRelation: "produtos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vendas_unidade_id_fkey"
      columns: ["unidade_id"]
isOneToOne: false
      referencedRelation: "estoque_unidades"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vendas_unidade_id_fkey"
      columns: ["unidade_id"]
isOneToOne: false
      referencedRelation: "inventario_unidades"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vendas_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vendas_vendedor_id_fkey"
      columns: ["vendedor_id"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    }
                  ]
                },"visitas": {
                  Row: {
                    "cliente_id": number | null,"corretor_id": string | null,"created_at": string | null,"data_hora": string,"empresa_id": number,"filial_id": number | null,"fim": string | null,"id": number,"imovel_id": number | null,"lead_id": number | null,"local": string | null,"observacoes": string | null,"participantes": string | null,"status": string,"tipo": string,"titulo": string | null,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "cliente_id"?: number | null,"corretor_id"?: string | null,"created_at"?: string | null,"data_hora": string,"empresa_id": number,"filial_id"?: number | null,"fim"?: string | null,"id"?: number,"imovel_id"?: number | null,"lead_id"?: number | null,"local"?: string | null,"observacoes"?: string | null,"participantes"?: string | null,"status"?: string,"tipo"?: string,"titulo"?: string | null,"updated_at"?: string | null
                  }
                  Update: {
                    "cliente_id"?: number | null,"corretor_id"?: string | null,"created_at"?: string | null,"data_hora"?: string,"empresa_id"?: number,"filial_id"?: number | null,"fim"?: string | null,"id"?: number,"imovel_id"?: number | null,"lead_id"?: number | null,"local"?: string | null,"observacoes"?: string | null,"participantes"?: string | null,"status"?: string,"tipo"?: string,"titulo"?: string | null,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "visitas_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "visitas_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "contatos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "visitas_corretor_id_fkey"
      columns: ["corretor_id"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "visitas_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "visitas_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "visitas_filial_id_fkey"
      columns: ["filial_id"]
isOneToOne: false
      referencedRelation: "filiais"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "visitas_imovel_id_fkey"
      columns: ["imovel_id"]
isOneToOne: false
      referencedRelation: "imoveis"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "visitas_imovel_id_fkey"
      columns: ["imovel_id"]
isOneToOne: false
      referencedRelation: "imoveis_imoveis"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "visitas_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "visitas_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "negocios"
      referencedColumns: ["id"]
    }
                  ]
                },"zapintel_conversa_cache": {
                  Row: {
                    "chave": string,"dados": NonNullable<Json>,"empresa_id": number,"gerado_em": string
                  }
                  ComputedFields: never
                  Insert: {
                    "chave": string,"dados": NonNullable<Json>,"empresa_id": number,"gerado_em"?: string
                  }
                  Update: {
                    "chave"?: string,"dados"?: NonNullable<Json>,"empresa_id"?: number,"gerado_em"?: string
                  }
                  Relationships: [
                    
                  ]
                },"zapintel_lead_perfil": {
                  Row: {
                    "empresa_id": number,"gerado_em": string,"lead_id": number,"marca": number,"mensagens": number,"modelo": string | null,"ms": number | null,"perfil": NonNullable<Json>,"transcritos": number,"versao": string
                  }
                  ComputedFields: never
                  Insert: {
                    "empresa_id": number,"gerado_em"?: string,"lead_id": number,"marca": number,"mensagens": number,"modelo"?: string | null,"ms"?: number | null,"perfil": NonNullable<Json>,"transcritos"?: number,"versao": string
                  }
                  Update: {
                    "empresa_id"?: number,"gerado_em"?: string,"lead_id"?: number,"marca"?: number,"mensagens"?: number,"modelo"?: string | null,"ms"?: number | null,"perfil"?: NonNullable<Json>,"transcritos"?: number,"versao"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "zapintel_lead_perfil_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: true
      referencedRelation: "leads"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "zapintel_lead_perfil_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: true
      referencedRelation: "negocios"
      referencedColumns: ["id"]
    }
                  ]
                },"zapintel_midia_retida": {
                  Row: {
                    "arquivo": string,"dias_janela": number,"id": number,"mensagem_id": number,"retirado_em": string,"tipo": string,"url_antiga": string
                  }
                  ComputedFields: never
                  Insert: {
                    "arquivo": string,"dias_janela": number,"id"?: number,"mensagem_id": number,"retirado_em"?: string,"tipo"?: string,"url_antiga": string
                  }
                  Update: {
                    "arquivo"?: string,"dias_janela"?: number,"id"?: number,"mensagem_id"?: number,"retirado_em"?: string,"tipo"?: string,"url_antiga"?: string
                  }
                  Relationships: [
                    
                  ]
                },"zapintel_venda_lead": {
                  Row: {
                    "casado_em": string,"cliente_id": number | null,"como": string,"confianca": string,"dias_ate_venda": number | null,"empresa_id": number,"lead_id": number | null,"venda_id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "casado_em"?: string,"cliente_id"?: number | null,"como": string,"confianca": string,"dias_ate_venda"?: number | null,"empresa_id": number,"lead_id"?: number | null,"venda_id": number
                  }
                  Update: {
                    "casado_em"?: string,"cliente_id"?: number | null,"como"?: string,"confianca"?: string,"dias_ate_venda"?: number | null,"empresa_id"?: number,"lead_id"?: number | null,"venda_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "zapintel_venda_lead_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "zapintel_venda_lead_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "negocios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "zapintel_venda_lead_venda_id_fkey"
      columns: ["venda_id"]
isOneToOne: true
      referencedRelation: "vendas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "zapintel_venda_lead_venda_id_fkey"
      columns: ["venda_id"]
isOneToOne: true
      referencedRelation: "vendas_vendas"
      referencedColumns: ["id"]
    }
                  ]
                },"zz_antes": {
                  Row: {
                    "id": number | null,"lead_id": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: number | null,"lead_id"?: number | null
                  }
                  Update: {
                    "id"?: number | null,"lead_id"?: number | null
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            "avaliacoes_usados": {
                  Row: {
                    "created_at": string | null,"empresa_id": number | null,"filial_id": number | null,"fotos_urls": string | null,"id": number | null,"km": number | null,"lead_id": number | null,"observacoes": string | null,"status": string | null,"unidade_id": number | null,"usuario_id": string | null,"valor_mercado": number | null,"valor_ofertado": number | null,"veiculo": Json | null
                  }
                  ComputedFields: never
                  Insert: {
                           "created_at"?: string | null,"empresa_id"?: number | null,"filial_id"?: number | null,"fotos_urls"?: string | null,"id"?: number | null,"km"?: number | null,"lead_id"?: number | null,"observacoes"?: string | null,"status"?: string | null,"unidade_id"?: number | null,"usuario_id"?: string | null,"valor_mercado"?: number | null,"valor_ofertado"?: number | null,"veiculo"?: Json | null
                         }
                        Update: {
                           "created_at"?: string | null,"empresa_id"?: number | null,"filial_id"?: number | null,"fotos_urls"?: string | null,"id"?: number | null,"km"?: number | null,"lead_id"?: number | null,"observacoes"?: string | null,"status"?: string | null,"unidade_id"?: number | null,"usuario_id"?: string | null,"valor_mercado"?: number | null,"valor_ofertado"?: number | null,"veiculo"?: Json | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "avaliacoes_usados_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "avaliacoes_usados_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "avaliacoes_usados_filial_id_fkey"
      columns: ["filial_id"]
isOneToOne: false
      referencedRelation: "filiais"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "avaliacoes_usados_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "avaliacoes_usados_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "negocios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "avaliacoes_usados_unidade_id_fkey"
      columns: ["unidade_id"]
isOneToOne: false
      referencedRelation: "estoque_unidades"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "avaliacoes_usados_unidade_id_fkey"
      columns: ["unidade_id"]
isOneToOne: false
      referencedRelation: "inventario_unidades"
      referencedColumns: ["id"]
    }
                  ]
                },"canais_conectados": {
                  Row: {
                    "access_token_enc": string | null,"coexistencia": boolean | null,"conectado_em": string | null,"created_at": string | null,"criado_por": string | null,"data_access_expira_em": string | null,"empresa_id": number | null,"external_id": string | null,"filial_id": number | null,"id": number | null,"ig_user_id": string | null,"nome_exibicao": string | null,"status": string | null,"sync_contatos_em": string | null,"sync_historico_em": string | null,"sync_historico_pct": number | null,"sync_request_ids": Json | null,"tipo": string | null,"token_expira_em": string | null,"ultima_msg_em": string | null,"ultimo_erro": string | null,"ultimo_erro_em": string | null,"updated_at": string | null,"via": string | null,"waba_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "access_token_enc"?: string | null,"coexistencia"?: boolean | null,"conectado_em"?: string | null,"created_at"?: string | null,"criado_por"?: string | null,"data_access_expira_em"?: string | null,"empresa_id"?: number | null,"external_id"?: string | null,"filial_id"?: number | null,"id"?: number | null,"ig_user_id"?: string | null,"nome_exibicao"?: string | null,"status"?: string | null,"sync_contatos_em"?: string | null,"sync_historico_em"?: string | null,"sync_historico_pct"?: number | null,"sync_request_ids"?: Json | null,"tipo"?: string | null,"token_expira_em"?: string | null,"ultima_msg_em"?: string | null,"ultimo_erro"?: string | null,"ultimo_erro_em"?: string | null,"updated_at"?: string | null,"via"?: string | null,"waba_id"?: string | null
                         }
                        Update: {
                           "access_token_enc"?: string | null,"coexistencia"?: boolean | null,"conectado_em"?: string | null,"created_at"?: string | null,"criado_por"?: string | null,"data_access_expira_em"?: string | null,"empresa_id"?: number | null,"external_id"?: string | null,"filial_id"?: number | null,"id"?: number | null,"ig_user_id"?: string | null,"nome_exibicao"?: string | null,"status"?: string | null,"sync_contatos_em"?: string | null,"sync_historico_em"?: string | null,"sync_historico_pct"?: number | null,"sync_request_ids"?: Json | null,"tipo"?: string | null,"token_expira_em"?: string | null,"ultima_msg_em"?: string | null,"ultimo_erro"?: string | null,"ultimo_erro_em"?: string | null,"updated_at"?: string | null,"via"?: string | null,"waba_id"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "canais_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "canais_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "canais_filial_id_fkey"
      columns: ["filial_id"]
isOneToOne: false
      referencedRelation: "filiais"
      referencedColumns: ["id"]
    }
                  ]
                },"categorias_produtos": {
                  Row: {
                    "ativo": boolean | null,"created_at": string | null,"empresa_id": number | null,"id": number | null,"nome": string | null,"ordem": number | null,"tipo_formulario": string | null,"usuario_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "ativo"?: boolean | null,"created_at"?: string | null,"empresa_id"?: number | null,"id"?: number | null,"nome"?: string | null,"ordem"?: number | null,"tipo_formulario"?: string | null,"usuario_id"?: string | null
                         }
                        Update: {
                           "ativo"?: boolean | null,"created_at"?: string | null,"empresa_id"?: number | null,"id"?: number | null,"nome"?: string | null,"ordem"?: number | null,"tipo_formulario"?: string | null,"usuario_id"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "categorias_produtos_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "categorias_produtos_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "categorias_produtos_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    }
                  ]
                },"chaves_imoveis": {
                  Row: {
                    "codigo": string | null,"com_quem": string | null,"created_at": string | null,"devolucao_prevista": string | null,"empresa_id": number | null,"id": number | null,"imovel_id": number | null,"observacoes": string | null,"retirada_em": string | null,"status": string | null,"usuario_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "codigo"?: string | null,"com_quem"?: string | null,"created_at"?: string | null,"devolucao_prevista"?: string | null,"empresa_id"?: number | null,"id"?: number | null,"imovel_id"?: number | null,"observacoes"?: string | null,"retirada_em"?: string | null,"status"?: string | null,"usuario_id"?: string | null
                         }
                        Update: {
                           "codigo"?: string | null,"com_quem"?: string | null,"created_at"?: string | null,"devolucao_prevista"?: string | null,"empresa_id"?: number | null,"id"?: number | null,"imovel_id"?: number | null,"observacoes"?: string | null,"retirada_em"?: string | null,"status"?: string | null,"usuario_id"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "chaves_imoveis_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "chaves_imoveis_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "chaves_imoveis_imovel_id_fkey"
      columns: ["imovel_id"]
isOneToOne: false
      referencedRelation: "imoveis"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "chaves_imoveis_imovel_id_fkey"
      columns: ["imovel_id"]
isOneToOne: false
      referencedRelation: "imoveis_imoveis"
      referencedColumns: ["id"]
    }
                  ]
                },"clientes": {
                  Row: {
                    "ativo": boolean | null,"bairro": string | null,"cep": string | null,"cidade": string | null,"cnpj_validado": boolean | null,"complemento": string | null,"corretor_id": string | null,"cpf_cnpj": string | null,"cpf_validado": boolean | null,"created_at": string | null,"data_nascimento": string | null,"email": string | null,"empresa_id": number | null,"endereco": string | null,"estado": string | null,"estado_civil": string | null,"filial_id": number | null,"id": number | null,"instagram": string | null,"lead_id": number | null,"nacionalidade": string | null,"nome": string | null,"numero": string | null,"observacoes": string | null,"origem_cliente": string | null,"profissao": string | null,"proprietario": boolean | null,"regiao_interesse": string | null,"status_aprovacao": string | null,"telefone": string | null,"tipo_cliente": string | null,"tipo_negocio": string | null,"usuario_id": string | null,"valor_pretendido": number | null
                  }
                  ComputedFields: never
                  Insert: {
                           "ativo"?: boolean | null,"bairro"?: string | null,"cep"?: string | null,"cidade"?: string | null,"cnpj_validado"?: boolean | null,"complemento"?: string | null,"corretor_id"?: string | null,"cpf_cnpj"?: string | null,"cpf_validado"?: boolean | null,"created_at"?: string | null,"data_nascimento"?: string | null,"email"?: string | null,"empresa_id"?: number | null,"endereco"?: string | null,"estado"?: string | null,"estado_civil"?: string | null,"filial_id"?: number | null,"id"?: number | null,"instagram"?: string | null,"lead_id"?: number | null,"nacionalidade"?: string | null,"nome"?: string | null,"numero"?: string | null,"observacoes"?: string | null,"origem_cliente"?: string | null,"profissao"?: string | null,"proprietario"?: boolean | null,"regiao_interesse"?: string | null,"status_aprovacao"?: string | null,"telefone"?: string | null,"tipo_cliente"?: string | null,"tipo_negocio"?: string | null,"usuario_id"?: string | null,"valor_pretendido"?: number | null
                         }
                        Update: {
                           "ativo"?: boolean | null,"bairro"?: string | null,"cep"?: string | null,"cidade"?: string | null,"cnpj_validado"?: boolean | null,"complemento"?: string | null,"corretor_id"?: string | null,"cpf_cnpj"?: string | null,"cpf_validado"?: boolean | null,"created_at"?: string | null,"data_nascimento"?: string | null,"email"?: string | null,"empresa_id"?: number | null,"endereco"?: string | null,"estado"?: string | null,"estado_civil"?: string | null,"filial_id"?: number | null,"id"?: number | null,"instagram"?: string | null,"lead_id"?: number | null,"nacionalidade"?: string | null,"nome"?: string | null,"numero"?: string | null,"observacoes"?: string | null,"origem_cliente"?: string | null,"profissao"?: string | null,"proprietario"?: boolean | null,"regiao_interesse"?: string | null,"status_aprovacao"?: string | null,"telefone"?: string | null,"tipo_cliente"?: string | null,"tipo_negocio"?: string | null,"usuario_id"?: string | null,"valor_pretendido"?: number | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "contatos_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contatos_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contatos_filial_id_fkey"
      columns: ["filial_id"]
isOneToOne: false
      referencedRelation: "filiais"
      referencedColumns: ["id"]
    }
                  ]
                },"cobrancas": {
                  Row: {
                    "cliente_id": number | null,"created_at": string | null,"descricao": string | null,"empresa_id": number | null,"filial_id": number | null,"id": number | null,"linha_digitavel": string | null,"link_pagamento": string | null,"metadata": Json | null,"os_id": number | null,"pago_em": string | null,"provider": string | null,"provider_ref": string | null,"qr_code": string | null,"qr_code_base64": string | null,"status": string | null,"tipo": string | null,"valor": number | null,"vencimento": string | null,"venda_id": number | null
                  }
                  ComputedFields: never
                  Insert: {
                           "cliente_id"?: number | null,"created_at"?: string | null,"descricao"?: string | null,"empresa_id"?: number | null,"filial_id"?: number | null,"id"?: number | null,"linha_digitavel"?: string | null,"link_pagamento"?: string | null,"metadata"?: Json | null,"os_id"?: number | null,"pago_em"?: string | null,"provider"?: string | null,"provider_ref"?: string | null,"qr_code"?: string | null,"qr_code_base64"?: string | null,"status"?: string | null,"tipo"?: string | null,"valor"?: number | null,"vencimento"?: string | null,"venda_id"?: number | null
                         }
                        Update: {
                           "cliente_id"?: number | null,"created_at"?: string | null,"descricao"?: string | null,"empresa_id"?: number | null,"filial_id"?: number | null,"id"?: number | null,"linha_digitavel"?: string | null,"link_pagamento"?: string | null,"metadata"?: Json | null,"os_id"?: number | null,"pago_em"?: string | null,"provider"?: string | null,"provider_ref"?: string | null,"qr_code"?: string | null,"qr_code_base64"?: string | null,"status"?: string | null,"tipo"?: string | null,"valor"?: number | null,"vencimento"?: string | null,"venda_id"?: number | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "cobrancas_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cobrancas_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "contatos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cobrancas_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cobrancas_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cobrancas_filial_id_fkey"
      columns: ["filial_id"]
isOneToOne: false
      referencedRelation: "filiais"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cobrancas_os_id_fkey"
      columns: ["os_id"]
isOneToOne: false
      referencedRelation: "assistencia_garantias"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cobrancas_os_id_fkey"
      columns: ["os_id"]
isOneToOne: false
      referencedRelation: "garantias_assistencias"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cobrancas_venda_id_fkey"
      columns: ["venda_id"]
isOneToOne: false
      referencedRelation: "vendas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cobrancas_venda_id_fkey"
      columns: ["venda_id"]
isOneToOne: false
      referencedRelation: "vendas_vendas"
      referencedColumns: ["id"]
    }
                  ]
                },"comissoes": {
                  Row: {
                    "created_at": string | null,"data_pagamento": string | null,"empresa_id": number | null,"filial_id": number | null,"id": number | null,"mes_referencia": string | null,"percentual": number | null,"status": string | null,"usuario_id": string | null,"valor_comissao": number | null,"venda_id": number | null,"zerado_em": string | null,"zerado_por": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "created_at"?: string | null,"data_pagamento"?: string | null,"empresa_id"?: number | null,"filial_id"?: number | null,"id"?: number | null,"mes_referencia"?: string | null,"percentual"?: number | null,"status"?: string | null,"usuario_id"?: string | null,"valor_comissao"?: number | null,"venda_id"?: number | null,"zerado_em"?: string | null,"zerado_por"?: string | null
                         }
                        Update: {
                           "created_at"?: string | null,"data_pagamento"?: string | null,"empresa_id"?: number | null,"filial_id"?: number | null,"id"?: number | null,"mes_referencia"?: string | null,"percentual"?: number | null,"status"?: string | null,"usuario_id"?: string | null,"valor_comissao"?: number | null,"venda_id"?: number | null,"zerado_em"?: string | null,"zerado_por"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "comissoes_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comissoes_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comissoes_filial_id_fkey"
      columns: ["filial_id"]
isOneToOne: false
      referencedRelation: "filiais"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comissoes_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comissoes_venda_id_fkey"
      columns: ["venda_id"]
isOneToOne: false
      referencedRelation: "vendas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comissoes_venda_id_fkey"
      columns: ["venda_id"]
isOneToOne: false
      referencedRelation: "vendas_vendas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comissoes_zerado_por_fkey"
      columns: ["zerado_por"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    }
                  ]
                },"contrato_documentos": {
                  Row: {
                    "arquivado": boolean | null,"created_at": string | null,"criado_por": string | null,"empresa_id": number | null,"id": number | null,"nome": string | null,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "arquivado"?: boolean | null,"created_at"?: string | null,"criado_por"?: string | null,"empresa_id"?: number | null,"id"?: number | null,"nome"?: string | null,"updated_at"?: string | null
                         }
                        Update: {
                           "arquivado"?: boolean | null,"created_at"?: string | null,"criado_por"?: string | null,"empresa_id"?: number | null,"id"?: number | null,"nome"?: string | null,"updated_at"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "contrato_documentos_criado_por_fkey"
      columns: ["criado_por"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contrato_documentos_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contrato_documentos_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    }
                  ]
                },"contrato_modelos": {
                  Row: {
                    "ativo": boolean | null,"created_at": string | null,"criado_por": string | null,"documento_id": number | null,"empresa_id": number | null,"id": number | null,"paginas": Json | null,"versao": number | null
                  }
                  ComputedFields: never
                  Insert: {
                           "ativo"?: boolean | null,"created_at"?: string | null,"criado_por"?: string | null,"documento_id"?: number | null,"empresa_id"?: number | null,"id"?: number | null,"paginas"?: Json | null,"versao"?: number | null
                         }
                        Update: {
                           "ativo"?: boolean | null,"created_at"?: string | null,"criado_por"?: string | null,"documento_id"?: number | null,"empresa_id"?: number | null,"id"?: number | null,"paginas"?: Json | null,"versao"?: number | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "contrato_modelos_criado_por_fkey"
      columns: ["criado_por"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contrato_modelos_documento_id_fkey"
      columns: ["documento_id"]
isOneToOne: false
      referencedRelation: "contrato_documentos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contrato_modelos_documento_id_fkey"
      columns: ["documento_id"]
isOneToOne: false
      referencedRelation: "vendas_contrato_documentos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contrato_modelos_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contrato_modelos_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    }
                  ]
                },"contratos_venda": {
                  Row: {
                    "cliente_id": number | null,"created_at": string | null,"criado_por": string | null,"dados": Json | null,"documento_id": number | null,"empresa_id": number | null,"filial_id": number | null,"garantia_dias": number | null,"html": string | null,"id": number | null,"nome_documento": string | null,"venda_ids": (number)[] | null
                  }
                  ComputedFields: never
                  Insert: {
                           "cliente_id"?: number | null,"created_at"?: string | null,"criado_por"?: string | null,"dados"?: Json | null,"documento_id"?: number | null,"empresa_id"?: number | null,"filial_id"?: number | null,"garantia_dias"?: number | null,"html"?: string | null,"id"?: number | null,"nome_documento"?: string | null,"venda_ids"?: (number)[] | null
                         }
                        Update: {
                           "cliente_id"?: number | null,"created_at"?: string | null,"criado_por"?: string | null,"dados"?: Json | null,"documento_id"?: number | null,"empresa_id"?: number | null,"filial_id"?: number | null,"garantia_dias"?: number | null,"html"?: string | null,"id"?: number | null,"nome_documento"?: string | null,"venda_ids"?: (number)[] | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "contratos_venda_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contratos_venda_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "contatos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contratos_venda_criado_por_fkey"
      columns: ["criado_por"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contratos_venda_documento_id_fkey"
      columns: ["documento_id"]
isOneToOne: false
      referencedRelation: "contrato_documentos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contratos_venda_documento_id_fkey"
      columns: ["documento_id"]
isOneToOne: false
      referencedRelation: "vendas_contrato_documentos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contratos_venda_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contratos_venda_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contratos_venda_filial_id_fkey"
      columns: ["filial_id"]
isOneToOne: false
      referencedRelation: "filiais"
      referencedColumns: ["id"]
    }
                  ]
                },"core_v_planos": {
                  Row: {
                    "cor": string | null,"descricao": string | null,"destaque": boolean | null,"features": Json | null,"id": string | null,"limite_leads": number | null,"limite_usuarios": number | null,"nome": string | null,"ordem": number | null,"preco_centavos": number | null
                  }
                  ComputedFields: never
                  Insert: {
                           "cor"?: string | null,"descricao"?: string | null,"destaque"?: boolean | null,"features"?: Json | null,"id"?: string | null,"limite_leads"?: number | null,"limite_usuarios"?: number | null,"nome"?: string | null,"ordem"?: number | null,"preco_centavos"?: number | null
                         }
                        Update: {
                           "cor"?: string | null,"descricao"?: string | null,"destaque"?: boolean | null,"features"?: Json | null,"id"?: string | null,"limite_leads"?: number | null,"limite_usuarios"?: number | null,"nome"?: string | null,"ordem"?: number | null,"preco_centavos"?: number | null
                         }
                        Relationships: [
                    
                  ]
                },"fichas_financiamento": {
                  Row: {
                    "banco": string | null,"created_at": string | null,"empresa_id": number | null,"entrada": number | null,"filial_id": number | null,"id": number | null,"lead_id": number | null,"observacoes": string | null,"parcelas": number | null,"status": string | null,"taxa": number | null,"usuario_id": string | null,"valor": number | null
                  }
                  ComputedFields: never
                  Insert: {
                           "banco"?: string | null,"created_at"?: string | null,"empresa_id"?: number | null,"entrada"?: number | null,"filial_id"?: number | null,"id"?: number | null,"lead_id"?: number | null,"observacoes"?: string | null,"parcelas"?: number | null,"status"?: string | null,"taxa"?: number | null,"usuario_id"?: string | null,"valor"?: number | null
                         }
                        Update: {
                           "banco"?: string | null,"created_at"?: string | null,"empresa_id"?: number | null,"entrada"?: number | null,"filial_id"?: number | null,"id"?: number | null,"lead_id"?: number | null,"observacoes"?: string | null,"parcelas"?: number | null,"status"?: string | null,"taxa"?: number | null,"usuario_id"?: string | null,"valor"?: number | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "fichas_financiamento_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fichas_financiamento_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fichas_financiamento_filial_id_fkey"
      columns: ["filial_id"]
isOneToOne: false
      referencedRelation: "filiais"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fichas_financiamento_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fichas_financiamento_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "negocios"
      referencedColumns: ["id"]
    }
                  ]
                },"fipe_consultas": {
                  Row: {
                    "ano": string | null,"ano_label": string | null,"codigo_fipe": string | null,"codigo_marca": number | null,"codigo_modelo": number | null,"criado_em": string | null,"id": number | null,"marca_nome": string | null,"mes_referencia": string | null,"modelo_nome": string | null,"referencia_codigo": number | null,"tipo": number | null,"valor": number | null
                  }
                  ComputedFields: never
                  Insert: {
                           "ano"?: string | null,"ano_label"?: string | null,"codigo_fipe"?: string | null,"codigo_marca"?: number | null,"codigo_modelo"?: number | null,"criado_em"?: string | null,"id"?: number | null,"marca_nome"?: string | null,"mes_referencia"?: string | null,"modelo_nome"?: string | null,"referencia_codigo"?: number | null,"tipo"?: number | null,"valor"?: number | null
                         }
                        Update: {
                           "ano"?: string | null,"ano_label"?: string | null,"codigo_fipe"?: string | null,"codigo_marca"?: number | null,"codigo_modelo"?: number | null,"criado_em"?: string | null,"id"?: number | null,"marca_nome"?: string | null,"mes_referencia"?: string | null,"modelo_nome"?: string | null,"referencia_codigo"?: number | null,"tipo"?: number | null,"valor"?: number | null
                         }
                        Relationships: [
                    
                  ]
                },"fipe_referencia": {
                  Row: {
                    "atualizado_em": string | null,"codigo": number | null,"id": number | null,"mes": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "atualizado_em"?: string | null,"codigo"?: number | null,"id"?: number | null,"mes"?: string | null
                         }
                        Update: {
                           "atualizado_em"?: string | null,"codigo"?: number | null,"id"?: number | null,"mes"?: string | null
                         }
                        Relationships: [
                    
                  ]
                },"fornecedores": {
                  Row: {
                    "ativo": boolean | null,"cnpj": string | null,"contato": string | null,"created_at": string | null,"email": string | null,"empresa_id": number | null,"id": number | null,"nome_fantasia": string | null,"observacoes": string | null,"razao_social": string | null,"telefone": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "ativo"?: boolean | null,"cnpj"?: string | null,"contato"?: string | null,"created_at"?: string | null,"email"?: string | null,"empresa_id"?: number | null,"id"?: number | null,"nome_fantasia"?: string | null,"observacoes"?: string | null,"razao_social"?: string | null,"telefone"?: string | null
                         }
                        Update: {
                           "ativo"?: boolean | null,"cnpj"?: string | null,"contato"?: string | null,"created_at"?: string | null,"email"?: string | null,"empresa_id"?: number | null,"id"?: number | null,"nome_fantasia"?: string | null,"observacoes"?: string | null,"razao_social"?: string | null,"telefone"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "fornecedores_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fornecedores_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    }
                  ]
                },"garantias_assistencias": {
                  Row: {
                    "aprovado_em": string | null,"celular_reserva_fornecido": boolean | null,"cliente_id": number | null,"created_at": string | null,"data_entrada": string | null,"defeito_relatado": string | null,"dentro_garantia": boolean | null,"dias_garantia_restantes": number | null,"empresa_id": number | null,"estado_entrada": string | null,"filial_id": number | null,"id": number | null,"imei_serial": string | null,"modelo_reserva": string | null,"observacoes": string | null,"orcamento_valor": number | null,"parecer_tecnico": string | null,"produto_id": number | null,"protocolo": string | null,"recusado_em": string | null,"responsavel_tecnico_id": string | null,"status": string | null,"tipo": string | null,"token": string | null,"usuario_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "aprovado_em"?: string | null,"celular_reserva_fornecido"?: boolean | null,"cliente_id"?: number | null,"created_at"?: string | null,"data_entrada"?: string | null,"defeito_relatado"?: string | null,"dentro_garantia"?: boolean | null,"dias_garantia_restantes"?: number | null,"empresa_id"?: number | null,"estado_entrada"?: string | null,"filial_id"?: number | null,"id"?: number | null,"imei_serial"?: string | null,"modelo_reserva"?: string | null,"observacoes"?: string | null,"orcamento_valor"?: number | null,"parecer_tecnico"?: string | null,"produto_id"?: number | null,"protocolo"?: string | null,"recusado_em"?: string | null,"responsavel_tecnico_id"?: string | null,"status"?: string | null,"tipo"?: string | null,"token"?: string | null,"usuario_id"?: string | null
                         }
                        Update: {
                           "aprovado_em"?: string | null,"celular_reserva_fornecido"?: boolean | null,"cliente_id"?: number | null,"created_at"?: string | null,"data_entrada"?: string | null,"defeito_relatado"?: string | null,"dentro_garantia"?: boolean | null,"dias_garantia_restantes"?: number | null,"empresa_id"?: number | null,"estado_entrada"?: string | null,"filial_id"?: number | null,"id"?: number | null,"imei_serial"?: string | null,"modelo_reserva"?: string | null,"observacoes"?: string | null,"orcamento_valor"?: number | null,"parecer_tecnico"?: string | null,"produto_id"?: number | null,"protocolo"?: string | null,"recusado_em"?: string | null,"responsavel_tecnico_id"?: string | null,"status"?: string | null,"tipo"?: string | null,"token"?: string | null,"usuario_id"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "garantias_assistencias_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "garantias_assistencias_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "contatos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "garantias_assistencias_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "garantias_assistencias_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "garantias_assistencias_filial_id_fkey"
      columns: ["filial_id"]
isOneToOne: false
      referencedRelation: "filiais"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "garantias_assistencias_produto_id_fkey"
      columns: ["produto_id"]
isOneToOne: false
      referencedRelation: "estoque_produtos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "garantias_assistencias_produto_id_fkey"
      columns: ["produto_id"]
isOneToOne: false
      referencedRelation: "produtos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "garantias_assistencias_responsavel_tecnico_id_fkey"
      columns: ["responsavel_tecnico_id"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "garantias_assistencias_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    }
                  ]
                },"imei_consultas": {
                  Row: {
                    "consultado_em": string | null,"consultado_por": string | null,"empresa_id": number | null,"fonte": string | null,"id": number | null,"imei": string | null,"motivo": string | null,"observacoes": string | null,"resultado": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "consultado_em"?: string | null,"consultado_por"?: string | null,"empresa_id"?: number | null,"fonte"?: string | null,"id"?: number | null,"imei"?: string | null,"motivo"?: string | null,"observacoes"?: string | null,"resultado"?: string | null
                         }
                        Update: {
                           "consultado_em"?: string | null,"consultado_por"?: string | null,"empresa_id"?: number | null,"fonte"?: string | null,"id"?: number | null,"imei"?: string | null,"motivo"?: string | null,"observacoes"?: string | null,"resultado"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "imei_consultas_consultado_por_fkey"
      columns: ["consultado_por"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "imei_consultas_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "imei_consultas_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    }
                  ]
                },"imoveis": {
                  Row: {
                    "aceita_financiamento": boolean | null,"aceita_permuta": boolean | null,"area_total": number | null,"area_util": number | null,"bairro": string | null,"banheiros": number | null,"captado_em": string | null,"captado_por": string | null,"cep": string | null,"cidade": string | null,"codigo": string | null,"complemento": string | null,"created_at": string | null,"descricao": string | null,"empresa_id": number | null,"finalidade": string | null,"fotos": Json | null,"id": number | null,"iptu_periodicidade": string | null,"latitude": number | null,"logradouro": string | null,"longitude": number | null,"matricula": string | null,"numero": string | null,"ocultar_numero_publico": boolean | null,"proprietario_id": number | null,"publicar_portais": boolean | null,"quartos": number | null,"status": string | null,"suites": number | null,"tipo": string | null,"titulo": string | null,"uf": string | null,"updated_at": string | null,"vagas": number | null,"valor_condominio": number | null,"valor_iptu": number | null,"valor_locacao": number | null,"valor_venda": number | null
                  }
                  ComputedFields: never
                  Insert: {
                           "aceita_financiamento"?: boolean | null,"aceita_permuta"?: boolean | null,"area_total"?: number | null,"area_util"?: number | null,"bairro"?: string | null,"banheiros"?: number | null,"captado_em"?: string | null,"captado_por"?: string | null,"cep"?: string | null,"cidade"?: string | null,"codigo"?: string | null,"complemento"?: string | null,"created_at"?: string | null,"descricao"?: string | null,"empresa_id"?: number | null,"finalidade"?: string | null,"fotos"?: Json | null,"id"?: number | null,"iptu_periodicidade"?: string | null,"latitude"?: number | null,"logradouro"?: string | null,"longitude"?: number | null,"matricula"?: string | null,"numero"?: string | null,"ocultar_numero_publico"?: boolean | null,"proprietario_id"?: number | null,"publicar_portais"?: boolean | null,"quartos"?: number | null,"status"?: string | null,"suites"?: number | null,"tipo"?: string | null,"titulo"?: string | null,"uf"?: string | null,"updated_at"?: string | null,"vagas"?: number | null,"valor_condominio"?: number | null,"valor_iptu"?: number | null,"valor_locacao"?: number | null,"valor_venda"?: number | null
                         }
                        Update: {
                           "aceita_financiamento"?: boolean | null,"aceita_permuta"?: boolean | null,"area_total"?: number | null,"area_util"?: number | null,"bairro"?: string | null,"banheiros"?: number | null,"captado_em"?: string | null,"captado_por"?: string | null,"cep"?: string | null,"cidade"?: string | null,"codigo"?: string | null,"complemento"?: string | null,"created_at"?: string | null,"descricao"?: string | null,"empresa_id"?: number | null,"finalidade"?: string | null,"fotos"?: Json | null,"id"?: number | null,"iptu_periodicidade"?: string | null,"latitude"?: number | null,"logradouro"?: string | null,"longitude"?: number | null,"matricula"?: string | null,"numero"?: string | null,"ocultar_numero_publico"?: boolean | null,"proprietario_id"?: number | null,"publicar_portais"?: boolean | null,"quartos"?: number | null,"status"?: string | null,"suites"?: number | null,"tipo"?: string | null,"titulo"?: string | null,"uf"?: string | null,"updated_at"?: string | null,"vagas"?: number | null,"valor_condominio"?: number | null,"valor_iptu"?: number | null,"valor_locacao"?: number | null,"valor_venda"?: number | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "imoveis_captado_por_fkey"
      columns: ["captado_por"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "imoveis_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "imoveis_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "imoveis_proprietario_id_fkey"
      columns: ["proprietario_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "imoveis_proprietario_id_fkey"
      columns: ["proprietario_id"]
isOneToOne: false
      referencedRelation: "contatos"
      referencedColumns: ["id"]
    }
                  ]
                },"inventario_unidades": {
                  Row: {
                    "anatel_resultado": string | null,"ano": number | null,"armazenamento": string | null,"ativo": boolean | null,"bateria": string | null,"chassi": string | null,"cliente_id": number | null,"condicao": string | null,"cor": string | null,"created_at": string | null,"custo_reparo": number | null,"empresa_id": number | null,"estado": string | null,"filial_id": number | null,"fornecedor_id": number | null,"fotos_urls": string | null,"grupo_pdv": string | null,"id": number | null,"imei": string | null,"imei2": string | null,"km": number | null,"numero_serie": string | null,"observacoes": string | null,"placa": string | null,"preco_custo": number | null,"preco_venda": number | null,"produto_id": number | null,"quantidade": number | null,"recebido_em": string | null,"recebido_por": string | null,"renavam": string | null,"reserva_expira_em": string | null,"reservado_em": string | null,"reservado_lead_id": number | null,"reservado_por": string | null,"status": string | null,"tipo": string | null,"usuario_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "anatel_resultado"?: string | null,"ano"?: number | null,"armazenamento"?: string | null,"ativo"?: boolean | null,"bateria"?: string | null,"chassi"?: string | null,"cliente_id"?: number | null,"condicao"?: string | null,"cor"?: string | null,"created_at"?: string | null,"custo_reparo"?: number | null,"empresa_id"?: number | null,"estado"?: string | null,"filial_id"?: number | null,"fornecedor_id"?: number | null,"fotos_urls"?: string | null,"grupo_pdv"?: string | null,"id"?: number | null,"imei"?: string | null,"imei2"?: string | null,"km"?: number | null,"numero_serie"?: string | null,"observacoes"?: string | null,"placa"?: string | null,"preco_custo"?: number | null,"preco_venda"?: number | null,"produto_id"?: number | null,"quantidade"?: number | null,"recebido_em"?: string | null,"recebido_por"?: string | null,"renavam"?: string | null,"reserva_expira_em"?: string | null,"reservado_em"?: string | null,"reservado_lead_id"?: number | null,"reservado_por"?: string | null,"status"?: string | null,"tipo"?: string | null,"usuario_id"?: string | null
                         }
                        Update: {
                           "anatel_resultado"?: string | null,"ano"?: number | null,"armazenamento"?: string | null,"ativo"?: boolean | null,"bateria"?: string | null,"chassi"?: string | null,"cliente_id"?: number | null,"condicao"?: string | null,"cor"?: string | null,"created_at"?: string | null,"custo_reparo"?: number | null,"empresa_id"?: number | null,"estado"?: string | null,"filial_id"?: number | null,"fornecedor_id"?: number | null,"fotos_urls"?: string | null,"grupo_pdv"?: string | null,"id"?: number | null,"imei"?: string | null,"imei2"?: string | null,"km"?: number | null,"numero_serie"?: string | null,"observacoes"?: string | null,"placa"?: string | null,"preco_custo"?: number | null,"preco_venda"?: number | null,"produto_id"?: number | null,"quantidade"?: number | null,"recebido_em"?: string | null,"recebido_por"?: string | null,"renavam"?: string | null,"reserva_expira_em"?: string | null,"reservado_em"?: string | null,"reservado_lead_id"?: number | null,"reservado_por"?: string | null,"status"?: string | null,"tipo"?: string | null,"usuario_id"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "inventario_unidades_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventario_unidades_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "contatos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventario_unidades_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventario_unidades_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventario_unidades_filial_id_fkey"
      columns: ["filial_id"]
isOneToOne: false
      referencedRelation: "filiais"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventario_unidades_fornecedor_id_fkey"
      columns: ["fornecedor_id"]
isOneToOne: false
      referencedRelation: "estoque_fornecedores"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventario_unidades_fornecedor_id_fkey"
      columns: ["fornecedor_id"]
isOneToOne: false
      referencedRelation: "fornecedores"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventario_unidades_produto_id_fkey"
      columns: ["produto_id"]
isOneToOne: false
      referencedRelation: "estoque_produtos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventario_unidades_produto_id_fkey"
      columns: ["produto_id"]
isOneToOne: false
      referencedRelation: "produtos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventario_unidades_recebido_por_fkey"
      columns: ["recebido_por"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventario_unidades_reservado_lead_id_fkey"
      columns: ["reservado_lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventario_unidades_reservado_lead_id_fkey"
      columns: ["reservado_lead_id"]
isOneToOne: false
      referencedRelation: "negocios"
      referencedColumns: ["id"]
    }
                  ]
                },"lancamentos_financeiros": {
                  Row: {
                    "categoria": string | null,"created_at": string | null,"data_pgto": string | null,"data_venc": string | null,"descricao": string | null,"empresa_id": number | null,"filial_id": number | null,"forma_pgto": string | null,"id": number | null,"observacoes": string | null,"referencia_id": number | null,"referencia_tp": string | null,"status": string | null,"tipo": string | null,"updated_at": string | null,"valor": number | null
                  }
                  ComputedFields: never
                  Insert: {
                           "categoria"?: string | null,"created_at"?: string | null,"data_pgto"?: string | null,"data_venc"?: string | null,"descricao"?: string | null,"empresa_id"?: number | null,"filial_id"?: number | null,"forma_pgto"?: string | null,"id"?: number | null,"observacoes"?: string | null,"referencia_id"?: number | null,"referencia_tp"?: string | null,"status"?: string | null,"tipo"?: string | null,"updated_at"?: string | null,"valor"?: number | null
                         }
                        Update: {
                           "categoria"?: string | null,"created_at"?: string | null,"data_pgto"?: string | null,"data_venc"?: string | null,"descricao"?: string | null,"empresa_id"?: number | null,"filial_id"?: number | null,"forma_pgto"?: string | null,"id"?: number | null,"observacoes"?: string | null,"referencia_id"?: number | null,"referencia_tp"?: string | null,"status"?: string | null,"tipo"?: string | null,"updated_at"?: string | null,"valor"?: number | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "lancamentos_financeiros_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lancamentos_financeiros_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lancamentos_financeiros_filial_id_fkey"
      columns: ["filial_id"]
isOneToOne: false
      referencedRelation: "filiais"
      referencedColumns: ["id"]
    }
                  ]
                },"lead_mensagens": {
                  Row: {
                    "canal_id": number | null,"conteudo": string | null,"created_at": string | null,"direcao": string | null,"empresa_id": number | null,"erro_envio": string | null,"external_id": string | null,"filial_id": number | null,"id": number | null,"lead_id": number | null,"lida": boolean | null,"midia_retida_em": string | null,"midia_url": string | null,"origem": string | null,"status_em": string | null,"status_entrega": string | null,"tipo": string | null,"transcricao": string | null,"usuario_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "canal_id"?: number | null,"conteudo"?: string | null,"created_at"?: string | null,"direcao"?: string | null,"empresa_id"?: number | null,"erro_envio"?: string | null,"external_id"?: string | null,"filial_id"?: number | null,"id"?: number | null,"lead_id"?: number | null,"lida"?: boolean | null,"midia_retida_em"?: string | null,"midia_url"?: string | null,"origem"?: string | null,"status_em"?: string | null,"status_entrega"?: string | null,"tipo"?: string | null,"transcricao"?: string | null,"usuario_id"?: string | null
                         }
                        Update: {
                           "canal_id"?: number | null,"conteudo"?: string | null,"created_at"?: string | null,"direcao"?: string | null,"empresa_id"?: number | null,"erro_envio"?: string | null,"external_id"?: string | null,"filial_id"?: number | null,"id"?: number | null,"lead_id"?: number | null,"lida"?: boolean | null,"midia_retida_em"?: string | null,"midia_url"?: string | null,"origem"?: string | null,"status_em"?: string | null,"status_entrega"?: string | null,"tipo"?: string | null,"transcricao"?: string | null,"usuario_id"?: string | null
                         }
                        Relationships: [
                    
                  ]
                },"lead_perfil_busca": {
                  Row: {
                    "area_max": number | null,"area_min": number | null,"ativo": boolean | null,"bairros": (string)[] | null,"caracteristicas": (string)[] | null,"cidades": (string)[] | null,"cliente_id": number | null,"created_at": string | null,"empresa_id": number | null,"filial_id": number | null,"finalidade": string | null,"id": number | null,"lead_id": number | null,"observacoes": string | null,"preco_max": number | null,"preco_min": number | null,"quartos_max": number | null,"quartos_min": number | null,"suites_min": number | null,"tipos": (string)[] | null,"updated_at": string | null,"vagas_min": number | null
                  }
                  ComputedFields: never
                  Insert: {
                           "area_max"?: number | null,"area_min"?: number | null,"ativo"?: boolean | null,"bairros"?: (string)[] | null,"caracteristicas"?: (string)[] | null,"cidades"?: (string)[] | null,"cliente_id"?: number | null,"created_at"?: string | null,"empresa_id"?: number | null,"filial_id"?: number | null,"finalidade"?: string | null,"id"?: number | null,"lead_id"?: number | null,"observacoes"?: string | null,"preco_max"?: number | null,"preco_min"?: number | null,"quartos_max"?: number | null,"quartos_min"?: number | null,"suites_min"?: number | null,"tipos"?: (string)[] | null,"updated_at"?: string | null,"vagas_min"?: number | null
                         }
                        Update: {
                           "area_max"?: number | null,"area_min"?: number | null,"ativo"?: boolean | null,"bairros"?: (string)[] | null,"caracteristicas"?: (string)[] | null,"cidades"?: (string)[] | null,"cliente_id"?: number | null,"created_at"?: string | null,"empresa_id"?: number | null,"filial_id"?: number | null,"finalidade"?: string | null,"id"?: number | null,"lead_id"?: number | null,"observacoes"?: string | null,"preco_max"?: number | null,"preco_min"?: number | null,"quartos_max"?: number | null,"quartos_min"?: number | null,"suites_min"?: number | null,"tipos"?: (string)[] | null,"updated_at"?: string | null,"vagas_min"?: number | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "lead_perfil_busca_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lead_perfil_busca_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "contatos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lead_perfil_busca_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lead_perfil_busca_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lead_perfil_busca_filial_id_fkey"
      columns: ["filial_id"]
isOneToOne: false
      referencedRelation: "filiais"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lead_perfil_busca_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: true
      referencedRelation: "leads"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lead_perfil_busca_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: true
      referencedRelation: "negocios"
      referencedColumns: ["id"]
    }
                  ]
                },"leads": {
                  Row: {
                    "anuncio": Json | null,"ativo": boolean | null,"convertido_em": number | null,"created_at": string | null,"data_transferencia_funil": string | null,"devolucoes": number | null,"devolvido_em": string | null,"empresa_id": number | null,"filial_id": number | null,"foto_url": string | null,"funil_id": number | null,"id": number | null,"instagram": string | null,"interesse": Json | null,"kanban_ordem": number | null,"kanban_status": string | null,"motivo_perda_id": number | null,"msgs_nao_lidas": number | null,"nome": string | null,"observacoes": string | null,"origem": string | null,"origem_id": string | null,"perdido_em": string | null,"primeira_msg": string | null,"produto_interessado": string | null,"responsavel_desde": string | null,"responsavel_id": string | null,"telefone": string | null,"ultima_enviada_at": string | null,"ultima_mensagem_at": string | null,"ultima_recebida_at": string | null,"ultima_tratativa": string | null,"valor_estimado": number | null
                  }
                  ComputedFields: never
                  Insert: {
                           "anuncio"?: Json | null,"ativo"?: boolean | null,"convertido_em"?: number | null,"created_at"?: string | null,"data_transferencia_funil"?: string | null,"devolucoes"?: number | null,"devolvido_em"?: string | null,"empresa_id"?: number | null,"filial_id"?: number | null,"foto_url"?: string | null,"funil_id"?: number | null,"id"?: number | null,"instagram"?: string | null,"interesse"?: Json | null,"kanban_ordem"?: number | null,"kanban_status"?: string | null,"motivo_perda_id"?: number | null,"msgs_nao_lidas"?: number | null,"nome"?: string | null,"observacoes"?: string | null,"origem"?: string | null,"origem_id"?: string | null,"perdido_em"?: string | null,"primeira_msg"?: string | null,"produto_interessado"?: string | null,"responsavel_desde"?: string | null,"responsavel_id"?: string | null,"telefone"?: string | null,"ultima_enviada_at"?: string | null,"ultima_mensagem_at"?: string | null,"ultima_recebida_at"?: string | null,"ultima_tratativa"?: string | null,"valor_estimado"?: number | null
                         }
                        Update: {
                           "anuncio"?: Json | null,"ativo"?: boolean | null,"convertido_em"?: number | null,"created_at"?: string | null,"data_transferencia_funil"?: string | null,"devolucoes"?: number | null,"devolvido_em"?: string | null,"empresa_id"?: number | null,"filial_id"?: number | null,"foto_url"?: string | null,"funil_id"?: number | null,"id"?: number | null,"instagram"?: string | null,"interesse"?: Json | null,"kanban_ordem"?: number | null,"kanban_status"?: string | null,"motivo_perda_id"?: number | null,"msgs_nao_lidas"?: number | null,"nome"?: string | null,"observacoes"?: string | null,"origem"?: string | null,"origem_id"?: string | null,"perdido_em"?: string | null,"primeira_msg"?: string | null,"produto_interessado"?: string | null,"responsavel_desde"?: string | null,"responsavel_id"?: string | null,"telefone"?: string | null,"ultima_enviada_at"?: string | null,"ultima_mensagem_at"?: string | null,"ultima_recebida_at"?: string | null,"ultima_tratativa"?: string | null,"valor_estimado"?: number | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "negocios_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "negocios_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "negocios_filial_id_fkey"
      columns: ["filial_id"]
isOneToOne: false
      referencedRelation: "filiais"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "negocios_funil_id_fkey"
      columns: ["funil_id"]
isOneToOne: false
      referencedRelation: "funis"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "negocios_motivo_perda_id_fkey"
      columns: ["motivo_perda_id"]
isOneToOne: false
      referencedRelation: "motivos_perda"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "negocios_responsavel_id_fkey"
      columns: ["responsavel_id"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    }
                  ]
                },"marcas_produtos": {
                  Row: {
                    "ativo": boolean | null,"created_at": string | null,"empresa_id": number | null,"id": number | null,"nome": string | null,"ordem": number | null
                  }
                  ComputedFields: never
                  Insert: {
                           "ativo"?: boolean | null,"created_at"?: string | null,"empresa_id"?: number | null,"id"?: number | null,"nome"?: string | null,"ordem"?: number | null
                         }
                        Update: {
                           "ativo"?: boolean | null,"created_at"?: string | null,"empresa_id"?: number | null,"id"?: number | null,"nome"?: string | null,"ordem"?: number | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "marcas_produtos_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "marcas_produtos_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    }
                  ]
                },"movimentacao_estoque": {
                  Row: {
                    "created_at": string | null,"empresa_id": number | null,"filial_id": number | null,"id": number | null,"observacoes": string | null,"produto_id": number | null,"quantidade": number | null,"tipo_movimento": string | null,"usuario_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "created_at"?: string | null,"empresa_id"?: number | null,"filial_id"?: number | null,"id"?: number | null,"observacoes"?: string | null,"produto_id"?: number | null,"quantidade"?: number | null,"tipo_movimento"?: string | null,"usuario_id"?: string | null
                         }
                        Update: {
                           "created_at"?: string | null,"empresa_id"?: number | null,"filial_id"?: number | null,"id"?: number | null,"observacoes"?: string | null,"produto_id"?: number | null,"quantidade"?: number | null,"tipo_movimento"?: string | null,"usuario_id"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "movimentacao_estoque_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movimentacao_estoque_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movimentacao_estoque_filial_id_fkey"
      columns: ["filial_id"]
isOneToOne: false
      referencedRelation: "filiais"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movimentacao_estoque_produto_id_fkey"
      columns: ["produto_id"]
isOneToOne: false
      referencedRelation: "estoque_produtos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movimentacao_estoque_produto_id_fkey"
      columns: ["produto_id"]
isOneToOne: false
      referencedRelation: "produtos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movimentacao_estoque_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    }
                  ]
                },"negocios_imobiliarios": {
                  Row: {
                    "assinado_em": string | null,"captador_id": string | null,"cashback": number | null,"cashback_percentual": number | null,"chaves_entregues_em": string | null,"cliente_id": number | null,"cliente_nome": string | null,"comissao_aprovada_em": string | null,"comissao_captador": number | null,"comissao_paga_em": string | null,"comissao_status": string | null,"comissao_total": number | null,"comissao_vendedor": number | null,"corretor_id": string | null,"created_at": string | null,"criado_por": string | null,"empresa_id": number | null,"id": number | null,"imovel_codigo": string | null,"imovel_id": number | null,"lead_id": number | null,"locacao_fim": string | null,"locacao_inicio": string | null,"observacoes": string | null,"origem": string | null,"percentual": number | null,"status": string | null,"tipo": string | null,"updated_at": string | null,"valor": number | null,"vistoria_em": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "assinado_em"?: string | null,"captador_id"?: string | null,"cashback"?: number | null,"cashback_percentual"?: number | null,"chaves_entregues_em"?: string | null,"cliente_id"?: number | null,"cliente_nome"?: string | null,"comissao_aprovada_em"?: string | null,"comissao_captador"?: number | null,"comissao_paga_em"?: string | null,"comissao_status"?: string | null,"comissao_total"?: number | null,"comissao_vendedor"?: number | null,"corretor_id"?: string | null,"created_at"?: string | null,"criado_por"?: string | null,"empresa_id"?: number | null,"id"?: number | null,"imovel_codigo"?: string | null,"imovel_id"?: number | null,"lead_id"?: number | null,"locacao_fim"?: string | null,"locacao_inicio"?: string | null,"observacoes"?: string | null,"origem"?: string | null,"percentual"?: number | null,"status"?: string | null,"tipo"?: string | null,"updated_at"?: string | null,"valor"?: number | null,"vistoria_em"?: string | null
                         }
                        Update: {
                           "assinado_em"?: string | null,"captador_id"?: string | null,"cashback"?: number | null,"cashback_percentual"?: number | null,"chaves_entregues_em"?: string | null,"cliente_id"?: number | null,"cliente_nome"?: string | null,"comissao_aprovada_em"?: string | null,"comissao_captador"?: number | null,"comissao_paga_em"?: string | null,"comissao_status"?: string | null,"comissao_total"?: number | null,"comissao_vendedor"?: number | null,"corretor_id"?: string | null,"created_at"?: string | null,"criado_por"?: string | null,"empresa_id"?: number | null,"id"?: number | null,"imovel_codigo"?: string | null,"imovel_id"?: number | null,"lead_id"?: number | null,"locacao_fim"?: string | null,"locacao_inicio"?: string | null,"observacoes"?: string | null,"origem"?: string | null,"percentual"?: number | null,"status"?: string | null,"tipo"?: string | null,"updated_at"?: string | null,"valor"?: number | null,"vistoria_em"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "negocios_imobiliarios_captador_id_fkey"
      columns: ["captador_id"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "negocios_imobiliarios_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "negocios_imobiliarios_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "contatos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "negocios_imobiliarios_corretor_id_fkey"
      columns: ["corretor_id"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "negocios_imobiliarios_criado_por_fkey"
      columns: ["criado_por"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "negocios_imobiliarios_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "negocios_imobiliarios_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "negocios_imobiliarios_imovel_id_fkey"
      columns: ["imovel_id"]
isOneToOne: false
      referencedRelation: "imoveis"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "negocios_imobiliarios_imovel_id_fkey"
      columns: ["imovel_id"]
isOneToOne: false
      referencedRelation: "imoveis_imoveis"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "negocios_imobiliarios_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "negocios_imobiliarios_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "negocios"
      referencedColumns: ["id"]
    }
                  ]
                },"orcamentos": {
                  Row: {
                    "acerto": string | null,"aparelho": string | null,"aparelho_novo": string | null,"aparelho_usado": string | null,"aprovado_em": string | null,"cliente_id": number | null,"cliente_nome": string | null,"cliente_telefone": string | null,"created_at": string | null,"defeito": string | null,"empresa_id": number | null,"filial_id": number | null,"garantia_dias": number | null,"id": number | null,"imei": string | null,"itens": Json | null,"lead_id": number | null,"observacoes": string | null,"os_id": number | null,"prazo_dias": number | null,"recusado_em": string | null,"status": string | null,"tipo": string | null,"token": string | null,"total": number | null,"troca_cotacao_id": number | null,"unidade_id": number | null,"usuario_id": string | null,"valor_devolver": number | null,"valor_entrada": number | null,"valor_novo": number | null
                  }
                  ComputedFields: never
                  Insert: {
                           "acerto"?: string | null,"aparelho"?: string | null,"aparelho_novo"?: string | null,"aparelho_usado"?: string | null,"aprovado_em"?: string | null,"cliente_id"?: number | null,"cliente_nome"?: string | null,"cliente_telefone"?: string | null,"created_at"?: string | null,"defeito"?: string | null,"empresa_id"?: number | null,"filial_id"?: number | null,"garantia_dias"?: number | null,"id"?: number | null,"imei"?: string | null,"itens"?: Json | null,"lead_id"?: number | null,"observacoes"?: string | null,"os_id"?: number | null,"prazo_dias"?: number | null,"recusado_em"?: string | null,"status"?: string | null,"tipo"?: string | null,"token"?: string | null,"total"?: number | null,"troca_cotacao_id"?: number | null,"unidade_id"?: number | null,"usuario_id"?: string | null,"valor_devolver"?: number | null,"valor_entrada"?: number | null,"valor_novo"?: number | null
                         }
                        Update: {
                           "acerto"?: string | null,"aparelho"?: string | null,"aparelho_novo"?: string | null,"aparelho_usado"?: string | null,"aprovado_em"?: string | null,"cliente_id"?: number | null,"cliente_nome"?: string | null,"cliente_telefone"?: string | null,"created_at"?: string | null,"defeito"?: string | null,"empresa_id"?: number | null,"filial_id"?: number | null,"garantia_dias"?: number | null,"id"?: number | null,"imei"?: string | null,"itens"?: Json | null,"lead_id"?: number | null,"observacoes"?: string | null,"os_id"?: number | null,"prazo_dias"?: number | null,"recusado_em"?: string | null,"status"?: string | null,"tipo"?: string | null,"token"?: string | null,"total"?: number | null,"troca_cotacao_id"?: number | null,"unidade_id"?: number | null,"usuario_id"?: string | null,"valor_devolver"?: number | null,"valor_entrada"?: number | null,"valor_novo"?: number | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "orcamentos_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orcamentos_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "contatos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orcamentos_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orcamentos_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orcamentos_filial_id_fkey"
      columns: ["filial_id"]
isOneToOne: false
      referencedRelation: "filiais"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orcamentos_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orcamentos_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "negocios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orcamentos_troca_cotacao_id_fkey"
      columns: ["troca_cotacao_id"]
isOneToOne: false
      referencedRelation: "avaliacao_cotacoes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orcamentos_troca_cotacao_id_fkey"
      columns: ["troca_cotacao_id"]
isOneToOne: false
      referencedRelation: "troca_cotacoes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orcamentos_unidade_id_fkey"
      columns: ["unidade_id"]
isOneToOne: false
      referencedRelation: "estoque_unidades"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orcamentos_unidade_id_fkey"
      columns: ["unidade_id"]
isOneToOne: false
      referencedRelation: "inventario_unidades"
      referencedColumns: ["id"]
    }
                  ]
                },"payment_webhook_eventos": {
                  Row: {
                    "event_type": string | null,"id": number | null,"processado_em": string | null,"provider": string | null,"provider_ref": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "event_type"?: string | null,"id"?: number | null,"processado_em"?: string | null,"provider"?: string | null,"provider_ref"?: string | null
                         }
                        Update: {
                           "event_type"?: string | null,"id"?: number | null,"processado_em"?: string | null,"provider"?: string | null,"provider_ref"?: string | null
                         }
                        Relationships: [
                    
                  ]
                },"pedidos_compra": {
                  Row: {
                    "created_at": string | null,"data_pedido": string | null,"descricao": string | null,"empresa_id": number | null,"filial_id": number | null,"fornecedor_id": number | null,"id": number | null,"observacoes": string | null,"solicitado_em": string | null,"solicitado_por": string | null,"status": string | null,"usuario_id": string | null,"valor_total": number | null
                  }
                  ComputedFields: never
                  Insert: {
                           "created_at"?: string | null,"data_pedido"?: string | null,"descricao"?: string | null,"empresa_id"?: number | null,"filial_id"?: number | null,"fornecedor_id"?: number | null,"id"?: number | null,"observacoes"?: string | null,"solicitado_em"?: string | null,"solicitado_por"?: string | null,"status"?: string | null,"usuario_id"?: string | null,"valor_total"?: number | null
                         }
                        Update: {
                           "created_at"?: string | null,"data_pedido"?: string | null,"descricao"?: string | null,"empresa_id"?: number | null,"filial_id"?: number | null,"fornecedor_id"?: number | null,"id"?: number | null,"observacoes"?: string | null,"solicitado_em"?: string | null,"solicitado_por"?: string | null,"status"?: string | null,"usuario_id"?: string | null,"valor_total"?: number | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "pedidos_compra_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pedidos_compra_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pedidos_compra_filial_id_fkey"
      columns: ["filial_id"]
isOneToOne: false
      referencedRelation: "filiais"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pedidos_compra_fornecedor_id_fkey"
      columns: ["fornecedor_id"]
isOneToOne: false
      referencedRelation: "estoque_fornecedores"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pedidos_compra_fornecedor_id_fkey"
      columns: ["fornecedor_id"]
isOneToOne: false
      referencedRelation: "fornecedores"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pedidos_compra_solicitado_por_fkey"
      columns: ["solicitado_por"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pedidos_compra_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    }
                  ]
                },"pre_vendas": {
                  Row: {
                    "canal_venda": string | null,"created_at": string | null,"desconto_valor": number | null,"empresa_id": number | null,"filial_id": number | null,"grupo_id": string | null,"id": number | null,"inventario_unidade_id": number | null,"observacoes": string | null,"produto_id": number | null,"status": string | null,"usuario_id": string | null,"valor_venda": number | null,"venda_id": number | null,"vendedor_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "canal_venda"?: string | null,"created_at"?: string | null,"desconto_valor"?: number | null,"empresa_id"?: number | null,"filial_id"?: number | null,"grupo_id"?: string | null,"id"?: number | null,"inventario_unidade_id"?: number | null,"observacoes"?: string | null,"produto_id"?: number | null,"status"?: string | null,"usuario_id"?: string | null,"valor_venda"?: number | null,"venda_id"?: number | null,"vendedor_id"?: string | null
                         }
                        Update: {
                           "canal_venda"?: string | null,"created_at"?: string | null,"desconto_valor"?: number | null,"empresa_id"?: number | null,"filial_id"?: number | null,"grupo_id"?: string | null,"id"?: number | null,"inventario_unidade_id"?: number | null,"observacoes"?: string | null,"produto_id"?: number | null,"status"?: string | null,"usuario_id"?: string | null,"valor_venda"?: number | null,"venda_id"?: number | null,"vendedor_id"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "pre_vendas_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pre_vendas_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pre_vendas_filial_id_fkey"
      columns: ["filial_id"]
isOneToOne: false
      referencedRelation: "filiais"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pre_vendas_inventario_unidade_id_fkey"
      columns: ["inventario_unidade_id"]
isOneToOne: false
      referencedRelation: "estoque_unidades"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pre_vendas_inventario_unidade_id_fkey"
      columns: ["inventario_unidade_id"]
isOneToOne: false
      referencedRelation: "inventario_unidades"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pre_vendas_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pre_vendas_venda_id_fkey"
      columns: ["venda_id"]
isOneToOne: false
      referencedRelation: "vendas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pre_vendas_venda_id_fkey"
      columns: ["venda_id"]
isOneToOne: false
      referencedRelation: "vendas_vendas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pre_vendas_vendedor_id_fkey"
      columns: ["vendedor_id"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    }
                  ]
                },"produtos": {
                  Row: {
                    "armazenamentos": (string)[] | null,"ativo": boolean | null,"categoria_id": number | null,"categoria_tipo": string | null,"codigos": string | null,"cores": (string)[] | null,"created_at": string | null,"descricao": string | null,"disponivel": boolean | null,"empresa_id": number | null,"foto_url": string | null,"garantia_dias": number | null,"id": number | null,"marca_id": number | null,"nome": string | null,"preco": number | null,"subcategoria_id": number | null
                  }
                  ComputedFields: never
                  Insert: {
                           "armazenamentos"?: (string)[] | null,"ativo"?: boolean | null,"categoria_id"?: number | null,"categoria_tipo"?: string | null,"codigos"?: string | null,"cores"?: (string)[] | null,"created_at"?: string | null,"descricao"?: string | null,"disponivel"?: boolean | null,"empresa_id"?: number | null,"foto_url"?: string | null,"garantia_dias"?: number | null,"id"?: number | null,"marca_id"?: number | null,"nome"?: string | null,"preco"?: number | null,"subcategoria_id"?: number | null
                         }
                        Update: {
                           "armazenamentos"?: (string)[] | null,"ativo"?: boolean | null,"categoria_id"?: number | null,"categoria_tipo"?: string | null,"codigos"?: string | null,"cores"?: (string)[] | null,"created_at"?: string | null,"descricao"?: string | null,"disponivel"?: boolean | null,"empresa_id"?: number | null,"foto_url"?: string | null,"garantia_dias"?: number | null,"id"?: number | null,"marca_id"?: number | null,"nome"?: string | null,"preco"?: number | null,"subcategoria_id"?: number | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "produtos_categoria_id_fkey"
      columns: ["categoria_id"]
isOneToOne: false
      referencedRelation: "categorias_produtos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "produtos_categoria_id_fkey"
      columns: ["categoria_id"]
isOneToOne: false
      referencedRelation: "estoque_categorias"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "produtos_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "produtos_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "produtos_marca_id_fkey"
      columns: ["marca_id"]
isOneToOne: false
      referencedRelation: "estoque_marcas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "produtos_marca_id_fkey"
      columns: ["marca_id"]
isOneToOne: false
      referencedRelation: "marcas_produtos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "produtos_subcategoria_id_fkey"
      columns: ["subcategoria_id"]
isOneToOne: false
      referencedRelation: "estoque_subcategorias"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "produtos_subcategoria_id_fkey"
      columns: ["subcategoria_id"]
isOneToOne: false
      referencedRelation: "subcategorias_produtos"
      referencedColumns: ["id"]
    }
                  ]
                },"propostas": {
                  Row: {
                    "cliente_nome": string | null,"created_at": string | null,"empresa_id": number | null,"filial_id": number | null,"id": number | null,"itens": Json | null,"lead_id": number | null,"observacoes": string | null,"status": string | null,"token": string | null,"total": number | null
                  }
                  ComputedFields: never
                  Insert: {
                           "cliente_nome"?: string | null,"created_at"?: string | null,"empresa_id"?: number | null,"filial_id"?: number | null,"id"?: number | null,"itens"?: Json | null,"lead_id"?: number | null,"observacoes"?: string | null,"status"?: string | null,"token"?: string | null,"total"?: number | null
                         }
                        Update: {
                           "cliente_nome"?: string | null,"created_at"?: string | null,"empresa_id"?: number | null,"filial_id"?: number | null,"id"?: number | null,"itens"?: Json | null,"lead_id"?: number | null,"observacoes"?: string | null,"status"?: string | null,"token"?: string | null,"total"?: number | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "propostas_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "propostas_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "propostas_filial_id_fkey"
      columns: ["filial_id"]
isOneToOne: false
      referencedRelation: "filiais"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "propostas_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "propostas_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "negocios"
      referencedColumns: ["id"]
    }
                  ]
                },"servicos_reparo": {
                  Row: {
                    "ativo": boolean | null,"categoria": string | null,"created_at": string | null,"empresa_id": number | null,"filial_id": number | null,"id": number | null,"nome": string | null,"preco": number | null,"tempo_estimado_min": number | null
                  }
                  ComputedFields: never
                  Insert: {
                           "ativo"?: boolean | null,"categoria"?: string | null,"created_at"?: string | null,"empresa_id"?: number | null,"filial_id"?: number | null,"id"?: number | null,"nome"?: string | null,"preco"?: number | null,"tempo_estimado_min"?: number | null
                         }
                        Update: {
                           "ativo"?: boolean | null,"categoria"?: string | null,"created_at"?: string | null,"empresa_id"?: number | null,"filial_id"?: number | null,"id"?: number | null,"nome"?: string | null,"preco"?: number | null,"tempo_estimado_min"?: number | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "servicos_reparo_filial_id_fkey"
      columns: ["filial_id"]
isOneToOne: false
      referencedRelation: "filiais"
      referencedColumns: ["id"]
    }
                  ]
                },"storage_orfaos": {
                  Row: {
                    "bytes": number | null,"created_at": string | null,"name": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "bytes"?: never,"created_at"?: string | null,"name"?: string | null
                         }
                        Update: {
                           "bytes"?: never,"created_at"?: string | null,"name"?: string | null
                         }
                        Relationships: [
                    
                  ]
                },"subcategorias_produtos": {
                  Row: {
                    "ativo": boolean | null,"categoria_id": number | null,"created_at": string | null,"empresa_id": number | null,"id": number | null,"nome": string | null,"ordem": number | null
                  }
                  ComputedFields: never
                  Insert: {
                           "ativo"?: boolean | null,"categoria_id"?: number | null,"created_at"?: string | null,"empresa_id"?: number | null,"id"?: number | null,"nome"?: string | null,"ordem"?: number | null
                         }
                        Update: {
                           "ativo"?: boolean | null,"categoria_id"?: number | null,"created_at"?: string | null,"empresa_id"?: number | null,"id"?: number | null,"nome"?: string | null,"ordem"?: number | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "subcategorias_produtos_categoria_id_fkey"
      columns: ["categoria_id"]
isOneToOne: false
      referencedRelation: "categorias_produtos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subcategorias_produtos_categoria_id_fkey"
      columns: ["categoria_id"]
isOneToOne: false
      referencedRelation: "estoque_categorias"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subcategorias_produtos_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subcategorias_produtos_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    }
                  ]
                },"tabela_precos": {
                  Row: {
                    "armazenamento": string | null,"ativo": boolean | null,"condicao": string | null,"created_at": string | null,"empresa_id": number | null,"id": number | null,"modelo": string | null,"observacoes": string | null,"preco_sugerido": number | null
                  }
                  ComputedFields: never
                  Insert: {
                           "armazenamento"?: string | null,"ativo"?: boolean | null,"condicao"?: string | null,"created_at"?: string | null,"empresa_id"?: number | null,"id"?: number | null,"modelo"?: string | null,"observacoes"?: string | null,"preco_sugerido"?: number | null
                         }
                        Update: {
                           "armazenamento"?: string | null,"ativo"?: boolean | null,"condicao"?: string | null,"created_at"?: string | null,"empresa_id"?: number | null,"id"?: number | null,"modelo"?: string | null,"observacoes"?: string | null,"preco_sugerido"?: number | null
                         }
                        Relationships: [
                    
                  ]
                },"taxas_pagamento": {
                  Row: {
                    "ativo": boolean | null,"bandeira": string | null,"created_at": string | null,"empresa_id": number | null,"forma_pagamento": string | null,"id": number | null,"parcelas": number | null,"percentual_taxa": number | null
                  }
                  ComputedFields: never
                  Insert: {
                           "ativo"?: boolean | null,"bandeira"?: string | null,"created_at"?: string | null,"empresa_id"?: number | null,"forma_pagamento"?: string | null,"id"?: number | null,"parcelas"?: number | null,"percentual_taxa"?: number | null
                         }
                        Update: {
                           "ativo"?: boolean | null,"bandeira"?: string | null,"created_at"?: string | null,"empresa_id"?: number | null,"forma_pagamento"?: string | null,"id"?: number | null,"parcelas"?: number | null,"percentual_taxa"?: number | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "taxas_pagamento_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "taxas_pagamento_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    }
                  ]
                },"tenant_payment_config": {
                  Row: {
                    "ativo": boolean | null,"atualizado_em": string | null,"credenciais_cipher": string | null,"empresa_id": number | null,"modo": string | null,"provider": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "ativo"?: boolean | null,"atualizado_em"?: string | null,"credenciais_cipher"?: string | null,"empresa_id"?: number | null,"modo"?: string | null,"provider"?: string | null
                         }
                        Update: {
                           "ativo"?: boolean | null,"atualizado_em"?: string | null,"credenciais_cipher"?: string | null,"empresa_id"?: number | null,"modo"?: string | null,"provider"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "tenant_payment_config_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: true
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tenant_payment_config_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: true
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    }
                  ]
                },"troca_cotacoes": {
                  Row: {
                    "armazenamento": string | null,"avarias": Json | null,"bonus": number | null,"checklist": Json | null,"cliente_id": number | null,"cliente_nome": string | null,"created_at": string | null,"descontos_total": number | null,"empresa_id": number | null,"filial_id": number | null,"id": number | null,"imei": string | null,"lead_id": number | null,"modelo": string | null,"na_troca": number | null,"numero": number | null,"observacoes": string | null,"status": string | null,"usada_em": string | null,"usuario_id": string | null,"valor_final": number | null,"venda_id": number | null
                  }
                  ComputedFields: never
                  Insert: {
                           "armazenamento"?: string | null,"avarias"?: Json | null,"bonus"?: number | null,"checklist"?: Json | null,"cliente_id"?: number | null,"cliente_nome"?: string | null,"created_at"?: string | null,"descontos_total"?: number | null,"empresa_id"?: number | null,"filial_id"?: number | null,"id"?: number | null,"imei"?: string | null,"lead_id"?: number | null,"modelo"?: string | null,"na_troca"?: number | null,"numero"?: number | null,"observacoes"?: string | null,"status"?: string | null,"usada_em"?: string | null,"usuario_id"?: string | null,"valor_final"?: number | null,"venda_id"?: number | null
                         }
                        Update: {
                           "armazenamento"?: string | null,"avarias"?: Json | null,"bonus"?: number | null,"checklist"?: Json | null,"cliente_id"?: number | null,"cliente_nome"?: string | null,"created_at"?: string | null,"descontos_total"?: number | null,"empresa_id"?: number | null,"filial_id"?: number | null,"id"?: number | null,"imei"?: string | null,"lead_id"?: number | null,"modelo"?: string | null,"na_troca"?: number | null,"numero"?: number | null,"observacoes"?: string | null,"status"?: string | null,"usada_em"?: string | null,"usuario_id"?: string | null,"valor_final"?: number | null,"venda_id"?: number | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "troca_cotacoes_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "troca_cotacoes_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "contatos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "troca_cotacoes_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "troca_cotacoes_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "troca_cotacoes_filial_id_fkey"
      columns: ["filial_id"]
isOneToOne: false
      referencedRelation: "filiais"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "troca_cotacoes_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "troca_cotacoes_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "negocios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "troca_cotacoes_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "troca_cotacoes_venda_id_fkey"
      columns: ["venda_id"]
isOneToOne: false
      referencedRelation: "vendas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "troca_cotacoes_venda_id_fkey"
      columns: ["venda_id"]
isOneToOne: false
      referencedRelation: "vendas_vendas"
      referencedColumns: ["id"]
    }
                  ]
                },"troca_precos": {
                  Row: {
                    "armazenamento": string | null,"ativo": boolean | null,"atualizado_em": string | null,"descontos": Json | null,"empresa_id": number | null,"id": number | null,"modelo": string | null,"na_troca": number | null
                  }
                  ComputedFields: never
                  Insert: {
                           "armazenamento"?: string | null,"ativo"?: boolean | null,"atualizado_em"?: string | null,"descontos"?: Json | null,"empresa_id"?: number | null,"id"?: number | null,"modelo"?: string | null,"na_troca"?: number | null
                         }
                        Update: {
                           "armazenamento"?: string | null,"ativo"?: boolean | null,"atualizado_em"?: string | null,"descontos"?: Json | null,"empresa_id"?: number | null,"id"?: number | null,"modelo"?: string | null,"na_troca"?: number | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "troca_precos_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "troca_precos_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    }
                  ]
                },"troca_regras": {
                  Row: {
                    "atualizado_em": string | null,"bonus_seminovo": number | null,"corte_bateria": number | null,"empresa_id": number | null,"observacoes": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "atualizado_em"?: string | null,"bonus_seminovo"?: number | null,"corte_bateria"?: number | null,"empresa_id"?: number | null,"observacoes"?: string | null
                         }
                        Update: {
                           "atualizado_em"?: string | null,"bonus_seminovo"?: number | null,"corte_bateria"?: number | null,"empresa_id"?: number | null,"observacoes"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "troca_regras_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: true
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "troca_regras_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: true
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    }
                  ]
                },"v_empresas_plano": {
                  Row: {
                    "id": number | null,"nome": string | null,"plano": string | null,"status": string | null,"stripe_customer_id": string | null,"stripe_price_id": string | null,"stripe_status": string | null,"stripe_subscription_id": string | null,"trial_ends_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "id"?: number | null,"nome"?: string | null,"plano"?: string | null,"status"?: string | null,"stripe_customer_id"?: string | null,"stripe_price_id"?: string | null,"stripe_status"?: string | null,"stripe_subscription_id"?: string | null,"trial_ends_at"?: string | null
                         }
                        Update: {
                           "id"?: number | null,"nome"?: string | null,"plano"?: string | null,"status"?: string | null,"stripe_customer_id"?: string | null,"stripe_price_id"?: string | null,"stripe_status"?: string | null,"stripe_subscription_id"?: string | null,"trial_ends_at"?: string | null
                         }
                        Relationships: [
                    
                  ]
                },"v_leads_nao_lidas": {
                  Row: {
                    "empresa_id": number | null,"lead_id": number | null,"nao_lidas": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"veiculo_dados": {
                  Row: {
                    "ano": number | null,"chassi": string | null,"created_at": string | null,"empresa_id": number | null,"km": number | null,"placa": string | null,"renavam": string | null,"unidade_id": number | null
                  }
                  ComputedFields: never
                  Insert: {
                           "ano"?: number | null,"chassi"?: string | null,"created_at"?: string | null,"empresa_id"?: number | null,"km"?: number | null,"placa"?: string | null,"renavam"?: string | null,"unidade_id"?: number | null
                         }
                        Update: {
                           "ano"?: number | null,"chassi"?: string | null,"created_at"?: string | null,"empresa_id"?: number | null,"km"?: number | null,"placa"?: string | null,"renavam"?: string | null,"unidade_id"?: number | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "veiculo_dados_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "veiculo_dados_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "veiculo_dados_unidade_id_fkey"
      columns: ["unidade_id"]
isOneToOne: true
      referencedRelation: "estoque_unidades"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "veiculo_dados_unidade_id_fkey"
      columns: ["unidade_id"]
isOneToOne: true
      referencedRelation: "inventario_unidades"
      referencedColumns: ["id"]
    }
                  ]
                },"vendas": {
                  Row: {
                    "canal_venda": string | null,"cliente_id": number | null,"comanda": string | null,"comissao": number | null,"created_at": string | null,"data_venda": string | null,"desconto_aprovado_por": string | null,"desconto_motivo": string | null,"desconto_valor": number | null,"empresa_id": number | null,"filial_id": number | null,"forma_pagamento": string | null,"grupo_pdv": string | null,"id": number | null,"lucro": number | null,"numero_serie": string | null,"observacoes": string | null,"parcelas": number | null,"pedido_compra_id": number | null,"previsao_entrega": string | null,"produto_id": number | null,"quantidade": number | null,"status": string | null,"unidade_id": number | null,"usuario_id": string | null,"valor_custo": number | null,"valor_venda": number | null,"vendedor_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "canal_venda"?: string | null,"cliente_id"?: number | null,"comanda"?: string | null,"comissao"?: number | null,"created_at"?: string | null,"data_venda"?: string | null,"desconto_aprovado_por"?: string | null,"desconto_motivo"?: string | null,"desconto_valor"?: number | null,"empresa_id"?: number | null,"filial_id"?: number | null,"forma_pagamento"?: string | null,"grupo_pdv"?: string | null,"id"?: number | null,"lucro"?: number | null,"numero_serie"?: string | null,"observacoes"?: string | null,"parcelas"?: number | null,"pedido_compra_id"?: number | null,"previsao_entrega"?: string | null,"produto_id"?: number | null,"quantidade"?: number | null,"status"?: string | null,"unidade_id"?: number | null,"usuario_id"?: string | null,"valor_custo"?: number | null,"valor_venda"?: number | null,"vendedor_id"?: string | null
                         }
                        Update: {
                           "canal_venda"?: string | null,"cliente_id"?: number | null,"comanda"?: string | null,"comissao"?: number | null,"created_at"?: string | null,"data_venda"?: string | null,"desconto_aprovado_por"?: string | null,"desconto_motivo"?: string | null,"desconto_valor"?: number | null,"empresa_id"?: number | null,"filial_id"?: number | null,"forma_pagamento"?: string | null,"grupo_pdv"?: string | null,"id"?: number | null,"lucro"?: number | null,"numero_serie"?: string | null,"observacoes"?: string | null,"parcelas"?: number | null,"pedido_compra_id"?: number | null,"previsao_entrega"?: string | null,"produto_id"?: number | null,"quantidade"?: number | null,"status"?: string | null,"unidade_id"?: number | null,"usuario_id"?: string | null,"valor_custo"?: number | null,"valor_venda"?: number | null,"vendedor_id"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "vendas_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vendas_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "contatos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vendas_desconto_aprovado_por_fkey"
      columns: ["desconto_aprovado_por"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vendas_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vendas_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "v_empresas_plano"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vendas_filial_id_fkey"
      columns: ["filial_id"]
isOneToOne: false
      referencedRelation: "filiais"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vendas_pedido_compra_id_fkey"
      columns: ["pedido_compra_id"]
isOneToOne: false
      referencedRelation: "pedidos_compra"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vendas_pedido_compra_id_fkey"
      columns: ["pedido_compra_id"]
isOneToOne: false
      referencedRelation: "vendas_pedidos_compra"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vendas_produto_id_fkey"
      columns: ["produto_id"]
isOneToOne: false
      referencedRelation: "estoque_produtos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vendas_produto_id_fkey"
      columns: ["produto_id"]
isOneToOne: false
      referencedRelation: "produtos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vendas_unidade_id_fkey"
      columns: ["unidade_id"]
isOneToOne: false
      referencedRelation: "estoque_unidades"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vendas_unidade_id_fkey"
      columns: ["unidade_id"]
isOneToOne: false
      referencedRelation: "inventario_unidades"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vendas_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vendas_vendedor_id_fkey"
      columns: ["vendedor_id"]
isOneToOne: false
      referencedRelation: "usuarios"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "assistente_status_conversas":
{ Args: { "p_empresa": number }; Returns: {
              "lead_id": number,"mensagens": number,"ultima_enviada": string,"ultima_recebida": string
            }[]
                           },
"buscar_lead_por_numero":
{ Args: { "p_id": number }; Returns: {
              "id": number,"loja": string,"nome": string,"outra_loja": boolean,"produto_interessado": string,"telefone": string
            }[]
                           },
"chat_marcar_lido":
{ Args: { "p_conversa": string }; Returns: undefined
                           },
"chat_nao_lidas_por_conversa":
{ Args: Record<PropertyKey, never>; Returns: {
              "conversa": string,"nao_lidas": number
            }[]
                           },
"compat_etapa":
{ Args: { "p_empresa": number,"p_funil": number,"p_slug": string }; Returns: Record<string, unknown>
                           },
"compat_guarda":
{ Args: { "p_empresa": number }; Returns: undefined
                           },
"core_contato_match":
{ Args: { "p_contato": number }; Returns: {
              "item_id": number,"modulo": string,"score": number
            }[]
                           },
"core_contato_vinculos":
{ Args: { "p_contato": number }; Returns: {
              "dados": Json,"em": string,"origem": string,"ref_id": number,"status": string,"tipo": string,"titulo": string
            }[]
                           },
"core_evento_emitir":
{ Args: { "p_dados"?: Json,"p_empresa": number,"p_entidade"?: string,"p_entidade_id"?: number,"p_tipo": string }; Returns: number
                           },
"core_fundir_contatos":
{ Args: { "p_empresa": number,"p_principal": number,"p_removido": number }; Returns: Json
                           },
"core_indicadores":
{ Args: { "p_empresa": number,"p_fim": string,"p_inicio": string,"p_modulo"?: string }; Returns: {
              "chave": string,"modulo": string,"registros": number,"valor": number
            }[]
                           },
"core_modulo_config":
{ Args: { "p_empresa"?: number,"p_modulo": string }; Returns: Json
                           },
"core_modulo_ligado":
{ Args: { "p_empresa": number,"p_modulo": string }; Returns: boolean
                           },
"core_negocio_do_canal":
{ Args: { "p_contato": number,"p_empresa": number,"p_filial": number,"p_primeira_msg"?: string,"p_so_existente"?: boolean }; Returns: number
                           },
"core_registro_resumo":
{ Args: { "p_empresa"?: number,"p_modulo": string,"p_registro_id": number }; Returns: Json
                           },
"core_sessao_contexto":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"core_telefone_e164":
{ Args: { "p_telefone": string }; Returns: string
                           },
"encerrar_impersonacao":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"filiais_visiveis":
{ Args: Record<PropertyKey, never>; Returns: (number)[]
                           },
"filial_atual":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"filial_gravacao":
{ Args: { "p_empresa": number }; Returns: number
                           },
"fundir_clientes":
{ Args: { "p_empresa": number,"p_principal": number,"p_secundario": number }; Returns: Json
                           },
"get_empresa_id":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"hard_delete_empresa":
{ Args: { "p_empresa_id": number }; Returns: undefined
                           },
"incrementar_msgs_nao_lidas":
{ Args: { "lead_id_param": number }; Returns: undefined
                           },
"is_empresa_admin":
{ Args: { "emp": number }; Returns: boolean
                           },
"is_super_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"mensagem_registrar":
{ Args: { "p_canal_id": number,"p_dados": Json,"p_empresa": number,"p_external_id": string }; Returns: number
                           },
"negocio_atribuir":
{ Args: { "p_acao": string,"p_negocio": number,"p_por"?: string,"p_responsavel": string }; Returns: undefined
                           },
"rate_limit_bump":
{ Args: { "p_chave": string,"p_janela": string }; Returns: number
                           },
"refresh_status_atrasados":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"set_impersonation":
{ Args: { "p_empresa_id": number,"p_ttl_seconds"?: number }; Returns: undefined
                           },
"set_super_admin":
{ Args: { "p_target": string,"p_value": boolean }; Returns: undefined
                           },
"webhook_reenvio":
{ Args: { "p_conta": string,"p_gravar": boolean,"p_hash": string,"p_tamanho": number }; Returns: boolean
                           },
"webhook_reenvio_esquecer":
{ Args: { "p_hash": string }; Returns: undefined
                           },
"zapintel_analises_pendentes":
{ Args: { "p_empresa": number,"p_versao": string }; Returns: {
              "filial": string,"gerado_em": string,"lead_id": number,"loja_deve": boolean,"mensagens_agora": number,"mensagens_na_ficha": number,"nome": string,"tem_ficha": boolean,"ultima": string
            }[]
                           },
"zapintel_atendimento":
{ Args: { "p_dias"?: number,"p_empresa"?: number,"p_filial"?: number }; Returns: Json
                           },
"zapintel_avisar":
{ Args: { "p_dados": Json,"p_empresa": number,"p_evento": string }; Returns: undefined
                           },
"zapintel_conversa":
{ Args: { "p_dias"?: number,"p_empresa"?: number,"p_filial"?: number,"p_recalcular"?: boolean }; Returns: Json
                           },
"zapintel_conversa_aquecer":
{ Args: { "p_empresa": number }; Returns: number
                           },
"zapintel_conversa_calc":
{ Args: { "p_dias": number,"p_emp": number,"p_lojas": (number)[] }; Returns: Json
                           },
"zapintel_conversa_chave":
{ Args: { "p_dias": number,"p_lojas": (number)[] }; Returns: string
                           },
"zapintel_dashboard":
{ Args: { "p_empresa"?: number,"p_filial"?: number,"p_versao"?: string }; Returns: Json
                           },
"zapintel_dashboard_lista":
{ Args: { "p_empresa"?: number,"p_filial"?: number,"p_tipo": string,"p_valor"?: string,"p_versao"?: string }; Returns: Json
                           },
"zapintel_escopo":
{ Args: { "p_empresa"?: number,"p_filial"?: number }; Returns: {
              "empresa": number,"filiais": (number)[]
            }[]
                           },
"zapintel_familia_objecao":
{ Args: { "r": string }; Returns: string
                           },
"zapintel_familia_sinal":
{ Args: { "r": string }; Returns: string
                           },
"zapintel_funil_interno":
{ Args: { "p_funil": number }; Returns: boolean
                           },
"zapintel_horario":
{ Args: { "p_emp": number }; Returns: Json
                           },
"zapintel_insights":
{ Args: { "p_dias"?: number,"p_empresa"?: number,"p_filial"?: number }; Returns: Json
                           },
"zapintel_leads_com_conversa":
{ Args: { "p_empresa": number }; Returns: {
              "id": number,"mensagens": number,"origem_id": string,"primeira": string,"telefone": string,"telefone_no_texto": string,"ultima": string
            }[]
                           },
"zapintel_leads_lista":
{ Args: { "p_empresa"?: number,"p_filial"?: number,"p_filtros"?: Json,"p_ordem"?: string,"p_pagina"?: number,"p_por_pagina"?: number,"p_versao"?: string }; Returns: Json
                           },
"zapintel_posvenda":
{ Args: { "p_empresa"?: number,"p_filial"?: number }; Returns: Json
                           },
"zapintel_resumo":
{ Args: { "p_empresa"?: number }; Returns: Json
                           },
"zapintel_turnos":
{ Args: { "p_desde": string,"p_emp": number,"p_lojas": (number)[] }; Returns: {
              "aberto": boolean,"chegou": string,"dow": number,"espera": number,"filial_id": number,"hora": number,"lead_id": number
            }[]
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

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const
