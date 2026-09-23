import { Plus, Trash2 } from "lucide-react";
import type { ExamTypeOption } from "@/lib/exams/examTypes";

type SectionDraft = { id?: string; name: string; maxMarks: string };

export function ExamTypesManager({
  examTypesLoading,
  examTypes,
  newExamType,
  onNewExamTypeChange,
  newExamTypeMax,
  onNewExamTypeMaxChange,
  onAddExamType,
  examTypeSaving,
  examTypeError,
  sectionDraftsByType,
  onSectionDraftsByTypeChange,
  expandedExamType,
  onExpandedExamTypeChange,
  maxMarksDrafts,
  onMaxMarksDraftsChange,
  onSaveExamTypeMaxMarks,
  onDeleteExamType,
  onSaveExamTypeSections,
  sectionSaving,
  sectionError,
}: {
  examTypesLoading: boolean;
  examTypes: ExamTypeOption[];
  newExamType: string;
  onNewExamTypeChange: (v: string) => void;
  newExamTypeMax: string;
  onNewExamTypeMaxChange: (v: string) => void;
  onAddExamType: () => void;
  examTypeSaving: boolean;
  examTypeError: string;
  sectionDraftsByType: Record<string, SectionDraft[]>;
  onSectionDraftsByTypeChange: (update: (prev: Record<string, SectionDraft[]>) => Record<string, SectionDraft[]>) => void;
  expandedExamType: string | null;
  onExpandedExamTypeChange: (update: (prev: string | null) => string | null) => void;
  maxMarksDrafts: Record<string, string>;
  onMaxMarksDraftsChange: (update: (prev: Record<string, string>) => Record<string, string>) => void;
  onSaveExamTypeMaxMarks: (name: string) => void;
  onDeleteExamType: (name: string) => void;
  onSaveExamTypeSections: (name: string) => void;
  sectionSaving: boolean;
  sectionError: string;
}) {
  return (
    <div className="somu border-none bg-white/5! rounded-3xl p-5 mb-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold">Exam Types</h3>
          <p className="text-xs text-white/50">
            Set max marks and optional subsections (Written/Practical) per exam type. Teachers inherit these.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <input
            value={newExamType}
            onChange={(e) => onNewExamTypeChange(e.target.value.toUpperCase())}
            placeholder="e.g. HALF YEARLY"
            className="px-4 py-2.5 rounded-2xl bg-black/40 border border-white/10 text-white text-sm outline-none focus:border-[#B4F42A]/50 uppercase"
          />
          <input
            value={newExamTypeMax}
            onChange={(e) => onNewExamTypeMaxChange(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder="Max marks"
            className="w-28 px-4 py-2.5 rounded-2xl bg-black/40 border border-white/10 text-white text-sm outline-none focus:border-[#B4F42A]/50"
          />
          <button
            type="button"
            onClick={onAddExamType}
            disabled={examTypeSaving}
            className="px-4 py-2.5 rounded-2xl bg-[#B4F42A] text-black text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <Plus size={16} />
            {examTypeSaving ? "Saving..." : "Add"}
          </button>
        </div>
      </div>

      {examTypeError && (
        <p className="mt-2 text-xs font-bold text-red-400">{examTypeError}</p>
      )}

      <div className="mt-4 flex flex-col gap-3">
        {examTypesLoading ? (
          <span className="text-xs text-white/50">Loading exam types...</span>
        ) : examTypes.length === 0 ? (
          <span className="text-xs text-white/50">No exam types found.</span>
        ) : (
          examTypes.map((t) => {
            const drafts = sectionDraftsByType[t.name] ?? [];
            const sum = drafts.reduce((a, s) => {
              const n = Number(s.maxMarks);
              return a + (Number.isFinite(n) ? n : 0);
            }, 0);
            const expanded = expandedExamType === t.name;
            return (
              <div
                key={t.name}
                className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden"
              >
                <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs font-bold text-white/80">
                  <button
                    type="button"
                    onClick={() =>
                      onExpandedExamTypeChange((prev) =>
                        prev === t.name ? null : t.name
                      )
                    }
                    className="min-w-[7rem] text-left hover:text-[#B4F42A]"
                    title="Edit subsections"
                  >
                    {t.name}
                    {(t.sections?.length ?? 0) > 0 ? (
                      <span className="ml-2 text-[10px] font-medium text-white/40">
                        ({t.sections.length} parts)
                      </span>
                    ) : null}
                  </button>
                  <span className="text-white/40 font-medium">Max</span>
                  <input
                    value={maxMarksDrafts[t.name] ?? ""}
                    onChange={(e) =>
                      onMaxMarksDraftsChange((prev) => ({
                        ...prev,
                        [t.name]: e.target.value.replace(/[^\d.]/g, ""),
                      }))
                    }
                    placeholder="—"
                    disabled={(t.sections?.length ?? 0) > 0 || drafts.length > 0}
                    className="w-20 px-2 py-1.5 rounded-xl bg-black/40 border border-white/10 text-white text-xs outline-none focus:border-[#B4F42A]/50 disabled:opacity-50"
                  />
                  <button
                    type="button"
                    disabled={examTypeSaving || drafts.length > 0}
                    onClick={() => onSaveExamTypeMaxMarks(t.name)}
                    className="px-2.5 py-1.5 rounded-xl bg-[#B4F42A]/20 text-[#B4F42A] border border-[#B4F42A]/30 hover:bg-[#B4F42A]/30 disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onExpandedExamTypeChange((prev) =>
                        prev === t.name ? null : t.name
                      )
                    }
                    className="px-2.5 py-1.5 rounded-xl bg-white/5 border border-white/10 text-white/70"
                  >
                    {expanded ? "Hide parts" : "Subsections"}
                  </button>
                  <button
                    type="button"
                    disabled={examTypeSaving}
                    onClick={() => onDeleteExamType(t.name)}
                    className="ml-auto inline-flex items-center justify-center rounded-full p-1.5 hover:bg-red-500/20 disabled:opacity-50"
                    title="Delete exam type"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                  </button>
                </div>
                {expanded && (
                  <div className="px-3 pb-3 border-t border-white/10 pt-3 space-y-2">
                    <p className="text-[10px] text-white/40">
                      Optional. Leave empty for a single score. With subsections, max becomes the sum
                      {drafts.length > 0 ? ` (currently ${sum})` : ""}.
                    </p>
                    {drafts.map((row, idx) => (
                      <div key={row.id ?? idx} className="flex gap-2 items-center">
                        <input
                          value={row.name}
                          onChange={(e) =>
                            onSectionDraftsByTypeChange((prev) => ({
                              ...prev,
                              [t.name]: (prev[t.name] ?? []).map((r, i) =>
                                i === idx ? { ...r, name: e.target.value } : r
                              ),
                            }))
                          }
                          placeholder="e.g. Written"
                          className="flex-1 px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white text-xs outline-none focus:border-[#B4F42A]/50"
                        />
                        <input
                          value={row.maxMarks}
                          onChange={(e) =>
                            onSectionDraftsByTypeChange((prev) => ({
                              ...prev,
                              [t.name]: (prev[t.name] ?? []).map((r, i) =>
                                i === idx
                                  ? {
                                      ...r,
                                      maxMarks: e.target.value.replace(
                                        /[^\d.]/g,
                                        ""
                                      ),
                                    }
                                  : r
                              ),
                            }))
                          }
                          placeholder="Max"
                          className="w-16 px-2 py-2 rounded-xl bg-black/40 border border-white/10 text-white text-xs outline-none focus:border-[#B4F42A]/50"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            onSectionDraftsByTypeChange((prev) => ({
                              ...prev,
                              [t.name]: (prev[t.name] ?? []).filter(
                                (_, i) => i !== idx
                              ),
                            }))
                          }
                          className="p-1.5 rounded-full hover:bg-red-500/20"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          onSectionDraftsByTypeChange((prev) => ({
                            ...prev,
                            [t.name]: [
                              ...(prev[t.name] ?? []),
                              { name: "", maxMarks: "" },
                            ],
                          }))
                        }
                        className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-white/80 inline-flex items-center gap-1"
                      >
                        <Plus size={14} /> Add
                      </button>
                      <button
                        type="button"
                        disabled={sectionSaving}
                        onClick={() => onSaveExamTypeSections(t.name)}
                        className="px-3 py-2 rounded-xl bg-[#B4F42A] text-black text-xs font-bold disabled:opacity-60"
                      >
                        {sectionSaving ? "Saving..." : "Save subsections"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      {sectionError && (
        <p className="mt-2 text-xs font-bold text-red-400">{sectionError}</p>
      )}
    </div>
  );
}
