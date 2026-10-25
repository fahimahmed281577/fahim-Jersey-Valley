import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  Package,
  Layers,
  Settings,
  RefreshCw,
  Lock,
  LayoutDashboard,
  ShoppingBag,
  Users,
  AlertTriangle,
  Plus,
  Edit3,
  Archive,
  RotateCcw,
  Search,
  Upload,
  Trash2,
  Eye,
  EyeOff,
  LogOut,
  KeyRound,
  X,
  Copy,
  Check,
  Tag
} from 'lucide-react';
import {
  formatBdt,
  getEffectiveProductPriceBdt,
  type Product,
  type CouponDefinition,
  type OrderStatus,
  type PaymentStatus,
  type SiteSettingsConfig,
  type JerseySize,
  type JerseyCategory,
  type KitType,
  type EditionTier,
  type GenderFit,
  type KitVisualSpec
} from '../lib/commerce';
import type {
  StoredOrder,
  StockAdjustmentLog,
  CustomerDirectoryRecord,
  UpsertProductInput
} from '../lib/persistentStore';
import {
  uploadProductImageToStorage,
  deleteProductImageFromStorage
} from '../lib/firebase';
import { JerseyVisualizer } from '../components/JerseyVisualizer';
import { useStore } from '../context/StoreContext';

type SanitizedOrder = Omit<StoredOrder, 'orderAccessToken' | 'idempotencyKey'>;

interface LowStockItem {
  productId: string;
  productName: string;
  team: string;
  slug: string;
  size: JerseySize;
  sku: string;
  stock: number;
}

interface AdminMetrics {
  totalOrders: number;
  pendingOrdersCount: number;
  confirmedOrdersCount: number;
  shippedOrdersCount: number;
  deliveredOrdersCount: number;
  cancelledOrdersCount: number;
  demoOrdersCount: number;
  activeOrdersCount: number;
  totalSalesCompletedBdt: number;
  totalRevenueBookedBdt: number;
  verifiedPaidRevenueBdt: number;
  pendingCodBdt: number;
  totalProducts: number;
  activeProductsCount: number;
  archivedProductsCount: number;
  lowStockVariantsCount: number;
  totalStockUnits: number;
}

type AdminTab =
  | 'overview'
  | 'products'
  | 'orders'
  | 'customers'
  | 'inventory'
  | 'settings';

const ALL_SIZES: JerseySize[] = ['S', 'M', 'L', 'XL', 'XXL'];

function createEmptyProductDraft(): UpsertProductInput {
  return {
    name: '',
    slug: '',
    team: '',
    countryOrLeague: 'International / Club',
    category: 'club',
    kitType: 'Home',
    editionTier: 'Fan Replica',
    gender: 'Unisex',
    season: '2025/26',
    priceBdt: 1350,
    salePriceBdt: null,
    customPrintPriceBdt: 350,
    description:
      'High-grade supporter replica football jersey tailored with breathable AeroMesh fabric for matchdays in Bangladesh. Note: Supporter replica apparel, not officially licensed team merchandise.',
    fabricSpec: '165 GSM AeroMesh 100% Breathable Polyester · Embroidered Crest',
    fitNote: 'Regular stadium fit. True to standard Bangladesh sizing.',
    careInstructions: 'Machine wash cold inside-out. Do not iron directly over print.',
    isActive: true,
    featuredRank: 20,
    imageUrls: [],
    variants: ALL_SIZES.map((size) => ({
      size,
      stock: 10,
      isActive: true
    })),
    visual: {
      primaryColor: '#111111',
      secondaryColor: '#FFFFFF',
      accentColor: '#15803D',
      textColor: '#FFFFFF',
      pattern: 'solid',
      collarStyle: 'crew',
      crestCode: 'JVY',
      defaultPreviewName: 'RAHIM',
      defaultPreviewNumber: '10'
    }
  };
}

