import type { Offer, Product } from '@ftu/shared';

// A ticket type has one purchase control. The API still owns phase, stock and prices.
export function currentTicketProducts(offer: Offer): Product[] {
  const groups = new Map<string, Product[]>();
  for (const product of offer.products) {
    const group = groups.get(product.name) ?? [];
    group.push(product);
    groups.set(product.name, group);
  }
  return Array.from(groups.values(), (products) => {
    const early = products.find((p) => p.tier === 'EARLY');
    const normal = products.find((p) => p.tier === 'NORMAL');
    if (offer.phase === 'NORMAL' || offer.phase === 'CLOSED') return normal ?? early!;
    if (offer.phase === 'EARLY') return early ?? normal!;
    if (offer.phase === 'UPCOMING')
      return offer.early_quota === 0 ? (normal ?? early!) : (early ?? normal!);
    // Legacy/DEMO configurations have per-product windows instead of an offer phase.
    return (
      products.find((p) => p.tier === 'EARLY' && p.state === 'OPEN') ??
      products.find((p) => p.state === 'OPEN') ??
      products.find((p) => p.state === 'SOLD_OUT') ??
      products.find((p) => p.state === 'UPCOMING') ??
      normal ??
      products[0]
    );
  });
}
