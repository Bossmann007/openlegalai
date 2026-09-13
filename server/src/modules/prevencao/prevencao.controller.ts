import { Public } from "@common/decorators/public.decorator";
import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import {
  AnalisarPrevencaoDto,
  ListarPrevencaoQueryDto,
} from "./prevencao.dto";
import { PrevencaoService } from "./prevencao.service";

/**
 * Internal trusted-zone office API. Not an MCP egress surface.
 * Preventive contract analysis stays on fixtures. Do not scrape tribunals.
 */
@Controller("prevencao")
export class PrevencaoController {
  constructor(private readonly prevencaoService: PrevencaoService) {}

  @Public()
  @Post("analisar")
  async analisar(@Body() dto: AnalisarPrevencaoDto) {
    return {
      zone: "internal" as const,
      relatorio: await this.prevencaoService.analisar(
        dto.contratoId,
        dto.posicaoCliente,
        dto.casoId
      ),
    };
  }

  @Public()
  @Get()
  listar(@Query() query: ListarPrevencaoQueryDto) {
    return {
      zone: "internal" as const,
      relatorios: this.prevencaoService.listar(query.casoId),
    };
  }
}
