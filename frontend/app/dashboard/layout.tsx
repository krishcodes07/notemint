import Sidebar from "@/components/dashboard/Sidebar";
import UploadSection from "@/components/dashboard/UploadSection";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex">
      <Sidebar />
      
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
