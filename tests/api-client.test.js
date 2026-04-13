import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, buildQuery, ApiError } from '../src/index.js';

// ── Mock fetch ─────────────────────────────

let mockResponses = [];
let fetchCalls = [];
const originalFetch = globalThis.fetch;

function mockFetch(url, init) {
  fetchCalls.push({ url, init });
  const mock = mockResponses.shift();
  if (!mock) {
    return Promise.resolve(new Response(JSON.stringify({ error: 'No mock' }), { status: 500 }));
  }
  return Promise.resolve(mock);
}

function mockJson(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  mockResponses = [];
  fetchCalls = [];
  globalThis.fetch = mockFetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ── buildQuery ─────────────────────────────

describe('buildQuery', () => {
  it('builds a query string from an object', () => {
    assert.equal(buildQuery({ page: 2, limit: 20 }), '?page=2&limit=20');
  });

  it('filters null values', () => {
    assert.equal(buildQuery({ page: 1, status: null }), '?page=1');
  });

  it('filters undefined values', () => {
    assert.equal(buildQuery({ page: 1, status: undefined }), '?page=1');
  });

  it('filters empty string values', () => {
    assert.equal(buildQuery({ page: 1, search: '' }), '?page=1');
  });

  it('returns empty string for empty object', () => {
    assert.equal(buildQuery({}), '');
  });

  it('returns empty string for null', () => {
    assert.equal(buildQuery(null), '');
  });

  it('returns empty string for undefined', () => {
    assert.equal(buildQuery(undefined), '');
  });

  it('returns empty string for non-object', () => {
    assert.equal(buildQuery('hello'), '');
  });

  it('keeps zero values', () => {
    assert.equal(buildQuery({ page: 0, offset: 0 }), '?page=0&offset=0');
  });

  it('keeps false values', () => {
    assert.equal(buildQuery({ active: false }), '?active=false');
  });
});

// ── createClient ───────────────────────────

describe('createClient', () => {
  it('creates a client with a base URL', () => {
    const client = createClient('/api');
    assert.equal(client.baseUrl, '/api');
  });
});

// ── GET ────────────────────────────────────

describe('client.get', () => {
  it('sends a GET request', async () => {
    mockResponses.push(mockJson({ items: [1, 2, 3] }));
    const client = createClient('/api');

    const result = await client.get('/orders');
    assert.deepEqual(result, { items: [1, 2, 3] });
    assert.equal(fetchCalls[0].url, '/api/orders');
    assert.equal(fetchCalls[0].init.method, undefined);
  });

  it('appends query params', async () => {
    mockResponses.push(mockJson({ items: [] }));
    const client = createClient('/api');

    await client.get('/orders', { page: 2, status: 'active' });
    assert.equal(fetchCalls[0].url, '/api/orders?page=2&status=active');
  });

  it('filters null/empty params', async () => {
    mockResponses.push(mockJson({ items: [] }));
    const client = createClient('/api');

    await client.get('/orders', { page: 1, search: '', status: null });
    assert.equal(fetchCalls[0].url, '/api/orders?page=1');
  });
});

// ── POST ───────────────────────────────────

describe('client.post', () => {
  it('sends a POST with JSON body', async () => {
    mockResponses.push(mockJson({ id: 1 }));
    const client = createClient('/api');

    await client.post('/orders', { email: 'a@b.com' });
    assert.equal(fetchCalls[0].init.method, 'POST');
    assert.equal(fetchCalls[0].init.body, '{"email":"a@b.com"}');
    assert.equal(fetchCalls[0].init.headers['Content-Type'], 'application/json');
  });

  it('sends a POST with no body', async () => {
    mockResponses.push(mockJson({ ok: true }));
    const client = createClient('/api');

    await client.post('/orders/1/resend');
    assert.equal(fetchCalls[0].init.method, 'POST');
    assert.equal(fetchCalls[0].init.body, undefined);
  });
});

// ── PUT ────────────────────────────────────

describe('client.put', () => {
  it('sends a PUT with JSON body', async () => {
    mockResponses.push(mockJson({ ok: true }));
    const client = createClient('/api');

    await client.put('/products/1', { name: 'Updated' });
    assert.equal(fetchCalls[0].init.method, 'PUT');
    assert.equal(fetchCalls[0].init.body, '{"name":"Updated"}');
    assert.equal(fetchCalls[0].init.headers['Content-Type'], 'application/json');
  });
});

// ── DELETE ──────────────────────────────────

describe('client.del', () => {
  it('sends a DELETE request', async () => {
    mockResponses.push(mockJson({ ok: true }));
    const client = createClient('/api');

    await client.del('/products/1');
    assert.equal(fetchCalls[0].init.method, 'DELETE');
  });
});

// ── Upload ─────────────────────────────────

describe('client.upload', () => {
  it('sends FormData as-is', async () => {
    mockResponses.push(mockJson({ id: 1 }));
    const client = createClient('/api');

    const form = new FormData();
    form.append('file', new Blob(['hello']), 'test.txt');

    await client.upload('/files/upload', form);
    assert.equal(fetchCalls[0].init.method, 'POST');
    assert.ok(fetchCalls[0].init.body instanceof FormData);
  });

  it('builds FormData from plain object', async () => {
    mockResponses.push(mockJson({ id: 1 }));
    const client = createClient('/api');

    await client.upload('/files/upload', {
      file: new Blob(['data']),
      priceId: 123,
    });

    const body = fetchCalls[0].init.body;
    assert.ok(body instanceof FormData);
    assert.equal(body.get('priceId'), '123');
  });

  it('strips Content-Type header for multipart', async () => {
    mockResponses.push(mockJson({ id: 1 }));
    const client = createClient('/api', {
      headers: { 'Content-Type': 'application/json', 'X-Custom': 'yes' },
    });

    await client.upload('/upload', new FormData());
    assert.equal(fetchCalls[0].init.headers['Content-Type'], undefined);
    assert.equal(fetchCalls[0].init.headers['X-Custom'], 'yes');
  });

  it('skips null values in plain object', async () => {
    mockResponses.push(mockJson({ id: 1 }));
    const client = createClient('/api');

    await client.upload('/upload', { file: new Blob(['x']), extra: null });
    const body = fetchCalls[0].init.body;
    assert.equal(body.get('extra'), null);
  });
});

// ── Raw ────────────────────────────────────

describe('client.raw', () => {
  it('returns the Response object', async () => {
    mockResponses.push(new Response('csv,data', { status: 200 }));
    const client = createClient('/api');

    const res = await client.raw('/export', { method: 'POST' });
    assert.ok(res instanceof Response);
    const text = await res.text();
    assert.equal(text, 'csv,data');
  });

  it('throws ApiError on non-ok response', async () => {
    mockResponses.push(mockJson({ error: 'Forbidden' }, 403));
    const client = createClient('/api');

    await assert.rejects(
      () => client.raw('/export'),
      (err) => {
        assert.ok(err instanceof ApiError);
        assert.equal(err.status, 403);
        return true;
      },
    );
  });
});

// ── Error Handling ─────────────────────────

describe('error handling', () => {
  it('throws ApiError on non-ok response', async () => {
    mockResponses.push(mockJson({ error: 'Not found' }, 404));
    const client = createClient('/api');

    await assert.rejects(
      () => client.get('/missing'),
      (err) => {
        assert.ok(err instanceof ApiError);
        assert.equal(err.status, 404);
        assert.equal(err.message, 'Not found');
        assert.deepEqual(err.body, { error: 'Not found' });
        return true;
      },
    );
  });

  it('uses message field from body', async () => {
    mockResponses.push(mockJson({ message: 'Invalid input' }, 400));
    const client = createClient('/api');

    await assert.rejects(
      () => client.post('/create', {}),
      (err) => {
        assert.equal(err.message, 'Invalid input');
        return true;
      },
    );
  });

  it('falls back to statusText for non-JSON error', async () => {
    mockResponses.push(new Response('Server Error', {
      status: 500,
      statusText: 'Internal Server Error',
    }));
    const client = createClient('/api');

    await assert.rejects(
      () => client.get('/fail'),
      (err) => {
        assert.ok(err instanceof ApiError);
        assert.equal(err.status, 500);
        assert.equal(err.message, 'Internal Server Error');
        return true;
      },
    );
  });

  it('calls onError handler', async () => {
    mockResponses.push(mockJson({ error: 'Nope' }, 403));
    let captured = null;
    const client = createClient('/api', {
      onError: (err) => { captured = err; },
    });

    await assert.rejects(() => client.get('/fail'));
    assert.ok(captured instanceof ApiError);
    assert.equal(captured.status, 403);
  });

  it('suppresses throw when onError returns a value', async () => {
    mockResponses.push(mockJson({ error: 'Nope' }, 403));
    const client = createClient('/api', {
      onError: () => ({ fallback: true }),
    });

    const result = await client.get('/fail');
    assert.deepEqual(result, { fallback: true });
  });
});

// ── Headers ────────────────────────────────

describe('headers', () => {
  it('merges default headers', async () => {
    mockResponses.push(mockJson({}));
    const client = createClient('/api', {
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    });

    await client.get('/test');
    assert.equal(fetchCalls[0].init.headers['X-Requested-With'], 'XMLHttpRequest');
  });

  it('request headers override defaults', async () => {
    mockResponses.push(mockJson({}));
    const client = createClient('/api', {
      headers: { 'X-Custom': 'default' },
    });

    await client.request('/test', { headers: { 'X-Custom': 'override' } });
    assert.equal(fetchCalls[0].init.headers['X-Custom'], 'override');
  });
});

// ── Interceptors ───────────────────────────

describe('interceptors', () => {
  it('calls onRequest before sending', async () => {
    mockResponses.push(mockJson({}));
    let interceptedUrl = null;
    const client = createClient('/api', {
      onRequest: (url) => { interceptedUrl = url; },
    });

    await client.get('/test');
    assert.equal(interceptedUrl, '/api/test');
  });

  it('uses modified init from onRequest', async () => {
    mockResponses.push(mockJson({}));
    const client = createClient('/api', {
      onRequest: (url, init) => ({
        ...init,
        headers: { ...init.headers, 'X-Injected': 'yes' },
      }),
    });

    await client.get('/test');
    assert.equal(fetchCalls[0].init.headers['X-Injected'], 'yes');
  });

  it('calls onResponse after receiving', async () => {
    mockResponses.push(mockJson({ ok: true }));
    let interceptedStatus = null;
    const client = createClient('/api', {
      onResponse: (res) => { interceptedStatus = res.status; },
    });

    await client.get('/test');
    assert.equal(interceptedStatus, 200);
  });
});
