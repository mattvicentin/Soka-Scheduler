"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";

interface Template {
  id: string;
  title: string;
  course_code: string;
  credits: number | null;
  typically_offered?: string | null;
  programs: Array<{ program_id: string; program_name: string }>;
}

interface Offering {
  id: string;
  course_template_id: string;
  course_template: { course_code: string; title: string; programs: Array<{ program_id: string; program_name: string }> };
  term_id: string;
  term: { name: string };
  section_code: string;
  participates_in_scheduling: boolean;
  instructors: Array<{ id: string; faculty_id: string; faculty_name: string; load_share: number }>;
}

interface Program {
  id: string;
  name: string;
}

interface Faculty {
  id: string;
  name: string;
}

export default function DeanCoursesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [tab, setTab] = useState<"templates" | "offerings">("templates");
  const [termId, setTermId] = useState("");
  const [terms, setTerms] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateTemplate, setShowCreateTemplate] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [showCreateOffering, setShowCreateOffering] = useState(false);
  const [editingOffering, setEditingOffering] = useState<Offering | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);
  const [deletingOfferingId, setDeletingOfferingId] = useState<string | null>(null);

  const loadTemplates = () =>
    apiFetch<{ data: Template[] }>("/api/course-templates").then((r) => {
      const d = (r.data as { data?: Template[] })?.data ?? [];
      setTemplates(d);
    });

  const loadOfferings = () => {
    const params = new URLSearchParams();
    if (termId) params.set("term_id", termId);
    params.set("participates_in_scheduling", "true");
    return apiFetch<{ data: Offering[] }>(`/api/course-offerings?${params}`).then((r) => {
      const d = (r.data as { data?: Offering[] })?.data ?? [];
      setOfferings(d);
    });
  };

  useEffect(() => {
    apiFetch<{ data: Array<{ id: string; name: string }> }>("/api/terms").then((r) => {
      const d = (r.data as { data?: Array<{ id: string; name: string }> })?.data ?? [];
      setTerms(d);
      if (d.length > 0) setTermId(d[0].id);
    });
  }, []);

  useEffect(() => {
    setLoading(true);
    if (tab === "templates") {
      loadTemplates().then(() => setLoading(false));
    } else {
      loadOfferings().then(() => setLoading(false));
    }
  }, [tab, termId]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-soka-body">Courses</h1>
      <p className="mt-1 text-soka-muted">
        Course templates, offerings, and instructor assignments.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-soka-muted">
          <span className="font-medium text-soka-body">View</span>
          <select
            value={tab}
            onChange={(e) => setTab(e.target.value as "templates" | "offerings")}
            className="rounded-md border border-soka-border bg-white px-3 py-2 text-sm text-soka-body"
          >
            <option value="templates">Course templates</option>
            <option value="offerings">Course offerings</option>
          </select>
        </label>
        {tab === "offerings" && (
          <label className="flex items-center gap-2 text-sm text-soka-muted">
            <span className="font-medium text-soka-body">Term</span>
            <select
              value={termId}
              onChange={(e) => setTermId(e.target.value)}
              className="rounded-md border border-soka-border bg-white px-3 py-2 text-sm text-soka-body"
            >
              {terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          onClick={() =>
            tab === "templates" ? setShowCreateTemplate(true) : setShowCreateOffering(true)
          }
          className="rounded-md bg-soka-blue px-4 py-2 text-sm font-medium text-white hover:bg-soka-blue-hover"
        >
          {tab === "templates" ? "Create template" : "Create offering"}
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded bg-soka-error/10 p-3 text-sm text-soka-error">{error}</div>
      )}

      {showCreateTemplate && (
        <TemplateModal
          programs={[]}
          onClose={() => setShowCreateTemplate(false)}
          onSave={async (data) => {
            setError(null);
            const res = await apiFetch("/api/course-templates", {
              method: "POST",
              body: JSON.stringify(data),
            });
            if (res.error) {
              setError(res.error);
              return;
            }
            setShowCreateTemplate(false);
            loadTemplates();
          }}
        />
      )}

      {editingTemplate && (
        <TemplateModal
          template={editingTemplate}
          programs={[]}
          onClose={() => setEditingTemplate(null)}
          onSave={async (data) => {
            setError(null);
            const { program_ids: _pid, ...patchData } = data;
            const res = await apiFetch(`/api/course-templates/${editingTemplate.id}`, {
              method: "PATCH",
              body: JSON.stringify(patchData),
            });
            if (res.error) {
              setError(res.error);
              return;
            }
            setEditingTemplate(null);
            loadTemplates();
          }}
          onDelete={async () => {
            if (!confirm("Delete this template?")) return;
            setError(null);
            const res = await apiFetch(`/api/course-templates/${editingTemplate.id}`, {
              method: "DELETE",
            });
            if (res.error) {
              setError(res.error);
              return;
            }
            setEditingTemplate(null);
            loadTemplates();
          }}
        />
      )}

      {showCreateOffering && (
        <OfferingModal
          templates={templates}
          terms={terms}
          termId={termId}
          onClose={() => setShowCreateOffering(false)}
          onSave={async (data) => {
            setError(null);
            const res = await apiFetch("/api/course-offerings", {
              method: "POST",
              body: JSON.stringify(data),
            });
            if (res.error) {
              setError(res.error);
              return;
            }
            setShowCreateOffering(false);
            loadOfferings();
          }}
        />
      )}

      {editingOffering && (
        <OfferingDetailModal
          offering={editingOffering}
          faculty={[]}
          onClose={() => setEditingOffering(null)}
          onRefresh={loadOfferings}
          onError={setError}
        />
      )}

      {loading ? (
        <p className="mt-6 text-soka-muted">Loading...</p>
      ) : tab === "templates" ? (
        <div className="mt-6 space-y-2">
          {templates.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between rounded border border-soka-border bg-white p-4"
            >
              <div>
                <span className="font-medium text-soka-body">{t.course_code}</span>
                <span className="ml-2 text-soka-muted">{t.title}</span>
                <span className="ml-2 text-sm text-soka-muted">
                  ({t.programs.map((p) => p.program_name).join(", ")})
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setEditingTemplate(t)}
                  className="text-soka-light-blue hover:underline"
                >
                  Edit
                </button>
                <button
                  type="button"
                  disabled={deletingTemplateId === t.id}
                  onClick={async () => {
                    if (
                      !confirm(
                        `Delete course template "${t.course_code} ${t.title}"? This is only allowed if there are no offerings for this template.`
                      )
                    ) {
                      return;
                    }
                    setError(null);
                    setDeletingTemplateId(t.id);
                    const res = await apiFetch(`/api/course-templates/${t.id}`, { method: "DELETE" });
                    setDeletingTemplateId(null);
                    if (res.error) {
                      setError(res.error);
                      return;
                    }
                    loadTemplates();
                  }}
                  className="text-sm text-soka-error hover:underline disabled:opacity-50"
                >
                  {deletingTemplateId === t.id ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-6 space-y-2">
          {offerings.map((o) => (
            <div
              key={o.id}
              className="flex items-center justify-between rounded border border-soka-border bg-white p-4"
            >
              <div>
                <span className="font-medium text-soka-body">
                  {o.course_template.course_code} {o.section_code}
                </span>
                <span className="ml-2 text-soka-muted">{o.course_template.title}</span>
                <span className="ml-2 text-sm text-soka-muted">{o.term.name}</span>
                <span className="ml-2 text-sm text-soka-muted">
                  — {o.instructors.map((i) => `${i.faculty_name} (${i.load_share})`).join(", ")}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setEditingOffering(o)}
                  className="text-soka-light-blue hover:underline"
                >
                  Edit / Instructors
                </button>
                <button
                  type="button"
                  disabled={deletingOfferingId === o.id}
                  onClick={async () => {
                    if (
                      !confirm(
                        `Delete offering ${o.course_template.course_code} ${o.section_code} (${o.term.name})? You cannot delete if draft schedule slots exist for this section.`
                      )
                    ) {
                      return;
                    }
                    setError(null);
                    setDeletingOfferingId(o.id);
                    const res = await apiFetch(`/api/course-offerings/${o.id}`, { method: "DELETE" });
                    setDeletingOfferingId(null);
                    if (res.error) {
                      setError(res.error);
                      return;
                    }
                    loadOfferings();
                  }}
                  className="text-sm text-soka-error hover:underline disabled:opacity-50"
                >
                  {deletingOfferingId === o.id ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TemplateModal({
  template,
  programs,
  onClose,
  onSave,
  onDelete,
}: {
  template?: Template | null;
  programs: Program[];
  onClose: () => void;
  onSave: (data: { title: string; course_code: string; credits: number | null; typically_offered?: string | null; program_ids?: string[] }) => void;
  onDelete?: () => void;
}) {
  const [title, setTitle] = useState(template?.title ?? "");
  const [courseCode, setCourseCode] = useState(template?.course_code ?? "");
  const [credits, setCredits] = useState<string>(template?.credits?.toString() ?? "");
  const [typicallyOffered, setTypicallyOffered] = useState<string>(
    template?.typically_offered ?? ""
  );
  const [programIds, setProgramIds] = useState<string[]>(template?.programs.map((p) => p.program_id) ?? []);
  const [programsList, setProgramsList] = useState<Program[]>([]);

  useEffect(() => {
    apiFetch<{ data: Program[] }>("/api/programs").then((r) => {
      const d = (r.data as { data?: Program[] })?.data ?? [];
      setProgramsList(d);
    });
  }, []);

  const isEdit = !!template;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="max-h-[90vh] w-full max-w-md overflow-auto rounded-lg bg-white p-6 shadow-lg">
        <h2 className="text-lg font-semibold text-soka-body">
          {isEdit ? "Edit template" : "Create template"}
        </h2>
        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-soka-body">Course code</label>
            <input
              type="text"
              value={courseCode}
              onChange={(e) => setCourseCode(e.target.value)}
              className="mt-1 block w-full rounded-md border border-soka-border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-soka-body">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 block w-full rounded-md border border-soka-border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-soka-body">Credits</label>
            <input
              type="number"
              min={1}
              max={10}
              value={credits}
              onChange={(e) => setCredits(e.target.value)}
              className="mt-1 block w-full rounded-md border border-soka-border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-soka-body">Typically offered</label>
            <select
              value={typicallyOffered}
              onChange={(e) => setTypicallyOffered(e.target.value)}
              className="mt-1 block w-full rounded-md border border-soka-border px-3 py-2 text-sm"
            >
              <option value="">—</option>
              <option value="fall">Fall</option>
              <option value="spring">Spring</option>
              <option value="both">Both</option>
            </select>
          </div>
          {!isEdit && (
            <div>
              <label className="block text-sm font-medium text-soka-body">Programs</label>
              <div className="mt-2 space-y-2">
                {programsList.map((p) => (
                  <label key={p.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={programIds.includes(p.id)}
                      onChange={(e) =>
                        setProgramIds((prev) =>
                          e.target.checked ? [...prev, p.id] : prev.filter((id) => id !== p.id)
                        )
                      }
                    />
                    <span className="text-sm">{p.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          {isEdit && template && (
            <TemplateProgramsSection templateId={template.id} programs={template.programs} />
          )}
        </div>
        <div className="mt-6 flex justify-between">
          <div>
            {onDelete && (
              <button
                onClick={onDelete}
                className="rounded-md border border-soka-error px-4 py-2 text-sm font-medium text-soka-error hover:bg-soka-error/10"
              >
                Delete
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-md border border-soka-border px-4 py-2 text-sm font-medium text-soka-body hover:bg-soka-surface"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                const cred = credits ? parseInt(credits, 10) : null;
                if (!title || !courseCode) {
                  alert("Title and course code required");
                  return;
                }
                const typically = typicallyOffered || null;
                if (isEdit) {
                  onSave({
                    title,
                    course_code: courseCode,
                    credits: cred ?? null,
                    typically_offered: typically,
                    program_ids: template?.programs.map((p) => p.program_id) ?? [],
                  });
                } else {
                  if (programIds.length === 0) {
                    alert("Select at least one program");
                    return;
                  }
                  onSave({
                    title,
                    course_code: courseCode,
                    credits: cred ?? null,
                    typically_offered: typically,
                    program_ids: programIds,
                  });
                }
              }}
              className="rounded-md bg-soka-blue px-4 py-2 text-sm font-medium text-white hover:bg-soka-blue-hover"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function OfferingModal({
  templates,
  terms,
  termId,
  onClose,
  onSave,
}: {
  templates: Template[];
  terms: Array<{ id: string; name: string }>;
  termId: string;
  onClose: () => void;
  onSave: (data: {
    course_template_id: string;
    term_id: string;
    section_code: string;
    instructor_faculty_id?: string;
  }) => void;
}) {
  const [templateId, setTemplateId] = useState("");
  const [tid, setTid] = useState(termId);
  const [sectionCode, setSectionCode] = useState("");
  const [instructorFacultyId, setInstructorFacultyId] = useState("");
  const [facultyList, setFacultyList] = useState<Faculty[]>([]);

  useEffect(() => {
    apiFetch<{ data: Faculty[] }>("/api/faculty").then((r) => {
      const d = (r.data as { data?: Faculty[] })?.data ?? [];
      setFacultyList(d);
    });
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="max-h-[90vh] w-full max-w-md overflow-auto rounded-lg bg-white p-6 shadow-lg">
        <h2 className="text-lg font-semibold text-soka-body">Create offering</h2>
        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-soka-body">Template</label>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="mt-1 block w-full rounded-md border border-soka-border px-3 py-2 text-sm"
            >
              <option value="">Select template</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.course_code} — {t.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-soka-body">Term</label>
            <select
              value={tid}
              onChange={(e) => setTid(e.target.value)}
              className="mt-1 block w-full rounded-md border border-soka-border px-3 py-2 text-sm"
            >
              {terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-soka-body">Section code</label>
            <input
              type="text"
              value={sectionCode}
              onChange={(e) => setSectionCode(e.target.value)}
              placeholder="01"
              className="mt-1 block w-full rounded-md border border-soka-border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-soka-body">
              Instructor <span className="font-normal text-soka-muted">(optional)</span>
            </label>
            <select
              value={instructorFacultyId}
              onChange={(e) => setInstructorFacultyId(e.target.value)}
              className="mt-1 block w-full rounded-md border border-soka-border px-3 py-2 text-sm"
            >
              <option value="">— None (assign later)</option>
              {facultyList.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-soka-border px-4 py-2 text-sm font-medium text-soka-body hover:bg-soka-surface"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (templateId && tid && sectionCode) {
                const payload: {
                  course_template_id: string;
                  term_id: string;
                  section_code: string;
                  instructor_faculty_id?: string;
                } = { course_template_id: templateId, term_id: tid, section_code: sectionCode };
                if (instructorFacultyId) {
                  payload.instructor_faculty_id = instructorFacultyId;
                }
                onSave(payload);
              } else {
                alert("Fill all required fields");
              }
            }}
            className="rounded-md bg-soka-blue px-4 py-2 text-sm font-medium text-white hover:bg-soka-blue-hover"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

function OfferingDetailModal({
  offering,
  faculty,
  onClose,
  onRefresh,
  onError,
}: {
  offering: Offering;
  faculty: Faculty[];
  onClose: () => void;
  onRefresh: () => void;
  onError: (msg: string | null) => void;
}) {
  const [sectionCode, setSectionCode] = useState(offering.section_code);
  const [participates, setParticipates] = useState(offering.participates_in_scheduling);
  const [instructors, setInstructors] = useState(offering.instructors);
  const [showAddInstructor, setShowAddInstructor] = useState(false);
  const [facultyList, setFacultyList] = useState<Faculty[]>([]);
  const [advisory, setAdvisory] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ data: Faculty[] }>("/api/faculty").then((r) => {
      const d = (r.data as { data?: Array<{ id: string; name: string }> })?.data ?? [];
      setFacultyList(d);
    });
  }, []);

  const saveOffering = async () => {
    onError(null);
    const res = await apiFetch(`/api/course-offerings/${offering.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        section_code: sectionCode,
        participates_in_scheduling: participates,
      }),
    });
    if (res.error) {
      onError(res.error);
      return;
    }
    onRefresh();
  };

  const addInstructor = async (facultyId: string, loadShare: number) => {
    onError(null);
    setAdvisory(null);
    const res = await apiFetch<{ warnings?: string[] }>(`/api/course-offerings/${offering.id}/instructors`, {
      method: "POST",
      body: JSON.stringify({ faculty_id: facultyId, load_share: loadShare }),
    });
    if (res.error) {
      onError(res.error);
      return;
    }
    setShowAddInstructor(false);
    const body = res.data as { warnings?: string[] } | undefined;
    if (body?.warnings?.length) {
      setAdvisory(body.warnings.join(" "));
    }
    const updated = await apiFetch<{ data: Array<{ id: string; faculty_id: string; faculty_name: string; load_share: number }> }>(
      `/api/course-offerings/${offering.id}/instructors`
    );
    const d = (updated.data as { data?: typeof instructors })?.data ?? [];
    setInstructors(d);
    onRefresh();
  };

  const updateLoadShare = async (instructorId: string, loadShare: number) => {
    onError(null);
    const res = await apiFetch(
      `/api/course-offerings/${offering.id}/instructors/${instructorId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ load_share: loadShare }),
      }
    );
    if (res.error) {
      onError(res.error);
      return;
    }
    setInstructors((prev) =>
      prev.map((i) => (i.id === instructorId ? { ...i, load_share: loadShare } : i))
    );
    onRefresh();
  };

  const removeInstructor = async (instructorId: string) => {
    if (!confirm("Remove this instructor?")) return;
    onError(null);
    const res = await apiFetch(
      `/api/course-offerings/${offering.id}/instructors?instructor_id=${instructorId}`,
      { method: "DELETE" }
    );
    if (res.error) {
      onError(res.error);
      return;
    }
    setInstructors((prev) => prev.filter((i) => i.id !== instructorId));
    onRefresh();
  };

  const deleteOffering = async () => {
    if (!confirm("Delete this offering?")) return;
    onError(null);
    const res = await apiFetch(`/api/course-offerings/${offering.id}`, {
      method: "DELETE",
    });
    if (res.error) {
      onError(res.error);
      return;
    }
    onClose();
    onRefresh();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-lg bg-white p-6 shadow-lg">
        <h2 className="text-lg font-semibold text-soka-body">
          {offering.course_template.course_code} {offering.section_code}
        </h2>
        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-soka-body">Section code</label>
            <input
              type="text"
              value={sectionCode}
              onChange={(e) => setSectionCode(e.target.value)}
              className="mt-1 block w-full rounded-md border border-soka-border px-3 py-2 text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="participates"
              checked={participates}
              onChange={(e) => setParticipates(e.target.checked)}
            />
            <label htmlFor="participates" className="text-sm text-soka-body">
              Participates in scheduling
            </label>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-soka-body">Instructors</label>
              <button
                onClick={() => setShowAddInstructor(true)}
                className="text-sm text-soka-light-blue hover:underline"
              >
                Add instructor
              </button>
            </div>
            <div className="mt-2 space-y-2">
              {instructors.map((i) => (
                <LoadShareRow
                  key={i.id}
                  instructor={i}
                  onUpdate={updateLoadShare}
                  onRemove={() => removeInstructor(i.id)}
                />
              ))}
            </div>
            {advisory && (
              <p className="mt-2 rounded-md bg-soka-warning/10 px-3 py-2 text-sm text-soka-warning">
                {advisory}
              </p>
            )}
            {participates && (
              <p className="mt-1 text-xs text-soka-muted">
                Load share must sum to 1.0 for scheduling
              </p>
            )}
          </div>
        </div>
        {showAddInstructor && (
          <AddInstructorForm
            facultyList={facultyList}
            existingIds={instructors.map((i) => i.faculty_id)}
            onAdd={addInstructor}
            onCancel={() => setShowAddInstructor(false)}
          />
        )}
        <div className="mt-6 flex justify-between">
          <button
            onClick={deleteOffering}
            className="rounded-md border border-soka-error px-4 py-2 text-sm font-medium text-soka-error hover:bg-soka-error/10"
          >
            Delete offering
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-md border border-soka-border px-4 py-2 text-sm font-medium text-soka-body hover:bg-soka-surface"
            >
              Close
            </button>
            <button
              onClick={saveOffering}
              className="rounded-md bg-soka-blue px-4 py-2 text-sm font-medium text-white hover:bg-soka-blue-hover"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TemplateProgramsSection({
  templateId,
  programs,
}: {
  templateId: string;
  programs: Array<{ program_id: string; program_name: string }>;
}) {
  const [list, setList] = useState(programs);
  const [programsList, setProgramsList] = useState<Program[]>([]);
  const [adding, setAdding] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ data: Program[] }>("/api/programs").then((r) => {
      const d = (r.data as { data?: Program[] })?.data ?? [];
      setProgramsList(d);
    });
  }, []);

  const addProgram = async (programId: string) => {
    if (!programId) return;
    setErr(null);
    const res = await apiFetch(`/api/course-templates/${templateId}/programs`, {
      method: "POST",
      body: JSON.stringify({ program_id: programId }),
    });
    if (res.error) {
      setErr(res.error);
      return;
    }
    const p = programsList.find((x) => x.id === programId);
    if (p) setList((prev) => [...prev, { program_id: p.id, program_name: p.name }]);
    setAdding("");
  };

  const removeProgram = async (programId: string) => {
    setErr(null);
    const res = await apiFetch(
      `/api/course-templates/${templateId}/programs?program_id=${programId}`,
      { method: "DELETE" }
    );
    if (res.error) {
      setErr(res.error);
      return;
    }
    setList((prev) => prev.filter((p) => p.program_id !== programId));
  };

  return (
    <div>
      <label className="block text-sm font-medium text-soka-body">Cross-listed programs</label>
      {err && <p className="mt-1 text-xs text-soka-error">{err}</p>}
      <div className="mt-2 space-y-1">
        {list.map((p) => (
          <div key={p.program_id} className="flex items-center justify-between rounded bg-soka-surface px-2 py-1">
            <span className="text-sm">{p.program_name}</span>
            {list.length > 1 && (
              <button
                onClick={() => removeProgram(p.program_id)}
                className="text-xs text-soka-error hover:underline"
              >
                Remove
              </button>
            )}
          </div>
        ))}
        <div className="flex gap-2">
          <select
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            className="rounded border border-soka-border px-2 py-1 text-sm"
          >
            <option value="">Add program</option>
            {programsList
              .filter((p) => !list.some((x) => x.program_id === p.id))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
          <button
            onClick={() => addProgram(adding)}
            disabled={!adding}
            className="rounded bg-soka-border px-2 py-1 text-sm hover:bg-soka-muted/20 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

function LoadShareRow({
  instructor,
  onUpdate,
  onRemove,
}: {
  instructor: { id: string; faculty_name: string; load_share: number };
  onUpdate: (id: string, loadShare: number) => void;
  onRemove: () => void;
}) {
  const [localShare, setLocalShare] = useState(instructor.load_share);
  useEffect(() => setLocalShare(instructor.load_share), [instructor.load_share]);

  return (
    <div className="flex items-center justify-between rounded border border-soka-border bg-soka-surface px-3 py-2">
      <span className="text-sm">{instructor.faculty_name}</span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={0.01}
          max={1}
          step={0.1}
          value={localShare}
          onChange={(e) => setLocalShare(parseFloat(e.target.value) || 0.5)}
          onBlur={(e) => {
            const v = parseFloat(e.target.value);
            if (!Number.isNaN(v) && v >= 0.01 && v <= 1) onUpdate(instructor.id, v);
          }}
          className="w-16 rounded border border-soka-border px-2 py-1 text-sm"
        />
        <span className="text-xs text-soka-muted">load</span>
        <button onClick={onRemove} className="text-soka-error hover:underline">
          Remove
        </button>
      </div>
    </div>
  );
}

function AddInstructorForm({
  facultyList,
  existingIds,
  onAdd,
  onCancel,
}: {
  facultyList: Faculty[];
  existingIds: string[];
  onAdd: (facultyId: string, loadShare: number) => void;
  onCancel: () => void;
}) {
  const [facultyId, setFacultyId] = useState("");
  const [loadShare, setLoadShare] = useState(0.5);
  const available = facultyList.filter((f) => !existingIds.includes(f.id));

  return (
    <div className="mt-4 rounded border border-soka-border bg-soka-surface p-4">
      <h3 className="text-sm font-medium text-soka-body">Add instructor</h3>
      <div className="mt-2 flex gap-2">
        <select
          value={facultyId}
          onChange={(e) => setFacultyId(e.target.value)}
          className="flex-1 rounded-md border border-soka-border px-3 py-2 text-sm"
        >
          <option value="">Select faculty</option>
          {available.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={0.01}
          max={1}
          step={0.1}
          value={loadShare}
          onChange={(e) => setLoadShare(parseFloat(e.target.value) || 0.5)}
          className="w-20 rounded border border-soka-border px-2 py-2 text-sm"
        />
        <button
          onClick={() => facultyId && onAdd(facultyId, loadShare)}
          className="rounded-md bg-soka-blue px-3 py-2 text-sm text-white hover:bg-soka-blue-hover"
        >
          Add
        </button>
        <button
          onClick={onCancel}
          className="rounded-md border border-soka-border px-3 py-2 text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
