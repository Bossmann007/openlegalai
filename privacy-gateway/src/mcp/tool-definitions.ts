import { POST_MESSAGE_MAX } from '../office/virtual-office.js';

/**
 * The wire surface, declared once.
 *
 * Both transports advertise this list, so stdio and HTTP cannot drift into
 * offering different tools. `additionalProperties: false` everywhere is part of
 * the identity rule: a caller has no schema slot to smuggle `user` or `role`
 * into, and `McpOfficeServer` rejects those keys even if a client sends them
 * anyway.
 */
export const TOOL_DEFINITIONS = [
  {
    name: 'enter_office',
    description:
      'Open a server-side office session. Returns a SafeDTO with an opaque session id.',
    inputSchema: {
      type: 'object',
      properties: {
        caseId: { type: 'string' },
      },
      required: ['caseId'],
      additionalProperties: false,
    },
  },
  {
    name: 'leave_office',
    description: 'Close an office session. Returns a SafeDTO ack.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
      },
      required: ['sessionId'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_safe_summary',
    description:
      'Release a declassified SafeDTO for the session. Never returns raw case text.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        intent: { type: 'string' },
      },
      required: ['sessionId'],
      additionalProperties: false,
    },
  },
  {
    name: 'ask_office',
    description:
      'Ask a question inside the office. The answer is a SafeDTO, not free text.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        intent: { type: 'string' },
      },
      required: ['sessionId'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_safe_conversation',
    description:
      'Release the state of the case channel: message counts and generated statements. Never returns a message body, an author or a timestamp.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        intent: { type: 'string' },
      },
      required: ['sessionId'],
      additionalProperties: false,
    },
  },
  {
    name: 'post_message',
    description:
      'Write a message into the case channel. Ingress only: the acknowledgement never echoes the text back and never carries office content.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        text: { type: 'string', maxLength: POST_MESSAGE_MAX },
      },
      required: ['sessionId', 'text'],
      additionalProperties: false,
    },
  },
] as const;
