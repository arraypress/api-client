/**
 * @arraypress/api-client
 *
 * Lightweight API client built on the Fetch API. Provides query building,
 * JSON body serialisation, file uploads, and consistent error handling.
 * Zero dependencies.
 *
 * Works in Cloudflare Workers, Node.js 18+, Deno, Bun, and browsers.
 *
 * @module @arraypress/api-client
 */

// ── Error ──────────────────────────────────

/**
 * Error thrown when an API request fails.
 *
 * Extends the native Error with HTTP status, status text, and the
 * parsed error body (if the server returned JSON).
 *
 * @example
 * try {
 *   await client.get('/missing');
 * } catch (err) {
 *   if (err instanceof ApiError) {
 *     console.log(err.status);  // 404
 *     console.log(err.body);    // { error: 'Not found' }
 *   }
 * }
 */
export class ApiError extends Error {
  /**
   * @param {string} message - Human-readable error message.
   * @param {number} status - HTTP status code.
   * @param {string} statusText - HTTP status text.
   * @param {*} [body] - Parsed response body (if available).
   */
  constructor(message, status, statusText, body) {
    super(message);
    this.name = 'ApiError';
    /** @type {number} HTTP status code. */
    this.status = status;
    /** @type {string} HTTP status text. */
    this.statusText = statusText;
    /** @type {*} Parsed response body. */
    this.body = body;
  }
}

// ── Query Builder ──────────────────────────

/**
 * Build a URL query string from a params object.
 *
 * Filters out `null`, `undefined`, and empty-string values.
 * Returns an empty string when no params remain.
 *
 * @param {Object} [params] - Key-value pairs to encode.
 * @returns {string} Query string including leading `?`, or empty string.
 *
 * @example
 * buildQuery({ page: 2, search: 'hello', status: null })
 * // => '?page=2&search=hello'
 *
 * buildQuery({})
 * // => ''
 *
 * buildQuery()
 * // => ''
 */
export function buildQuery(params) {
  if (!params || typeof params !== 'object') return '';
  const entries = Object.entries(params).filter(
    ([, v]) => v != null && v !== '',
  );
  if (entries.length === 0) return '';
  return '?' + new URLSearchParams(entries).toString();
}

// ── Client ─────────────────────────────────

/**
 * Create an API client bound to a base URL.
 *
 * The client provides `get`, `post`, `put`, `del`, `upload`, and `raw`
 * methods that all share the same base URL, default headers, and error
 * handling behaviour.
 *
 * @param {string} baseUrl - Base URL prefix for all requests (e.g. `/admin/api`).
 * @param {Object} [options]
 * @param {Record<string, string>} [options.headers] - Default headers merged into every request.
 * @param {function} [options.onError] - Custom error handler called with (ApiError) before throwing. Return a value to suppress the throw.
 * @param {function} [options.onRequest] - Intercept the Request before it is sent. Receives (url, init) and may return modified init.
 * @param {function} [options.onResponse] - Intercept the Response after it is received. Receives (response, url). Runs before error handling.
 * @returns {ApiClient} Client instance.
 *
 * @example
 * import { createClient } from '@arraypress/api-client';
 *
 * // Admin API — CSRF header on every request
 * const api = createClient('/admin/api', {
 *   headers: { 'X-Requested-With': 'XMLHttpRequest' },
 * });
 *
 * const orders = await api.get('/orders', { page: 1, limit: 20 });
 * await api.post('/orders/manual', { email: 'a@b.com', items: [...] });
 *
 * // Store API — simple GET-heavy client
 * const store = createClient('/api');
 * const config = await store.get('/store/config');
 */
