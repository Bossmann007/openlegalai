import { CasosModule } from "@modules/casos/casos.module";
import { DissidioModule } from "@modules/dissidio/dissidio.module";
import { JurisprudenceModule } from "@modules/jurisprudence/jurisprudence.module";
import { ProcessModule } from "@modules/process/process.module";
import { Module } from "@nestjs/common";
import { DataJudClient } from "./datajud.client";
import { DataJudController } from "./datajud.controller";
import { DataJudService } from "./datajud.service";

@Module({
  imports: [CasosModule, ProcessModule, JurisprudenceModule, DissidioModule],
  controllers: [DataJudController],
  providers: [DataJudClient, DataJudService],
  exports: [DataJudService],
})
export class DataJudModule {}
