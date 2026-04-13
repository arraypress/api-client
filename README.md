# @arraypress/api-client

Lightweight API client built on the Fetch API. Provides query building, JSON body serialisation, file uploads, and consistent error handling. Zero dependencies.

Works in Cloudflare Workers, Node.js 18+, Deno, Bun, and browsers.

## Install

```bash
npm install @arraypress/api-client
```

## Quick Start

```js
import { createClient } from '@arraypress/api-client';

const api = createClient('/admin/api', {
  headers: { 'X-Requested-With': 'XMLHttpRequest' },
});

// GET with query params
const orders = await api.get('/orders', { page: 2, status: 'completed' });

// POST with JSON body
await api.post('/orders/manual', { email: 'user@example.com', items: [...] });

// PUT
await api.put('/products/42/meta', { name: 'Updated Product' });

// DELETE
await api.del('/products/42');

// POST with no body
await api.post('/orders/123/resend');
```

## Functions

### `createClient(baseUrl, options?)`

Create an API client bound to a base URL. All methods share the same base URL, default headers, and error handling.

```ts
function createClient(baseUrl: string, options?: ClientOptions): ApiClient
```

**Options:**

| Option | Type | Description |
|--------|------|-------------|
| `headers` | `Record<string, string>` | Default headers merged into every request |
| `onError` | `(error: ApiError) => any` | Custom error handler. Return a value to suppress the throw |
| `onRequest` | `(url, init) => init \| void` | Intercept the request before sending |
| `onResponse` | `(response, url) => void` | Intercept the response after receiving |

```js
import { createClient } from '@arraypress/api-client';

// Admin API with CSRF header
const admin = createClient('/admin/api', {
  headers: { 'X-Requested-With': 'XMLHttpRequest' },
});

// Public store API
const store = createClient('/api');

// With error interceptor
const api = createClient('/admin/api', {
  onError: (err) => {
    if (err.status === 401) window.location.href = '/login';
  },
});
```

### `client.get(path, params?)`

GET request. Params are encoded as a query string — `null`, `undefined`, and empty-string values are filtered out.

```js
await api.get('/orders', { page: 2, status: 'completed', search: '' });
// => GET /admin/api/orders?page=2&status=completed

await api.get('/stats');
// => GET /admin/api/stats
```

### `client.post(path, body?)`

POST request with an optional JSON body. Content-Type is set automatically when a body is provided.

```js
// With body
await api.post('/orders/manual', { email: 'a@b.com', items: [{ priceId: 1 }] });

// Without body
await api.post('/orders/123/resend');
```

### `client.put(path, body)`

PUT request with a JSON body.

```js
await api.put('/products/42/meta', { name: 'New Name', slug: 'new-name' });
```

### `client.del(path)`

DELETE request.

```js
await api.del('/products/42');
```

### `client.upload(path, data)`

Upload files via multipart/form-data. Accepts a `FormData` object or a plain object — File/Blob values are appended as files, everything else as strings.

Content-Type is intentionally omitted so the runtime sets the correct multipart boundary.

```js
// Plain object — File values are detected automatically
await api.upload('/files/upload', {
  file: fileInput.files[0],
  priceId: '123',
});

// Pre-built FormData
const form = new FormData();
form.append('file', blob, 'photo.jpg');
form.append('productId', '42');
await api.upload('/media/upload', form);
```

### `client.raw(path, init?)`

Returns the raw `Response` object instead of parsed JSON. Use for CSV exports, file downloads, or streaming.

```js
const res = await api.raw('/subscribers/export', { method: 'POST' });
const csv = await res.text();

// Download as blob
const res = await api.raw('/files/42/signed-url');
const blob = await res.blob();
```

### `client.request(path, init?)`

Access the underlying request function for custom calls that don't fit `get`/`post`/`put`/`del`.

```js
await api.request('/custom', {
  method: 'PATCH',
  body: JSON.stringify({ field: 'value' }),
  headers: { 'Content-Type': 'application/json' },
});
```

### `buildQuery(params?)`

Standalone query string builder. Filters out `null`, `undefined`, and empty-string values. Exported separately for use with `raw()` or outside the client.

```js
import { buildQuery } from '@arraypress/api-client';

buildQuery({ page: 2, search: 'hello', status: null })
// => '?page=2&search=hello'

buildQuery({})
// => ''
```

### `ApiError`

Error class thrown on non-ok responses. Extends `Error` with `status`, `statusText`, and `body`.

```js
import { ApiError } from '@arraypress/api-client';

try {
  await api.get('/missing');
} catch (err) {
  if (err instanceof ApiError) {
    console.log(err.status);     // 404
    console.log(err.statusText); // 'Not Found'
    console.log(err.body);       // { error: 'Not found' }
    console.log(err.message);    // 'Not found'
  }
}
```

## Usage with React + TanStack Query

```js
import { createClient } from '@arraypress/api-client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const api = createClient('/admin/api', {
  headers: { 'X-Requested-With': 'XMLHttpRequest' },
});

function useOrders(params) {
  return useQuery({
    queryKey: ['orders', 'list', params],
    queryFn: () => api.get('/orders', params),
  });
}

function useDeleteOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.del(`/orders/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  });
}
```

## Usage with Hono

```js
import { createClient } from '@arraypress/api-client';

// Server-side API client (e.g. calling an external service)
const payments = createClient('https://api.stripe.com/v1', {
  headers: { Authorization: `Bearer ${STRIPE_KEY}` },
});

const charges = await payments.get('/charges', { limit: 10 });
```

## License

MIT
