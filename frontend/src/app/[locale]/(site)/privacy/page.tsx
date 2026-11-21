import { InfoArticle } from "@/components/info/info-content";
import { infoMetadata } from "@/components/info/info-metadata";

export async function generateMetadata({ params }: PageProps<"/[locale]/privacy">) {
  return infoMetadata("privacy", params);
}

export default function PrivacyPage() {
  return <InfoArticle page="privacy" />;
}
