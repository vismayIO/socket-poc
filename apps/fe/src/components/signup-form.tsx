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
import { Link } from "@tanstack/react-router"
import type React from "react"
import z from "zod"

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.email().min(1, 'Email is required'),
  password: z.string().min(1, 'Password is required'),
  confirmPassword: z.string().min(1, 'Confirm Password is required'),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"], // Sets the error to appear on this field
});

export function SignupForm({ ...props }: React.ComponentProps<typeof Card>) {
  const form = useAppForm({
    defaultValues: {
      email: '',
      password: '',
      name: '',
      confirmPassword: '',
    },
    validators: {
      onBlur: schema,
    },
    onSubmit: async ({ value: { email, name, password } }) => {
      await authClient.signUp.email({ email, name, password })
    },
  })
  return (
    <Card {...props}>
      <CardHeader>
        <CardTitle>Create an account</CardTitle>
        <CardDescription>
          Enter your information below to create your account
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => {
          e.preventDefault()
          e.stopPropagation()
          form.handleSubmit()
        }}>
          <FieldGroup>
            <form.AppField name="name">
              {(field) => <field.TextField label="Full Name" />}
            </form.AppField>
            <form.AppField name="email">
              {(field) => <field.TextField label="Email" />}
            </form.AppField>
            <form.AppField name="password">
              {(field) => (
                <field.TextField label="Password" type="password" />
              )}
            </form.AppField>
            <form.AppField name="confirmPassword">
              {(field) => (
                <field.TextField label="Confirm Password" type="password" />
              )}
            </form.AppField>
            <FieldGroup>
              <Field>
                <Button type="submit">Create Account</Button>
                <FieldDescription className="px-6 text-center">
                  Already have an account? <Link to="/login">Login</Link>
                </FieldDescription>
              </Field>
            </FieldGroup>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
