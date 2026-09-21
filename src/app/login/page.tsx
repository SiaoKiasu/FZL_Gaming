import AuthPanel from "@/components/AuthPanel";
import { isDbConfigured } from "@/lib/db";
import { roster } from "@/lib/roster";
import { getCurrentMember, isSessionConfigured } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "登录 · FZL Gaming",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const member = await getCurrentMember();
  const params = await searchParams;
  // Only ever redirect back to a path on this site: taking the raw value
  // would turn the login page into an open redirect.
  const raw = typeof params.next === "string" ? params.next : "/";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";

  const ready = isDbConfigured() && isSessionConfigured();

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-16">
      <section className="mb-8">
        <h1 className="font-display text-3xl font-bold sm:text-4xl">
          {member ? "我的账号" : "登录"}
        </h1>
        {member ? null : (
          <p className="mt-2 text-sm text-[var(--muted)]">
            打分、评论、报名、记账都需要先登录，这样谁做的就是谁做的，没法冒名。
          </p>
        )}
      </section>

      {ready ? (
        <AuthPanel member={member} members={roster.map((p) => p.nickname)} next={next} />
      ) : (
        <p className="rounded-sm border border-dashed border-[var(--border)] p-6 text-sm text-[var(--muted)]">
          登录功能还没配好 —— 需要数据库连接、SESSION_SECRET 环境变量，
          并且跑过 db/schema_auth.sql。
        </p>
      )}
    </div>
  );
}
