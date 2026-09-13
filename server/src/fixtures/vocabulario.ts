/**
 * Vocabulário controlado de assuntos.
 *
 * Assunto processual não é texto livre: no mundo real vem das Tabelas
 * Processuais Unificadas do CNJ, com código. Por isso um assunto catalogado
 * pode atravessar o gateway — ele identifica uma categoria pública, não o caso.
 * O que não está catalogado vira balde, porque texto livre não controlado é
 * exatamente por onde informação do cliente escaparia.
 */
export const ASSUNTOS_CATALOGADOS = new Set([
  "Contratos bancários",
  "Revisão de contrato",
  "Tarifa de cadastro",
  "Seguro prestamista",
  "Juros remuneratórios",
  "Capitalização de juros",
]);

export const ASSUNTO_NAO_CATALOGADO = "assunto não catalogado";

export function chaveAssunto(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const SINONIMOS_PARA_CATALOGO: Record<string, readonly string[]> = {
  "alienacao fiduciaria": ["Contratos bancários"],
  "busca e apreensao": ["Contratos bancários"],
  "financiamento de veiculo": ["Contratos bancários"],
  "arrendamento mercantil": ["Contratos bancários"],
  "cedula de credito bancario": ["Contratos bancários"],
  "contrato bancario": ["Contratos bancários"],
  "tarifas bancarias": ["Tarifa de cadastro"],
  "tarifas": ["Tarifa de cadastro"],
  "tarifa": ["Tarifa de cadastro"],
  "venda casada": ["Seguro prestamista", "Contratos bancários"],
};

const CATALOGO_POR_CHAVE = new Map(
  [...ASSUNTOS_CATALOGADOS].map((item) => [chaveAssunto(item), item])
);

export function expandirAssuntosRelacionados(assuntos: string[]): string[] {
  const saida = new Set<string>();

  for (const assunto of assuntos || []) {
    const chave = chaveAssunto(assunto);
    if (!chave) {
      continue;
    }

    const catalogado = CATALOGO_POR_CHAVE.get(chave);
    if (catalogado) {
      saida.add(catalogado);
    }

    const sinonimos = SINONIMOS_PARA_CATALOGO[chave];
    if (!sinonimos) {
      continue;
    }
    for (const item of sinonimos) {
      saida.add(item);
    }
  }

  return [...saida];
}

export function normalizarAssuntos(assuntos: string[]): string[] {
  const saida = new Set<string>();

  for (const assunto of assuntos || []) {
    saida.add(
      ASSUNTOS_CATALOGADOS.has(assunto) ? assunto : ASSUNTO_NAO_CATALOGADO
    );
  }

  return [...saida];
}
