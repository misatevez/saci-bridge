import { logger } from '../logger.js';
import type { TransformResult, SkipResult, HandlerResult, HandlerDeps } from './types.js';

const SYNCABLE_STATUSES = new Set(['Approved', 'Converted']);

export interface QuotePayload {
  id: string;
  name?: string;
  quote_num?: string;
  stage?: string;
  approval_status?: string;
  event_type?: 'create' | 'update' | 'delete';
  date_quote_expected_closed?: string;
  date_entered?: string;
  billing_account_id?: string;
  billing_contact_id?: string;
  subtotal_amount?: number | string;
  discount_amount?: number | string;
  tax_amount?: number | string;
  total_amount?: number | string;
  currency_id?: string;
  description?: string;
  // Legacy fields retained for backward compatibility
  billing_account_name?: string;
  billing_contact_first_name?: string;
  billing_contact_last_name?: string;
  billing_address_street?: string;
  billing_address_city?: string;
  billing_address_country?: string;
  billing_contact_email?: string;
  billing_contact_phone?: string;
  identification_type?: string;
  identification?: string;
  line_items?: Array<{
    sku?: string;
    product_id?: string;
    name: string;
    quantity: number | string;
    unit_price: number | string;
    total_amount?: number | string;
  }>;
}

interface FirmasLineItem {
  id: string;
  name: string;
  product_id: string | null;
  quantity: number;
  unit_price: number;
  total_amount: number;
  currency_id: string | null;
}

function buildHeaderAttributes(payload: QuotePayload): Record<string, unknown> {
  return {
    name: payload.name ?? payload.quote_num ?? `Quote-${payload.id}`,
    quote_stage: payload.stage ?? 'Draft',
    date_quote_expected_closed:
      payload.date_quote_expected_closed ??
      payload.date_entered ??
      new Date().toISOString().slice(0, 10),
    subtotal_amount: Number(payload.subtotal_amount ?? 0) || 0,
    discount_amount: Number(payload.discount_amount ?? 0) || 0,
    shipping_amount: 0,
    tax_amount: Number(payload.tax_amount ?? 0) || 0,
    grand_total_amount: Number(payload.total_amount ?? 0) || 0,
    currency_id: payload.currency_id ?? '-99',
    description: payload.description ?? '',
  };
}

async function resolveRelationships(
  payload: QuotePayload,
  deps: HandlerDeps,
): Promise<{ saciAccountId: string | null; saciContactId: string | null }> {
  let saciAccountId: string | null = null;
  let saciContactId: string | null = null;

  if (payload.billing_account_id) {
    saciAccountId = await deps.getSaciId('Accounts', payload.billing_account_id).catch(() => null);
    if (!saciAccountId) {
      logger.warn(
        { recordId: payload.id, billing_account_id: payload.billing_account_id },
        '[QUOTES][WARN] unresolved billing_account_id — creating quote without account link',
      );
    }
  }

  if (payload.billing_contact_id) {
    saciContactId = await deps.getSaciId('Contacts', payload.billing_contact_id).catch(() => null);
    if (!saciContactId) {
      logger.warn(
        { recordId: payload.id, billing_contact_id: payload.billing_contact_id },
        '[QUOTES][WARN] unresolved billing_contact_id — creating quote without contact link',
      );
    }
  }

  return { saciAccountId, saciContactId };
}

async function softDeleteLineItems(
  firmasQuoteId: string,
  saciQuoteId: string,
  outboxId: string,
  deps: HandlerDeps,
): Promise<void> {
  let rows: Array<{ id: string }> = [];
  try {
    rows = await deps.queryFirmas<{ id: string }>(
      'SELECT id FROM aos_products_quotes WHERE parent_type = ? AND parent_id = ?',
      ['AOS_Quotes', firmasQuoteId],
    );
  } catch (err) {
    logger.warn({ saciQuoteId, err }, '[QUOTES][WARN] Failed to query line item IDs for soft-delete');
    return;
  }

  for (const row of rows) {
    const saciLineId = await deps.getSaciId('AOS_Products_Quotes', row.id).catch(() => null);
    if (!saciLineId) continue;
    const outcome = await deps.callSaci(outboxId, 'PATCH', `/module/AOS_Products_Quotes/${saciLineId}`, {
      data: { type: 'AOS_Products_Quotes', id: saciLineId, attributes: { deleted: 1 } },
    });
    if (!outcome.ok) {
      logger.warn({ saciLineId }, '[QUOTES][WARN] Failed to soft-delete line item in SaciERP');
    }
  }
}

