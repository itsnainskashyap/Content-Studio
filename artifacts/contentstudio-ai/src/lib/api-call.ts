import { useCallback, useState } from "react";

const TIMEOUT_MS = 60_000;

export interface CallState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

function normalizeError(err: unknown, aborted: boolean): string {
  if (aborted) return "Request timed out after 60 seconds. Please try again.";
  if (err && typeof err === "object" && "message" in err) {
    const raw = String((err as { message: unknown }).message);
    const lower = raw.toLowerCase();
    if (lower.includes("rate") && lower.includes("limit")) {
      return "Hit the AI rate limit. Please wait 30 seconds and try again.";
    }
    if (lower.includes("429")) {
      return "Too many requests right now. Please wait 30 seconds and try again.";
    }
    if (raw) return raw;
  }
  return "Something went wrong. Please try again.";
}

/**
 * Wraps an async API mutation (typically from generated react-query hooks
 * via mutateAsync, or any (args, signal) => Promise<T> function) with:
 *  - 60s AbortController timeout
 *  - normalized error messages with rate-limit text
 *  - inline retry support via an idempotent run() call.
 */
export function useApiCall<TArgs, TResult>(
  fn: (args: TArgs, signal: AbortSignal) => Promise<TResult>,
) {
  const [state, setState] = useState<CallState<TResult>>({
    data: null,
    loading: false,
    error: null,
  });

  const run = useCallback(
    async (args: TArgs): Promise<TResult | null> => {
      setState({ data: null, loading: true, error: null });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const result = await fn(args, controller.signal);
        clearTimeout(timer);
        setState({ data: result, loading: false, error: null });
        return result;
      } catch (err) {
        clearTimeout(timer);
        const message = normalizeError(err, controller.signal.aborted);
        setState({ data: null, loading: false, error: message });
        return null;
      }
    },
    [fn],
  );

  const reset = useCallback(() => {
    setState({ data: null, loading: false, error: null });
  }, []);

  const setData = useCallback((data: TResult | null) => {
    setState({ data, loading: false, error: null });
  }, []);

  return { ...state, run, reset, setData };
}

/**
 * Adapter: converts a react-query mutation hook (like useGenerateStory)
 * into a (body, signal) => Promise<TResult> function that useApiCall expects.
 *
 * The generated hooks accept a `signal` via mutationOptions; we pass it
 * through so the AbortController properly cancels in-flight requests.
 */
export function mutationCaller<TBody, TResult>(
  mutateAsync: (variables: {
    data: TBody;
    signal?: AbortSignal;
  }) => Promise<TResult>,
) {
  return (body: TBody, signal: AbortSignal) =>
    mutateAsync({ data: body, signal });
}
