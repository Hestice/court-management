import Link from "next/link";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

const ERROR_MESSAGES: Record<string, string> = {
  auth_callback_failed: "We couldn't confirm your email. Please try again or request a new link.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const errorMessage = error ? (ERROR_MESSAGES[error] ?? "Something went wrong. Please try again.") : null;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-12">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-sm text-muted-foreground">Welcome back.</p>
      </div>
      {errorMessage ? (
        <p
          className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {errorMessage}
        </p>
      ) : null}
      <LoginForm next={next} />
      <p className="mt-6 text-sm text-muted-foreground">
        No account?{" "}
        <Link href="/register" className="text-primary hover:underline">
          Create one
        </Link>
        .
      </p>
    </main>
  );
}
