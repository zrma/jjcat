import { useCallback, useEffect, useReducer } from "react";

export const TRANSIENT_NOTICE_DURATION_MS = 4_000;

export interface TransientNoticeState {
  sequence: number;
  message: string | null;
}

export type TransientNoticeEvent =
  | { type: "show"; message: string }
  | { type: "expire"; sequence: number };

export const INITIAL_TRANSIENT_NOTICE_STATE: TransientNoticeState = {
  sequence: 0,
  message: null,
};

export function reduceTransientNotice(
  state: TransientNoticeState,
  event: TransientNoticeEvent,
): TransientNoticeState {
  if (event.type === "show") {
    return {
      sequence: state.sequence + 1,
      message: event.message,
    };
  }
  if (event.sequence !== state.sequence) {
    return state;
  }
  return {
    ...state,
    message: null,
  };
}

export function useTransientNotice(
  durationMs: number = TRANSIENT_NOTICE_DURATION_MS,
) {
  const [state, dispatch] = useReducer(
    reduceTransientNotice,
    INITIAL_TRANSIENT_NOTICE_STATE,
  );

  useEffect(() => {
    if (state.message === null) return;
    const timer = window.setTimeout(() => {
      dispatch({ type: "expire", sequence: state.sequence });
    }, durationMs);
    return () => window.clearTimeout(timer);
  }, [durationMs, state.message, state.sequence]);

  const showNotice = useCallback((message: string) => {
    dispatch({ type: "show", message });
  }, []);

  return [state.message, showNotice] as const;
}
