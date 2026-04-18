import { AdminSidebar } from "@/components/admin-sidebar";
import { NavGuardProvider } from "@/components/admin-nav-guard";

export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <NavGuardProvider>
      <div className="flex flex-1 flex-col md:flex-row">
        <AdminSidebar />
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </NavGuardProvider>
  );
}
