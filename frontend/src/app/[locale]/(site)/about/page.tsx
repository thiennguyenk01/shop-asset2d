import { InfoArticle } from "@/components/info/info-content";
import { infoMetadata } from "@/components/info/info-metadata";

export async function generateMetadata({ params }: PageProps<"/[locale]/about">) {
  return infoMetadata("about", params);
}

export default function AboutPage() {
  return <InfoArticle page="about" />;
}
