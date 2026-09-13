import { POSICOES_CLIENTE } from "@models/prevencao.model";
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

const TEXTO_CURTO = 200;

export class AnalisarPrevencaoDto {
  @IsString()
  @IsNotEmpty({ message: "contratoId é obrigatório." })
  @MaxLength(TEXTO_CURTO, { message: "contratoId deve ter no máximo 200 caracteres." })
  contratoId: string;

  @IsString()
  @IsIn([...POSICOES_CLIENTE], {
    message: "posicaoCliente deve ser consumidor ou instituicao_financeira.",
  })
  posicaoCliente: (typeof POSICOES_CLIENTE)[number];

  /** Desambigua ids repetidos no acervo (ex.: ctr-capa em vários casos). */
  @IsOptional()
  @IsString()
  @MaxLength(TEXTO_CURTO, { message: "casoId deve ter no máximo 200 caracteres." })
  casoId?: string;
}

export class ListarPrevencaoQueryDto {
  @IsString()
  @IsNotEmpty({ message: "casoId é obrigatório." })
  @MaxLength(TEXTO_CURTO, { message: "casoId deve ter no máximo 200 caracteres." })
  casoId: string;
}
