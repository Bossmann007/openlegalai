import { CasosModule } from "@modules/casos/casos.module";
import { ContractsModule } from "@modules/contracts/contracts.module";
import { DissidioModule } from "@modules/dissidio/dissidio.module";
import { JurisprudenceModule } from "@modules/jurisprudence/jurisprudence.module";
import { ProcessModule } from "@modules/process/process.module";
import { Module } from "@nestjs/common";
import { PrevencaoController } from "./prevencao.controller";
import { PrevencaoService } from "./prevencao.service";

@Module({
  imports: [
    ContractsModule,
    CasosModule,
    ProcessModule,
    JurisprudenceModule,
    DissidioModule,
  ],
  controllers: [PrevencaoController],
  providers: [PrevencaoService],
  exports: [PrevencaoService],
})
export class PrevencaoModule {}
