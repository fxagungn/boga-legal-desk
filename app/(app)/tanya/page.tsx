import { ChatWidget } from "@/components/chat/ChatWidget";
import { pageGuard } from "@/lib/guard";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { me } = await pageGuard("chat");
  return (
    <div className="mx-auto max-w-[860px]">
      <ChatWidget name={me.name} inline />
    </div>
  );
}
