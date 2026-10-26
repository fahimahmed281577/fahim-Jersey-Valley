import { atom, computed } from 'nanostores';
import type { CartLineItem } from '../../context/StoreContext';
import {
  type Product,
  type JerseySize,
  getEffectiveProductPriceBdt,
  validateCustomization
} from '../commerce';

const CART_STORAGE_KEY = 'jv_cart_v1';

function getInitialCart(): CartLineItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export const $cart = atom<CartLineItem[]>(getInitialCart());
export const $isCartDrawerOpen = atom<boolean>(false);

// Auto-sync cart to localStorage on browser changes
if (typeof window !== 'undefined') {
  $cart.subscribe((items) => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Storage unavailable or full
    }
  });
}

// Derived computed stores
export const $cartCount = computed($cart, (items) =>
  items.reduce((sum, item) => sum + item.quantity, 0)
);

export const $cartSubtotalBdt = computed($cart, (items) =>
  items.reduce((sum, item) => sum + item.unitPriceBdt * item.quantity, 0)
);

export function openCartDrawer() {
  $isCartDrawerOpen.set(true);
}

export function closeCartDrawer() {
  $isCartDrawerOpen.set(false);
}

export function toggleCartDrawer() {
  $isCartDrawerOpen.set(!$isCartDrawerOpen.get());
}

export function addToCartIsland(params: {
  product: Product;
  size: JerseySize;
  quantity: number;
  customName?: string;
  customNumber?: string;
  customPrintPriceBdt?: number;
}): { ok: boolean; error?: string } {
  const { product, size, quantity } = params;

  if (quantity <= 0) {
    return { ok: false, error: 'Quantity must be at least 1' };
  }

  const variant = product.variants?.find((v) => v.size === size);
  if (!variant) {
    return { ok: false, error: `Size ${size} is not available for this jersey.` };
  }

  if (variant.stock < quantity) {
    return {
      ok: false,
      error: `Only ${variant.stock} item(s) left in size ${size}`
    };
  }

  const customCheck = validateCustomization(params.customName, params.customNumber);
  if (!customCheck.valid) {
    return { ok: false, error: customCheck.error };
  }

  const customName = customCheck.customName || '';
  const customNumber = customCheck.customNumber || '';
  const hasCustomPrint = customCheck.hasCustomPrint;

  const lineKey = `${product.id}__${size}__${customName}__${customNumber}`;
  const currentCart = $cart.get();
  const existingIndex = currentCart.findIndex((item) => item.lineKey === lineKey);

  const baseUnitPrice = getEffectiveProductPriceBdt(product, variant.priceBdt);
  const customFee = hasCustomPrint
    ? (params.customPrintPriceBdt ?? product.customPrintPriceBdt ?? 250)
    : 0;
  const unitPrice = baseUnitPrice + customFee;

  if (existingIndex > -1) {
    const existing = currentCart[existingIndex];
    const newQty = existing.quantity + quantity;
    if (newQty > variant.stock) {
      return {
        ok: false,
        error: `Cannot add more. You have ${existing.quantity} in bag; only ${variant.stock} available.`
      };
    }
    const updated = [...currentCart];
    updated[existingIndex] = { ...existing, quantity: newQty };
    $cart.set(updated);
  } else {
    const newItem: CartLineItem = {
      lineKey,
      productId: product.id,
      slug: product.slug,
      productName: product.name,
      team: product.team,
      editionTier: product.editionTier,
      size,
      quantity,
      baseUnitPriceBdt: baseUnitPrice,
      customPrintPriceBdt: customFee,
      customName,
      customNumber,
      hasCustomPrint,
      unitPriceBdt: unitPrice,
      visual: product.visual
    };
    $cart.set([...currentCart, newItem]);
  }

  $isCartDrawerOpen.set(true);
  return { ok: true };
}

export function updateCartQuantityIsland(lineKey: string, nextQuantity: number) {
  if (nextQuantity <= 0) {
    removeFromCartIsland(lineKey);
    return;
  }
  const current = $cart.get();
  $cart.set(
    current.map((item) =>
      item.lineKey === lineKey ? { ...item, quantity: nextQuantity } : item
    )
  );
}

export function removeFromCartIsland(lineKey: string) {
  $cart.set($cart.get().filter((item) => item.lineKey !== lineKey));
}

export function clearCartIsland() {
  $cart.set([]);
}
