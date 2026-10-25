import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  signOut,
  type User
} from 'firebase/auth';
import {
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  collection,
  getDocs,
  serverTimestamp
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType
} from '../lib/firebase';
import {
  validateCustomization,
  getEffectiveProductPriceBdt,
  type Product,
  type CouponDefinition,
  type SiteSettingsConfig,
  type JerseySize
} from '../lib/commerce';
import {
  INITIAL_CATALOG,
  INITIAL_COUPONS,
  INITIAL_SITE_SETTINGS
} from '../data/catalog';

export interface CartLineItem {
  lineKey: string;
  productId: string;
  slug: string;
  productName: string;
  team: string;
  editionTier: Product['editionTier'];
  size: JerseySize;
  quantity: number;
  baseUnitPriceBdt: number;
  customPrintPriceBdt: number;
  customName: string;
  customNumber: string;
  hasCustomPrint: boolean;
  unitPriceBdt: number;
  visual: Product['visual'];
}

export interface CustomerAddressProfile {
  phone: string;
  division: string;
  district: string;
  upazila: string;
  streetAddress: string;
  postalCode: string;
}

interface ToastMessage {
  id: string;
  title: string;
  type: 'success' | 'error' | 'info';
}

interface StoreContextValue {
  products: Product[];
  coupons: CouponDefinition[];
  settings: SiteSettingsConfig;
  isLoadingCatalog: boolean;
  refreshCatalog: () => Promise<void>;

  cart: CartLineItem[];
  isCartDrawerOpen: boolean;
  setCartDrawerOpen: (open: boolean) => void;
  addToCart: (params: {
    product: Product;
    size: JerseySize;
    quantity: number;
    customName?: string;
    customNumber?: string;
  }) => { ok: boolean; error?: string };
  updateCartQuantity: (lineKey: string, nextQuantity: number) => void;
  removeFromCart: (lineKey: string) => void;
  clearCart: () => void;
  cartCount: number;
  cartSubtotalBdt: number;

  wishlistIds: string[];
  toggleWishlist: (product: Product) => Promise<void>;
  isInWishlist: (productId: string) => boolean;

  currentUser: User | null;
  isAuthReady: boolean;
  isAdmin: boolean;
  getAuthHeaders: () => Promise<Record<string, string>>;
  savedAddress: CustomerAddressProfile;
  saveCustomerAddress: (address: CustomerAddressProfile) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  registerWithEmail: (name: string, email: string, pass: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  logoutUser: () => Promise<void>;

  toasts: ToastMessage[];
  pushToast: (title: string, type?: ToastMessage['type']) => void;
  dismissToast: (id: string) => void;
}

const StoreContext = createContext<StoreContextValue | null>(null);

const CART_STORAGE_KEY = 'jv_cart_v1';
const WISHLIST_STORAGE_KEY = 'jv_wishlist_v1';
const ADDRESS_STORAGE_KEY = 'jv_address_v1';

const DEFAULT_ADDRESS: CustomerAddressProfile = {
  phone: '',
  division: 'Dhaka',
  district: 'Dhaka',
  upazila: 'Dhanmondi',
  streetAddress: '',
  postalCode: ''
};

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [products, setProducts] = useState<Product[]>(INITIAL_CATALOG);
  const [coupons, setCoupons] = useState<CouponDefinition[]>(INITIAL_COUPONS);
  const [settings, setSettings] = useState<SiteSettingsConfig>(INITIAL_SITE_SETTINGS);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState<boolean>(false);

