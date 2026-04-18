import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SiteNavClient } from "./site-nav-client";
import { Button } from "./ui/button";
import { logout } from "@/app/(auth)/actions";

export async function SiteNav() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let displayName: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("users")
      .select("name, email")
      .eq("id", user.id)
      .maybeSingle();
    displayName = profile?.name?.trim() || profile?.email || user.email || null;
  }

  return (
    <SiteNavClient>
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-6">
          <Link href="/" className="font-semibold tracking-tight">
            Your Facility
          </Link>
          <nav className="flex items-center gap-2 text-sm">
            {user ? (
              <>
                <span className="hidden text-muted-foreground sm:inline">{displayName}</span>
                <form action={logout}>
                  <Button type="submit" variant="ghost" size="sm">
                    Log out
                  </Button>
                </form>
              </>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/login">Login</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/register">Register</Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>
    </SiteNavClient>
  );
}
