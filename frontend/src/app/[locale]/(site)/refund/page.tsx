import { InfoArticle } from "@/components/info/info-content";
import { infoMetadata } from "@/components/info/info-metadata";

export async function generateMetadata({ params }: PageProps<"/[locale]/refund">) {
  return infoMetadata("refund", params);
}

export default function RefundPage() {
  return <InfoArticle page="refund" />;
}
