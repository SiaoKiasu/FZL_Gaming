import type { Metadata } from "next";
import "./globals.css";
import NavBar from "@/components/NavBar";
import UploadProvider from "@/components/UploadProvider";
import UploadStatusBar from "@/components/UploadStatusBar";
import { getCurrentMember } from "@/lib/session";

export const metadata: Metadata = {
  title: "FZL Gaming",
  description: "FZL Gaming 战队官方门户",
};

// Reading the session here means every route renders dynamically (cookies
// are a request-time API). That's already true of every data-backed page in
// this app -- they're all force-dynamic -- and the two static ones (/ and
// /roster) are cheap enough that showing who's logged in on every page is
// worth the trade.
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const member = await getCurrentMember();

  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        {/* UploadProvider wraps everything so an in-flight upload isn't
            unmounted by client-side navigation -- see its header comment. */}
        <UploadProvider>
          <NavBar member={member} />
          <main className="flex-1">{children}</main>
          <footer className="border-t border-[var(--border)] py-6 text-center text-xs text-[var(--muted)]">
            FZL GAMING · {new Date().getFullYear()}
          </footer>
          <UploadStatusBar />
        </UploadProvider>
      </body>
    </html>
  );
}
