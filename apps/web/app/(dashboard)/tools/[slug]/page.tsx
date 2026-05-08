export const dynamic = "force-dynamic";
import ToolDetailPageClient from "./ToolDetailPageClient";

export default async function ToolDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ToolDetailPageClient slug={slug} />;
}
