import { useState, useCallback } from "react";

const TIMEOUT_MS = 60_000;

export interface CallState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

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
        let message = "Something went wrong. Please try again.";
        if (controller.signal.aborted) {
          message = "Request timed out after 60 seconds. Try again.";
        } else if (err && typeof err === "object" && "message" in err) {
          const raw = String((err as { message: unknown }).message);
          if (raw.toLowerCase().includes("rate") && raw.includes("limit")) {
            message =
              "Hit the AI rate limit. Wait a moment and try again.";
          } else if (raw.toLowerCase().includes("429")) {
            message =
              "Too many requests right now. Wait a moment and try again.";
          } else if (raw) {
            message = raw;
          }
        }
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

export function postJson<TBody, TResp>(path: string) {
  return async (body: TBody, signal: AbortSignal): Promise<TResp> => {
    const base = import.meta.env.BASE_URL || "/";
    const url = `${base}api${path}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) {
      let detail = `${res.status} ${res.statusText}`;
      try {
        const data = (await res.json()) as { error?: string };
        if (data?.error) detail = data.error;
      } catch {
        // ignore
      }
      throw new Error(detail);
    }
    return (await res.json()) as TResp;
  };
}
