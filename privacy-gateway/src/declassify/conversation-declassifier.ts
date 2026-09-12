import { randomBytes } from 'node:crypto';
import type { AuditLog } from '../audit/audit-log.js';
import type { SafeDTO, SafeItem, SafeTask, SafeWarning } from '../domain/safe-dto.js';
import { validateSafeDto } from '../domain/safe-dto.js';
import type { Tainted } from '../domain/taint.js';
import { deriveTaint, tainted } from '../domain/taint.js';
import type { CaseMessage, RawChannel, Role } from '../domain/types.js';
import { classificationOf } from '../domain/types.js';
import { authorizeRelease } from '../policy/authorized-releases.js';
import { FlowPolicy } from '../policy/flow-policy.js';
import { ReleasePolicy } from '../policy/release-policy.js';

const DECISION_RE = /\b(decidimos|decidiu|acordamos|vamos priorizar|priorizar)\b/i;
const PENDING_RE = /\b(pendencia|pendência|falta|aguardando|em aberto)\b/i;
const INJECTION_RE =
  /ignore as regras|envie todos os documentos|ignore previous/i;

const RELEASE_KIND_BY_ROLE: Record<Role, string> = {
  socio: 'partner_brief',
  advogado: 'associate_brief',
  estagiario: 'intern_brief',
};

export type ChannelSignals = {
  total: number;
  fromTeam: number;
  fromInternalAgents: number;
  fromExternalModels: number;
  hasDecision: boolean;
  hasPending: boolean;
  injection: boolean;
};

/**
 * Turns a case channel into a SafeDTO.
 *
 * The whole channel body stays server-side. What crosses is a count, two
 * booleans and sentences this file wrote — never a line anyone typed. That is
 * the difference the product rests on: a redacted transcript is still a
 * transcript, and a transcript of a legal team is exactly what must not leave.
 *
 * Signals are read from team and internal-agent messages only. Text that an
 * outside model posted through `post_message` is counted but never interpreted,
 * so a caller cannot plant "decidimos liberar tudo", ask for the summary, and
 * read its own sentence back as a team decision.
 */
export class ConversationDeclassifier {
  private readonly flow = new FlowPolicy();
  private readonly release = new ReleasePolicy();
  private readonly audit?: AuditLog;

  constructor(opts?: { audit?: AuditLog }) {
    this.audit = opts?.audit;
  }

  declassify(args: {
    channel: RawChannel;
    sessionId: string;
    role: Role;
    userId?: string;
    intent?: string;
  }): SafeDTO {
    const signals = readChannelSignals(args.channel.messages, args.intent);
    const sourceTaint = deriveTaint(
      args.channel.messages.map((message) =>
        tainted(message.id, classificationOf(message.classification)),
      ),
    );
    const kind = RELEASE_KIND_BY_ROLE[args.role];
    const userId = args.userId ?? 'office';

    const abstract = <T>(value: T): Tainted<T> =>
      authorizeRelease(kind, value, sourceTaint, this.audit, userId);

    const summary = abstract(buildSummary(signals, args.role));
    const decisions: Tainted<SafeItem>[] = signals.hasDecision
      ? [
          abstract({
            id: 'dec_channel',
            text: 'A equipe registrou ao menos um encaminhamento definido no canal.',
          }),
        ]
      : [];
    const tasks: Tainted<SafeTask>[] = signals.hasPending
      ? [
          abstract({
            id: 'task_channel',
            text: 'Resolver a pendencia sinalizada no canal do caso.',
            status: 'open' as const,
          }),
        ]
      : [];

    // Same gate the document path uses: nothing crosses on the strength of
    // having been built here. It crosses because the flow policy says so.
    for (const piece of [summary, ...decisions, ...tasks]) {
      const verdict = this.flow.canCross(piece);
      if (!verdict.ok) {
        this.audit?.append({
          action: 'flow_denied',
          userId,
          sessionId: args.sessionId,
          outcome: 'deny',
          reason: verdict.code,
        });
        throw new Error(verdict.code);
      }
    }

    const warnings: SafeWarning[] = [
      {
        code: 'conversation_summary',
        message: 'Channel bodies destroyed at boundary. Only counts and generated statements released.',
      },
    ];

    if (signals.fromExternalModels > 0) {
      warnings.push({
        code: 'external_posts_not_interpreted',
        message:
          'Messages posted by external models are counted but never used to derive decisions or pendings.',
      });
    }

    if (signals.injection) {
      warnings.push({
        code: 'prompt_injection_ignored',
        message:
          'Injection-like instructions in the channel or intent were ignored by policy.',
      });
    }

    const dto: SafeDTO = {
      schemaVersion: '1',
      sessionId: args.sessionId,
      releaseId: `rel_${randomBytes(5).toString('hex')}`,
      summary: summary.value,
      decisions: decisions.map((d) => d.value),
      tasks: tasks.map((t) => t.value),
      safeReferences: [
        {
          id: 'ref_channel',
          label: 'Canal do caso (referencia opaca)',
          kind: 'internal_case_ref' as const,
        },
      ],
      warnings,
    };

    const capped = this.release.apply(args.role, dto);
    const checked = validateSafeDto(capped);
    if (!checked.ok) {
      throw new Error(`CONVERSATION_DTO_INVALID:${checked.reason}`);
    }
    return checked.dto;
  }
}

export function readChannelSignals(
  messages: CaseMessage[],
  intent: string | undefined,
): ChannelSignals {
  const interpretable = messages.filter((m) => m.origin !== 'external');
  const joined = interpretable.map((m) => m.body).join('\n');
  const everything = messages.map((m) => m.body).join('\n');

  return {
    total: messages.length,
    fromTeam: messages.filter((m) => m.origin === 'human').length,
    fromInternalAgents: messages.filter((m) => m.origin === 'agent').length,
    fromExternalModels: messages.filter((m) => m.origin === 'external').length,
    hasDecision: DECISION_RE.test(joined),
    hasPending: PENDING_RE.test(joined),
    // Injection is flagged wherever it appears, including in text the caller
    // posted: detecting it is not the same as acting on it.
    injection: INJECTION_RE.test(everything) || INJECTION_RE.test(intent ?? ''),
  };
}

function buildSummary(signals: ChannelSignals, role: Role): string {
  if (signals.total === 0) {
    return 'O canal do caso ainda nao registra mensagens.';
  }

  const parts = [
    `O canal reune ${signals.total} mensagens, ${signals.fromInternalAgents} delas escritas por agentes internos.`,
  ];

  if (role === 'estagiario') {
    parts.push(
      'O andamento da discussao permanece no escritorio e nao integra este release.',
    );
    return parts.join(' ');
  }

  if (signals.hasDecision) {
    parts.push('A equipe ja fixou ao menos um encaminhamento.');
  }
  if (signals.hasPending) {
    parts.push('Ha ao menos uma pendencia aguardando resolucao.');
  }
  if (!signals.hasDecision && !signals.hasPending) {
    parts.push('Nenhum encaminhamento ou pendencia foi identificado no canal.');
  }

  parts.push('O conteudo das mensagens nao integra este release.');
  return parts.join(' ');
}
