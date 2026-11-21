import { FaqList } from "@/components/info/info-content";
import { infoMetadata } from "@/components/info/info-metadata";

export async function generateMetadata({ params }: PageProps<"/[locale]/faq">) {
  return infoMetadata("faq", params);
}

export default function FaqPage() {
  return <FaqList />;
}
