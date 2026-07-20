import { createHmac, randomUUID } from "node:crypto";
import { logger } from "./logger";

/**
 * Signed domain-event stream.
 *
 * Per the build plan, Sales/CRM is a *separate* product; the LMS owes it only a
 * signed event stream (not a shared database). Every significant domain action
 * (signup, enrollment, payment, course completion, …) emits an event here,
 * HMAC-signed with EVENT_SIGNING_SECRET so the consumer can verify authenticity.
 *
 * The transport is intentionally pluggable: today events are logged (and can be
 * persisted to an outbox table in Step 2); later the same envelope is POSTed to
 * the CRM webhook or pushed onto a queue — no call sites change.
 */
export type DomainEventType =
  | "user.registered"
  | "user.verified"
  | "enrollment.created"
  | "payment.captured"
  | "payment.failed"
  | "course.completed"
  | "certificate.issued"
  | "live_class.started";

export interface DomainEvent<TPayload = Record<string, unknown>> {
  id: string;
  type: DomainEventType;
  occurredAt: string; // ISO-8601
  payload: TPayload;
}

export interface SignedEnvelope<TPayload = Record<string, unknown>> {
  event: DomainEvent<TPayload>;
  signature: string; // hex HMAC-SHA256 of the canonical event JSON
}

export function signEvent<TPayload>(
  event: DomainEvent<TPayload>,
): SignedEnvelope<TPayload> {
  const secret = process.env.EVENT_SIGNING_SECRET;
  const canonical = JSON.stringify(event);
  const signature = secret
    ? createHmac("sha256", secret).update(canonical).digest("hex")
    : "unsigned";
  return { event, signature };
}

export function verifyEventSignature(envelope: SignedEnvelope): boolean {
  const secret = process.env.EVENT_SIGNING_SECRET;
  if (!secret) return false;
  const expected = createHmac("sha256", secret)
    .update(JSON.stringify(envelope.event))
    .digest("hex");
  return expected === envelope.signature;
}

/** Pluggable sink. Swap for an outbox writer / HTTP push / queue producer. */
type EventSink = (envelope: SignedEnvelope) => Promise<void> | void;

const defaultSink: EventSink = (envelope) => {
  logger.info("domain.event", {
    type: envelope.event.type,
    id: envelope.event.id,
  });
};

let sink: EventSink = defaultSink;

export function setEventSink(next: EventSink): void {
  sink = next;
}

export async function emitEvent<TPayload>(
  type: DomainEventType,
  payload: TPayload,
): Promise<SignedEnvelope<TPayload>> {
  const event: DomainEvent<TPayload> = {
    id: randomUUID(),
    type,
    occurredAt: new Date().toISOString(),
    payload: payload as TPayload,
  };
  const envelope = signEvent(event);
  await sink(envelope as SignedEnvelope);
  return envelope;
}
