import { Shell, } from "@/app/components/Shell";
import { Card } from "@/app/components/ui";

export default function More() {
  return (
    <Shell tab="More" back="/">
      <Card>
        <p className="text-sm text-gray-700">More options are not part of this demo.</p>
      </Card>
    </Shell>
  );
}