export const AdminDashboardPage: React.FC = () => {
  const { currentUser, isAdmin, getAuthHeaders, refreshCatalog, pushToast } = useStore();

  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [authorizedAdmin, setAuthorizedAdmin] = useState<boolean>(false);
  const [authStatusCode, setAuthStatusCode] = useState<number | null>(null);
  const [authErrorMessage, setAuthErrorMessage] = useState<string | null>(null);
  const [persistenceBackend, setPersistenceBackend] = useState<string>('transactional-store');

  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [lowStockItems, setLowStockItems] = useState<LowStockItem[]>([]);
  const [recentOrders, setRecentOrders] = useState<SanitizedOrder[]>([]);
  const [orders, setOrders] = useState<SanitizedOrder[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [coupons, setCoupons] = useState<CouponDefinition[]>([]);
  const [stockLogs, setStockLogs] = useState<StockAdjustmentLog[]>([]);
  const [customers, setCustomers] = useState<CustomerDirectoryRecord[]>([]);
  const [settingsForm, setSettingsForm] = useState<SiteSettingsConfig | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [copiedUid, setCopiedUid] = useState<boolean>(false);

  // Product Management search, filter, pagination & modal state
  const [productSearch, setProductSearch] = useState<string>('');
  const [productCategoryFilter, setProductCategoryFilter] = useState<string>('all');
  const [productStatusFilter, setProductStatusFilter] = useState<'all' | 'active' | 'archived'>(
    'all'
  );
  const [productPage, setProductPage] = useState<number>(1);
  const PRODUCTS_PER_PAGE = 6;

  const [productModalOpen, setProductModalOpen] = useState<boolean>(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [productDraft, setProductDraft] = useState<UpsertProductInput>(createEmptyProductDraft);
  const [newImageUrlInput, setNewImageUrlInput] = useState<string>('');
  const [uploadingImage, setUploadingImage] = useState<boolean>(false);
  const [savingProduct, setSavingProduct] = useState<boolean>(false);

  // Order Management search, filter & detail inspector state
  const [orderSearch, setOrderSearch] = useState<string>('');
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('all');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>('all');
  const [inspectedOrder, setInspectedOrder] = useState<SanitizedOrder | null>(null);
  const [orderStatusNote, setOrderStatusNote] = useState<string>('');

  // Customer Management search & detail state
  const [customerSearch, setCustomerSearch] = useState<string>('');
  const [expandedCustomerKey, setExpandedCustomerKey] = useState<string | null>(null);

  // Inventory Management reason & custom stock input state
  const [stockReasonInput, setStockReasonInput] = useState<string>(
    'Restock / physical warehouse count verification'
  );
  const [stockDrafts, setStockDrafts] = useState<Record<string, number>>({});

  // Standalone Administrator Login & Session state
  const [loginAdminId, setLoginAdminId] = useState<string>('jvadmin');
  const [loginPassword, setLoginPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loggingIn, setLoggingIn] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [standaloneConfigured, setStandaloneConfigured] = useState<boolean>(true);
  const [missingEnvVars, setMissingEnvVars] = useState<string[]>([]);
  const [configNotice, setConfigNotice] = useState<string | null>(null);
  const [adminSessionMode, setAdminSessionMode] = useState<'standalone' | 'firebase'>('standalone');
  const [adminActorId, setAdminActorId] = useState<string>('jvadmin');
  const [csrfToken, setCsrfToken] = useState<string>('');

  // Coupon Management form state
  const [couponForm, setCouponForm] = useState<CouponDefinition>({
    code: '',
    description: '',
    discountType: 'PERCENTAGE',
    value: 10,
    minSubtotalBdt: 1500,
    maxDiscountBdt: 500,
    isActive: true
  });

  const buildAdminHeaders = useCallback(
    async (extraHeaders?: Record<string, string>): Promise<Record<string, string>> => {
      const firebaseHeaders = await getAuthHeaders();
      const headers: Record<string, string> = {
        'X-Requested-With': 'XMLHttpRequest',
        ...firebaseHeaders,
        ...(extraHeaders || {})
      };
      if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken;
      }
      return headers;
    },
    [getAuthHeaders, csrfToken]
  );

  const loadAdminOverview = useCallback(async () => {
    setLoading(true);
    setAuthErrorMessage(null);
    try {
      const firebaseHeaders = await getAuthHeaders();
      const baseHeaders: Record<string, string> = {
        'X-Requested-With': 'XMLHttpRequest',
        ...firebaseHeaders
      };

      // 1. Check standalone session & server configuration status
      try {
        const sessionRes = await fetch('/api/admin/auth/session', {
          credentials: 'include',
          headers: baseHeaders
        });
        if (sessionRes.ok) {
          const sessionData = await sessionRes.json();
          setStandaloneConfigured(Boolean(sessionData.standaloneConfigured));
          setMissingEnvVars(
            Array.isArray(sessionData.missingEnvVars) ? sessionData.missingEnvVars : []
          );
          setConfigNotice(sessionData.configNotice || null);
          if (sessionData.csrfToken) {
            setCsrfToken(sessionData.csrfToken);
            baseHeaders['X-CSRF-Token'] = sessionData.csrfToken;
          }
          if (sessionData.authMode) {
            setAdminSessionMode(sessionData.authMode);
          }
          if (sessionData.adminId) {
            setAdminActorId(sessionData.adminId);
          }
        }
      } catch {
        // Proceed to overview check
      }

      // 2. Load protected Admin Overview (verifies either Standalone Cookie or Firebase Bearer Token)
      const res = await fetch('/api/admin/overview', {
        credentials: 'include',
        headers: baseHeaders
      });
      setAuthStatusCode(res.status);
      const data = await res.json();

      if (!res.ok) {
        setAuthorizedAdmin(false);
        setAuthErrorMessage(
          data.error ||
            (res.status === 401
              ? 'Administrator authentication required. Sign in below with your Standalone Admin ID and password.'
              : 'Administrator privileges required.')
        );
        return;
      }

      setAuthorizedAdmin(Boolean(data.authorizedAdmin));
      setPersistenceBackend(data.persistenceBackend || 'transactional-store');
      if (data.adminSession) {
        setAdminSessionMode(data.adminSession.authMode || 'standalone');
        setAdminActorId(data.adminSession.adminId || 'jvadmin');
        if (data.adminSession.csrfToken) {
          setCsrfToken(data.adminSession.csrfToken);
        }
      }
      setMetrics(data.metrics || null);
      setLowStockItems(data.lowStockItems || []);
      setRecentOrders(data.recentOrders || []);
      setOrders(data.orders || []);
      setProducts(data.products || []);
      setCoupons(data.coupons || []);
      setStockLogs(data.stockLogs || []);
      setCustomers(data.customers || []);
      setSettingsForm(data.settings || null);

      const initialDrafts: Record<string, number> = {};
      for (const p of (data.products || []) as Product[]) {
        for (const v of p.variants) {
          initialDrafts[`${p.id}:${v.size}`] = v.stock;
        }
      }
      setStockDrafts(initialDrafts);
    } catch {
      setAuthorizedAdmin(false);
      setAuthErrorMessage('Unable to connect to the server admin API.');
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    loadAdminOverview();
  }, [loadAdminOverview, currentUser, isAdmin]);

  const handleStandaloneLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoggingIn(true);
    try {
      const res = await fetch('/api/admin/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({
          adminId: loginAdminId.trim(),
          password: loginPassword
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || 'Invalid Admin ID or password.');
        return;
      }

      setLoginPassword('');
      setShowPassword(false);
      if (data.csrfToken) {
        setCsrfToken(data.csrfToken);
      }
      setAdminSessionMode('standalone');
      setAdminActorId(data.adminId || 'jvadmin');
      pushToast(`Signed in as standalone administrator (${data.adminId || 'jvadmin'})`, 'success');
      await loadAdminOverview();
    } catch {
      setLoginError('Network error while attempting administrator login.');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleStandaloneLogout = async () => {
    try {
      const headers = await buildAdminHeaders({
        'Content-Type': 'application/json'
      });
      await fetch('/api/admin/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers
      });
    } catch {
      // Proceed to clear client session state
    }
    setAuthorizedAdmin(false);
    setCsrfToken('');
    setLoginPassword('');
    setAuthStatusCode(401);
    setAuthErrorMessage(null);
    pushToast('Signed out of administrator session.', 'info');
  };

  // Filtered & paginated products
  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    return products.filter((p) => {
      if (productCategoryFilter !== 'all' && p.category !== productCategoryFilter) {
        return false;
      }
      if (productStatusFilter === 'active' && !p.isActive) return false;
      if (productStatusFilter === 'archived' && p.isActive) return false;
      if (q) {
        const hay = `${p.name} ${p.team} ${p.slug} ${p.countryOrLeague} ${p.season}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [products, productSearch, productCategoryFilter, productStatusFilter]);

  const totalProductPages = Math.max(1, Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE));
  const paginatedProducts = useMemo(() => {
    const start = (productPage - 1) * PRODUCTS_PER_PAGE;
    return filteredProducts.slice(start, start + PRODUCTS_PER_PAGE);
  }, [filteredProducts, productPage]);

  // Filtered orders
  const filteredOrders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    return orders.filter((o) => {
      if (orderStatusFilter !== 'all' && o.orderStatus !== orderStatusFilter) return false;
      if (paymentStatusFilter !== 'all' && o.paymentStatus !== paymentStatusFilter) return false;
      if (q) {
        const hay =
          `${o.orderNumber} ${o.customerName} ${o.customerPhone} ${o.customerEmail} ${o.district} ${o.upazila}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [orders, orderSearch, orderStatusFilter, paymentStatusFilter]);

  // Filtered customers
  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => {
      const hay = `${c.name} ${c.phone} ${c.email} ${c.uid || ''} ${c.district}`.toLowerCase();
      return hay.includes(q);
    });
  }, [customers, customerSearch]);

  const handleCopyUid = () => {
    if (!currentUser?.uid) return;
    navigator.clipboard?.writeText(currentUser.uid);
    setCopiedUid(true);
    pushToast('Copied your Firebase UID to clipboard', 'success');
    setTimeout(() => setCopiedUid(false), 2500);
  };

  // Open Product Modal for Create or Edit
  const openCreateProductModal = () => {
    setEditingProductId(null);
    setProductDraft(createEmptyProductDraft());
    setNewImageUrlInput('');
    setProductModalOpen(true);
  };

  const openEditProductModal = (prod: Product) => {
    setEditingProductId(prod.id);
    setProductDraft({
      id: prod.id,
      slug: prod.slug,
      name: prod.name,
      team: prod.team,
      countryOrLeague: prod.countryOrLeague,
      category: prod.category,
      kitType: prod.kitType,
      editionTier: prod.editionTier,
      gender: prod.gender,
      season: prod.season,
      priceBdt: prod.priceBdt,
      salePriceBdt: prod.salePriceBdt ?? null,
      customPrintPriceBdt: prod.customPrintPriceBdt,
      description: prod.description,
      fabricSpec: prod.fabricSpec,
      fitNote: prod.fitNote,
      careInstructions: prod.careInstructions,
      isActive: prod.isActive,
      featuredRank: prod.featuredRank,
      imageUrls: [...(prod.imageUrls || [])],
      variants: prod.variants.map((v) => ({
        size: v.size,
        sku: v.sku,
        priceBdt: v.priceBdt,
        stock: v.stock,
        isActive: v.isActive,
        chestInches: v.chestInches,
        lengthInches: v.lengthInches
      })),
      visual: { ...prod.visual }
    });
    setNewImageUrlInput('');
    setProductModalOpen(true);
  };

  const handleFirebaseStorageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const targetId =
        editingProductId ||
        productDraft.slug ||
        productDraft.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') ||
        'jersey';
      const downloadUrl = await uploadProductImageToStorage(targetId, file);
      setProductDraft((prev) => ({
        ...prev,
        imageUrls: [...(prev.imageUrls || []), downloadUrl]
      }));
      pushToast('Uploaded product image to Firebase Storage', 'success');
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Firebase Storage upload failed. Check Storage rules or paste an HTTPS image URL.';
      pushToast(message, 'error');
    } finally {
      setUploadingImage(false);
      e.target.value = '';
    }
  };

  const handleAddExternalImageUrl = () => {
    const clean = newImageUrlInput.trim();
    if (!clean) return;
    if (!clean.startsWith('https://') && !clean.startsWith('http://')) {
      pushToast('Image URL must start with https://', 'error');
      return;
    }
    setProductDraft((prev) => ({
      ...prev,
      imageUrls: [...(prev.imageUrls || []), clean]
    }));
    setNewImageUrlInput('');
  };

  const handleRemoveProductImage = async (urlToRemove: string) => {
    try {
      await deleteProductImageFromStorage(urlToRemove);
    } catch {
      // Non-fatal if external URL or already deleted
    }
    setProductDraft((prev) => ({
      ...prev,
      imageUrls: (prev.imageUrls || []).filter((u) => u !== urlToRemove)
    }));
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProduct(true);
    try {
      const headers = await buildAdminHeaders({
        'Content-Type': 'application/json'
      });
      const url = editingProductId
        ? `/api/admin/products/${encodeURIComponent(editingProductId)}`
        : '/api/admin/products';
      const method = editingProductId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers,
        body: JSON.stringify(productDraft)
      });
      const data = await res.json();
      if (!res.ok) {
        pushToast(data.error || 'Could not save product.', 'error');
        return;
      }

      setProductModalOpen(false);
      await loadAdminOverview();
      await refreshCatalog();
      pushToast(
        editingProductId
          ? `Updated product "${data.product.name}"`
          : `Created product "${data.product.name}"`,
        'success'
      );
    } catch {
      pushToast('Network error while saving product.', 'error');
    } finally {
      setSavingProduct(false);
    }
  };

  const handleToggleProductArchive = async (prod: Product) => {
    try {
      const headers = await buildAdminHeaders({
        'Content-Type': 'application/json'
      });
      const nextActive = !prod.isActive;
      const res = await fetch(`/api/admin/products/${encodeURIComponent(prod.id)}/archive`, {
        method: 'PATCH',
        credentials: 'include',
        headers,
        body: JSON.stringify({ isActive: nextActive })
      });
      const data = await res.json();
      if (!res.ok) {
        pushToast(data.error || 'Unable to change product archive state.', 'error');
        return;
      }
      await loadAdminOverview();
      await refreshCatalog();
      pushToast(
        nextActive
          ? `Restored "${prod.name}" to active storefront`
          : `Archived "${prod.name}" (hidden from storefront)`,
        'info'
      );
    } catch {
      pushToast('Failed to update product archive status.', 'error');
    }
  };

  const handleOrderUpdate = async (
    orderNumber: string,
    nextOrderStatus: OrderStatus,
    nextPaymentStatus: PaymentStatus,
    note?: string
  ) => {
    try {
      const headers = await buildAdminHeaders({
        'Content-Type': 'application/json'
      });
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(orderNumber)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers,
        body: JSON.stringify({
          orderStatus: nextOrderStatus,
          paymentStatus: nextPaymentStatus,
          note: note ?? (orderStatusNote || undefined)
        })
      });
      const data = await res.json();
      if (!res.ok) {
        pushToast(data.error || 'Could not update order.', 'error');
        return;
      }
      if (inspectedOrder && inspectedOrder.orderNumber === orderNumber) {
        setInspectedOrder(data.order);
      }
      setOrderStatusNote('');
      await loadAdminOverview();
      await refreshCatalog();
      pushToast(`Updated ${orderNumber} → ${nextOrderStatus} / ${nextPaymentStatus}`, 'success');
    } catch {
      pushToast('Failed to update order status.', 'error');
    }
  };

  const handleVariantStockUpdate = async (
    productId: string,
    size: JerseySize,
    nextStock: number
  ) => {
    if (nextStock < 0) return;
    try {
      const headers = await buildAdminHeaders({
        'Content-Type': 'application/json'
      });
      const res = await fetch(`/api/admin/products/${encodeURIComponent(productId)}/stock`, {
        method: 'PATCH',
        credentials: 'include',
        headers,
        body: JSON.stringify({
          size,
          stock: nextStock,
          reason: stockReasonInput
        })
      });
      const data = await res.json();
      if (!res.ok) {
        pushToast(data.error || 'Administrator privileges required to modify stock.', 'error');
        return;
      }
      await loadAdminOverview();
      await refreshCatalog();
      pushToast(`Updated stock for ${productId} (${size}) to ${nextStock}`, 'success');
    } catch {
      pushToast('Could not update stock.', 'error');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settingsForm) return;
    try {
      const headers = await buildAdminHeaders({
        'Content-Type': 'application/json'
      });
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        credentials: 'include',
        headers,
        body: JSON.stringify(settingsForm)
      });
      const data = await res.json();
      if (!res.ok) {
        pushToast(data.error || 'Administrator privileges required to update settings.', 'error');
        return;
      }
      await loadAdminOverview();
      await refreshCatalog();
      pushToast('Saved Bangladesh shipping rates & store settings', 'success');
    } catch {
      pushToast('Could not save settings.', 'error');
    }
  };

  const handleSaveCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const headers = await buildAdminHeaders({
        'Content-Type': 'application/json'
      });
      const res = await fetch('/api/admin/coupons', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify(couponForm)
      });
      const data = await res.json();
      if (!res.ok) {
        pushToast(data.error || 'Could not save coupon.', 'error');
        return;
      }
      setCouponForm({
        code: '',
        description: '',
        discountType: 'PERCENTAGE',
        value: 10,
        minSubtotalBdt: 1500,
        maxDiscountBdt: 500,
        isActive: true
      });
      await loadAdminOverview();
      await refreshCatalog();
      pushToast(`Saved coupon code ${data.coupon.code}`, 'success');
    } catch {
      pushToast('Failed to save coupon.', 'error');
    }
  };

  const handleDeleteCoupon = async (code: string) => {
    try {
      const headers = await buildAdminHeaders();
      const res = await fetch(`/api/admin/coupons/${encodeURIComponent(code)}`, {
        method: 'DELETE',
        credentials: 'include',
        headers
      });
      const data = await res.json();
      if (!res.ok) {
        pushToast(data.error || 'Could not deactivate coupon.', 'error');
        return;
      }
      await loadAdminOverview();
      await refreshCatalog();
      pushToast(`Deactivated coupon ${code}`, 'info');
    } catch {
      pushToast('Failed to deactivate coupon.', 'error');
    }
  };

  // ============================================================================
  // STANDALONE ADMIN LOGIN PAGE (SHOWN WHEN UNAUTHENTICATED OR NON-ADMIN)
  // ============================================================================
  if (!loading && !authorizedAdmin) {
    return (
      <div className="max-w-xl mx-auto px-4 sm:px-6 py-12 space-y-6">
        <div className="bg-white border border-zinc-300 p-6 sm:p-8 space-y-6">
          <div className="flex items-start justify-between gap-4 border-b border-zinc-200 pb-4">
            <div>
              <span className="inline-block text-[11px] font-mono-num uppercase text-[#15803D] bg-emerald-50 border border-emerald-200 px-2.5 py-0.5">
                TEMPORARY STANDALONE ADMIN AUTHENTICATION · LOCAL &amp; PREVIEW
              </span>
              <h1 className="font-display text-3xl font-bold uppercase text-zinc-900 mt-2">
                Jersey Valley Admin Sign In
              </h1>
              <p className="text-xs text-zinc-600 mt-1">
                Sign in with your standalone administrator credentials to access and configure the
                6-tab Admin Panel before connecting Firebase Authentication.
              </p>
            </div>
            <KeyRound className="w-7 h-7 text-[#111111] shrink-0" />
          </div>

          {!standaloneConfigured && (
            <div
              role="alert"
              className="p-4 bg-amber-50 border border-amber-300 text-xs text-amber-900 space-y-2"
            >
              <div className="flex items-center gap-2 font-bold">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                <span>Standalone Admin Credentials Not Configured on Server</span>
              </div>
              <p>{configNotice}</p>
              {missingEnvVars.length > 0 && (
                <p>
                  Missing variables: <code>{missingEnvVars.join(', ')}</code>
                </p>
              )}
            </div>
          )}

          {authStatusCode === 403 && currentUser && (
            <div
              role="alert"
              className="p-3.5 bg-amber-50 border border-amber-200 text-xs text-amber-900"
            >
              <strong>Firebase Account Not Authorized as Admin (HTTP 403):</strong> You are signed
              into the storefront as <strong>{currentUser.email}</strong>, which is a regular
              customer account. Sign in below using your <strong>Standalone Admin ID</strong> to
              access the Admin Console.
            </div>
          )}

          {loginError && (
            <div
              role="alert"
              className="p-3.5 bg-red-50 border border-red-300 text-xs text-red-900 font-medium flex items-start gap-2"
            >
              <AlertTriangle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleStandaloneLogin} className="space-y-4" noValidate>
            <div>
              <label
                htmlFor="standalone-admin-id"
                className="block text-xs font-bold uppercase tracking-wider text-zinc-800 mb-1.5"
              >
                Admin ID
              </label>
              <input
                id="standalone-admin-id"
                name="adminId"
                type="text"
                autoComplete="username"
                required
                value={loginAdminId}
                onChange={(e) => setLoginAdminId(e.target.value)}
                placeholder="jvadmin"
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-zinc-300 text-zinc-900 focus:outline-none focus:border-[#111111] font-mono-num"
              />
            </div>

            <div>
              <label
                htmlFor="standalone-admin-password"
                className="block text-xs font-bold uppercase tracking-wider text-zinc-800 mb-1.5"
              >
                Administrator Password
              </label>
              <div className="relative flex items-center">
                <input
                  id="standalone-admin-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Enter your administrator password"
                  className="w-full pl-3.5 pr-20 py-2.5 text-sm bg-white border border-zinc-300 text-zinc-900 focus:outline-none focus:border-[#111111] font-mono-num"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2 px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:text-[#111111] bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 flex items-center gap-1"
                >
                  {showPassword ? (
                    <>
                      <EyeOff className="w-3.5 h-3.5" />
                      <span>Hide</span>
                    </>
                  ) : (
                    <>
                      <Eye className="w-3.5 h-3.5" />
                      <span>Show</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loggingIn || !standaloneConfigured}
              className="w-full py-3 px-5 bg-[#111111] text-white text-xs font-bold uppercase tracking-wider hover:bg-[#15803D] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loggingIn ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>Sign In to Admin Console</span>
                </>
              )}
            </button>
          </form>

          <div className="border-t border-zinc-200 pt-4 space-y-2 text-[11px] text-zinc-600">
            <div className="flex items-center justify-between">
              <strong className="text-zinc-900 uppercase tracking-wider">
                Security &amp; Architecture Notice
              </strong>
              <span className="font-mono-num text-zinc-500">HttpOnly · Bcrypt · CSRF</span>
            </div>
            <p className="leading-relaxed">
              This temporary standalone login verifies credentials exclusively on the Express
              backend against <code>ADMIN_LOGIN_ID</code> and <code>ADMIN_PASSWORD_HASH</code> using
              bcrypt and issues an <code>HttpOnly</code>, <code>SameSite=Lax</code> session cookie.
              When you later connect Firebase Authentication, the same <code>/api/admin/*</code>{' '}
              routes also support verified Firebase Admin Bearer tokens via <code>ADMIN_UIDS</code>.
            </p>
            {currentUser && (
              <div className="pt-2 flex items-center justify-between gap-2 bg-[#F7F7F5] border border-zinc-200 px-3 py-2">
                <span className="truncate">
                  Firebase UID: <code className="font-mono-num font-bold">{currentUser.uid}</code>
                </span>
                <button
                  type="button"
                  onClick={handleCopyUid}
                  className="px-2.5 py-1 bg-[#111111] text-white text-[11px] font-semibold hover:bg-[#15803D] flex items-center gap-1 shrink-0"
                >
                  {copiedUid ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedUid ? 'Copied' : 'Copy UID'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-10 space-y-8">
      {/* Header */}
      <div className="border-b border-zinc-200 pb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1">
            <span>STORE ADMINISTRATION</span>
            <span aria-hidden="true">·</span>
            <span>
              {adminSessionMode === 'standalone'
                ? 'TEMPORARY STANDALONE ADMIN AUTH'
                : 'SERVER-VERIFIED FIREBASE RBAC'}
            </span>
            <span aria-hidden="true">·</span>
            <span>PERSISTENCE: {persistenceBackend.toUpperCase()}</span>
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold uppercase tracking-tight text-zinc-900">
            Jersey Valley Admin Console
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={openCreateProductModal}
            className="px-4 py-2 bg-[#15803D] text-white text-xs font-semibold hover:bg-[#14532D] transition-colors flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add New Jersey</span>
          </button>
          <button
            type="button"
            onClick={loadAdminOverview}
            className="px-4 py-2 bg-[#111111] text-white text-xs font-semibold hover:bg-[#15803D] transition-colors flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh Data</span>
          </button>
          <button
            type="button"
            onClick={handleStandaloneLogout}
            className="px-4 py-2 bg-white border border-zinc-300 text-zinc-900 text-xs font-semibold hover:bg-red-50 hover:border-red-300 hover:text-red-800 transition-colors flex items-center gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Log Out ({adminActorId})</span>
          </button>
        </div>
      </div>

      {/* Verified Admin Status Strip */}
      <div className="bg-emerald-50/60 border border-[#15803D] p-4 flex flex-wrap items-center justify-between gap-4 text-xs text-zinc-800">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="w-4 h-4 text-[#15803D] shrink-0" />
          <span>
            <strong>
              {adminSessionMode === 'standalone'
                ? 'Temporary Standalone Administrator Session:'
                : 'Verified Firebase Administrator Session:'}
            </strong>{' '}
            <code className="font-mono-num font-bold">{adminActorId}</code> · All changes are
            validated on the server and persisted via <code>{persistenceBackend}</code>.
          </span>
        </div>
        <button
          type="button"
          onClick={handleStandaloneLogout}
          className="text-[#15803D] font-semibold hover:underline flex items-center gap-1"
        >
          <span>End Session</span>
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Navigation Tabs */}
      <div
        className="flex flex-wrap items-center gap-1 p-1 bg-zinc-200/80 w-fit"
        role="tablist"
        aria-label="Admin sections"
      >
        {[
          { id: 'overview', label: 'Overview', icon: LayoutDashboard },
          {
            id: 'products',
            label: `Products (${products.length})`,
            icon: ShoppingBag
          },
          { id: 'orders', label: `Orders (${orders.length})`, icon: Package },
          {
            id: 'customers',
            label: `Customers (${customers.length})`,
            icon: Users
          },
          {
            id: 'inventory',
            label: `Inventory & Logs (${lowStockItems.length} Low)`,
            icon: Layers
          },
          { id: 'settings', label: 'Settings & Coupons', icon: Settings }
        ].map((tab) => {
          const Icon = tab.icon;
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActiveTab(tab.id as AdminTab)}
              className={`px-4 py-2 text-xs font-semibold flex items-center gap-2 transition-colors ${
                selected ? 'bg-[#111111] text-white' : 'text-zinc-700 hover:text-zinc-900'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* =====================================================================
          TAB 1: DASHBOARD OVERVIEW
          ===================================================================== */}
      {activeTab === 'overview' && metrics && (
        <div className="space-y-8">
          {/* Genuine Order Lifecycle Breakdown */}
          <div>
            <h2 className="font-display text-lg font-bold uppercase text-zinc-900 mb-3">
              Genuine Order Lifecycle Breakdown (Excludes Demo Seed Orders)
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              <div className="bg-white border border-zinc-200 p-4">
                <span className="text-[11px] text-zinc-500 block">Total Genuine Orders</span>
                <strong className="text-2xl font-bold font-mono-num text-zinc-900">
                  {metrics.totalOrders}
                </strong>
                <span className="text-[10px] text-zinc-400 block mt-0.5">
                  +{metrics.demoOrdersCount} demo excluded
                </span>
              </div>
              <div className="bg-white border border-zinc-200 p-4">
                <span className="text-[11px] text-zinc-500 block">Pending Confirmation</span>
                <strong className="text-2xl font-bold font-mono-num text-amber-700">
                  {metrics.pendingOrdersCount}
                </strong>
              </div>
              <div className="bg-white border border-zinc-200 p-4">
                <span className="text-[11px] text-zinc-500 block">Confirmed / Processing</span>
                <strong className="text-2xl font-bold font-mono-num text-zinc-900">
                  {metrics.confirmedOrdersCount}
                </strong>
              </div>
              <div className="bg-white border border-zinc-200 p-4">
                <span className="text-[11px] text-zinc-500 block">Shipped (In Transit)</span>
                <strong className="text-2xl font-bold font-mono-num text-blue-700">
                  {metrics.shippedOrdersCount}
                </strong>
              </div>
              <div className="bg-white border border-zinc-200 p-4">
                <span className="text-[11px] text-zinc-500 block">Delivered</span>
                <strong className="text-2xl font-bold font-mono-num text-[#15803D]">
                  {metrics.deliveredOrdersCount}
                </strong>
              </div>
              <div className="bg-white border border-zinc-200 p-4">
                <span className="text-[11px] text-zinc-500 block">Cancelled</span>
                <strong className="text-2xl font-bold font-mono-num text-red-700">
                  {metrics.cancelledOrdersCount}
                </strong>
              </div>
            </div>
          </div>

          {/* Financial & Catalog Summary */}
          <div>
            <h2 className="font-display text-lg font-bold uppercase text-zinc-900 mb-3">
              Revenue &amp; Inventory Health (Genuine Orders Only)
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-zinc-200 p-4">
                <span className="text-[11px] text-zinc-500 block">
                  Total Sales (Completed / Verified)
                </span>
                <strong className="text-xl font-bold font-mono-num text-[#15803D]">
                  {formatBdt(metrics.totalSalesCompletedBdt)}
                </strong>
                <span className="text-[10px] text-zinc-400 block mt-0.5">
                  Delivered or payment verified
                </span>
              </div>
              <div className="bg-white border border-zinc-200 p-4">
                <span className="text-[11px] text-zinc-500 block">
                  Active Booked Order Volume
                </span>
                <strong className="text-xl font-bold font-mono-num text-zinc-900">
                  {formatBdt(metrics.totalRevenueBookedBdt)}
                </strong>
                <span className="text-[10px] text-zinc-400 block mt-0.5">
                  Verified Paid: {formatBdt(metrics.verifiedPaidRevenueBdt)}
                </span>
              </div>
              <div className="bg-white border border-zinc-200 p-4">
                <span className="text-[11px] text-zinc-500 block">Pending COD Collection</span>
                <strong className="text-xl font-bold font-mono-num text-amber-700">
                  {formatBdt(metrics.pendingCodBdt)}
                </strong>
                <span className="text-[10px] text-zinc-400 block mt-0.5">
                  Remains UNPAID_COD until doorstep cash collection
                </span>
              </div>
              <div className="bg-white border border-zinc-200 p-4">
                <span className="text-[11px] text-zinc-500 block">Catalog &amp; Total Stock</span>
                <strong className="text-xl font-bold font-mono-num text-zinc-900">
                  {metrics.activeProductsCount} Active · {metrics.totalStockUnits} Units
                </strong>
                <span className="text-[10px] text-zinc-400 block mt-0.5">
                  {metrics.archivedProductsCount} archived · {metrics.lowStockVariantsCount} low-stock
                  variants
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Recent Orders */}
            <div className="lg:col-span-7 bg-white border border-zinc-200 p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                <h3 className="font-display text-lg font-bold uppercase text-zinc-900">
                  Recent Orders
                </h3>
                <button
                  type="button"
                  onClick={() => setActiveTab('orders')}
                  className="text-xs font-semibold text-[#15803D] hover:underline"
                >
                  View All Orders →
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-200 text-left text-zinc-500">
                      <th className="py-2 pr-3">Order #</th>
                      <th className="py-2 pr-3">Customer</th>
                      <th className="py-2 pr-3">Total</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200">
                    {recentOrders.map((ord) => (
                      <tr key={ord.orderNumber}>
                        <td className="py-2.5 pr-3 font-mono-num font-bold text-zinc-900">
                          {ord.orderNumber}
                          {ord.isDemoOrder && (
                            <span className="ml-1.5 text-[10px] text-amber-700 font-sans">
                              (DEMO)
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 pr-3">
                          <span className="font-semibold text-zinc-900 block">
                            {ord.customerName}
                          </span>
                          <span className="text-zinc-500 font-mono-num">{ord.customerPhone}</span>
                        </td>
                        <td className="py-2.5 pr-3 font-mono-num font-semibold">
                          {formatBdt(ord.totalBdt)}
                        </td>
                        <td className="py-2.5 pr-3">
                          <span className="inline-block px-2 py-0.5 bg-zinc-100 text-zinc-800 font-mono-num text-[11px]">
                            {ord.orderStatus}
                          </span>
                        </td>
                        <td className="py-2.5">
                          <button
                            type="button"
                            onClick={() => setInspectedOrder(ord)}
                            className="text-[#15803D] font-semibold hover:underline"
                          >
                            Details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Low-Stock Alerts */}
            <div className="lg:col-span-5 bg-white border border-zinc-200 p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <h3 className="font-display text-lg font-bold uppercase text-zinc-900">
                    Low-Stock Variants (≤ 5 Units)
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('inventory')}
                  className="text-xs font-semibold text-[#15803D] hover:underline"
                >
                  Manage Stock →
                </button>
              </div>

              {lowStockItems.length === 0 ? (
                <p className="text-xs text-zinc-500">
                  All active jersey size variants have more than 5 units in stock.
                </p>
              ) : (
                <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                  {lowStockItems.map((item) => (
                    <div
                      key={`${item.productId}-${item.size}`}
                      className="p-3 bg-[#F7F7F5] border border-zinc-200 flex items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <strong className="text-zinc-900 block">{item.productName}</strong>
                        <span className="text-zinc-500 font-mono-num">
                          Size {item.size} · SKU: {item.sku} ·{' '}
                          <strong
                            className={item.stock === 0 ? 'text-red-700' : 'text-amber-700'}
                          >
                            {item.stock} left
                          </strong>
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          handleVariantStockUpdate(item.productId, item.size, item.stock + 5)
                        }
                        className="px-2.5 py-1 bg-[#111111] text-white text-[11px] font-semibold hover:bg-[#15803D] shrink-0"
                      >
                        +5 Restock
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 2: PRODUCT MANAGEMENT (ADD, EDIT, ARCHIVE, IMAGES, PAGINATION)
          ===================================================================== */}
      {activeTab === 'products' && (
        <div className="bg-white border border-zinc-200 p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-100 pb-4">
            <div>
              <h2 className="font-display text-xl font-bold uppercase text-zinc-900">
                Product Catalog Management
              </h2>
              <p className="text-xs text-zinc-500">
                Add new jerseys, upload Firebase Storage photos, configure regular &amp; sale
                prices, edit sizes and colors, or archive products.
              </p>
            </div>
            <button
              type="button"
              onClick={openCreateProductModal}
              className="px-4 py-2.5 bg-[#15803D] text-white text-xs font-semibold hover:bg-[#14532D] flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Add New Product</span>
            </button>
          </div>

          {/* Search & Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-2 relative">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2.5" />
              <input
                type="search"
                aria-label="Search products"
                value={productSearch}
                onChange={(e) => {
                  setProductSearch(e.target.value);
                  setProductPage(1);
                }}
                placeholder="Search by jersey name, team, slug, or season..."
                className="w-full pl-8 pr-3 py-2 bg-[#F7F7F5] border border-zinc-300 text-xs"
              />
            </div>

            <div>
              <select
                aria-label="Filter products by category"
                value={productCategoryFilter}
                onChange={(e) => {
                  setProductCategoryFilter(e.target.value);
                  setProductPage(1);
                }}
                className="w-full px-3 py-2 bg-[#F7F7F5] border border-zinc-300 text-xs"
              >
                <option value="all">All Categories</option>
                <option value="national">National Teams</option>
                <option value="club">Club Kits</option>
                <option value="retro">Heritage Retro</option>
              </select>
            </div>

            <div>
              <select
                aria-label="Filter products by status"
                value={productStatusFilter}
                onChange={(e) => {
                  setProductStatusFilter(e.target.value as 'all' | 'active' | 'archived');
                  setProductPage(1);
                }}
                className="w-full px-3 py-2 bg-[#F7F7F5] border border-zinc-300 text-xs"
              >
                <option value="all">All Statuses (Active &amp; Archived)</option>
                <option value="active">Active on Storefront</option>
                <option value="archived">Archived (Hidden)</option>
              </select>
            </div>
          </div>

          {/* Product List */}
          <div className="space-y-4">
            {paginatedProducts.map((prod) => {
              const totalStock = prod.variants.reduce((acc, v) => acc + v.stock, 0);
              const effectivePrice = getEffectiveProductPriceBdt(prod);
              return (
                <div
                  key={prod.id}
                  className={`p-4 border flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
                    prod.isActive
                      ? 'bg-[#F7F7F5] border-zinc-200'
                      : 'bg-zinc-100/70 border-zinc-300 opacity-75'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-14 bg-white border border-zinc-200 shrink-0 overflow-hidden">
                      {prod.imageUrls && prod.imageUrls.length > 0 ? (
                        <img
                          src={prod.imageUrls[0]}
                          alt={prod.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <JerseyVisualizer
                          visual={prod.visual}
                          team={prod.team}
                          editionTier={prod.editionTier}
                          view="front"
                          className="w-full h-full"
                        />
                      )}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          to={`/product/${prod.slug}`}
                          className="text-sm font-bold text-zinc-900 hover:text-[#15803D]"
                        >
                          {prod.name}
                        </Link>
                        {!prod.isActive && (
                          <span className="px-2 py-0.5 bg-zinc-800 text-white text-[10px] font-semibold uppercase">
                            Archived
                          </span>
                        )}
                        {prod.salePriceBdt && prod.salePriceBdt < prod.priceBdt && (
                          <span className="px-2 py-0.5 bg-emerald-100 text-[#15803D] text-[10px] font-semibold uppercase">
                            On Sale
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-600 font-mono-num mt-0.5">
                        {prod.team} · {prod.category.toUpperCase()} · {prod.kitType} ·{' '}
                        {prod.editionTier} · Price: <strong>{formatBdt(effectivePrice)}</strong>
                        {effectivePrice < prod.priceBdt && (
                          <span className="line-through text-zinc-400 ml-1">
                            {formatBdt(prod.priceBdt)}
                          </span>
                        )}{' '}
                        · Total Stock: <strong>{totalStock}</strong> units
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEditProductModal(prod)}
                      className="px-3 py-1.5 bg-white border border-zinc-300 text-xs font-semibold text-zinc-800 hover:border-zinc-900 flex items-center gap-1.5"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Edit Product</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleProductArchive(prod)}
                      className="px-3 py-1.5 bg-white border border-zinc-300 text-xs font-semibold text-zinc-800 hover:border-zinc-900 flex items-center gap-1.5"
                    >
                      {prod.isActive ? (
                        <>
                          <Archive className="w-3.5 h-3.5" />
                          <span>Archive</span>
                        </>
                      ) : (
                        <>
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Restore</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between pt-3 border-t border-zinc-200 text-xs text-zinc-600">
            <span>
              Showing {paginatedProducts.length} of {filteredProducts.length} products (Page{' '}
              {productPage} of {totalProductPages})
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={productPage <= 1}
                onClick={() => setProductPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 border border-zinc-300 bg-white disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={productPage >= totalProductPages}
                onClick={() => setProductPage((p) => Math.min(totalProductPages, p + 1))}
                className="px-3 py-1.5 border border-zinc-300 bg-white disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 3: ORDER MANAGEMENT
          ===================================================================== */}
      {activeTab === 'orders' && (
        <div className="bg-white border border-zinc-200 p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 pb-3">
            <div>
              <h2 className="font-display text-xl font-bold uppercase text-zinc-900">
                Customer Orders &amp; COD Lifecycle Control
              </h2>
              <p className="text-xs text-zinc-500">
                Search orders, inspect itemized customizations and delivery addresses, and update
                fulfillment and payment states. Cancelling an order automatically restores stock.
              </p>
            </div>
          </div>

          {/* Search & Status Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2.5" />
              <input
                type="search"
                aria-label="Search orders"
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
                placeholder="Search order #, customer, phone, district..."
                className="w-full pl-8 pr-3 py-2 bg-[#F7F7F5] border border-zinc-300 text-xs"
              />
            </div>

            <select
              aria-label="Filter by order status"
              value={orderStatusFilter}
              onChange={(e) => setOrderStatusFilter(e.target.value)}
              className="w-full px-3 py-2 bg-[#F7F7F5] border border-zinc-300 text-xs"
            >
              <option value="all">All Fulfillment Statuses</option>
              <option value="PENDING_CONFIRMATION">PENDING_CONFIRMATION</option>
              <option value="CONFIRMED">CONFIRMED</option>
              <option value="PROCESSING">PROCESSING</option>
              <option value="SHIPPED">SHIPPED</option>
              <option value="DELIVERED">DELIVERED</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>

            <select
              aria-label="Filter by payment status"
              value={paymentStatusFilter}
              onChange={(e) => setPaymentStatusFilter(e.target.value)}
              className="w-full px-3 py-2 bg-[#F7F7F5] border border-zinc-300 text-xs"
            >
              <option value="all">All Payment Statuses</option>
              <option value="UNPAID_COD">UNPAID_COD</option>
              <option value="PENDING_VERIFICATION">PENDING_VERIFICATION</option>
              <option value="VERIFIED">VERIFIED (Paid)</option>
              <option value="REFUNDED">REFUNDED</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-zinc-500">
                  <th className="py-2.5 pr-4">Order #</th>
                  <th className="py-2.5 pr-4">Customer &amp; Phone</th>
                  <th className="py-2.5 pr-4">Location</th>
                  <th className="py-2.5 pr-4">Total (BDT)</th>
                  <th className="py-2.5 pr-4">Fulfillment Status</th>
                  <th className="py-2.5 pr-4">Payment Status</th>
                  <th className="py-2.5">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {filteredOrders.map((ord) => (
                  <tr key={ord.orderNumber}>
                    <td className="py-3 pr-4 font-mono-num font-bold text-zinc-900">
                      <span>{ord.orderNumber}</span>
                      {ord.isDemoOrder && (
                        <span className="block text-[10px] font-sans font-semibold text-amber-700">
                          DEMO RECORD
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <span className="font-semibold text-zinc-900 block">{ord.customerName}</span>
                      <span className="font-mono-num text-zinc-500">{ord.customerPhone}</span>
                    </td>
                    <td className="py-3 pr-4 text-zinc-600">
                      {ord.upazila}, {ord.district} ({ord.division})
                    </td>
                    <td className="py-3 pr-4 font-mono-num font-semibold text-zinc-900">
                      {formatBdt(ord.totalBdt)} ({ord.paymentMethod})
                    </td>
                    <td className="py-3 pr-4">
                      <select
                        aria-label={`Fulfillment status for ${ord.orderNumber}`}
                        value={ord.orderStatus}
                        onChange={(e) =>
                          handleOrderUpdate(
                            ord.orderNumber,
                            e.target.value as OrderStatus,
                            ord.paymentStatus
                          )
                        }
                        className="px-2.5 py-1.5 bg-[#F7F7F5] border border-zinc-300 text-xs font-mono-num"
                      >
                        <option value="PENDING_CONFIRMATION">PENDING_CONFIRMATION</option>
                        <option value="CONFIRMED">CONFIRMED</option>
                        <option value="PROCESSING">PROCESSING</option>
                        <option value="SHIPPED">SHIPPED</option>
                        <option value="DELIVERED">DELIVERED</option>
                        <option value="CANCELLED">CANCELLED</option>
                      </select>
                    </td>
                    <td className="py-3 pr-4">
                      <select
                        aria-label={`Payment status for ${ord.orderNumber}`}
                        value={ord.paymentStatus}
                        onChange={(e) =>
                          handleOrderUpdate(
                            ord.orderNumber,
                            ord.orderStatus,
                            e.target.value as PaymentStatus
                          )
                        }
                        className="px-2.5 py-1.5 bg-[#F7F7F5] border border-zinc-300 text-xs font-mono-num"
                      >
                        <option value="UNPAID_COD">UNPAID_COD</option>
                        <option value="PENDING_VERIFICATION">PENDING_VERIFICATION</option>
                        <option value="VERIFIED">VERIFIED (Paid)</option>
                        <option value="REFUNDED">REFUNDED</option>
                      </select>
                    </td>
                    <td className="py-3">
                      <button
                        type="button"
                        onClick={() => setInspectedOrder(ord)}
                        className="text-[#15803D] font-semibold hover:underline flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Inspect</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 4: CUSTOMER MANAGEMENT
          ===================================================================== */}
      {activeTab === 'customers' && (
        <div className="bg-white border border-zinc-200 p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-100 pb-3">
            <div>
              <h2 className="font-display text-xl font-bold uppercase text-zinc-900">
                Customer Directory &amp; Order History
              </h2>
              <p className="text-xs text-zinc-500">
                View verified customer profiles and genuine order history. Authentication secrets,
                passwords, and guest access tokens are never exposed.
              </p>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2.5" />
              <input
                type="search"
                aria-label="Search customers"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                placeholder="Search name, phone, email, or UID..."
                className="w-full pl-8 pr-3 py-2 bg-[#F7F7F5] border border-zinc-300 text-xs"
              />
            </div>
          </div>

          {filteredCustomers.length === 0 ? (
            <p className="text-xs text-zinc-500 py-6">
              No genuine customer records match your filter yet.
            </p>
          ) : (
            <div className="space-y-3">
              {filteredCustomers.map((cust) => {
                const isExpanded = expandedCustomerKey === cust.customerKey;
                return (
                  <div
                    key={cust.customerKey}
                    className="border border-zinc-200 bg-[#F7F7F5] p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <strong className="text-sm text-zinc-900">{cust.name}</strong>
                          <span className="px-2 py-0.5 text-[10px] font-semibold bg-white border border-zinc-300 text-zinc-700">
                            {cust.isRegisteredUser ? 'Registered Account' : 'Guest Checkout'}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-600 font-mono-num mt-0.5">
                          Phone: {cust.phone || '—'} · Email: {cust.email || '—'}{' '}
                          {cust.uid && `· UID: ${cust.uid}`}
                        </p>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          Location: {cust.upazila ? `${cust.upazila}, ` : ''}
                          {cust.district} ({cust.division})
                        </p>
                      </div>

                      <div className="flex items-center gap-4 text-xs font-mono-num">
                        <div className="text-right">
                          <span className="text-zinc-500 block">Genuine Orders</span>
                          <strong className="text-zinc-900">{cust.totalOrders}</strong>
                        </div>
                        <div className="text-right">
                          <span className="text-zinc-500 block">Total Spent</span>
                          <strong className="text-[#15803D]">
                            {formatBdt(cust.totalSpentBdt)}
                          </strong>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedCustomerKey(isExpanded ? null : cust.customerKey)
                          }
                          className="px-3 py-1.5 bg-white border border-zinc-300 text-zinc-800 font-sans font-semibold hover:border-zinc-900"
                        >
                          {isExpanded ? 'Hide History' : `Order History (${cust.orders.length})`}
                        </button>
                      </div>
                    </div>

                    {isExpanded && cust.orders.length > 0 && (
                      <div className="bg-white border border-zinc-200 p-3 space-y-2 text-xs">
                        {cust.orders.map((ord) => (
                          <div
                            key={ord.orderNumber}
                            className="flex flex-wrap items-center justify-between gap-2 border-b last:border-b-0 border-zinc-100 pb-2 last:pb-0"
                          >
                            <div className="font-mono-num">
                              <strong className="text-zinc-900">{ord.orderNumber}</strong> ·{' '}
                              {ord.createdAt.split('T')[0]} · {ord.itemCount} item(s) ·{' '}
                              <strong>{formatBdt(ord.totalBdt)}</strong>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 bg-zinc-100 font-mono-num text-[11px]">
                                {ord.orderStatus} / {ord.paymentStatus}
                              </span>
                              <button
                                type="button"
                                onClick={() => setInspectedOrder(ord)}
                                className="text-[#15803D] font-semibold hover:underline"
                              >
                                Inspect →
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          TAB 5: INVENTORY MANAGEMENT & STOCK ADJUSTMENT AUDIT LOG
          ===================================================================== */}
      {activeTab === 'inventory' && (
        <div className="space-y-6">
          <div className="bg-white border border-zinc-200 p-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-100 pb-3">
              <div>
                <h2 className="font-display text-xl font-bold uppercase text-zinc-900">
                  Size-Specific Variant Stock Management
                </h2>
                <p className="text-xs text-zinc-500">
                  Update stock counts per size variant (S to XXL). Every adjustment is validated on
                  the server and recorded in the timestamped audit log below.
                </p>
              </div>
              <div className="w-full sm:w-80">
                <label
                  htmlFor="stock-reason"
                  className="block text-[11px] font-semibold text-zinc-600 mb-1"
                >
                  Adjustment Note / Reason
                </label>
                <input
                  id="stock-reason"
                  type="text"
                  value={stockReasonInput}
                  onChange={(e) => setStockReasonInput(e.target.value)}
                  className="w-full px-3 py-1.5 bg-[#F7F7F5] border border-zinc-300 text-xs"
                />
              </div>
            </div>

            <div className="space-y-4">
              {products.map((prod) => (
                <div
                  key={prod.id}
                  className="p-4 bg-[#F7F7F5] border border-zinc-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  <div>
                    <Link
                      to={`/product/${prod.slug}`}
                      className="text-sm font-bold text-zinc-900 hover:text-[#15803D]"
                    >
                      {prod.name}
                    </Link>
                    <p className="text-xs text-zinc-500 font-mono-num mt-0.5">
                      {prod.team} · {prod.editionTier} · Base Price: {formatBdt(prod.priceBdt)}
                      {prod.salePriceBdt ? ` · Sale: ${formatBdt(prod.salePriceBdt)}` : ''}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    {prod.variants.map((v) => {
                      const key = `${prod.id}:${v.size}`;
                      const draftVal = stockDrafts[key] ?? v.stock;
                      return (
                        <div
                          key={v.sku}
                          className="bg-white border border-zinc-300 px-2.5 py-2 flex items-center gap-1.5 text-xs font-mono-num"
                        >
                          <span className="font-bold text-zinc-900">{v.size}:</span>
                          <button
                            type="button"
                            onClick={() =>
                              handleVariantStockUpdate(prod.id, v.size, Math.max(0, v.stock - 1))
                            }
                            aria-label={`Decrease ${prod.name} size ${v.size} stock`}
                            className="w-5 h-5 bg-zinc-100 hover:bg-zinc-200 font-bold"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min={0}
                            max={5000}
                            aria-label={`${prod.name} size ${v.size} stock quantity`}
                            value={draftVal}
                            onChange={(e) =>
                              setStockDrafts((prev) => ({
                                ...prev,
                                [key]: Math.max(0, Number(e.target.value))
                              }))
                            }
                            onBlur={() => {
                              if (draftVal !== v.stock) {
                                handleVariantStockUpdate(prod.id, v.size, draftVal);
                              }
                            }}
                            className="w-12 text-center font-semibold border border-zinc-200 py-0.5"
                          />
                          <button
                            type="button"
                            onClick={() => handleVariantStockUpdate(prod.id, v.size, v.stock + 1)}
                            aria-label={`Increase ${prod.name} size ${v.size} stock`}
                            className="w-5 h-5 bg-zinc-100 hover:bg-zinc-200 font-bold"
                          >
                            +
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Timestamped Stock Adjustment Audit Log */}
          <div className="bg-white border border-zinc-200 p-6 space-y-4">
            <h3 className="font-display text-lg font-bold uppercase text-zinc-900">
              Timestamped Stock Adjustment Audit Log
            </h3>
            {stockLogs.length === 0 ? (
              <p className="text-xs text-zinc-500">
                No manual stock adjustments or cancellation restocks recorded yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse font-mono-num">
                  <thead>
                    <tr className="border-b border-zinc-200 text-left text-zinc-500 font-sans">
                      <th className="py-2 pr-3">Timestamp</th>
                      <th className="py-2 pr-3">Product &amp; Size</th>
                      <th className="py-2 pr-3">Stock Change</th>
                      <th className="py-2 pr-3">Reason</th>
                      <th className="py-2">Actor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200">
                    {stockLogs.map((log) => (
                      <tr key={log.id}>
                        <td className="py-2 pr-3 text-zinc-500">
                          {log.timestamp.replace('T', ' ').slice(0, 19)} UTC
                        </td>
                        <td className="py-2 pr-3 font-sans font-semibold text-zinc-900">
                          {log.productName} ({log.size})
                        </td>
                        <td className="py-2 pr-3">
                          {log.previousStock} → <strong>{log.newStock}</strong> (
                          <span
                            className={log.delta >= 0 ? 'text-[#15803D]' : 'text-red-700'}
                          >
                            {log.delta >= 0 ? `+${log.delta}` : log.delta}
                          </span>
                          )
                        </td>
                        <td className="py-2 pr-3 font-sans text-zinc-600">{log.reason}</td>
                        <td className="py-2 text-zinc-500">{log.actorEmail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 6: STORE SETTINGS & COUPONS
          ===================================================================== */}
      {activeTab === 'settings' && settingsForm && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Shipping, Store Contact & Return Settings */}
          <form
            onSubmit={handleSaveSettings}
            className="lg:col-span-7 bg-white border border-zinc-200 p-6 space-y-5"
          >
            <div className="border-b border-zinc-100 pb-3">
              <h2 className="font-display text-xl font-bold uppercase text-zinc-900">
                Bangladesh Shipping Rates &amp; Store Contact Settings
              </h2>
              <p className="text-xs text-zinc-500">
                Configure Inside/Outside Dhaka courier charges, free shipping threshold, return
                window, and storefront contact details.
              </p>
            </div>

            <div>
              <label
                htmlFor="adm-announcement"
                className="block text-xs font-semibold text-zinc-800 mb-1"
              >
                Top Announcement Bar Text
              </label>
              <input
                id="adm-announcement"
                type="text"
                value={settingsForm.announcementText}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, announcementText: e.target.value })
                }
                className="w-full px-3 py-2 bg-[#F7F7F5] border border-zinc-300 text-xs"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div>
                <label
                  htmlFor="adm-inside-dhaka"
                  className="block text-xs font-semibold text-zinc-800 mb-1"
                >
                  Inside Dhaka (৳)
                </label>
                <input
                  id="adm-inside-dhaka"
                  type="number"
                  min={0}
                  value={settingsForm.insideDhakaShippingBdt}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      insideDhakaShippingBdt: Number(e.target.value)
                    })
                  }
                  className="w-full px-3 py-2 bg-[#F7F7F5] border border-zinc-300 text-xs font-mono-num"
                />
              </div>

              <div>
                <label
                  htmlFor="adm-outside-dhaka"
                  className="block text-xs font-semibold text-zinc-800 mb-1"
                >
                  Outside Dhaka (৳)
                </label>
                <input
                  id="adm-outside-dhaka"
                  type="number"
                  min={0}
                  value={settingsForm.outsideDhakaShippingBdt}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      outsideDhakaShippingBdt: Number(e.target.value)
                    })
                  }
                  className="w-full px-3 py-2 bg-[#F7F7F5] border border-zinc-300 text-xs font-mono-num"
                />
              </div>

              <div>
                <label
                  htmlFor="adm-free-threshold"
                  className="block text-xs font-semibold text-zinc-800 mb-1"
                >
                  Free Shipping (৳)
                </label>
                <input
                  id="adm-free-threshold"
                  type="number"
                  min={0}
                  value={settingsForm.freeShippingThresholdBdt}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      freeShippingThresholdBdt: Number(e.target.value)
                    })
                  }
                  className="w-full px-3 py-2 bg-[#F7F7F5] border border-zinc-300 text-xs font-mono-num"
                />
              </div>

              <div>
                <label
                  htmlFor="adm-return-days"
                  className="block text-xs font-semibold text-zinc-800 mb-1"
                >
                  Return Window (Days)
                </label>
                <input
                  id="adm-return-days"
                  type="number"
                  min={1}
                  max={90}
                  value={settingsForm.returnWindowDays}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      returnWindowDays: Number(e.target.value)
                    })
                  }
                  className="w-full px-3 py-2 bg-[#F7F7F5] border border-zinc-300 text-xs font-mono-num"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-zinc-100">
              <div>
                <label
                  htmlFor="adm-support-phone"
                  className="block text-xs font-semibold text-zinc-800 mb-1"
                >
                  Store Support Phone (Bangladesh)
                </label>
                <input
                  id="adm-support-phone"
                  type="text"
                  value={settingsForm.supportPhone || ''}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, supportPhone: e.target.value })
                  }
                  placeholder="01711-000000"
                  className="w-full px-3 py-2 bg-[#F7F7F5] border border-zinc-300 text-xs font-mono-num"
                />
              </div>

              <div>
                <label
                  htmlFor="adm-support-email"
                  className="block text-xs font-semibold text-zinc-800 mb-1"
                >
                  Store Support Email
                </label>
                <input
                  id="adm-support-email"
                  type="email"
                  value={settingsForm.supportEmail || ''}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, supportEmail: e.target.value })
                  }
                  placeholder="support@jerseyvalley.com.bd"
                  className="w-full px-3 py-2 bg-[#F7F7F5] border border-zinc-300 text-xs"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="adm-store-address"
                className="block text-xs font-semibold text-zinc-800 mb-1"
              >
                Dispatch / Hub Address
              </label>
              <input
                id="adm-store-address"
                type="text"
                value={settingsForm.storeAddress || ''}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, storeAddress: e.target.value })
                }
                placeholder="Panthapath, Dhaka 1215, Bangladesh"
                className="w-full px-3 py-2 bg-[#F7F7F5] border border-zinc-300 text-xs"
              />
            </div>

            <button
              type="submit"
              className="px-5 py-2.5 bg-[#111111] text-white text-xs font-semibold hover:bg-[#15803D] transition-colors"
            >
              Save Store Settings
            </button>
          </form>

          {/* Coupon & Discount Rules Manager */}
          <div className="lg:col-span-5 bg-white border border-zinc-200 p-6 space-y-5">
            <div className="border-b border-zinc-100 pb-3 flex items-center justify-between">
              <div>
                <h2 className="font-display text-xl font-bold uppercase text-zinc-900">
                  Coupons &amp; Discount Rules
                </h2>
                <p className="text-xs text-zinc-500">
                  Create or update promotional codes validated on the server during checkout.
                </p>
              </div>
              <Tag className="w-4 h-4 text-[#15803D]" />
            </div>

            <div className="space-y-2.5">
              {coupons.map((c) => (
                <div
                  key={c.code}
                  className={`p-3 border flex items-center justify-between gap-2 text-xs ${
                    c.isActive
                      ? 'bg-[#F7F7F5] border-zinc-200'
                      : 'bg-zinc-100 border-zinc-200 opacity-60'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <strong className="font-mono-num text-zinc-900">{c.code}</strong>
                      <span className="text-[10px] px-1.5 py-0.5 bg-white border border-zinc-300">
                        {c.discountType === 'PERCENTAGE'
                          ? `${c.value}% OFF`
                          : `৳${c.value} OFF`}
                      </span>
                      {!c.isActive && (
                        <span className="text-[10px] text-red-700 font-semibold">INACTIVE</span>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      Min Subtotal: {formatBdt(c.minSubtotalBdt)} · {c.description}
                    </p>
                  </div>
                  {c.isActive && (
                    <button
                      type="button"
                      onClick={() => handleDeleteCoupon(c.code)}
                      aria-label={`Deactivate coupon ${c.code}`}
                      className="p-1.5 text-zinc-500 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <form onSubmit={handleSaveCoupon} className="space-y-3 pt-3 border-t border-zinc-200">
              <strong className="text-xs text-zinc-900 block">
                Add or Update Coupon Code
              </strong>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label
                    htmlFor="coup-code"
                    className="block text-[11px] font-semibold text-zinc-700 mb-1"
                  >
                    Coupon Code
                  </label>
                  <input
                    id="coup-code"
                    type="text"
                    required
                    value={couponForm.code}
                    onChange={(e) =>
                      setCouponForm({ ...couponForm, code: e.target.value.toUpperCase() })
                    }
                    placeholder="EID250"
                    className="w-full px-2.5 py-1.5 bg-[#F7F7F5] border border-zinc-300 text-xs font-mono-num"
                  />
                </div>
                <div>
                  <label
                    htmlFor="coup-type"
                    className="block text-[11px] font-semibold text-zinc-700 mb-1"
                  >
                    Discount Type
                  </label>
                  <select
                    id="coup-type"
                    value={couponForm.discountType}
                    onChange={(e) =>
                      setCouponForm({
                        ...couponForm,
                        discountType: e.target.value as 'PERCENTAGE' | 'FIXED_BDT'
                      })
                    }
                    className="w-full px-2.5 py-1.5 bg-[#F7F7F5] border border-zinc-300 text-xs"
                  >
                    <option value="PERCENTAGE">Percentage (%)</option>
                    <option value="FIXED_BDT">Fixed Amount (৳)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label
                    htmlFor="coup-val"
                    className="block text-[11px] font-semibold text-zinc-700 mb-1"
                  >
                    Value ({couponForm.discountType === 'PERCENTAGE' ? '%' : '৳'})
                  </label>
                  <input
                    id="coup-val"
                    type="number"
                    required
                    min={1}
                    value={couponForm.value}
                    onChange={(e) =>
                      setCouponForm({ ...couponForm, value: Number(e.target.value) })
                    }
                    className="w-full px-2.5 py-1.5 bg-[#F7F7F5] border border-zinc-300 text-xs font-mono-num"
                  />
                </div>
                <div>
                  <label
                    htmlFor="coup-min"
                    className="block text-[11px] font-semibold text-zinc-700 mb-1"
                  >
                    Min Subtotal (৳)
                  </label>
                  <input
                    id="coup-min"
                    type="number"
                    min={0}
                    value={couponForm.minSubtotalBdt}
                    onChange={(e) =>
                      setCouponForm({ ...couponForm, minSubtotalBdt: Number(e.target.value) })
                    }
                    className="w-full px-2.5 py-1.5 bg-[#F7F7F5] border border-zinc-300 text-xs font-mono-num"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="coup-desc"
                  className="block text-[11px] font-semibold text-zinc-700 mb-1"
                >
                  Description
                </label>
                <input
                  id="coup-desc"
                  type="text"
                  required
                  value={couponForm.description}
                  onChange={(e) =>
                    setCouponForm({ ...couponForm, description: e.target.value })
                  }
                  placeholder="Flat ৳250 off on orders ৳2,000+"
                  className="w-full px-2.5 py-1.5 bg-[#F7F7F5] border border-zinc-300 text-xs"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2 bg-[#15803D] text-white text-xs font-semibold hover:bg-[#14532D]"
              >
                Save Coupon Rule
              </button>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 1: CREATE / EDIT PRODUCT MODAL
          ===================================================================== */}
      {productModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-label={editingProductId ? 'Edit Jersey Product' : 'Add New Jersey Product'}
        >
          <div className="bg-white border border-zinc-300 max-w-4xl w-full p-6 my-8 space-y-5 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
              <h3 className="font-display text-2xl font-bold uppercase text-zinc-900">
                {editingProductId ? `Edit Jersey: ${productDraft.name}` : 'Add New Jersey Product'}
              </h3>
              <button
                type="button"
                onClick={() => setProductModalOpen(false)}
                aria-label="Close product modal"
                className="p-1 text-zinc-500 hover:text-zinc-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="space-y-5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label
                    htmlFor="prd-name"
                    className="block font-semibold text-zinc-800 mb-1"
                  >
                    Jersey Name *
                  </label>
                  <input
                    id="prd-name"
                    type="text"
                    required
                    value={productDraft.name}
                    onChange={(e) =>
                      setProductDraft({ ...productDraft, name: e.target.value })
                    }
                    placeholder="Brazil 2026 Home Fan Replica Jersey"
                    className="w-full px-3 py-2 bg-[#F7F7F5] border border-zinc-300"
                  />
                </div>
                <div>
                  <label
                    htmlFor="prd-team"
                    className="block font-semibold text-zinc-800 mb-1"
                  >
                    Team / Nation *
                  </label>
                  <input
                    id="prd-team"
                    type="text"
                    required
                    value={productDraft.team}
                    onChange={(e) =>
                      setProductDraft({ ...productDraft, team: e.target.value })
                    }
                    placeholder="Brazil"
                    className="w-full px-3 py-2 bg-[#F7F7F5] border border-zinc-300"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label
                    htmlFor="prd-cat"
                    className="block font-semibold text-zinc-800 mb-1"
                  >
                    Category
                  </label>
                  <select
                    id="prd-cat"
                    value={productDraft.category}
                    onChange={(e) =>
                      setProductDraft({
                        ...productDraft,
                        category: e.target.value as JerseyCategory
                      })
                    }
                    className="w-full px-2.5 py-2 bg-[#F7F7F5] border border-zinc-300"
                  >
                    <option value="national">National Team</option>
                    <option value="club">Club</option>
                    <option value="retro">Retro</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="prd-kit"
                    className="block font-semibold text-zinc-800 mb-1"
                  >
                    Kit Type
                  </label>
                  <select
                    id="prd-kit"
                    value={productDraft.kitType}
                    onChange={(e) =>
                      setProductDraft({
                        ...productDraft,
                        kitType: e.target.value as KitType
                      })
                    }
                    className="w-full px-2.5 py-2 bg-[#F7F7F5] border border-zinc-300"
                  >
                    <option value="Home">Home</option>
                    <option value="Away">Away</option>
                    <option value="Third">Third</option>
                    <option value="Retro">Retro</option>
                    <option value="Special">Special</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="prd-tier"
                    className="block font-semibold text-zinc-800 mb-1"
                  >
                    Edition Tier
                  </label>
                  <select
                    id="prd-tier"
                    value={productDraft.editionTier}
                    onChange={(e) =>
                      setProductDraft({
                        ...productDraft,
                        editionTier: e.target.value as EditionTier
                      })
                    }
                    className="w-full px-2.5 py-2 bg-[#F7F7F5] border border-zinc-300"
                  >
                    <option value="Fan Replica">Fan Replica</option>
                    <option value="Player Fit Replica">Player Fit Replica</option>
                    <option value="Heritage Retro Replica">Heritage Retro Replica</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="prd-gender"
                    className="block font-semibold text-zinc-800 mb-1"
                  >
                    Fit / Gender
                  </label>
                  <select
                    id="prd-gender"
                    value={productDraft.gender || 'Unisex'}
                    onChange={(e) =>
                      setProductDraft({
                        ...productDraft,
                        gender: e.target.value as GenderFit
                      })
                    }
                    className="w-full px-2.5 py-2 bg-[#F7F7F5] border border-zinc-300"
                  >
                    <option value="Unisex">Unisex</option>
                    <option value="Men">Men</option>
                    <option value="Women">Women</option>
                    <option value="Kids">Kids</option>
                  </select>
                </div>
              </div>

              {/* Pricing */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label
                    htmlFor="prd-price"
                    className="block font-semibold text-zinc-800 mb-1"
                  >
                    Regular Price (৳ BDT) *
                  </label>
                  <input
                    id="prd-price"
                    type="number"
                    required
                    min={300}
                    max={25000}
                    value={productDraft.priceBdt}
                    onChange={(e) =>
                      setProductDraft({ ...productDraft, priceBdt: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 bg-[#F7F7F5] border border-zinc-300 font-mono-num"
                  />
                </div>

                <div>
                  <label
                    htmlFor="prd-sale-price"
                    className="block font-semibold text-zinc-800 mb-1"
                  >
                    Sale Price (৳ BDT — Optional)
                  </label>
                  <input
                    id="prd-sale-price"
                    type="number"
                    min={200}
                    max={24999}
                    value={productDraft.salePriceBdt ?? ''}
                    onChange={(e) =>
                      setProductDraft({
                        ...productDraft,
                        salePriceBdt: e.target.value === '' ? null : Number(e.target.value)
                      })
                    }
                    placeholder="Leave blank if not on sale"
                    className="w-full px-3 py-2 bg-[#F7F7F5] border border-zinc-300 font-mono-num"
                  />
                </div>

                <div>
                  <label
                    htmlFor="prd-print-price"
                    className="block font-semibold text-zinc-800 mb-1"
                  >
                    Custom Name/Number Fee (৳)
                  </label>
                  <input
                    id="prd-print-price"
                    type="number"
                    min={0}
                    max={5000}
                    value={productDraft.customPrintPriceBdt ?? 350}
                    onChange={(e) =>
                      setProductDraft({
                        ...productDraft,
                        customPrintPriceBdt: Number(e.target.value)
                      })
                    }
                    className="w-full px-3 py-2 bg-[#F7F7F5] border border-zinc-300 font-mono-num"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label
                  htmlFor="prd-desc"
                  className="block font-semibold text-zinc-800 mb-1"
                >
                  Description &amp; Replica Disclosure *
                </label>
                <textarea
                  id="prd-desc"
                  rows={3}
                  required
                  value={productDraft.description}
                  onChange={(e) =>
                    setProductDraft({ ...productDraft, description: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-[#F7F7F5] border border-zinc-300"
                />
              </div>

              {/* Stock by Size */}
              <div className="p-4 bg-[#F7F7F5] border border-zinc-200 space-y-2">
                <strong className="block text-zinc-900">Stock by Size Variant (S – XXL)</strong>
                <div className="grid grid-cols-5 gap-3">
                  {ALL_SIZES.map((size) => {
                    const currentVar = productDraft.variants?.find((v) => v.size === size);
                    return (
                      <div key={size}>
                        <label
                          htmlFor={`prd-stk-${size}`}
                          className="block text-[11px] font-bold text-zinc-700 mb-1"
                        >
                          Size {size}
                        </label>
                        <input
                          id={`prd-stk-${size}`}
                          type="number"
                          min={0}
                          max={5000}
                          value={currentVar?.stock ?? 0}
                          onChange={(e) => {
                            const nextVal = Math.max(0, Number(e.target.value));
                            setProductDraft((prev) => ({
                              ...prev,
                              variants: ALL_SIZES.map((s) => {
                                const ex = prev.variants?.find((v) => v.size === s);
                                return s === size
                                  ? { size: s, stock: nextVal, isActive: true }
                                  : ex || { size: s, stock: 10, isActive: true };
                              })
                            }));
                          }}
                          className="w-full px-2.5 py-1.5 bg-white border border-zinc-300 font-mono-num"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Colors & Visual Spec */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center p-4 bg-[#F7F7F5] border border-zinc-200">
                <div className="sm:col-span-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label
                      htmlFor="prd-col-pri"
                      className="block text-[11px] font-semibold text-zinc-700 mb-1"
                    >
                      Primary Color
                    </label>
                    <input
                      id="prd-col-pri"
                      type="color"
                      value={productDraft.visual?.primaryColor || '#111111'}
                      onChange={(e) =>
                        setProductDraft({
                          ...productDraft,
                          visual: { ...productDraft.visual, primaryColor: e.target.value }
                        })
                      }
                      className="w-full h-9 bg-white border border-zinc-300 cursor-pointer"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="prd-col-sec"
                      className="block text-[11px] font-semibold text-zinc-700 mb-1"
                    >
                      Secondary Color
                    </label>
                    <input
                      id="prd-col-sec"
                      type="color"
                      value={productDraft.visual?.secondaryColor || '#FFFFFF'}
                      onChange={(e) =>
                        setProductDraft({
                          ...productDraft,
                          visual: { ...productDraft.visual, secondaryColor: e.target.value }
                        })
                      }
                      className="w-full h-9 bg-white border border-zinc-300 cursor-pointer"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="prd-col-acc"
                      className="block text-[11px] font-semibold text-zinc-700 mb-1"
                    >
                      Accent Color
                    </label>
                    <input
                      id="prd-col-acc"
                      type="color"
                      value={productDraft.visual?.accentColor || '#15803D'}
                      onChange={(e) =>
                        setProductDraft({
                          ...productDraft,
                          visual: { ...productDraft.visual, accentColor: e.target.value }
                        })
                      }
                      className="w-full h-9 bg-white border border-zinc-300 cursor-pointer"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="prd-pattern"
                      className="block text-[11px] font-semibold text-zinc-700 mb-1"
                    >
                      Kit Pattern
                    </label>
                    <select
                      id="prd-pattern"
                      value={productDraft.visual?.pattern || 'solid'}
                      onChange={(e) =>
                        setProductDraft({
                          ...productDraft,
                          visual: {
                            ...productDraft.visual,
                            pattern: e.target.value as KitVisualSpec['pattern']
                          }
                        })
                      }
                      className="w-full px-2 py-2 bg-white border border-zinc-300"
                    >
                      <option value="solid">Solid</option>
                      <option value="stripes">Vertical Stripes</option>
                      <option value="pinstripe">Pinstripes</option>
                      <option value="hoops">Horizontal Hoops</option>
                      <option value="halves">Split Halves</option>
                      <option value="sash">Diagonal Sash</option>
                    </select>
                  </div>
                </div>

                <div className="sm:col-span-4 h-32 bg-white border border-zinc-200 overflow-hidden">
                  <JerseyVisualizer
                    visual={{
                      primaryColor: productDraft.visual?.primaryColor || '#111111',
                      secondaryColor: productDraft.visual?.secondaryColor || '#FFFFFF',
                      accentColor: productDraft.visual?.accentColor || '#15803D',
                      textColor: productDraft.visual?.textColor || '#FFFFFF',
                      pattern: productDraft.visual?.pattern || 'solid',
                      collarStyle: productDraft.visual?.collarStyle || 'crew',
                      crestCode:
                        productDraft.visual?.crestCode ||
                        productDraft.team.slice(0, 3).toUpperCase() ||
                        'JVY',
                      defaultPreviewName: 'PREVIEW',
                      defaultPreviewNumber: '10'
                    }}
                    team={productDraft.team || 'Preview'}
                    editionTier={productDraft.editionTier}
                    view="front"
                    className="w-full h-full"
                  />
                </div>
              </div>

              {/* Firebase Storage Image Upload & Gallery Manager */}
              <div className="p-4 bg-[#F7F7F5] border border-zinc-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <strong className="block text-zinc-900">
                      Product Images (Firebase Storage Upload or HTTPS URL)
                    </strong>
                    <span className="text-[11px] text-zinc-500">
                      Upload jersey photos directly to Firebase Storage or paste a hosted image URL.
                    </span>
                  </div>
                  <label className="px-3 py-1.5 bg-[#111111] text-white text-xs font-semibold hover:bg-[#15803D] cursor-pointer flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{uploadingImage ? 'Uploading...' : 'Upload to Firebase Storage'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={uploadingImage}
                      onChange={handleFirebaseStorageUpload}
                      className="hidden"
                    />
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="url"
                    value={newImageUrlInput}
                    onChange={(e) => setNewImageUrlInput(e.target.value)}
                    placeholder="https://firebasestorage.googleapis.com/..."
                    className="flex-1 px-3 py-1.5 bg-white border border-zinc-300"
                  />
                  <button
                    type="button"
                    onClick={handleAddExternalImageUrl}
                    className="px-3 py-1.5 bg-white border border-zinc-300 font-semibold hover:border-zinc-900"
                  >
                    Add Image URL
                  </button>
                </div>

                {productDraft.imageUrls && productDraft.imageUrls.length > 0 && (
                  <div className="flex flex-wrap gap-3 pt-2">
                    {productDraft.imageUrls.map((imgUrl) => (
                      <div
                        key={imgUrl}
                        className="relative w-20 h-20 border border-zinc-300 bg-white overflow-hidden group"
                      >
                        <img
                          src={imgUrl}
                          alt="Uploaded jersey"
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveProductImage(imgUrl)}
                          aria-label="Remove product image"
                          className="absolute top-1 right-1 p-1 bg-black/80 text-white hover:bg-red-700"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => setProductModalOpen(false)}
                  className="px-4 py-2 border border-zinc-300 text-zinc-700 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingProduct}
                  className="px-5 py-2 bg-[#15803D] text-white font-semibold hover:bg-[#14532D]"
                >
                  {savingProduct
                    ? 'Saving...'
                    : editingProductId
                      ? 'Save Product Changes'
                      : 'Create Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 2: INSPECT ORDER DETAILS MODAL
          ===================================================================== */}
      {inspectedOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-label={`Order Details ${inspectedOrder.orderNumber}`}
        >
          <div className="bg-white border border-zinc-300 max-w-2xl w-full p-6 my-8 space-y-5 max-h-[90vh] overflow-y-auto text-xs">
            <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
              <div>
                <span className="text-[11px] text-zinc-500 font-mono-num">
                  PLACED {inspectedOrder.createdAt.replace('T', ' ').slice(0, 19)} UTC
                </span>
                <h3 className="font-display text-2xl font-bold uppercase text-zinc-900">
                  Order {inspectedOrder.orderNumber}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setInspectedOrder(null)}
                aria-label="Close order details"
                className="p-1 text-zinc-500 hover:text-zinc-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-[#F7F7F5] border border-zinc-200">
              <div>
                <strong className="text-zinc-900 block mb-1">Customer Contact</strong>
                <p>Name: {inspectedOrder.customerName}</p>
                <p className="font-mono-num">Phone: {inspectedOrder.customerPhone}</p>
                <p>Email: {inspectedOrder.customerEmail || '—'}</p>
              </div>
              <div>
                <strong className="text-zinc-900 block mb-1">Bangladesh Delivery Address</strong>
                <p>{inspectedOrder.streetAddress}</p>
                <p>
                  {inspectedOrder.upazila}, {inspectedOrder.district} ({inspectedOrder.division}){' '}
                  {inspectedOrder.postalCode}
                </p>
                {inspectedOrder.deliveryNotes && (
                  <p className="text-zinc-500 mt-1">Note: {inspectedOrder.deliveryNotes}</p>
                )}
              </div>
            </div>

            {/* Items */}
            <div className="space-y-2">
              <strong className="text-zinc-900 block">Ordered Items</strong>
              <div className="divide-y divide-zinc-200 border border-zinc-200">
                {inspectedOrder.items.map((item, idx) => (
                  <div
                    key={`${item.sku}-${idx}`}
                    className="p-3 flex items-center justify-between gap-4"
                  >
                    <div>
                      <strong className="text-zinc-900">{item.productName}</strong>
                      <p className="text-zinc-500 font-mono-num">
                        Size: {item.size} · Qty: {item.quantity} · SKU: {item.sku}
                        {item.hasCustomPrint &&
                          ` · Print: ${item.customName || ''} #${item.customNumber || ''}`}
                      </p>
                    </div>
                    <strong className="font-mono-num">{formatBdt(item.lineTotalBdt)}</strong>
                  </div>
                ))}
              </div>
            </div>

            {/* Totals */}
            <div className="p-4 bg-[#F7F7F5] border border-zinc-200 space-y-1 font-mono-num">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>{formatBdt(inspectedOrder.subtotalBdt)}</span>
              </div>
              {inspectedOrder.discountBdt > 0 && (
                <div className="flex justify-between text-[#15803D]">
                  <span>Discount ({inspectedOrder.appliedCouponCode}):</span>
                  <span>-{formatBdt(inspectedOrder.discountBdt)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Shipping ({inspectedOrder.shippingZoneLabel}):</span>
                <span>{formatBdt(inspectedOrder.shippingBdt)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-zinc-900 pt-2 border-t border-zinc-200">
                <span>Total ({inspectedOrder.paymentMethod}):</span>
                <span>{formatBdt(inspectedOrder.totalBdt)}</span>
              </div>
            </div>

            {/* Status Update with Note */}
            <div className="space-y-2 pt-2 border-t border-zinc-200">
              <strong className="text-zinc-900 block">
                Update Order Status / Add Fulfillment Note
              </strong>
              <input
                type="text"
                value={orderStatusNote}
                onChange={(e) => setOrderStatusNote(e.target.value)}
                placeholder="Optional note (e.g., Handed over to Pathao Courier Dhaka Hub)"
                className="w-full px-3 py-2 bg-[#F7F7F5] border border-zinc-300"
              />
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    'PENDING_CONFIRMATION',
                    'CONFIRMED',
                    'PROCESSING',
                    'SHIPPED',
                    'DELIVERED',
                    'CANCELLED'
                  ] as OrderStatus[]
                ).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() =>
                      handleOrderUpdate(
                        inspectedOrder.orderNumber,
                        st,
                        inspectedOrder.paymentStatus,
                        orderStatusNote || undefined
                      )
                    }
                    className={`px-2.5 py-1.5 border font-mono-num text-[11px] font-semibold ${
                      inspectedOrder.orderStatus === st
                        ? 'bg-[#111111] text-white border-[#111111]'
                        : 'bg-white text-zinc-800 border-zinc-300 hover:border-zinc-900'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            {/* Status History Timeline */}
            <div className="space-y-2 pt-2 border-t border-zinc-200">
              <strong className="text-zinc-900 block">Order Audit Timeline</strong>
              <div className="space-y-1.5">
                {inspectedOrder.statusHistory.map((h, i) => (
                  <div key={i} className="text-[11px] text-zinc-600 font-mono-num">
                    <span className="text-zinc-400">
                      {h.timestamp.replace('T', ' ').slice(0, 19)}
                    </span>{' '}
                    · <strong>{h.status}</strong> ({h.paymentStatus}) —{' '}
                    <span className="font-sans">{h.note}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
