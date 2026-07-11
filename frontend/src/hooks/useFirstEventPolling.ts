import { useCallback, useEffect, useRef, useState } from "react";
import { requestJson } from "../api/client";
import type { EventRecord } from "../workspace/types";

export type FirstEventPollingStatus =
  | "checking"
  | "connected"
  | "retrying"
  | "waiting";

type FirstEventProbe = () => Promise<EventRecord[]>;

const defaultProbe: FirstEventProbe = async () => {
  return requestJson<EventRecord[]>("/api/events?limit=100", {}, {
    errorMessage: "Collector status could not be checked",
  });
};

export function firstMatchingEvent(
  events: EventRecord[],
  eventFilter?: (event: EventRecord) => boolean,
) {
  return events.find((event) => eventFilter?.(event) ?? true) ?? null;
}

export function useFirstEventPolling({
  enabled = true,
  eventFilter,
  intervalMs = 3000,
  onFirstEvent,
  probe = defaultProbe,
  waitForNewEvent = false,
}: {
  enabled?: boolean;
  eventFilter?: (event: EventRecord) => boolean;
  intervalMs?: number;
  onFirstEvent?: (event: EventRecord) => void;
  probe?: FirstEventProbe;
  waitForNewEvent?: boolean;
} = {}) {
  const [status, setStatus] = useState<FirstEventPollingStatus>("checking");
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  const checkingRef = useRef(false);
  const detectedRef = useRef(false);
  const baselineEventIdRef = useRef<string | null | undefined>(undefined);
  const onFirstEventRef = useRef(onFirstEvent);
  const probeRef = useRef(probe);
  const eventFilterRef = useRef(eventFilter);

  useEffect(() => {
    onFirstEventRef.current = onFirstEvent;
  }, [onFirstEvent]);

  useEffect(() => {
    probeRef.current = probe;
  }, [probe]);

  useEffect(() => {
    eventFilterRef.current = eventFilter;
  }, [eventFilter]);

  const checkNow = useCallback(async () => {
    if (!enabled || checkingRef.current || detectedRef.current) {
      return;
    }

    checkingRef.current = true;
    setStatus((current) => (current === "waiting" ? current : "checking"));
    try {
      const events = await probeRef.current();
      const firstEvent = firstMatchingEvent(events, eventFilterRef.current);
      setLastCheckedAt(new Date());
      if (waitForNewEvent && baselineEventIdRef.current === undefined) {
        baselineEventIdRef.current = firstEvent?.id ?? null;
        setStatus("waiting");
        return;
      }
      if (firstEvent) {
        if (waitForNewEvent && firstEvent.id === baselineEventIdRef.current) {
          setStatus("waiting");
          return;
        }
        detectedRef.current = true;
        setStatus("connected");
        onFirstEventRef.current?.(firstEvent);
      } else {
        setStatus("waiting");
      }
    } catch {
      setLastCheckedAt(new Date());
      setStatus("retrying");
    } finally {
      checkingRef.current = false;
    }
  }, [enabled, waitForNewEvent]);

  useEffect(() => {
    if (!enabled) {
      setStatus("waiting");
      return;
    }

    void checkNow();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void checkNow();
      }
    }, Math.max(intervalMs, 1000));

    return () => window.clearInterval(interval);
  }, [checkNow, enabled, intervalMs]);

  return { checkNow, lastCheckedAt, status };
}
