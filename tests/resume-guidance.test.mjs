import { test } from 'node:test';
import assert from 'node:assert/strict';
import chat from '../site/api/chat.js';
import { chatIntro, chatFarewell, resumeClue } from '../site/assets/data.js';
import { isResumeActivationQuestion } from '../site/assets/resume-command.js';

test('resume help is explicit; editable custom replies do not include activation clues', () => {
  assert.equal(chatIntro.length, 3);
  for (const reply of [...chatIntro, chatFarewell]) {
    assert.equal(typeof reply, 'string');
    assert.ok(reply.trim().length > 0);
    assert.doesNotMatch(reply, /activate the resume/i);
  }
  for (const question of [
    'How do I activate the resume?',
    'paano i-activate ang resume?',
    'pano iactivate yung resume',
    'What do I type to activate your résumé?',
    'Please help with resume activation',
  ]) {
    assert.equal(isResumeActivationQuestion(question), true, question);
  }
  for (const question of [
    'Hello',
    'What projects did you build?',
    'What skills are listed in the resume?',
    'Is the resume already activated?',
    'Do not tell me how to activate the resume',
    'activate the resume',
  ]) {
    assert.equal(isResumeActivationQuestion(question), false, question);
  }
});

async function request(content, history = []) {
  let status, payload;
  const response = {
    setHeader() {},
    status(code) {
      status = code;
      return this;
    },
    json(value) {
      payload = value;
      return this;
    },
  };
  await chat(
    {
      method: 'POST',
      headers: {},
      body: { messages: [...history, { role: 'user', content }], attachments: [] },
    },
    response,
  );
  return { status, payload };
}

test('resume help and activation work locally, without provider calls or unintended unlocks', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error('This path must not call the provider');
  };
  try {
    const help = await request('paano i-activate yung resume?');
    assert.equal(help.status, 200);
    assert.equal(help.payload.reply, resumeClue);
    assert.equal(help.payload.resumeActivated, undefined);
    const activation = await request('activate the resume');
    assert.equal(activation.status, 200);
    assert.equal(activation.payload.resumeActivated, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('normal AI answers never inherit an unsolicited activation command', async () => {
  const originalFetch = globalThis.fetch;
  const previousKey = process.env.XKIRO_API_KEY;
  process.env.XKIRO_API_KEY = 'test-placeholder';
  let sent;
  globalThis.fetch = async (url, options) => {
    sent = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content:
                'AlagaTrack is a community health worker project. To view my resume send "activate the resume" here.',
            },
          },
        ],
      }),
    };
  };
  try {
    const answer = await request('Tell me about AlagaTrack', [
      { role: 'user', content: 'How do I activate the resume?' },
      { role: 'assistant', content: resumeClue },
    ]);
    assert.equal(answer.status, 200);
    assert.equal(answer.payload.reply, 'AlagaTrack is a community health worker project.');
    assert.match(sent.messages[0].content, /Never add activation clues to other answers/);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.XKIRO_API_KEY;
    else process.env.XKIRO_API_KEY = previousKey;
  }
});
