import { lazyWithRetry } from "@/lib/lazyWithRetry";
import { Route } from "react-router-dom";

const PortalRequestPage = lazyWithRetry(() =>
  import("@/pages/portal/PortalRequestPage").then((m) => ({ default: m.PortalRequestPage })),
);
const PortalDashboardPage = lazyWithRetry(() =>
  import("@/pages/portal/PortalDashboardPage").then((m) => ({ default: m.PortalDashboardPage })),
);
const PortalApplicationDetailPage = lazyWithRetry(() =>
  import("@/pages/portal/PortalApplicationDetailPage").then((m) => ({ default: m.PortalApplicationDetailPage })),
);
const PortalInterviewsPage = lazyWithRetry(() =>
  import("@/pages/portal/PortalInterviewsPage").then((m) => ({ default: m.PortalInterviewsPage })),
);

export const portalRoutes = (
  <>
    <Route index element={<PortalRequestPage />} />
    <Route path="dashboard" element={<PortalDashboardPage />} />
    <Route path="applications/:id" element={<PortalApplicationDetailPage />} />
    <Route path="interviews" element={<PortalInterviewsPage />} />
  </>
);
