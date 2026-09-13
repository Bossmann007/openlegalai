import { PosicaoCliente } from "@models/prevencao.model";

export function medidasPreProcessuais(posicao: PosicaoCliente): string[] {
  switch (posicao) {
    case "consumidor":
      return [
        "Notificar extrajudicialmente pedindo o histórico da operação e a planilha de evolução do débito.",
        "Pedir o cancelamento administrativo do seguro ou produto sem contratação destacada.",
        "Reunir cédula, termos de adesão e comprovantes antes de ajuizar.",
        "Separar teses (tarifa de cadastro versus seguro prestamista) na eventual peça inicial.",
        "Tratar CDC e venda casada como fundamento pré-processual, não como sentença antecipada.",
      ];
    case "instituicao_financeira":
      return [
        "Conferir pactuação expressa e prova do serviço cobrado a título de tarifa.",
        "Separar a defesa da tarifa da defesa do seguro prestamista.",
        "Preparar resposta padronizada à notificação extrajudicial.",
        "Documentar adesão do contratante sem copiar dados pessoais na peça.",
        "Antecipar distinção de câmaras divergentes sem tratar o dissídio como precedente vinculante.",
      ];
    default: {
      const nunca: never = posicao;
      return nunca;
    }
  }
}
