import test from 'node:test';
import assert from 'node:assert/strict';
import { GGUI_AGENT_SYSTEM_PROMPT } from '@ggui-ai/protocol';
import { buildAgentInstructions, buildPromptWithJiumContext } from './agent.js';
import { JIUM_SYSTEM_PROMPT } from './jium-system-prompt.js';

test('S3: JIUM_SYSTEM_PROMPT exposes Jium orchestration directives', () => {
  assert.ok(JIUM_SYSTEM_PROMPT.length > 400);
  assert.match(JIUM_SYSTEM_PROMPT, /gentle_proactive/);
  assert.match(JIUM_SYSTEM_PROMPT, /ggui/i);
  assert.match(JIUM_SYSTEM_PROMPT, /user_context/);
  assert.match(JIUM_SYSTEM_PROMPT, /api_gateway/);
  assert.match(JIUM_SYSTEM_PROMPT, /resolve_references/);
  assert.match(JIUM_SYSTEM_PROMPT, /render/i);
});

test('S2: buildAgentInstructions appends GGUI schema hardening rules', () => {
  const instructions = buildAgentInstructions(undefined);

  assert.ok(instructions?.startsWith(JIUM_SYSTEM_PROMPT));
  assert.ok(!instructions?.startsWith(GGUI_AGENT_SYSTEM_PROMPT));
  assert.match(instructions ?? '', /Never use JSON Schema `type` arrays/);
  assert.match(instructions ?? '', /Never emit `null` for string-typed fields/);
});

test('S2: buildAgentInstructions preserves explicit null system prompt', () => {
  assert.equal(buildAgentInstructions(null), undefined);
});

test('S8: buildPromptWithJiumContext prepends compact context when available', async () => {
  const prompt = await buildPromptWithJiumContext(
    {
      chatId: 'chat-1',
      prompt: '오늘 일정 보여줘',
      mcpServers: {},
      systemPrompt: undefined,
      abortSignal: new AbortController().signal,
    },
    async () => ({
      userId: 'dev-user',
      now: '2026-05-31T00:00:00.000Z',
      calendar: [{ id: 'event-1', title: 'Send invoice' }],
      recentContext: [{ summary: '인보이스 보내야 해.' }],
    }),
  );

  assert.match(prompt, /^<jium_context>/);
  assert.match(prompt, /"userId":"dev-user"/);
  assert.match(prompt, /<user_request>오늘 일정 보여줘<\/user_request>$/);
});

test('S8: buildPromptWithJiumContext leaves prompt unchanged without context provider', async () => {
  const prompt = await buildPromptWithJiumContext({
    chatId: 'chat-1',
    prompt: '오늘 일정 보여줘',
    mcpServers: {},
    systemPrompt: undefined,
    abortSignal: new AbortController().signal,
  });

  assert.equal(prompt, '오늘 일정 보여줘');
});
