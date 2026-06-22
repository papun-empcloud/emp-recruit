import { Route } from "react-router-dom";
import { lazyWithRetry } from "@/lib/lazyWithRetry";

const OfferListPage = lazyWithRetry(() =>
  import("@/pages/offers/OfferListPage").then((m) => ({ default: m.OfferListPage })),
);
const OfferDetailPage = lazyWithRetry(() =>
  import("@/pages/offers/OfferDetailPage").then((m) => ({ default: m.OfferDetailPage })),
);
const OfferCreatePage = lazyWithRetry(() =>
  import("@/pages/offers/OfferCreatePage").then((m) => ({ default: m.OfferCreatePage })),
);
const OfferEditPage = lazyWithRetry(() =>
  import("@/pages/offers/OfferEditPage").then((m) => ({ default: m.OfferEditPage })),
);
const OfferLetterTemplatePage = lazyWithRetry(() =>
  import("@/pages/offers/OfferLetterTemplatePage").then((m) => ({ default: m.OfferLetterTemplatePage })),
);

export const offerRoutes = (
  <>
    <Route path="/offers" element={<OfferListPage />} />
    <Route path="/offers/new" element={<OfferCreatePage />} />
    <Route path="/offers/letter-templates" element={<OfferLetterTemplatePage />} />
    <Route path="/offers/:id/edit" element={<OfferEditPage />} />
    <Route path="/offers/:id" element={<OfferDetailPage />} />
  </>
);
