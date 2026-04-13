/**
 * @arraypress/api-client — TypeScript definitions.
 */

/**
 * Error thrown when an API request fails.
 *
 * Extends Error with HTTP status, status text, and the
 * parsed error body (if the server returned JSON).
 */
export declare class ApiError extends Error {
  /** HTTP status code. */
  status: number;
  /** HTTP status text. */
  statusText: string;
  /** Parsed response body (if available). */
  body: any;
  constructor(message: string, status: number, statusText: string, body?: any);
}

/**
 * Build a URL query string from a params object.
 *
 * Filters out `null`, `undefined`, and empty-string values.
 * Returns an empty string when no params remain.
 */
export declare function buildQuery(params?: Record<string, any>): string;

/** Options for `createClient`. */
export interface ClientOptions {
  /** Default headers merged into every request. */
  headers?: Record<string, string>;
  /** Custom error handler. Called with (ApiError) before throwing. Return a value to suppress the throw. */
  onError?: (error: ApiError) => any;
  /** Intercept the request before it is sent. Receives (url, init) and may return modified init. */
  onRequest?: (url: string, init: RequestInit) => RequestInit | void | Promise<RequestInit | void>;
  /** Intercept the response after it is received. Receives (response, url). Runs before error handling. */
  onResponse?: (response: Response, url: string) => void | Promise<void>;
}

/** API client instance returned by `createClient`. */
export interface ApiClient {
  /** GET request. Params are appended as a query string. */
  get<T = any>(path: string, params?: Record<string, any>): Promise<T>;
  /** POST request with an optional JSON body. */
  post<T = any>(path: string, body?: any): Promise<T>;
  /** PUT request with a JSON body. */
  put<T = any>(path: string, body: any): Promise<T>;
  /** DELETE request. */
  del<T = any>(path: string): Promise<T>;
  /** Upload a file via multipart/form-data. */
  upload<T = any>(path: string, data: FormData | Record<string, any>): Promise<T>;
  /** Raw request — returns the Response object instead of parsed JSON. */
  raw(path: string, init?: RequestInit): Promise<Response>;
  /** Access the underlying request function for custom calls. */
  request<T = any>(path: string, init?: RequestInit): Promise<T>;
  /** The base URL this client is bound to. */
  baseUrl: string;
}

/**
 * Create an API client bound to a base URL.
 *
 * The client provides `get`, `post`, `put`, `del`, `upload`, and `raw`
 * methods that all share the same base URL, default headers, and error
 * handling behaviour.
 */
export declare function createClient(baseUrl: string, options?: ClientOptions): ApiClient;
