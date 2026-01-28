import { AppSidebar } from "@/components/app-sidebar";
import { ChartAreaInteractive } from "@/components/chart-area-interactive";
import { DataTable } from "@/components/data-table";
import { RealtimeDashboard } from "@/components/realtime-dashboard";
import { TradingDashboard } from "@/components/trading-dashboard";
import { SectionCards } from "@/components/section-cards";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
// import { authClient } from '@/lib/auth-client'
import { createFileRoute } from "@tanstack/react-router";
import data from "@/app/dashboard/data.json";

export const Route = createFileRoute("/_authenticated/dashboard")({
	component: Dashboard,
});

function Dashboard() {
	// const { name, email, id } = authClient.useSession().data!.user

	return (
		<SidebarProvider
			style={
				{
					"--sidebar-width": "calc(var(--spacing) * 72)",
					"--header-height": "calc(var(--spacing) * 12)",
				} as React.CSSProperties
			}
		>
			<AppSidebar variant="inset" />
			<SidebarInset>
				<SiteHeader />
				<div className="flex flex-1 flex-col">
					<div className="@container/main flex flex-1 flex-col gap-2">
						<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
							<SectionCards />

							<Tabs defaultValue="overview" className="px-4 lg:px-6">
								<TabsList className="grid w-full grid-cols-3">
									<TabsTrigger value="overview">Overview</TabsTrigger>
									<TabsTrigger value="trading">Trading Charts</TabsTrigger>
									<TabsTrigger value="realtime">Real-time Data</TabsTrigger>
								</TabsList>

								<TabsContent value="overview" className="space-y-4">
									<ChartAreaInteractive />
									<DataTable data={data} />
								</TabsContent>

								<TabsContent value="trading">
									<TradingDashboard />
								</TabsContent>

								<TabsContent value="realtime">
									<RealtimeDashboard />
								</TabsContent>
							</Tabs>
						</div>
					</div>
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
