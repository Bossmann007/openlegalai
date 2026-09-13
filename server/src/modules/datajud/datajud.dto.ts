import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { DATAJUD_LIMITE } from "./datajud.limites";

export class AbrirDataJudDto {
  @IsString()
  @MinLength(DATAJUD_LIMITE.cnjMin, { message: "Informe o número CNJ do processo." })
  @MaxLength(DATAJUD_LIMITE.cnjMax)
  numeroProcesso: string;

  @IsOptional()
  @IsString()
  @MaxLength(DATAJUD_LIMITE.tribunal)
  tribunal?: string;
}

export class BuscarDataJudDto {
  @IsOptional()
  @IsString()
  @MaxLength(DATAJUD_LIMITE.busca)
  query?: string;

  @IsOptional()
  @IsString()
  @MaxLength(DATAJUD_LIMITE.busca)
  assunto?: string;

  @IsOptional()
  @IsString()
  @MaxLength(DATAJUD_LIMITE.busca)
  classe?: string;

  @IsOptional()
  @IsString()
  @MaxLength(DATAJUD_LIMITE.tribunal)
  tribunal?: string;
}
