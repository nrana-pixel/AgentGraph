export const dynamic = "force-dynamic";
import TraceDetailPageClient from "./TraceDetailPageClient";

export default async function TraceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TraceDetailPageClient id={id} />;
}
