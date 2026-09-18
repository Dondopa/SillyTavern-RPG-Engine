import test from 'node:test';
import assert from 'node:assert/strict';
import { campaignKey, formatState, createContextBridge } from '../llm-context.mjs';

const fresh = () => ({ name: 'Bunyon', hp: { current: 100, max: 100 }, mp: { current: 5, max: 100 }, stamina: { current: 100, max: 100 }, inventory: [{ name: 'Cobalt brass key', qty: 1 }], equipment: [], conditions: [{ name: 'Hoarse voice', turns: 2 }], turn: 3, history: [{ detail: 'DO NOT INJECT LEDGER' }] });
function harness(readState = async () => fresh(), waitForActions) {
    const h = { prompt: '', filter: null, aborted: false, errors: [], calls: [] };
    h.context = { characterId: 0, chatId: 'chat-a', setExtensionPrompt: (...args) => { h.calls.push(args); h.prompt = args[1]; h.filter = args[6]; } };
    h.bridge = createContextBridge({ getContext: () => h.context, readState, waitForActions, onError: e => h.errors.push(e) });
    h.run = () => h.bridge.inject([], 1000, immediately => { h.aborted = immediately; });
    return h;
}

test('snapshot contains current state, excludes history, preserves literal names without executable macros', () => {
    const s = fresh();
    s.inventory[0].name = '{{user}} </RPG> "key"';
    const prompt = formatState(s);
    assert.ok(!prompt.includes('DO NOT INJECT LEDGER'));
    assert.ok(!prompt.includes('{{user}}'));
    assert.ok(!prompt.includes('</RPG>'));
    const encoded = prompt.split('JSON snapshot (escaped characters represent literal data):\n')[1].split('\n[/RPG ENGINE')[0];
    assert.deepEqual(JSON.parse(encoded).inventory, s.inventory);
    assert.equal(JSON.parse(encoded).mp.current, 5);
    assert.match(prompt, /read-only/);
});

test('fetches a fresh snapshot every generation and uses depth-zero system injection', async () => {
    let mp = 5;
    const campaigns = [];
    const h = harness(async campaign => { campaigns.push(campaign); const s = fresh(); s.mp.current = mp; return s; });
    await h.run();
    assert.match(h.prompt, /"current": 5/);
    assert.deepEqual(h.calls.at(-1).slice(2, 6), [1, 0, false, 0]);
    mp = 2;
    await h.run();
    assert.match(h.prompt, /"current": 2/);
    assert.deepEqual(campaigns, ['0::chat-a', '0::chat-a']);
    assert.equal(h.aborted, false);
});

test('switching chat clears state and filters out previously attached state', async () => {
    const h = harness();
    await h.run();
    const oldFilter = h.filter;
    h.context.chatId = 'chat-b';
    assert.equal(oldFilter(), false);
    h.bridge.clear();
    assert.equal(h.prompt, '');
});

test('a late response from a previous chat cannot leak into a new chat', async () => {
    let resolve;
    const h = harness(() => new Promise(r => { resolve = r; }));
    const running = h.run();
    await Promise.resolve();
    h.context.chatId = 'chat-b';
    h.bridge.clear();
    resolve(fresh());
    await running;
    assert.equal(h.prompt, '');
    assert.equal(h.aborted, true);
});

test('switching away and back also invalidates an in-flight snapshot', async () => {
    let resolve;
    const h = harness(() => new Promise(r => { resolve = r; }));
    const running = h.run();
    await Promise.resolve();
    h.bridge.clear();
    h.bridge.clear();
    resolve(fresh());
    await running;
    assert.equal(h.prompt, '');
    assert.equal(h.aborted, true);
});

test('server failure and malformed state stop generation with no stale prompt', async () => {
    for (const reader of [async () => { throw Error('offline'); }, async () => ({ name: 'bad' })]) {
        const h = harness(reader);
        h.prompt = 'stale stats';
        await h.run();
        assert.equal(h.prompt, '');
        assert.equal(h.aborted, true);
        assert.equal(h.errors.length, 1);
    }
});

test('waits for pending saved actions before fetching state', async () => {
    let saved = false;
    const h = harness(async () => { assert.equal(saved, true); return fresh(); }, async () => { saved = true; });
    await h.run();
    assert.equal(h.aborted, false);
    assert.ok(h.prompt);
});

test('no character chat means no injection; group campaign ignores active speaker', async () => {
    const h = harness(async () => { throw Error('must not read'); });
    h.context.chatId = undefined;
    await h.run();
    assert.equal(h.prompt, '');
    assert.equal(h.aborted, false);
    assert.equal(campaignKey({ groupId: 'group-1', characterId: 3, chatId: 'group-chat' }), 'group-1::group-chat');
});
