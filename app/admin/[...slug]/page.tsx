import { redirect } from "next/navigation";
export default async function AdminToken({ params }: { params: Promise<{slug:string[]}> }) {
  const { slug } = await params;
  const token = slug?.[0];
  if (!token) redirect("/admin");
  redirect(`/api/admin/exchange?token=${encodeURIComponent(token)}`);
}
