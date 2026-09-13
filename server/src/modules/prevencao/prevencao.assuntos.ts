import { Contrato } from "@models/contrato.model";
import { Caso } from "@models/caso.model";

const ASSUNTOS_BANCARIOS = [
  "Contratos bancários",
  "Revisão de contrato",
  "Tarifa de cadastro",
  "Seguro prestamista",
] as const;

const MARCAS_BANCARIAS =
  /tarifa|cadastro|prestamista|banc[aá]r|financiamento|aliena[cç][aã]o|consignad|contrato|seguro|c[eé]dula|cr[eé]dito|ve[ií]culo/i;

/**
 * Vocabulário controlado para cruzar o contrato com a fixture de juris.
 * Não é busca livre no tribunal.
 */
export function assuntosDoContrato(
  contrato: Contrato,
  caso?: Pick<Caso, "tema" | "subtema" | "tese">
): string[] {
  const bruto = [contrato.titulo, contrato.resumo, caso?.tema, caso?.subtema, caso?.tese]
    .filter(Boolean)
    .join(" ");

  const assuntos = new Set<string>();

  if (caso?.tema) {
    assuntos.add(caso.tema);
  }
  if (caso?.subtema) {
    assuntos.add(caso.subtema);
  }

  if (MARCAS_BANCARIAS.test(bruto) || assuntos.size === 0) {
    for (const assunto of ASSUNTOS_BANCARIOS) {
      assuntos.add(assunto);
    }
  }

  return [...assuntos];
}
