type CnpjData = {
  razao_social: string
  situacao_cadastral: number
  descricao_situacao_cadastral: string
}

export async function consultarCnpj(cnpj: string): Promise<CnpjData> {
  const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`)

  if (!response.ok) {
    throw new Error('CNPJ invalido ou nao encontrado')
  }

  const data = await response.json() as CnpjData
  return data
}

export function cnpjAtivo(situacao: number): boolean {
  return situacao === 2
}