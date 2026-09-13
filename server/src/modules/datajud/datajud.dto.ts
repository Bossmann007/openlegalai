import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class AbrirDataJudDto {
  @IsString()
  @MinLength(15, { message: "Informe o número CNJ do processo." })
  @MaxLength(40)
  numeroProcesso: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  tribunal?: string;
}

export class BuscarDataJudDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  query?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  assunto?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  classe?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  tribunal?: string;
}
