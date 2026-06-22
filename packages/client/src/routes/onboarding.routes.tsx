import { lazyWithRetry } from "@/lib/lazyWithRetry";
import { Route } from "react-router-dom";

const OnboardingListPage = lazyWithRetry(() =>
  import("@/pages/onboarding/OnboardingListPage").then((m) => ({ default: m.OnboardingListPage })),
);
const OnboardingDetailPage = lazyWithRetry(() =>
  import("@/pages/onboarding/OnboardingDetailPage").then((m) => ({ default: m.OnboardingDetailPage })),
);
const OnboardingTemplatesPage = lazyWithRetry(() =>
  import("@/pages/onboarding/OnboardingTemplatesPage").then((m) => ({ default: m.OnboardingTemplatesPage })),
);

export const onboardingRoutes = (
  <>
    <Route path="/onboarding" element={<OnboardingListPage />} />
    <Route path="/onboarding/templates" element={<OnboardingTemplatesPage />} />
    <Route path="/onboarding/:id" element={<OnboardingDetailPage />} />
  </>
);
