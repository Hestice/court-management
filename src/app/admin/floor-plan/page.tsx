import { listCourts } from "@/lib/data/courts";

import { FloorPlanEditor } from "./floor-plan-editor";

export const metadata = { title: "Floor Plan — Admin" };

export default async function FloorPlanPage() {
  const courts = await listCourts();
  return <FloorPlanEditor initialCourts={courts} />;
}
