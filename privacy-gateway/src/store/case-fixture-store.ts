import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  asRawChannel,
  asRawContext,
  type CaseMessage,
  type CaseRecord,
  type RawChannel,
  type RawContext,
  type UserPrincipal,
} from '../domain/types.js';
import { RbacStub } from '../rbac/rbac-stub.js';
import type { OfficeStore } from './office-store.js';

const here = dirname(fileURLToPath(import.meta.url));

export class CaseFixtureStore implements OfficeStore {
  private readonly cases: Map<string, CaseRecord>;
  private readonly rbac = new RbacStub();

  constructor(records: CaseRecord[]) {
    this.cases = new Map(records.map((c) => [c.id, c]));
  }

  static fromDefaultFixture(): CaseFixtureStore {
    const path = join(here, '../../fixtures/case-banco-demo.json');
    const raw = JSON.parse(readFileSync(path, 'utf8')) as CaseRecord;
    return new CaseFixtureStore([raw]);
  }

  getAuthorizedSummary(
    user: UserPrincipal,
    caseId: string,
  ): RawContext | null {
    const record = this.cases.get(caseId);
    if (!record) {
      return null;
    }
    if (
      !this.rbac.canAccessCase(user, record.allowedUserIds, record.allowedRoles)
    ) {
      return null;
    }
    for (const doc of record.documents) {
      if (!doc.classification) {
        return null;
      }
    }
    return asRawContext(record.id, record.documents);
  }

  getAuthorizedChannel(
    user: UserPrincipal,
    caseId: string,
  ): RawChannel | null {
    const record = this.authorizedRecord(user, caseId);
    if (!record) {
      return null;
    }
    const messages = record.channel ?? [];
    // An unlabelled message is not a public one. Same rule as documents: if the
    // archive cannot say how sensitive a row is, nothing about it crosses.
    for (const message of messages) {
      if (!message.classification || !message.origin) {
        return null;
      }
    }
    return asRawChannel(record.id, messages);
  }

  appendMessage(
    user: UserPrincipal,
    caseId: string,
    message: CaseMessage,
  ): boolean {
    const record = this.authorizedRecord(user, caseId);
    if (!record) {
      return false;
    }
    record.channel = [...(record.channel ?? []), message];
    return true;
  }

  private authorizedRecord(
    user: UserPrincipal,
    caseId: string,
  ): CaseRecord | undefined {
    const record = this.cases.get(caseId);
    if (!record) {
      return undefined;
    }
    if (
      !this.rbac.canAccessCase(user, record.allowedUserIds, record.allowedRoles)
    ) {
      return undefined;
    }
    return record;
  }
}
