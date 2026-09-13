import { HttpException, HttpStatus } from "@nestjs/common";
import { DataJudErroKind } from "./datajud.types";

export class DataJudException extends HttpException {
  readonly kind: DataJudErroKind;

  constructor(kind: DataJudErroKind, mensagem: string, status: HttpStatus) {
    super({ erro: mensagem, message: mensagem, fonte: "datajud", kind }, status);
    this.kind = kind;
  }
}

export function erroSemChave(): DataJudException {
  return new DataJudException(
    "sem_chave",
    "DataJud sem chave. Defina DATAJUD_API_KEY com a chave pública da wiki do CNJ (api-publica/acesso). Sem isso não há busca ao vivo.",
    HttpStatus.SERVICE_UNAVAILABLE
  );
}

export function erroChaveRecusada(): DataJudException {
  return new DataJudException(
    "chave_recusada",
    "DataJud recusou a chave (Authorization: APIKey). Confira DATAJUD_API_KEY na wiki do CNJ.",
    HttpStatus.BAD_GATEWAY
  );
}

export function erroTribunal(alias: string): DataJudException {
  return new DataJudException(
    "tribunal",
    `Tribunal sem índice público DataJud (alias '${alias}'). Use tjpr ou outro alias oficial.`,
    HttpStatus.BAD_REQUEST
  );
}

export function erroRede(detalhe: string): DataJudException {
  return new DataJudException(
    "rede",
    `DataJud inacessível (rede). ${detalhe}`,
    HttpStatus.BAD_GATEWAY
  );
}

export function erroVazio(numero: string, tribunal: string): DataJudException {
  return new DataJudException(
    "vazio",
    `Processo ${numero} não encontrado no DataJud (${tribunal.toUpperCase()}). Nada foi inventado.`,
    HttpStatus.NOT_FOUND
  );
}

export function erroInvalido(mensagem: string): DataJudException {
  return new DataJudException("invalido", mensagem, HttpStatus.BAD_REQUEST);
}