export function createClient(baseUrl, options = {}) {
  const defaultHeaders = options.headers || {};
  const onError = options.onError || null;
  const onRequest = options.onRequest || null;
  const onResponse = options.onResponse || null;

  /**
   * Merge default headers with request-specific headers.
   * Content-Type from defaults is excluded when the body is FormData
   * (lets the runtime set the correct multipart boundary).
   *
   * @param {Object} [extra] - Request-specific headers.
   * @param {boolean} [isMultipart] - Whether to strip Content-Type from defaults.
   * @returns {Object} Merged headers.
   */
  function mergeHeaders(extra, isMultipart) {
    const base = {};
    for (const [k, v] of Object.entries(defaultHeaders)) {
      if (isMultipart && k.toLowerCase() === 'content-type') continue;
      base[k] = v;
    }
    return { ...base, ...extra };
  }

  /**
   * Send a fetch request with interceptors and error handling.
   *
   * @param {string} url - Full URL.
   * @param {Object} init - Fetch init (headers already merged).
   * @returns {Promise<Response>} The fetch Response.
   * @throws {ApiError} When the response is not ok.
   */
  async function send(url, init) {
    let fetchInit = init;

    if (onRequest) {
      const modified = await onRequest(url, fetchInit);
      if (modified) fetchInit = modified;
    }

    const res = await fetch(url, fetchInit);

    if (onResponse) {
      await onResponse(res, url);
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      const message = body?.error || body?.message || res.statusText || 'Request failed';
      const err = new ApiError(message, res.status, res.statusText, body);
      if (onError) {
        const result = await onError(err);
        if (result !== undefined) return result;
      }
      throw err;
    }

    return res;
  }

  /**
   * Send a request and return the parsed JSON body.
   *
   * @param {string} path - Path appended to the base URL.
   * @param {Object} [init] - Fetch init overrides.
   * @returns {Promise<*>} Parsed JSON response.
   * @throws {ApiError} When the response is not ok.
   */
  async function request(path, init = {}) {
    const res = await send(baseUrl + path, {
      ...init,
      headers: mergeHeaders(init.headers, false),
    });
    return res.json ? res.json() : res;
  }

  /**
   * Send a request and return the raw Response object.
   *
   * @param {string} path - Path appended to the base URL.
   * @param {Object} [init] - Fetch init overrides.
   * @returns {Promise<Response>} Raw fetch Response.
   * @throws {ApiError} When the response is not ok.
   */
  async function raw(path, init = {}) {
    return send(baseUrl + path, {
      ...init,
      headers: mergeHeaders(init.headers, false),
    });
  }

  return {
    /**
     * GET request. Params are appended as a query string.
     *
     * @param {string} path - Request path.
     * @param {Object} [params] - Query parameters (nulls and empty strings filtered).
     * @returns {Promise<*>} Parsed JSON response.
     *
     * @example
     * await client.get('/orders', { page: 2, status: 'completed' });
     */
    get(path, params) {
      return request(path + buildQuery(params));
    },

    /**
     * POST request with a JSON body.
     *
     * @param {string} path - Request path.
     * @param {*} [body] - Request body (will be JSON-stringified).
     * @returns {Promise<*>} Parsed JSON response.
     *
     * @example
     * await client.post('/orders/manual', { email: 'user@example.com', items: [...] });
     *
     * // POST with no body
     * await client.post('/orders/123/resend');
     */
    post(path, body) {
      const init = { method: 'POST' };
      if (body !== undefined) {
        init.body = JSON.stringify(body);
        init.headers = { 'Content-Type': 'application/json' };
      }
      return request(path, init);
    },

    /**
     * PUT request with a JSON body.
     *
     * @param {string} path - Request path.
     * @param {*} body - Request body (will be JSON-stringified).
     * @returns {Promise<*>} Parsed JSON response.
     *
     * @example
     * await client.put('/products/42/meta', { name: 'Updated Product' });
     */
    put(path, body) {
      return request(path, {
        method: 'PUT',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      });
    },

    /**
     * DELETE request.
     *
     * @param {string} path - Request path.
     * @returns {Promise<*>} Parsed JSON response.
     *
     * @example
     * await client.del('/products/42');
     */
    del(path) {
      return request(path, { method: 'DELETE' });
    },

    /**
     * Upload a file via multipart/form-data.
     *
     * Accepts a pre-built FormData object or a plain object of fields.
     * When given an object, each value is appended to a new FormData —
     * File/Blob values are appended as files, everything else as strings.
     *
     * Content-Type is intentionally omitted so the browser/runtime sets
     * the correct multipart boundary.
     *
     * @param {string} path - Request path.
     * @param {FormData|Object} data - Form fields to upload.
     * @returns {Promise<*>} Parsed JSON response.
     *
     * @example
     * // With a File object
     * await client.upload('/files/upload', { file: fileInput.files[0], priceId: '123' });
     *
     * // With pre-built FormData
     * const form = new FormData();
     * form.append('file', blob, 'photo.jpg');
     * await client.upload('/media/upload', form);
     */
    async upload(path, data) {
      let formData;
      if (data instanceof FormData) {
        formData = data;
      } else {
        formData = new FormData();
        for (const [key, value] of Object.entries(data)) {
          if (value == null) continue;
          if (value instanceof Blob || value instanceof File) {
            formData.append(key, value);
          } else {
            formData.append(key, String(value));
          }
        }
      }

      // Use send() directly with multipart flag to strip Content-Type
      // from defaults — lets the runtime set the correct boundary.
      const res = await send(baseUrl + path, {
        method: 'POST',
        body: formData,
        headers: mergeHeaders({}, true),
      });
      return res.json ? res.json() : res;
    },

    /**
     * Raw request — returns the Response object instead of parsed JSON.
     *
     * Useful for CSV exports, file downloads, or streaming responses.
     *
     * @param {string} path - Request path.
     * @param {Object} [init] - Fetch init overrides.
     * @returns {Promise<Response>} Raw fetch Response.
     *
     * @example
     * const res = await client.raw('/subscribers/export', { method: 'POST' });
     * const csv = await res.text();
     *
     * // With query params
     * const res = await client.raw('/payouts/export' + buildQuery({ status: 'paid' }), {
     *   method: 'POST',
     * });
     */
    raw(path, init) {
      return raw(path, init);
    },

    /**
     * Access the underlying request function for custom calls.
     *
     * @param {string} path - Request path.
     * @param {Object} [init] - Fetch init overrides.
     * @returns {Promise<*>} Parsed JSON response.
     */
    request(path, init) {
      return request(path, init);
    },

    /** The base URL this client is bound to. */
    baseUrl,
  };
}
