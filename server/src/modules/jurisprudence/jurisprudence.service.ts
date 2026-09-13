import { JurisprudenciaFixture } from "@models/jurisprudencia.model";
import { JURISPRUDENCIAS_BANCARIAS } from "../../fixtures/jurisprudencias";
import { expandirAssuntosRelacionados } from "../../fixtures/vocabulario";
import { Injectable } from "@nestjs/common";

@Injectable()
export class JurisprudenceService {
  buscarRelacionadas(assuntos: string[]): JurisprudenciaFixture[] {
    const chaves = new Set(
      [...expandirAssuntosRelacionados(assuntos), ...(assuntos || [])].map((item) =>
        item.toLowerCase()
      )
    );

    return JURISPRUDENCIAS_BANCARIAS.filter((item) =>
      item.relatedSubjects.some((assunto) => chaves.has(assunto.toLowerCase()))
    );
  }
}
