import test from 'node:test';
import assert from 'node:assert/strict';
import {
  $cart,
  $cartCount,
  $cartSubtotalBdt,
  addToCartIsland,
  updateCartQuantityIsland,
  removeFromCartIsland,
  clearCartIsland
} from './cartStore';
import { INITIAL_CATALOG } from '../../data/catalog';

test('Astro Island Cart Store: initializes empty and clears correctly', () => {
  clearCartIsland();
  assert.equal($cart.get().length, 0);
  assert.equal($cartCount.get(), 0);
  assert.equal($cartSubtotalBdt.get(), 0);
});

test('Astro Island Cart Store: adds valid jersey to cart with reactivity', () => {
  clearCartIsland();
  const product = INITIAL_CATALOG[0]; // Real catalog item
  const res = addToCartIsland({
    product,
    size: 'L',
    quantity: 1
  });

  assert.equal(res.ok, true);
  assert.equal($cart.get().length, 1);
  assert.equal($cartCount.get(), 1);
  assert.equal($cart.get()[0].productId, product.id);
  assert.equal($cart.get()[0].size, 'L');
  assert.ok($cartSubtotalBdt.get() > 0);
});

test('Astro Island Cart Store: enforces size stock availability limits', () => {
  clearCartIsland();
  const product = INITIAL_CATALOG[0];
  const variant = product.variants.find((v) => v.size === 'L');
  const maxStock = variant ? variant.stock : 9;

  // Attempt to add more than available
  const res = addToCartIsland({
    product,
    size: 'L',
    quantity: maxStock + 5
  });

  assert.equal(res.ok, false);
  assert.match(res.error || '', /Only \d+ item\(s\) left/);
});

test('Astro Island Cart Store: supports custom printing validation and fee calculation', () => {
  clearCartIsland();
  const product = INITIAL_CATALOG[0];

  // Invalid custom name with special characters
  const badRes = addToCartIsland({
    product,
    size: 'M',
    quantity: 1,
    customName: 'MESSI$$$',
    customNumber: '10'
  });
  assert.equal(badRes.ok, false);

  // Valid custom print
  const goodRes = addToCartIsland({
    product,
    size: 'M',
    quantity: 1,
    customName: 'BELLINGHAM',
    customNumber: '5',
    customPrintPriceBdt: 250
  });

  assert.equal(goodRes.ok, true);
  const item = $cart.get()[0];
  assert.equal(item.hasCustomPrint, true);
  assert.equal(item.customName, 'BELLINGHAM');
  assert.equal(item.customNumber, '5');
  assert.equal(item.customPrintPriceBdt, 250);
});

test('Astro Island Cart Store: updates quantity and removes items', () => {
  clearCartIsland();
  const product = INITIAL_CATALOG[0];
  addToCartIsland({
    product,
    size: 'XL',
    quantity: 1
  });

  const lineKey = $cart.get()[0].lineKey;
  updateCartQuantityIsland(lineKey, 2);
  assert.equal($cartCount.get(), 2);

  removeFromCartIsland(lineKey);
  assert.equal($cart.get().length, 0);
  assert.equal($cartCount.get(), 0);
});
