import { createHmac, timingSafeEqual } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { homeLeads, homePaymentEvents } from '../db/schema.js'
import { applyEntitlementChangeInTransaction, type EntitlementStatus } from './home-entitlement.js'

const PAYMENT_EVENT_TYPES = [
  'subscription.active',
  'subscription.past_due',
  'subscription.canceled',
  'subscription.expired',
  'subscription.revoked',
] as const

type PaymentEventType = typeof PAYMENT_EVENT_TYPES[number]

interface PaymentWebhookBody {
  provider: string
  eventId: string
  leadId: string
  eventType: PaymentEventType
  currentPeriodEnd?: string | null
  providerRef?: string | null
}

const EVENT_TO_STATUS: Record<PaymentEventType, EntitlementStatus> = {
  'subscription.active': 'active',
  'subscription.past_due': 'past_due',
  'subscription.canceled': 'canceled',
  'subscription.expired': 'expired',
  'subscription.revoked': 'revoked',
}

export function canonicalPaymentWebhookMessage(body: PaymentWebhookBody): string {
  return [
    body.provider,
    body.eventId,
    body.leadId,
    body.eventType,
    body.currentPeriodEnd ?? '',
    body.providerRef ?? '',
  ].join('\n')
}

export function createPaymentWebhookSignature(body: PaymentWebhookBody, secret: string): string {
  const digest = createHmac('sha256', secret).update(canonicalPaymentWebhookMessage(body)).digest('hex')
  return `sha256=${digest}`
}

export function verifyPaymentWebhookSignature(body: PaymentWebhookBody, secret: string, header: unknown): boolean {
  if (typeof header !== 'string') return false
  const signature = header.startsWith('sha256=') ? header.slice('sha256='.length) : header
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false

  const expected = Buffer.from(createPaymentWebhookSignature(body, secret).slice('sha256='.length), 'hex')
  const actual = Buffer.from(signature, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

function parsePeriodEnd(raw: string | null | undefined): Date | null {
  if (raw == null) return null
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) throw new Error('Невірна дата кінця періоду')
  return date
}

export async function homePaymentWebhookRoutes(app: FastifyInstance) {
  app.post<{ Body: PaymentWebhookBody }>('/payment/webhook', {
    schema: {
      body: {
        type: 'object',
        required: ['provider', 'eventId', 'leadId', 'eventType'],
        additionalProperties: false,
        properties: {
          // Без пробільних символів: канонічний рядок підпису зʼєднує поля
          // через \n, тож \n усередині значення дозволив би пересунути межі
          // полів без зміни підпису (нова пара provider+eventId → обхід
          // ідемпотентності → replay старої події).
          provider: { type: 'string', minLength: 1, maxLength: 80, pattern: '^\\S+$' },
          eventId: { type: 'string', minLength: 1, maxLength: 160, pattern: '^\\S+$' },
          leadId: { type: 'string', format: 'uuid' },
          eventType: { type: 'string', enum: [...PAYMENT_EVENT_TYPES] },
          currentPeriodEnd: { oneOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }] },
          providerRef: { oneOf: [{ type: 'string', maxLength: 160, pattern: '^\\S+$' }, { type: 'null' }] },
        },
      },
    },
  }, async (req, reply) => {
    const secret = process.env.HOME_PAYMENT_WEBHOOK_SECRET
    if (!secret) {
      return reply.code(503).send({ error: 'Платіжний webhook не налаштовано' })
    }

    if (!verifyPaymentWebhookSignature(req.body, secret, req.headers['x-rozumko-payment-signature'])) {
      return reply.code(401).send({ error: 'Невірний підпис webhook' })
    }

    const [lead] = await db
      .select({ id: homeLeads.id })
      .from(homeLeads)
      .where(eq(homeLeads.id, req.body.leadId))
      .limit(1)
    if (!lead) return reply.code(404).send({ error: 'Лід не знайдено' })

    const status = EVENT_TO_STATUS[req.body.eventType]
    let currentPeriodEnd: Date | null
    try {
      currentPeriodEnd = parsePeriodEnd(req.body.currentPeriodEnd)
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }

    try {
      const result = await db.transaction(async (tx) => {
        const [inserted] = await tx.insert(homePaymentEvents)
          .values({
            provider: req.body.provider,
            providerEventId: req.body.eventId,
            leadId: lead.id,
            eventType: req.body.eventType,
            providerRef: req.body.providerRef ?? null,
            payload: req.body,
          })
          .onConflictDoNothing()
          .returning({ id: homePaymentEvents.id })

        if (!inserted) return { duplicate: true as const, entitlement: null }

        const entitlement = await applyEntitlementChangeInTransaction(tx, lead.id, {
          status,
          currentPeriodEnd,
          providerRef: req.body.providerRef ?? null,
          reason: `payment:${req.body.provider}:${req.body.eventId}`,
        }, 'provider')

        return { duplicate: false as const, entitlement }
      })

      return reply.send({ ok: true, duplicate: result.duplicate, entitlement: result.entitlement })
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }
  })
}
