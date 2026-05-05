import type { OutboxModule } from '../db/outbox.js';
import type { TransformResult } from './types.js';
import { transformAccount } from './account.js';
import { transformContact } from './contact.js';
import { transformQuote } from './quote.js';
import { transformProduct } from './product.js';

export type { TransformResult } from './types.js';

export function transform(
  module: OutboxModule,
  payloadJson: string,
  saciId?: string | null,
): TransformResult {
  const payload = JSON.parse(payloadJson) as Record<string, unknown>;

  switch (module) {
    case 'Accounts':
      return transformAccount(
        payload as unknown as Parameters<typeof transformAccount>[0],
        saciId,
      );
    case 'Contacts':
      return transformContact(payload as unknown as Parameters<typeof transformContact>[0], saciId);
    case 'AOS_Quotes':
      return transformQuote(payload as unknown as Parameters<typeof transformQuote>[0]);
    case 'AOS_Products':
      return transformProduct(payload as unknown as Parameters<typeof transformProduct>[0]);
    default: {
      const _exhaustive: never = module;
      throw new Error(`Unknown module: ${_exhaustive}`);
    }
  }
}
