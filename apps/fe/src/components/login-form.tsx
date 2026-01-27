import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup
} from "@/components/ui/field"
import { useAppForm } from "@/hooks/form"
import { authClient } from "@/lib/auth-client"
import { cn } from "@/lib/utils"
import { Link } from "@tanstack/react-router"
import { z } from "zod"



const schema = z.object({
  email: z.email().min(1, 'Email is Require'),
  password: z.string().min(1, 'Password is required'),
})


export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const form = useAppForm({
    defaultValues: {
      email: '',
      password: '',
    },
    validators: {
      onBlur: schema,
    },
    onSubmit: async ({ value: { email, password } }) => {
      await authClient.signIn.email({ email, password })
    },
  })

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle>Login to your account</CardTitle>
          <CardDescription>
            Enter your email below to login to your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => {
            e.preventDefault()
            e.stopPropagation()
            form.handleSubmit()
          }}>
            <FieldGroup>
              <form.AppField name="email">
                {(field) => <field.TextField label="Email" />}
              </form.AppField>
              <Field>
                <form.AppField name="password">
                  {(field) => <field.TextField label="Password" type="password" />}
                </form.AppField>
              </Field>
              <Field>
                <Button type="submit">Login</Button>
                <FieldDescription className="text-center">
                  Don&apos;t have an account? <Link to="/sign-up">Sign up</Link>
                </FieldDescription>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