  const [cart, setCart] = useState<CartLineItem[]>(() => {
    try {
      const raw = localStorage.getItem(CART_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [isCartDrawerOpen, setCartDrawerOpen] = useState<boolean>(false);

  const [wishlistIds, setWishlistIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(WISHLIST_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const [savedAddress, setSavedAddress] = useState<CustomerAddressProfile>(() => {
    try {
      const raw = localStorage.getItem(ADDRESS_STORAGE_KEY);
      return raw ? { ...DEFAULT_ADDRESS, ...JSON.parse(raw) } : DEFAULT_ADDRESS;
    } catch {
      return DEFAULT_ADDRESS;
    }
  });

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState<boolean>(false);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const pushToast = useCallback((title: string, type: ToastMessage['type'] = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev.slice(-2), { id, title, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3800);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const getAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const activeUser = auth.currentUser;
    if (!activeUser) return {};
    try {
      const idToken = await activeUser.getIdToken();
      return { Authorization: `Bearer ${idToken}` };
    } catch {
      return {};
    }
  }, []);

  const refreshCatalog = useCallback(async () => {
    setIsLoadingCatalog(true);
    try {
      const res = await fetch('/api/catalog');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.products) && data.products.length > 0) {
          setProducts(data.products);
        }
        if (Array.isArray(data.coupons)) {
          setCoupons(data.coupons);
        }
        if (data.settings) {
          setSettings(data.settings);
        }
      }
    } catch {
      // Keep deterministic local catalog fallback if offline
    } finally {
      setIsLoadingCatalog(false);
    }
  }, []);

  useEffect(() => {
    refreshCatalog();
  }, [refreshCatalog]);

  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch {
      // ignore storage quota errors
    }
  }, [cart]);

  useEffect(() => {
    try {
      localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(wishlistIds));
    } catch {
      // ignore
    }
  }, [wishlistIds]);

  // Listen to Firebase Auth state, verify server-side admin RBAC, and sync profile + wishlist
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      setIsAuthReady(true);

      if (!user) {
        setIsAdmin(false);
        return;
      }

      // Check server-validated admin status via /api/auth/me + Firestore /admins/{uid}
      try {
        const token = await user.getIdToken();
        const meRes = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (meRes.ok) {
          const meData = await meRes.json();
          setIsAdmin(Boolean(meData.isAdmin));
        } else {
          setIsAdmin(false);
        }
      } catch {
        setIsAdmin(false);
      }

