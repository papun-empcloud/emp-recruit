import { lazyWithRetry } from "@/lib/lazyWithRetry";
import { Route } from "react-router-dom";

const CareerListPage = lazyWithRetry(() =>
  import("@/pages/careers/CareerListPage").then((m) => ({ default: m.CareerListPage })),
);
const CareerJobDetailPage = lazyWithRetry(() =>
  import("@/pages/careers/CareerJobDetailPage").then((m) => ({ default: m.CareerJobDetailPage })),
);
const CareerApplyPage = lazyWithRetry(() =>
  import("@/pages/careers/CareerApplyPage").then((m) => ({ default: m.CareerApplyPage })),
);
const ApplicationSuccessPage = lazyWithRetry(() =>
  import("@/pages/careers/ApplicationSuccessPage").then((m) => ({ default: m.ApplicationSuccessPage })),
);

export const careerRoutes = (
  <>
    <Route index element={<CareerListPage />} />
    <Route path="jobs/:jobId" element={<CareerJobDetailPage />} />
    <Route path="jobs/:jobId/apply" element={<CareerApplyPage />} />
    <Route path="jobs/:jobId/success" element={<ApplicationSuccessPage />} />
  </>
);
