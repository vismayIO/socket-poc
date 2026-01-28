import { SignupForm } from "@/components/signup-form";
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/sign-up")({
	beforeLoad: async ({ context }) => {
		const { data } = await context.authClient.getSession();
		if (data) {
			throw redirect({ to: "/dashboard" });
		}
	},
	component: Page,
});

export default function Page() {
	return (
		<div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
			<div className="w-full max-w-sm">
				<SignupForm />
			</div>
		</div>
	);
}
