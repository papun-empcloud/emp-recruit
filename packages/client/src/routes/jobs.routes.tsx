import { lazyWithRetry } from "@/lib/lazyWithRetry";
import { Route } from "react-router-dom";

const JobListPage = lazyWithRetry(() =>
  import("@/pages/jobs/JobListPage").then((m) => ({ default: m.JobListPage })),
);
const JobDetailPage = lazyWithRetry(() =>
  import("@/pages/jobs/JobDetailPage").then((m) => ({ default: m.JobDetailPage })),
);
const JobCreatePage = lazyWithRetry(() =>
  import("@/pages/jobs/JobCreatePage").then((m) => ({ default: m.JobCreatePage })),
);
const JobEditPage = lazyWithRetry(() =>
  import("@/pages/jobs/JobFormPage").then((m) => ({ default: m.JobFormPage })),
);
const JobPipelinePage = lazyWithRetry(() =>
  import("@/pages/jobs/JobPipelinePage").then((m) => ({ default: m.JobPipelinePage })),
);
const JobWorkflowPage = lazyWithRetry(() =>
  import("@/pages/jobs/JobWorkflowPage").then((m) => ({ default: m.JobWorkflowPage })),
);

export const jobRoutes = (
  <>
    <Route path="/jobs" element={<JobListPage />} />
    <Route path="/jobs/new" element={<JobCreatePage />} />
    <Route path="/jobs/:id" element={<JobDetailPage />} />
    <Route path="/jobs/:id/edit" element={<JobEditPage />} />
    <Route path="/jobs/:id/pipeline" element={<JobPipelinePage />} />
    <Route path="/jobs/:id/workflow" element={<JobWorkflowPage />} />
  </>
);
