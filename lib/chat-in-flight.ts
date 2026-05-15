"use client"

import { useMemo, useSyncExternalStore } from "react"

let inFlight = new Set<string>()
const listeners = new Set<() => void>()

function snapshot(): string {
  if (inFlight.size === 0) return ""
  return [...inFlight].sort().join("|")
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function setChatSessionSending(sessionId: string, sending: boolean): void {
  const next = new Set(inFlight)
  if (sending) next.add(sessionId)
  else next.delete(sessionId)
  const before = snapshot()
  inFlight = next
  if (snapshot() !== before) {
    for (const l of listeners) l()
  }
}

export function isChatSessionSending(sessionId: string): boolean {
  return inFlight.has(sessionId)
}

/** Subscribe to which sessions have an in-flight `/api/chat` request. */
export function useChatInFlightSnapshot(): string {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

export function useIsChatSessionSending(sessionId: string | null): boolean {
  const snap = useChatInFlightSnapshot()
  return useMemo(() => {
    if (!sessionId) return false
    if (snap === "") return false
    return snap.split("|").includes(sessionId)
  }, [sessionId, snap])
}
