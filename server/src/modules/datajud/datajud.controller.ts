import { Public } from "@common/decorators/public.decorator";
import { Body, Controller, Post } from "@nestjs/common";
import { AbrirDataJudDto, BuscarDataJudDto } from "./datajud.dto";
import { DataJudService } from "./datajud.service";

/**
 * Internal trusted-zone office API. Not an MCP egress surface.
 * Live DataJud metadata only. Never fabricate hits when the CNJ API fails.
 */
@Controller("datajud")
export class DataJudController {
  constructor(private readonly dataJudService: DataJudService) {}

  @Public()
  @Post("abrir")
  async abrir(@Body() dto: AbrirDataJudDto) {
    return {
      zone: "internal" as const,
      live: true,
      fonte: "datajud" as const,
      rotulo: "metadados DataJud ao vivo",
      caso: await this.dataJudService.abrir(dto.numeroProcesso, dto.tribunal),
    };
  }

  @Public()
  @Post("buscar")
  async buscar(@Body() dto: BuscarDataJudDto) {
    const resultado = await this.dataJudService.buscar({
      query: dto.query,
      assunto: dto.assunto,
      classe: dto.classe,
      tribunal: dto.tribunal,
    });

    return {
      zone: "internal" as const,
      live: true,
      fonte: "datajud" as const,
      rotulo: "metadados DataJud ao vivo",
      ...resultado,
    };
  }
}
