import { useEffect } from 'react';
import { formatBdt, getEffectiveProductPriceBdt, type Product } from './commerce';

export interface PageSeoOptions {
  title: string;
  description: string;
  canonicalPath?: string;
  robots?: 'index, follow' | 'noindex, nofollow';
  ogType?: 'website' | 'product';
  productJsonLd?: Product | null;
}

function upsertMetaTag(
  selector: string,
  attrName: 'name' | 'property',
  attrValue: string,
  content: string
): void {
  if (typeof document === 'undefined') return;
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attrName, attrValue);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertCanonicalLink(href: string): void {
  if (typeof document === 'undefined') return;
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    document.head.appendChild(link);
  }
  link.setAttribute('href', href);
}

function upsertProductJsonLd(product: Product | null | undefined, canonicalUrl: string): void {
  if (typeof document === 'undefined') return;
  const scriptId = 'jv-dynamic-product-jsonld';
  const existing = document.getElementById(scriptId);
  if (!product) {
    if (existing) existing.remove();
    return;
  }

  const totalStock = product.variants.reduce(
    (acc, v) => acc + (v.isActive ? v.stock : 0),
    0
  );
  const effectivePriceBdt = getEffectiveProductPriceBdt(product);
  const primarySku =
    product.variants.find((v) => v.isActive)?.sku || `JV-${product.id.toUpperCase()}`;

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    sku: primarySku,
    description: `${product.description} (${product.editionTier} — Unofficial supporter replica apparel, priced in BDT ${formatBdt(effectivePriceBdt)}).`,
    brand: {
      '@type': 'Brand',
      name: 'Jersey Valley'
    },
    category: `${product.category} football jersey (${product.editionTier})`,
    offers: {
      '@type': 'Offer',
      url: canonicalUrl,
      priceCurrency: 'BDT',
      price: String(effectivePriceBdt),
      availability:
        totalStock > 0
          ? 'https://schema.org/InStock'
          : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition'
    }
  };

  let scriptEl = existing as HTMLScriptElement | null;
  if (!scriptEl) {
    scriptEl = document.createElement('script');
    scriptEl.id = scriptId;
    scriptEl.type = 'application/ld+json';
    document.head.appendChild(scriptEl);
  }
  scriptEl.textContent = JSON.stringify(schema);
}

export function usePageSeo({
  title,
  description,
  canonicalPath,
  robots = 'index, follow',
  ogType = 'website',
  productJsonLd = null
}: PageSeoOptions): void {
  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;

    document.title = title;

    const origin = window.location.origin || 'https://jerseyvalley.com.bd';
    const path = canonicalPath ?? window.location.pathname;
    const canonicalUrl = `${origin}${path.startsWith('/') ? path : `/${path}`}`;

    upsertMetaTag('meta[name="description"]', 'name', 'description', description);
    upsertMetaTag('meta[name="robots"]', 'name', 'robots', robots);
    upsertMetaTag('meta[property="og:title"]', 'property', 'og:title', title);
    upsertMetaTag('meta[property="og:description"]', 'property', 'og:description', description);
    upsertMetaTag('meta[property="og:type"]', 'property', 'og:type', ogType);
    upsertMetaTag('meta[property="og:url"]', 'property', 'og:url', canonicalUrl);
    upsertMetaTag('meta[name="twitter:title"]', 'name', 'twitter:title', title);
    upsertMetaTag('meta[name="twitter:description"]', 'name', 'twitter:description', description);
    upsertCanonicalLink(canonicalUrl);
    upsertProductJsonLd(productJsonLd, canonicalUrl);

    return () => {
      if (productJsonLd) {
        upsertProductJsonLd(null, canonicalUrl);
      }
    };
  }, [title, description, canonicalPath, robots, ogType, productJsonLd]);
}
