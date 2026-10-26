import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { INITIAL_CATALOG } from '../data/catalog';

const PRODUCTS_DIR = path.resolve(process.cwd(), 'public/images/products');

test('Responsive Images: all 10 catalog products have generated responsive assets', () => {
  assert.equal(INITIAL_CATALOG.length, 10);

  const widths = [400, 800, 1024];
  const formats = ['avif', 'webp', 'jpg'];

  for (const product of INITIAL_CATALOG) {
    assert.ok(product.primaryImage, `Product ${product.id} must have a primaryImage`);
    assert.ok(product.responsiveImageBase, `Product ${product.id} must have responsiveImageBase`);

    // Verify canonical jpg fallback exists
    const canonicalPath = path.join(PRODUCTS_DIR, `${product.id}.jpg`);
    assert.ok(fs.existsSync(canonicalPath), `Missing canonical image: ${canonicalPath}`);

    // Verify all widths in AVIF, WebP, and JPG exist
    for (const w of widths) {
      for (const fmt of formats) {
        const variantPath = path.join(PRODUCTS_DIR, `${product.id}-${w}w.${fmt}`);
        assert.ok(
          fs.existsSync(variantPath),
          `Missing responsive variant: ${product.id}-${w}w.${fmt}`
        );
        const stat = fs.statSync(variantPath);
        assert.ok(stat.size > 1000, `Variant ${variantPath} should have substantial file size`);
      }
    }
  }
});

test('Responsive Images: formats achieve efficient web payload size (< 150KB)', () => {
  for (const product of INITIAL_CATALOG) {
    const avifStat = fs.statSync(path.join(PRODUCTS_DIR, `${product.id}-800w.avif`));
    const webpStat = fs.statSync(path.join(PRODUCTS_DIR, `${product.id}-800w.webp`));
    const jpgStat = fs.statSync(path.join(PRODUCTS_DIR, `${product.id}-800w.jpg`));

    assert.ok(avifStat.size < 150000, `AVIF (${avifStat.size}B) should be < 150KB for ${product.id}`);
    assert.ok(webpStat.size < 150000, `WebP (${webpStat.size}B) should be < 150KB for ${product.id}`);
    assert.ok(jpgStat.size < 200000, `JPG (${jpgStat.size}B) should be < 200KB for ${product.id}`);
  }
});
