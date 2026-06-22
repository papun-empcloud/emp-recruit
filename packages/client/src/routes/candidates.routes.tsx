import { lazyWithRetry } from "@/lib/lazyWithRetry";
import { Route } from "react-router-dom";

const CandidateListPage = lazyWithRetry(() =>
  import("@/pages/candidates/CandidateListPage").then((m) => ({ default: m.CandidateListPage })),
);
const CandidateDetailPage = lazyWithRetry(() =>
  import("@/pages/candidates/CandidateDetailPage").then((m) => ({ default: m.CandidateDetailPage })),
);
const CandidateCreatePage = lazyWithRetry(() =>
  import("@/pages/candidates/CandidateCreatePage").then((m) => ({ default: m.CandidateCreatePage })),
);
const CandidateEditPage = lazyWithRetry(() =>
  import("@/pages/candidates/CandidateEditPage").then((m) => ({ default: m.CandidateEditPage })),
);
const ComparisonPage = lazyWithRetry(() =>
  import("@/pages/candidates/ComparisonPage").then((m) => ({ default: m.ComparisonPage })),
);

export const candidateRoutes = (
  <>
    <Route path="/candidates" element={<CandidateListPage />} />
    <Route path="/candidates/new" element={<CandidateCreatePage />} />
    <Route path="/candidates/compare" element={<ComparisonPage />} />
    <Route path="/candidates/:id/edit" element={<CandidateEditPage />} />
    <Route path="/candidates/:id" element={<CandidateDetailPage />} />
  </>
);
