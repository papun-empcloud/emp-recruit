import { useTranslation } from "react-i18next";

export function JobPipelinePage() {
  const { t } = useTranslation();
  return <div><h1 className="text-2xl font-bold text-gray-900">{t("jobs.pipeline.title")}</h1><p className="mt-2 text-gray-500">{t("jobs.pipeline.subtitle")}</p></div>;
}
