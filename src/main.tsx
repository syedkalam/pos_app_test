import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/_global.scss";
import { BrowserRouter } from "react-router-dom";
import AppRoutes from "./app/routes/AppRoutes.tsx";
import AppProvider from "./app/providers/AppProvider.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AppProvider>
  </StrictMode>
);
