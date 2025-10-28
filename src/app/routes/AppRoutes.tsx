import { Suspense } from "react";
import { useRoutes } from "react-router-dom";

import HomePage from "../../pages/home/HomePage";
import MainLayout from "../../layouts/MainLayout";
import NotFound from "../../pages/notFound/NotFound";
import CartPage from "../../pages/cart/CartPage";
import OrderStatus from "../../features/orders/OrderStatus";

// const HomePage = lazy(() => import("@/pages/"));
// const ProductsPage = lazy(() => import("@/pages/Products/ProductsPage"));
// const CartPage = lazy(() => import("@/pages/Cart/CartPage"));
// const LoginPage = lazy(() => import("@/pages/Login/LoginPage"));
// const NotFound = lazy(() => import("@/pages/NotFound"));

export default function AppRoutes() {
  const routes = useRoutes([
    {
      element: <MainLayout />,
      children: [
        { path: "/", element: <HomePage /> },
//         { path: "/products", element: <ProductsPage /> },
        { path: "/cart", element: <CartPage /> },
        { path: "/orders", element: <OrderStatus /> },
 { path: "*", element: <NotFound /> }
      ],
    },
//     { path: "/login", element: <LoginPage /> },
//     { path: "*", element: <NotFound /> },
  ]);

  return (
    <Suspense fallback={<div>Loading...</div>}>
      {routes}
    </Suspense>
  );
}
