import { Public } from "@common/decorators/public.decorator";
import { Body, Controller, Post } from "@nestjs/common";
import { AbrirDataJudDto, BuscarDataJudDto } from "./datajud.dto";
import { DataJudService } from "./datajud.service";

/**
 * Internal trusted-zone office API. Not an MCP egress surface.
 * Live DataJud metadata or an honest local replay. Never fabricate hits.
 */
@Controller("datajud")
export class DataJudController {
  constructor(private readonly dataJudService: DataJudService) {}

  @Public()
  @Post("abrir")
  async abrir(@Body() dto: AbrirDataJudDto) {
    const caso = await this.dataJudService.abrir(dto.numeroProcesso, dto.tribunal);
    const origem =
      caso.jurimetria.honestidade?.live === "datajud_captura"
        ? {
            live: false as const,
            fonte: "datajud_captura" as const,
            rotulo: "captura oficial (replay)" as const,
          }
        : {
            live: true as const,
            fonte: "datajud" as const,
            rotulo: "metadados DataJud ao vivo" as const,
          };

    return {
      zone: "internal" as const,
      ...origem,
      caso,
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
      live: resultado.aoVivo,
      fonte: resultado.fonte,
      rotulo: resultado.rotulo,
      tribunal: resultado.tribunal,
      hits: resultado.hits,
    };
  }
}