async function syncLineItems(
  firmasQuoteId: string,
  saciQuoteId: string,
  outboxId: string,
  deps: HandlerDeps,
): Promise<void> {
  let lineItems: FirmasLineItem[] = [];
  try {
    lineItems = await deps.queryFirmas<FirmasLineItem>(
      'SELECT id, name, product_id, quantity, unit_price, total_amount, currency_id FROM aos_products_quotes WHERE parent_type = ? AND parent_id = ? AND deleted = 0',
      ['AOS_Quotes', firmasQuoteId],
    );
  } catch (err) {
    logger.warn({ firmasQuoteId, err }, '[QUOTES][WARN] Failed to query line items — syncing header only');
    return;
  }

  if (lineItems.length === 0) {
    logger.info({ firmasQuoteId }, '[QUOTES] No line items to sync');
    return;
  }

  for (const item of lineItems) {
    const saciProductId = item.product_id
      ? await deps.getSaciId('AOS_Products', item.product_id).catch(() => null)
      : null;

    if (!saciProductId && item.product_id) {
      logger.warn(
        { firmasQuoteId, product_id: item.product_id },
        '[QUOTES][WARN] unresolved product_id — creating line item without product link',
      );
    }

    const lineAttrs: Record<string, unknown> = {
      name: item.name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total_amount: item.total_amount,
      parent_type: 'AOS_Quotes',
      parent_id: saciQuoteId,
      currency_id: item.currency_id ?? '-99',
    };
    if (saciProductId) lineAttrs['product_id'] = saciProductId;

    const outcome = await deps.callSaci(outboxId, 'POST', '/module', {
      data: { type: 'AOS_Products_Quotes', attributes: lineAttrs },
    });

    if (outcome.ok) {
      const body = outcome.body as { data?: { id?: string } } | undefined;
      const saciLineId = body?.data?.id;
      if (saciLineId) {
        await deps.upsertMapping('AOS_Products_Quotes', item.id, saciLineId).catch(() => undefined);
      }
    } else {
      logger.warn(
        { saciQuoteId, itemId: item.id, status: outcome.status },
        '[QUOTES][WARN] Failed to create line item in SaciERP — skipping',
      );
    }
  }
}

function makeHandler(payload: QuotePayload, saciId: string | null) {
  return async (outboxId: string, deps: HandlerDeps): Promise<{ ok: boolean }> => {
    const eventType = payload.event_type;

    // DELETE
    if (eventType === 'delete') {
      if (!saciId) {
        logger.warn({ recordId: payload.id }, '[QUOTES] Delete event but no saciId — nothing to do');
        return { ok: true };
      }
      const outcome = await deps.callSaci(outboxId, 'PATCH', `/module/AOS_Quotes/${saciId}`, {
        data: { type: 'AOS_Quotes', id: saciId, attributes: { deleted: 1 } },
      });
      if (!outcome.ok) {
        logger.error({ saciId, status: outcome.status }, '[QUOTES] Failed to soft-delete quote header');
        return { ok: false };
      }
      await softDeleteLineItems(payload.id, saciId, outboxId, deps);
      return { ok: true };
    }

    // Resolve Account/Contact relationships
    const { saciAccountId, saciContactId } = await resolveRelationships(payload, deps);

    const attributes = buildHeaderAttributes(payload);
    if (saciAccountId) attributes['billing_account_id'] = saciAccountId;
    if (saciContactId) attributes['billing_contact_id'] = saciContactId;

    let currentSaciId = saciId;

    if (!currentSaciId) {
      // CREATE
      const outcome = await deps.callSaci(outboxId, 'POST', '/module', {
        data: { type: 'AOS_Quotes', attributes },
      });
      if (!outcome.ok) {
        logger.error({ recordId: payload.id, status: outcome.status }, '[QUOTES] Failed to create quote header');
        return { ok: false };
      }
      const body = outcome.body as { data?: { id?: string } } | undefined;
      currentSaciId = body?.data?.id ?? null;
      if (currentSaciId) {
        await deps.upsertMapping('AOS_Quotes', payload.id, currentSaciId).catch(() => undefined);
      }
    } else {
      // UPDATE: patch header then reconcile line items
      const outcome = await deps.callSaci(outboxId, 'PATCH', `/module/AOS_Quotes/${currentSaciId}`, {
        data: { type: 'AOS_Quotes', id: currentSaciId, attributes },
      });
      if (!outcome.ok) {
        logger.error({ recordId: payload.id, saciId: currentSaciId }, '[QUOTES] Failed to update quote header');
        return { ok: false };
      }
      await softDeleteLineItems(payload.id, currentSaciId, outboxId, deps);
    }

    if (currentSaciId) {
      await syncLineItems(payload.id, currentSaciId, outboxId, deps);
    }

    return { ok: true };
  };
}

export function transformQuote(payload: QuotePayload, saciId?: string | null): TransformResult {
  const eventType = payload.event_type;
  const approvalStatus = payload.approval_status ?? '';
  const stage = payload.stage ?? '';

  if (eventType !== 'delete' && !SYNCABLE_STATUSES.has(approvalStatus) && stage !== 'Converted') {
    return {
      skip: true,
      reason: `approval_status=${approvalStatus || 'none'}, stage=${stage || 'none'}`,
    } satisfies SkipResult;
  }

  return { handle: makeHandler(payload, saciId ?? null) } satisfies HandlerResult;
}
