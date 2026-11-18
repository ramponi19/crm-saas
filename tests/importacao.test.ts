/**
 * Importação de contatos e leads por planilha (18/11/2026): leitor de CSV/XLSX e regras da importação.
 *
 *   npm test
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { lerPlanilha, lerCsv } from '@/lib/planilha'
import { adivinharMapa, validarLinhas, lerValor, csvDasRecusadas } from '@/lib/importacao'
import { criarZip } from '@/lib/zip'

function xlsx(linhas: (string | number)[][]): Buffer {
  const strings: string[] = []
  const idx = (s: string) => { let i = strings.indexOf(s); if (i < 0) { strings.push(s); i = strings.length - 1 } return i }
  const col = (i: number) => String.fromCharCode(65 + i)
  const rows = linhas.map((l, r) => `<row r="${r + 1}">${l.map((v, c) => typeof v === 'number'
    ? `<c r="${col(c)}${r + 1}"><v>${v}</v></c>`
    : `<c r="${col(c)}${r + 1}" t="s"><v>${idx(v)}</v></c>`).join('')}</row>`).join('')
  return criarZip([
    { nome: 'xl/workbook.xml', conteudo: '<workbook><sheets><sheet name="Contatos" sheetId="1" r:id="rId1"/></sheets></workbook>' },
    { nome: 'xl/_rels/workbook.xml.rels', conteudo: '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>' },
    { nome: 'xl/sharedStrings.xml', conteudo: `<sst>${strings.map((s) => `<si><t>${s.replace(/&/g, '&amp;')}</t></si>`).join('')}</sst>` },
    { nome: 'xl/worksheets/sheet1.xml', conteudo: `<worksheet><sheetData>${rows}</sheetData></worksheet>` },
  ])
}

describe('leitor de planilha', () => {
  test('CSV com ; (Excel pt-BR), aspas e BOM', () => {
    const p = lerPlanilha(Buffer.from('﻿Nome;Celular;Obs\r\nAna;(11) 98888-7777;"diz ""oi""; volta"\r\n\r\nBia;11977776666;\r\n'), 'a.csv')
    assert.deepEqual(p.colunas, ['Nome', 'Celular', 'Obs'])
    assert.deepEqual(p.linhas, [['Ana', '(11) 98888-7777', 'diz "oi"; volta'], ['Bia', '11977776666', '']])
  })
  test('CSV com vírgula e em Windows-1252', () => {
    const buf = Buffer.from([...Buffer.from('Nome,Telefone\nJo'), 0xe3, ...Buffer.from('o,11966665555\n')])
    assert.deepEqual(lerPlanilha(buf, 'b.csv').linhas, [['João', '11966665555']])
    assert.deepEqual(lerCsv('a,b\n1,2'), [['a', 'b'], ['1', '2']])
  })
  test('XLSX: textos compartilhados, número grande vira inteiro, colunas vazias no meio', () => {
    const buf = xlsx([['Nome', 'WhatsApp', 'Valor'], ['Carlos & Cia', 5511955554444, 1500.5], ['Dani', '11944443333', '']])
    const p = lerPlanilha(buf, 'c.xlsx')
    assert.deepEqual(p.colunas, ['Nome', 'WhatsApp', 'Valor'])
    assert.deepEqual(p.linhas, [['Carlos & Cia', '5511955554444', '1500.5'], ['Dani', '11944443333', '']])
  })
  test('notação científica do Excel vira o número inteiro', () => {
    const buf = criarZip([{ nome: 'xl/worksheets/sheet1.xml', conteudo: '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="2"><c r="A2"><v>1.1999998888E10</v></c></row></sheetData></worksheet>' },
      { nome: 'xl/sharedStrings.xml', conteudo: '<sst><si><t>Tel</t></si></sst>' }])
    assert.deepEqual(lerPlanilha(buf, 'd.xlsx').linhas, [['11999998888']])
  })
  test('planilha vazia e .xls recusados', () => {
    assert.throws(() => lerPlanilha(Buffer.from('\n\n'), 'v.csv'), /vazia/)
    assert.throws(() => lerPlanilha(Buffer.from('x'), 'v.xls'), /97-2003/)
  })
})

describe('regras da importação', () => {
  test('palpite do mapeamento pelo cabeçalho', () => {
    assert.deepEqual(adivinharMapa(['Nome do cliente', 'Celular/WhatsApp', 'E-mail', 'Modelo de interesse', 'Valor', 'Observações']),
      { nome: 0, telefone: 1, email: 2, interesse: 3, valor: 4, observacoes: 5 })
    assert.deepEqual(adivinharMapa(['Coluna A', 'Fone']), { telefone: 1 })
  })
  test('valor em reais', () => {
    assert.equal(lerValor('R$ 1.234,56'), 1234.56)
    assert.equal(lerValor('50.000'), 50000)
    assert.equal(lerValor('1500.5'), 1500.5)
    assert.equal(lerValor(''), null)
    assert.ok(Number.isNaN(lerValor('mil')))
  })
  test('validação: telefone obrigatório e válido, repetido na planilha, e-mail e valor; nome cai no telefone', () => {
    const linhas = [
      ['Ana', '(11) 98888-7777', 'ana@x.com', '1.000'],
      ['', '11977776666', '', ''],
      ['Repetida', '+55 11 98888-7777', '', ''],
      ['Sem fone', '', '', ''],
      ['Fone ruim', '123', '', ''],
      ['Email ruim', '11966665555', 'ana@', ''],
      ['Valor ruim', '11955554444', '', 'muito'],
    ]
    const { validas, recusadas } = validarLinhas(linhas, { nome: 0, telefone: 1, email: 2, valor: 3 })
    assert.deepEqual(validas.map((v) => [v.linha, v.nome, v.telefone, v.e164, v.email, v.valor]), [
      [2, 'Ana', '(11) 98888-7777', '+5511988887777', 'ana@x.com', 1000],
      [3, '(11) 97777-6666', '(11) 97777-6666', '+5511977776666', null, null],
    ])
    assert.deepEqual(recusadas.map((r) => [r.linha, r.motivo.split(' (')[0]]), [
      [4, 'telefone repetido na planilha'], [5, 'sem telefone'], [6, 'telefone inválido'], [7, 'e-mail inválido'], [8, 'valor inválido'],
    ])
  })
  test('relatório das recusadas em CSV com a linha original', () => {
    const csv = csvDasRecusadas([{ linha: 3, motivo: 'sem telefone' }], ['Nome', 'Tel'], [['A', '1'], ['B; C', '']])
    assert.equal(csv, '﻿linha;motivo;Nome;Tel\r\n3;sem telefone;"B; C";')
  })
})
