import { pageGuard } from "@/lib/guard";
import { listMatrix } from "@/lib/ldms/discipline";
import { listUnits } from "@/lib/ldms/permits";
import { getFlows } from "@/lib/flows";
import { aiReady } from "@/lib/ai";
import { ApplyMatrix } from "@/components/ldms/ApplyMatrix";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ kode?: string }> }) {
  const { can } = await pageGuard("matrix_apply");
  const [rules, units, flows, ready] = await Promise.all([listMatrix(), listUnits(), getFlows(), aiReady()]);
  return <ApplyMatrix rules={rules} units={units.map((u) => u.name)} initialCode={(await searchParams).kode} ai={ready.ok ? null : ready.reason} canRun={can("matrix_apply", "edit")} drive={Boolean(flows.drive.folderId)} />;
}
