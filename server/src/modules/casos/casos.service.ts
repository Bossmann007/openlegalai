import { Caso } from "@models/caso.model";
import { DataJudHit } from "@modules/datajud/datajud.types";
import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { cnjDigitos } from "./caso.assembler";
import { CasosRepository } from "./casos.repository";

@Injectable()
export class CasosService {
  private readonly logger = new Logger(CasosService.name);
  private readonly live = new Map<string, Caso>();

  constructor(private readonly repositorio: CasosRepository) {}

  async listar(): Promise<Caso[]> {
    let acervo: Caso[] = [];
    try {
      acervo = await this.repositorio.listar();
    } catch (erro) {
      if (!this.live.size) {
        throw erro;
      }
    }

    const porChave = new Map<string, Caso>();
    for (const caso of acervo) {
      porChave.set(caso.id, caso);
    }
    for (const caso of this.live.values()) {
      porChave.set(caso.id, caso);
    }

    return [...porChave.values()];
  }

  async obter(idOrCnj: string): Promise<Caso> {
    const live = this.buscarLive(idOrCnj);
    if (live) {
      return live;
    }

    const achado = await this.obterDoAcervo(idOrCnj);
    if (!achado) {
      throw new NotFoundException("Caso não encontrado.");
    }

    return achado;
  }

  async obterDoAcervo(idOrCnj: string): Promise<Caso | undefined> {
    try {
      return await this.repositorio.obter(idOrCnj);
    } catch (erro) {
      this.logger.debug(
        `Acervo sem o caso '${idOrCnj}': ${
          erro instanceof Error ? erro.message : String(erro)
        }`
      );
      return undefined;
    }
  }

  guardarLive(caso: Caso): void {
    const chaves = [
      caso.id,
      caso.processNumber,
      cnjDigitos(caso.processNumber),
    ].filter((item) => item && item.trim());

    for (const chave of chaves) {
      this.live.set(chave, caso);
    }
  }

  async tentarPersistirLive(hit: DataJudHit): Promise<void> {
    try {
      await this.repositorio.upsertProcessoLive(hit);
    } catch (erro) {
      this.logger.warn(
        `Persistência DataJud no TiDB falhou; overlay em memória segue válido: ${
          erro instanceof Error ? erro.message : String(erro)
        }`
      );
    }
  }

  private buscarLive(idOrCnj: string): Caso | undefined {
    const chave = idOrCnj.trim();
    return this.live.get(chave) || this.live.get(cnjDigitos(chave));
  }
}
