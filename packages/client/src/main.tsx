import React from "react";
import ReactDOM from "react-dom/client";
import {
  createBrowserRouter,
  createRoutesFromElements,
  Route,
  RouterProvider,
} from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import App from "./App";
import "./styles/globals.css";
import "./i18n";
import { useAuthStore } from "./lib/auth-store";

// Load existing session from localStorage
useAuthStore.getState().loadFromStorage();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5 * 60 * 1000, retry: 1 },
  },
});

// A data router (createBrowserRouter) is used instead of a plain <BrowserRouter>
// so React Router's useBlocker is available — it powers the unsaved-changes
// guard on the Career Page. App's own <Routes> tree renders unchanged inside the
// catch-all route.
function RootLayout() {
  return (
    <>
      <App />
      <Toaster position="top-right" />
    </>
  );
}

const router = createBrowserRouter(
  createRoutesFromElements(<Route path="*" element={<RootLayout />} />),
);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>
);
