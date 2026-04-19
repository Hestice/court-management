import { listCourts } from "@/lib/data/courts";

import { CourtsTable } from "./courts-table";

export const metadata = { title: "Courts — Admin" };

export default async function AdminCourtsPage() {
  const courts = await listCourts();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-8">
      <CourtsTable courts={courts} />
    </main>
  );
}
