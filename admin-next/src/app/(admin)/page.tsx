import type { Metadata } from "next";
import EcommerceMetrics from "@/components/ecommerce/EcommerceMetrics";

export const metadata: Metadata = {
  title: "Dashboard | Songdian Admin",
  description: "Songdian Technology Admin Dashboard",
};

export default function Dashboard() {
  return (
    <div>
      <h2 className="mb-6 text-2xl font-semibold text-gray-800 dark:text-white/90">
        Dashboard
      </h2>
      <EcommerceMetrics />
    </div>
  );
}
