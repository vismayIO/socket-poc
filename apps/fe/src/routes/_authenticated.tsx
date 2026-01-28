import { authClient } from "@/lib/auth-client";
import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated")({
	beforeLoad: async ({ context }) => {
		const { data } = await context.authClient.getSession();
		if (!data) {
			throw redirect({
				to: "/login",
				search: {
					redirect: location.href,
				},
			});
		}
	},
	component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
	const { isPending } = authClient.useSession();
	if (isPending) {
		return (
			<div className="flex items-center justify-center min-h-screen">
				<div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900"></div>
			</div>
		);
	}

	return <Outlet />;
}
