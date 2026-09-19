import NourishApp from "./nourish-app";
import SignIn from "./sign-in";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: {
  searchParams: Promise<{ auth_error?: string }>;
}) {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return <SignIn unavailable />;
  }
  if (!user) return <SignIn failed={(await searchParams).auth_error === "1"} />;
  return <NourishApp user={user} />;
}
