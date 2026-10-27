import assert from 'node:assert/strict';
import { before, test } from 'node:test';

process.env.DB_PATH = ':memory:';

let handler: (req: any, res: any) => Promise<void>;
let pendingRequests: Map<string, { resolve: (value: unknown) => void }>;

before(async () => {
  const { initDatabase } = await import('../src/db/client');
  const mcp = await import('../src/routes/mcp');
  initDatabase();
  pendingRequests = mcp.pendingRequests;
  const route = mcp.default.stack.find(layer => layer.route?.path === '/execute');
  assert.ok(route);
  handler = route.route.stack[0].handle;
});

function response() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; }
  };
}

test('rejects non-string paths without creating pending requests', async () => {
  for (const body of [
    { path: { nested: true } },
    { file: 42 },
    { params: { arguments: { path: ['file.txt'] } } },
    { params: { arguments: { file: { name: 'file.txt' } } } }
  ]) {
    const res = response();
    await handler({ body }, res);
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error: 'Path or file must be a string.' });
    assert.equal(pendingRequests.size, 0);
  }
});

test('rejects a missing or non-object body', async () => {
  for (const body of [undefined, null, []]) {
    const res = response();
    await handler({ body }, res);
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error: 'Request body must be a JSON object.' });
  }
});

test('accepts a string path and preserves the approval flow', async () => {
  const res = response();
  const request = handler({ body: { path: '/tmp/example.txt' } }, res);
  assert.equal(pendingRequests.size, 1);
  const [id, holder] = [...pendingRequests.entries()][0];
  pendingRequests.delete(id);
  holder.resolve({ ok: true });
  await request;
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    status: 'success', decision: 'approved', id, data: { ok: true }
  });
});
