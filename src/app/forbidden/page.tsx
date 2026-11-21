import Link from "next/link";
import { ShieldAlert } from "lucide-react";

export default function Forbidden() {
  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="card card-pad max-w-md text-center">
        <ShieldAlert className="mx-auto text-bad" size={36} />
        <h1 className="mt-3 text-lg font-semibold">Access denied</h1>
        <p className="mt-1 text-sm text-muted">Your role does not include permission to open this page. Contact an administrator if you need access.</p>
        <Link href="/" className="btn btn-primary mt-5">Back to dashboard</Link>
      </div>
    </div>
  );
}
