/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { StoreProvider } from './context/StoreContext';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { CatalogPage } from './pages/CatalogPage';
import { ProductDetailPage } from './pages/ProductDetailPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { OrderTrackingPage } from './pages/OrderTrackingPage';
import { WishlistPage } from './pages/WishlistPage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';

const AnimatedRoutes: React.FC = () => {
  const location = useLocation();
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    if (!location.hash) {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
    }
  }, [location.pathname, location.hash]);

  return (
    <motion.div
      key={location.pathname}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
    >
      <Routes location={location}>
        <Route path="/" element={<HomePage />} />
        <Route path="/shop" element={<CatalogPage />} />
        <Route path="/product/:slug" element={<ProductDetailPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/track" element={<OrderTrackingPage />} />
        <Route path="/orders/:orderNumber" element={<OrderTrackingPage />} />
        <Route path="/wishlist" element={<WishlistPage />} />
        <Route path="/account" element={<Navigate to="/track" replace />} />
        <Route path="/admin" element={<AdminDashboardPage />} />
      </Routes>
    </motion.div>
  );
};

export default function App() {
  return (
    <BrowserRouter>
      <StoreProvider>
        <Layout>
          <AnimatedRoutes />
        </Layout>
      </StoreProvider>
    </BrowserRouter>
  );
}

