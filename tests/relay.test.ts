import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validRelayData } from '../src/shared/signaling';

test('relay limits guests to validated game inputs and champion handshake', () => {
  for (const champion of ['zed', 'singed', 'ahri', 'leblanc', 'yasuo', 'ezreal'])
    assert.equal(validRelayData(1, { type: 'hello', champion }), true);
  assert.equal(validRelayData(1, { type: 'hello', champion: 'unknown' }), false);
  assert.equal(validRelayData(1, { type: 'input', seq: 1, input: { action: 'stop' } }), true);
  assert.equal(validRelayData(1, { type: 'input', seq: -1, input: { action: 'stop' } }), false);
  for (const type of ['state', 'joined', 'error', 'create', 'join', 'reset-practice'])
    assert.equal(validRelayData(1, { type }), false);
});

test('relay accepts host state messages but never forwards host input commands', () => {
  for (const type of ['joined', 'state', 'pong', 'error']) assert.equal(validRelayData(0, { type }), true);
  assert.equal(validRelayData(0, { type: 'input', seq: 1, input: { action: 'stop' } }), false);
  assert.equal(validRelayData(0, null), false);
});

test('relay rejects oversized and malformed guest payloads', () => {
  assert.equal(validRelayData(1, { type: 'ready', extra: 'x'.repeat(3000) }), false);
  assert.equal(validRelayData(1, { type: 'select-champion', champion: 'invalid' }), false);
  assert.equal(
    validRelayData(1, { type: 'input', seq: 1, input: { action: 'move', point: { x: Infinity, y: 0 } } }),
    false,
  );
});
