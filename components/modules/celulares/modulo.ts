/**
 * O MÓDULO "CELULARES E APARELHOS" (chave `celulares` em core/modulos.ts).
 *
 * Tudo o que é de loja de celular — IMEI, bateria, armazenamento, número de modelo
 * Apple, seminovo, aparelho na troca — mora nesta pasta e só aparece com o módulo
 * ligado. O Estoque, o PDV e os Orçamentos do core são genéricos e perguntam
 * "o módulo está ligado?" antes de mostrar qualquer coisa daqui.
 *
 * O endereço que liga o módulo é o mesmo da ferramenta Check IMEI. Fica num arquivo
 * sem 'use client' para o servidor também poder ler (`ligadosDaEmpresa(cfg).has(...)`).
 */
export const HREF_CELULARES = '/check-imei'
