import { LoginForm } from "@/components/login-form";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

const loginSearchSchema = z.object({
	redirect: z.string().optional(),
});

export const Route = createFileRoute("/login")({
	validateSearch: loginSearchSchema,
	beforeLoad: async ({ context, search }) => {
		const { data } = await context.authClient.getSession();
		if (data) {
			throw redirect({ to: search.redirect || "/dashboard" });
		}
	},
	component: Login,
});

export function Login() {
	return (
		<div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
			<div className="w-full max-w-sm">
				<LoginForm />
			</div>
		</div>
	);
}