      if (user.emailVerified) {
        const userDocPath = `users/${user.uid}`;
        try {
          const snap = await getDoc(doc(db, 'users', user.uid));
          if (!snap.exists()) {
            await setDoc(doc(db, 'users', user.uid), {
              uid: user.uid,
              displayName: (user.displayName || user.email?.split('@')[0] || 'Customer').slice(0, 80),
              favoriteTeam: 'Bangladesh',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
          }

          // Load isolated PII shipping address if saved
          const privSnap = await getDoc(doc(db, 'users', user.uid, 'private', 'shipping'));
          if (privSnap.exists()) {
            const d = privSnap.data();
            const loaded: CustomerAddressProfile = {
              phone: String(d.phone || ''),
              division: String(d.division || 'Dhaka'),
              district: String(d.district || 'Dhaka'),
              upazila: String(d.upazila || 'Dhanmondi'),
              streetAddress: String(d.streetAddress || ''),
              postalCode: String(d.postalCode || '')
            };
            setSavedAddress(loaded);
            localStorage.setItem(ADDRESS_STORAGE_KEY, JSON.stringify(loaded));
          }

          // Load wishlist subcollection
          const wishSnap = await getDocs(collection(db, 'users', user.uid, 'wishlist'));
          const remoteIds = wishSnap.docs.map((docItem) => String(docItem.data().productId));
          if (remoteIds.length > 0) {
            setWishlistIds((prev) => Array.from(new Set([...prev, ...remoteIds])));
          }
        } catch (err) {
          console.warn('Profile sync notice:', userDocPath, err);
        }
      }
    });
    return () => unsub();
  }, []);

  const addToCart = useCallback(
    (params: {
      product: Product;
      size: JerseySize;
      quantity: number;
      customName?: string;
      customNumber?: string;
    }): { ok: boolean; error?: string } => {
      const { product, size, quantity, customName, customNumber } = params;
      const variant = product.variants.find((v) => v.size === size && v.isActive);
      if (!variant || variant.stock <= 0) {
        return { ok: false, error: `Size ${size} is currently out of stock.` };
      }

      const customCheck = validateCustomization(customName, customNumber);
      if (!customCheck.valid) {
        return { ok: false, error: customCheck.error };
      }

      const lineKey = `${product.id}__${size}__${customCheck.customName}__${customCheck.customNumber}`;
      const existingLine = cart.find((item) => item.lineKey === lineKey);
      const totalForVariant = cart
        .filter((item) => item.productId === product.id && item.size === size)
        .reduce((acc, item) => acc + item.quantity, 0);

      if (totalForVariant + quantity > variant.stock) {
        return {
          ok: false,
          error: `Only ${variant.stock} unit(s) available in Size ${size} for ${product.name}.`
        };
      }

      const effectiveBasePrice = getEffectiveProductPriceBdt(product, variant.priceBdt);
      const unitPriceBdt =
        effectiveBasePrice + (customCheck.hasCustomPrint ? product.customPrintPriceBdt : 0);

      setCart((prev) => {
        if (existingLine) {
          return prev.map((item) =>
            item.lineKey === lineKey
              ? { ...item, quantity: item.quantity + quantity }
              : item
          );
        }
        return [
          ...prev,
          {
            lineKey,
            productId: product.id,
            slug: product.slug,
            productName: product.name,
            team: product.team,
            editionTier: product.editionTier,
            size,
            quantity,
            baseUnitPriceBdt: effectiveBasePrice,
            customPrintPriceBdt: customCheck.hasCustomPrint ? product.customPrintPriceBdt : 0,
            customName: customCheck.customName,
            customNumber: customCheck.customNumber,
            hasCustomPrint: customCheck.hasCustomPrint,
            unitPriceBdt,
            visual: product.visual
          }
        ];
      });

      pushToast(`Added ${product.name} (${size}) to your bag`, 'success');
      return { ok: true };
    },
    [cart, pushToast]
  );

  const updateCartQuantity = useCallback(
    (lineKey: string, nextQuantity: number) => {
      if (nextQuantity <= 0) {
        setCart((prev) => prev.filter((item) => item.lineKey !== lineKey));
        return;
      }

      const targetLine = cart.find((item) => item.lineKey === lineKey);
      if (!targetLine) return;

      const product = products.find((p) => p.id === targetLine.productId);
      const variant = product?.variants.find((v) => v.size === targetLine.size);
      const maxStock = variant ? variant.stock : 10;

      if (nextQuantity > maxStock) {
        pushToast(`Maximum available stock for size ${targetLine.size} is ${maxStock}.`, 'error');
        return;
      }

      setCart((prev) =>
        prev.map((item) =>
          item.lineKey === lineKey ? { ...item, quantity: nextQuantity } : item
        )
      );
    },
    [cart, products, pushToast]
  );

  const removeFromCart = useCallback(
    (lineKey: string) => {
      setCart((prev) => prev.filter((item) => item.lineKey !== lineKey));
      pushToast('Item removed from bag', 'info');
    },
    [pushToast]
  );

  const clearCart = useCallback(() => {
    setCart([]);
  }, []);

  const toggleWishlist = useCallback(
    async (product: Product) => {
      const existsInWishlist = wishlistIds.includes(product.id);
      const nextIds = existsInWishlist
        ? wishlistIds.filter((id) => id !== product.id)
        : [...wishlistIds, product.id];

      setWishlistIds(nextIds);
      pushToast(
        existsInWishlist
          ? `Removed ${product.name} from saved jerseys`
          : `Saved ${product.name} to wishlist`,
        'info'
      );

      if (currentUser && currentUser.emailVerified) {
        const wishDocPath = `users/${currentUser.uid}/wishlist/${product.id}`;
        try {
          if (existsInWishlist) {
            await deleteDoc(doc(db, 'users', currentUser.uid, 'wishlist', product.id));
          } else {
            await setDoc(doc(db, 'users', currentUser.uid, 'wishlist', product.id), {
              userId: currentUser.uid,
              productId: product.id,
              productName: product.name.slice(0, 120),
              priceBdt: product.priceBdt,
              createdAt: serverTimestamp()
            });
          }
        } catch (err) {
          handleFirestoreError(
            err,
            existsInWishlist ? OperationType.DELETE : OperationType.WRITE,
            wishDocPath
          );
        }
      }
    },
    [wishlistIds, currentUser, pushToast]
  );

  const isInWishlist = useCallback(
    (productId: string) => wishlistIds.includes(productId),
    [wishlistIds]
  );

  const saveCustomerAddress = useCallback(
    async (address: CustomerAddressProfile) => {
      setSavedAddress(address);
      localStorage.setItem(ADDRESS_STORAGE_KEY, JSON.stringify(address));

      if (currentUser && currentUser.emailVerified) {
        const privPath = `users/${currentUser.uid}/private/shipping`;
        try {
          const existingSnap = await getDoc(doc(db, 'users', currentUser.uid, 'private', 'shipping'));
          if (existingSnap.exists()) {
            await setDoc(
              doc(db, 'users', currentUser.uid, 'private', 'shipping'),
              {
                uid: currentUser.uid,
                email: (currentUser.email || 'customer@jerseyvalley.bd').slice(0, 120),
                phone: address.phone.slice(0, 20),
                division: address.division.slice(0, 40),
                district: address.district.slice(0, 40),
                upazila: address.upazila.slice(0, 60),
                streetAddress: address.streetAddress.slice(0, 200),
                postalCode: (address.postalCode || '').slice(0, 10),
                createdAt: existingSnap.data().createdAt,
                updatedAt: serverTimestamp()
              }
            );
          } else {
            await setDoc(doc(db, 'users', currentUser.uid, 'private', 'shipping'), {
              uid: currentUser.uid,
              email: (currentUser.email || 'customer@jerseyvalley.bd').slice(0, 120),
              phone: address.phone.slice(0, 20),
              division: address.division.slice(0, 40),
              district: address.district.slice(0, 40),
              upazila: address.upazila.slice(0, 60),
              streetAddress: address.streetAddress.slice(0, 200),
              postalCode: (address.postalCode || '').slice(0, 10),
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
          }
          pushToast('Saved Bangladesh delivery address to your account', 'success');
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, privPath);
        }
      } else {
        pushToast('Delivery address saved on this device', 'success');
      }
    },
    [currentUser, pushToast]
  );

  const loginWithGoogle = useCallback(async () => {
    await signInWithPopup(auth, googleProvider);
    pushToast('Signed in with Google', 'success');
  }, [pushToast]);

  const loginWithEmail = useCallback(
    async (email: string, pass: string) => {
      await signInWithEmailAndPassword(auth, email.trim(), pass);
      pushToast('Signed in to Jersey Valley', 'success');
    },
    [pushToast]
  );

  const registerWithEmail = useCallback(
    async (name: string, email: string, pass: string) => {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), pass);
      if (name.trim()) {
        await updateProfile(cred.user, { displayName: name.trim().slice(0, 80) });
      }
      pushToast('Account created! Welcome to Jersey Valley.', 'success');
    },
    [pushToast]
  );

  const sendPasswordReset = useCallback(
    async (email: string) => {
      await sendPasswordResetEmail(auth, email.trim());
      pushToast('Password reset link sent to your email.', 'info');
    },
    [pushToast]
  );

  const logoutUser = useCallback(async () => {
    await signOut(auth);
    setIsAdmin(false);
    pushToast('Signed out of your account', 'info');
  }, [pushToast]);

  const cartCount = cart.reduce((acc, item) => acc + item.quantity, 0);
  const cartSubtotalBdt = cart.reduce(
    (acc, item) => acc + item.unitPriceBdt * item.quantity,
    0
  );

  return (
    <StoreContext.Provider
      value={{
        products,
        coupons,
        settings,
        isLoadingCatalog,
        refreshCatalog,
        cart,
        isCartDrawerOpen,
        setCartDrawerOpen,
        addToCart,
        updateCartQuantity,
        removeFromCart,
        clearCart,
        cartCount,
        cartSubtotalBdt,
        wishlistIds,
        toggleWishlist,
        isInWishlist,
        currentUser,
        isAuthReady,
        isAdmin,
        getAuthHeaders,
        savedAddress,
        saveCustomerAddress,
        loginWithGoogle,
        loginWithEmail,
        registerWithEmail,
        sendPasswordReset,
        logoutUser,
        toasts,
        pushToast,
        dismissToast
      }}
    >
      {children}
    </StoreContext.Provider>
  );
};

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) {
    throw new Error('useStore must be used within a StoreProvider');
  }
  return ctx;
}
