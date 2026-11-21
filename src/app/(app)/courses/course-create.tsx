"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Modal, useToast } from "@/components/client-ui";
import { api } from "@/lib/client";

type Opt = { id: number; name: string; is_default?: boolean };

export function CreateCourseButton({ subjects, semesters, groups, schemes }: { subjects: Opt[]; semesters: Opt[]; groups: Opt[]; schemes: Opt[] }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const toast = useToast();
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const num = (k: string) => (fd.get(k) ? Number(fd.get(k)) : null);
    setBusy(true);
    try {
      const r = await api<{ id: number }>("/api/courses", { body: {
        subject_id: num("subject_id"), semester_id: num("semester_id"), group_id: num("group_id"), instructor: fd.get("instructor") || null,
        grading_scheme_id: num("grading_scheme_id"), enroll_group: fd.get("enroll_group") === "on",
      } });
      toast("ok", "Course created");
      router.push(`/courses/${r.id}`);
    } catch (err) { toast("error", (err as Error).message); setBusy(false); }
  }
  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}><Plus size={16} />New course</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Create course offering">
        <form id="create-course" onSubmit={submit} className="space-y-3">
          <div><label className="label">Subject *</label><select name="subject_id" required className="input"><option value="">Select…</option>{subjects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
          <div><label className="label">Semester *</label><select name="semester_id" required className="input">{semesters.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
          <div><label className="label">Group</label><select name="group_id" className="input"><option value="">— (no group)</option>{groups.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
          <div><label className="label">Instructor</label><input name="instructor" className="input" /></div>
          <div><label className="label">Grading scheme *</label><select name="grading_scheme_id" required className="input">{schemes.map((x) => <option key={x.id} value={x.id}>{x.name}{x.is_default ? " (default)" : ""}</option>)}</select></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="enroll_group" defaultChecked />Enroll all active students of the group</label>
          <div className="flex justify-end gap-2 pt-2"><button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button><button className="btn btn-primary" disabled={busy}>{busy ? "Creating…" : "Create"}</button></div>
        </form>
      </Modal>
    </>
  );
}
