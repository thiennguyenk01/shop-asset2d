import { InfoArticle } from "@/components/info/info-content";
import { infoMetadata } from "@/components/info/info-metadata";

export async function generateMetadata({ params }: PageProps<"/[locale]/terms">) {
  return infoMetadata("terms", params);
}

export default function TermsPage() {
  return <InfoArticle page="terms" />;
}
