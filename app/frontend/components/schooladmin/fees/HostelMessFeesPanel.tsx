"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import PrimaryButton from "../../common/PrimaryButton";
import type { Class, ExtraFee } from "./types";
import type { MessDuplicateIssue } from "@/lib/fees/findMessFeeDuplicateIssues";
import { classLabel, existingMessAmountForClass, patchTargetId, scopeLabel } from "./hostel-mess-shared/hostelMessFeesUtils";
import { useHostelMessFeesState } from "./hostel-mess-shared/useHostelMessFeesState";
import { SingleClassMessEditor } from "./hostel-mess-shared/SingleClassMessEditor";
import { StatPill } from "./hostel-mess-shared/StatPill";

const inputClass =
  "w-full min-h-[42px] rounded-xl border border-white/10 bg-[#0B1220]/80 px-4 py-2.5 text-sm text-gray-100 placeholder:text-white/30 focus:border-sky-400/50 focus:outline-none focus:ring-2 focus:ring-sky-400/20";

const inputCompact =
  "w-full min-h-[42px] rounded-lg border border-white/10 bg-[#0B1220]/60 px-3 py-2 text-sm text-right tabular-nums text-gray-100 placeholder:text-white/30 focus:border-sky-400/50 focus:outline-none focus:ring-1 focus:ring-sky-400/25";

const labelClass = "block text-[11px] font-semibold uppercase tracking-wide text-white/45 mb-1.5";

interface HostelMessFeesPanelProps {
  classes: Class[];
  extraFees: ExtraFee[];
  schoolResidencyHeadName: string;
  classHeadName: string;
  onSuccess: () => void;
}

export default function HostelMessFeesPanel(props: HostelMessFeesPanelProps) {
  const { classes, extraFees, schoolResidencyHeadName, classHeadName, onSuccess } = props;
  const {
    sortedClasses,
    duplicateIssues,
    duplicateRowCount,
    schoolHead,
    schoolAmount,
    setSchoolAmount,
    schoolSaving,
    saveSchoolHead,
    classAmounts,
    setClassAmounts,
    fillAllValue,
    setFillAllValue,
    classSearch,
    setClassSearch,
    tableSaving,
    tableProgress,
    cleanupBusy,
    showDuplicateList,
    setShowDuplicateList,
    classView,
    setClassView,
    applyFillAllToTable,
    runDuplicateCleanup,
    saveAllClassAmounts,
    filteredClasses,
    configuredCount,
    pendingChangeCount,
    classesWithDuplicate,
    schoolScopeMismatch,
    selectedClass,
    saveSingleClass,
    classViewSelectValue,
  } = useHostelMessFeesState({ classes, extraFees, schoolResidencyHeadName, classHeadName, onSuccess });

  return (
    <section className="space-y-6">
      <header className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-transparent p-5 sm:p-6">
        <h3 className="text-lg font-semibold tracking-tight text-white">School & class fee catalog</h3>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/55">
          Set hostel fee once for the whole school. Use the mess fee dropdown to edit one class or open
          the full table for all classes.
        </p>
      </header>

      <div className="max-w-md rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] p-5">
        <h4 className="text-sm font-semibold text-amber-100">{schoolResidencyHeadName}</h4>
        <p className="mt-0.5 text-xs text-white/50">School-wide · hostellers only</p>
        {schoolScopeMismatch && (
          <p className="mt-3 rounded-lg border border-amber-500/30 bg-black/20 px-3 py-2 text-xs text-amber-100">
            Not limited to hostellers yet ({scopeLabel(schoolHead.lump?.residencyScope)}).
          </p>
        )}
        <div className="mt-4">
          <label className={labelClass} htmlFor="school-residency-fee-amount">
            Combined amount (₹)
          </label>
          <input
            id="school-residency-fee-amount"
            type="number"
            value={schoolAmount}
            onChange={(e) => setSchoolAmount(e.target.value)}
            className={inputClass}
            placeholder="e.g. 50000"
          />
        </div>
        <div className="mt-4">
          <PrimaryButton
            title={schoolSaving ? "Saving…" : patchTargetId(schoolHead) ? "Update hostel fee" : "Save hostel fee"}
            loading={schoolSaving}
            onClick={saveSchoolHead}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-sky-500/20 bg-gradient-to-b from-sky-500/[0.08] to-[#0B1220]/40 shadow-lg shadow-black/20">
        <div className="border-b border-white/10 px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h4 className="flex items-center gap-2 text-lg font-semibold text-white">
                <Sparkles className="h-5 w-5 text-sky-400" />
                {classHeadName} — all classes
              </h4>
              <p className="mt-1 text-sm text-white/55">
                Day scholars · combined total → 2 installments per class
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatPill label="Classes" value={String(sortedClasses.length)} />
              <StatPill label="Configured" value={`${configuredCount}`} tone="sky" />
              <StatPill
                label="To save"
                value={String(pendingChangeCount)}
                tone={pendingChangeCount > 0 ? "lime" : undefined}
              />
              <StatPill
                label="Duplicates"
                value={String(duplicateRowCount)}
                tone={duplicateRowCount > 0 ? "amber" : "ok"}
              />
            </div>
          </div>

          {duplicateRowCount > 0 && (
            <div className="mt-4 rounded-xl border border-amber-500/35 bg-amber-500/10 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
                  <div>
                    <p className="text-sm font-semibold text-amber-100">
                      {duplicateRowCount} duplicate mess fee row(s) found
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-amber-100/80">
                      Old bulk student mess fees or extra copies can inflate totals. Remove them from
                      the database (not hidden in UI only).
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowDuplicateList((v) => !v)}
                      className="mt-2 text-xs font-semibold text-amber-200 underline-offset-2 hover:underline"
                    >
                      {showDuplicateList ? "Hide details" : "Show details"}
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={runDuplicateCleanup}
                  disabled={cleanupBusy || tableSaving}
                  className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-2 rounded-xl border border-amber-400/40 bg-amber-500/20 px-4 text-sm font-semibold text-amber-50 hover:bg-amber-500/30 disabled:opacity-50"
                >
                  {cleanupBusy ? (
                    "Removing…"
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4" />
                      Remove duplicates
                    </>
                  )}
                </button>
              </div>
              {showDuplicateList && (
                <ul className="mt-3 max-h-40 space-y-2 overflow-y-auto border-t border-amber-500/20 pt-3">
                  {duplicateIssues.map((issue: MessDuplicateIssue) => (
                    <li
                      key={issue.id}
                      className="rounded-lg bg-black/25 px-3 py-2 text-xs text-amber-100/90"
                    >
                      <span className="font-semibold text-amber-200">{issue.classLabel}</span>
                      <span className="text-amber-100/70"> — {issue.detail}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {duplicateRowCount === 0 && (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-lime-500/25 bg-lime-500/10 px-4 py-2.5 text-xs text-lime-200">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              No duplicate mess fees detected for this school.
            </div>
          )}

          <div className="mt-5 max-w-md">
            <label className={labelClass} htmlFor="mess-class-view">
              View classes
            </label>
            <div className="relative">
              <select
                id="mess-class-view"
                value={classViewSelectValue}
                onChange={(e) => {
                  const v = e.target.value;
                  setClassView(v === "" ? "closed" : v);
                  if (v !== "all") setClassSearch("");
                }}
                disabled={tableSaving || sortedClasses.length === 0}
                className={`${inputClass} appearance-none pr-10 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50`}
              >
                <option value="">— Hidden —</option>
                <option value="all">All classes (table)</option>
                {sortedClasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {classLabel(c)}
                    {classesWithDuplicate.has(c.id) ? " · duplicate" : ""}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
            </div>
            <p className="mt-1.5 text-xs text-white/40">
              {classView === "closed"
                ? "Class list is hidden. Pick a class or open the full table."
                : classView === "all"
                  ? "Editing all classes in the table below."
                  : `Editing ${selectedClass ? classLabel(selectedClass) : "class"}.`}
            </p>
          </div>
        </div>

        {classView !== "closed" && (
        <div className="space-y-4 border-t border-white/10 px-5 py-4 sm:px-6">
          {classView === "all" && (
          <>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <div className="relative">
              <label className={labelClass} htmlFor="class-search">
                Search class
              </label>
              <Search className="pointer-events-none absolute left-3 top-[34px] h-4 w-4 text-white/35" />
              <input
                id="class-search"
                type="search"
                value={classSearch}
                onChange={(e) => setClassSearch(e.target.value)}
                className={`${inputClass} pl-9`}
                placeholder="Filter by class name…"
                disabled={tableSaving}
              />
            </div>
            <div className="sm:min-w-[140px]">
              <label className={labelClass} htmlFor="fill-all-mess">
                Fill all rows (₹)
              </label>
              <input
                id="fill-all-mess"
                type="number"
                value={fillAllValue}
                onChange={(e) => setFillAllValue(e.target.value)}
                className={inputClass}
                placeholder="28600"
                disabled={tableSaving}
              />
            </div>
            <button
              type="button"
              onClick={applyFillAllToTable}
              disabled={tableSaving || sortedClasses.length === 0}
              className="min-h-[42px] rounded-xl border border-white/15 bg-white/10 px-4 text-sm font-semibold text-white hover:bg-white/15 disabled:opacity-50"
            >
              Apply to all
            </button>
          </div>

          {sortedClasses.length === 0 ? (
            <p className="py-8 text-center text-sm text-white/50">No classes found.</p>
          ) : filteredClasses.length === 0 ? (
            <p className="py-8 text-center text-sm text-white/50">No classes match your search.</p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-white/10">
              <div className="max-h-[min(32rem,55vh)] overflow-auto">
                <table className="w-full min-w-[36rem] border-collapse text-sm">
                  <thead className="sticky top-0 z-10 bg-[#0a1020] text-[11px] uppercase tracking-wider text-white/45">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">#</th>
                      <th className="px-4 py-3 text-left font-semibold">Class</th>
                      <th className="px-4 py-3 text-left font-semibold">Status</th>
                      <th className="px-4 py-3 text-right font-semibold">In DB (₹)</th>
                      <th className="px-4 py-3 text-right font-semibold min-w-[9rem]">New total (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredClasses.map((c, idx) => {
                      const saved = existingMessAmountForClass(extraFees, classHeadName, c.id);
                      const draft = classAmounts[c.id] ?? "";
                      const draftNum = Number(draft);
                      const changed =
                        draft.trim() !== "" &&
                        Number.isFinite(draftNum) &&
                        draftNum > 0 &&
                        Math.abs(draftNum - saved) > 0.02;
                      const hasDup = classesWithDuplicate.has(c.id);
                      const rowTone = hasDup
                        ? "bg-amber-500/[0.06]"
                        : changed
                          ? "bg-sky-500/[0.06]"
                          : idx % 2 === 0
                            ? "bg-white/[0.02]"
                            : "";

                      let status = "Not set";
                      let statusClass = "text-white/40 bg-white/5 border-white/10";
                      if (hasDup) {
                        status = "Duplicate";
                        statusClass = "text-amber-200 bg-amber-500/15 border-amber-500/30";
                      } else if (changed) {
                        status = "Changed";
                        statusClass = "text-sky-200 bg-sky-500/15 border-sky-500/30";
                      } else if (saved > 0) {
                        status = "Saved";
                        statusClass = "text-lime-200 bg-lime-500/10 border-lime-500/25";
                      }

                      return (
                        <tr key={c.id} className={`border-t border-white/5 ${rowTone}`}>
                          <td className="px-4 py-2.5 text-white/35 tabular-nums">{idx + 1}</td>
                          <td className="px-4 py-2.5 font-medium text-white">{classLabel(c)}</td>
                          <td className="px-4 py-2.5">
                            <span
                              className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusClass}`}
                            >
                              {status}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-white/60">
                            {saved > 0 ? saved.toLocaleString("en-IN") : "—"}
                          </td>
                          <td className="px-4 py-2.5">
                            <input
                              type="number"
                              value={draft}
                              onChange={(e) =>
                                setClassAmounts((prev) => ({ ...prev, [c.id]: e.target.value }))
                              }
                              className={inputCompact}
                              placeholder="Enter amount"
                              disabled={tableSaving}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          </>
          )}

          {selectedClass && classView !== "all" ? (
            <SingleClassMessEditor
              classRef={selectedClass}
              extraFees={extraFees}
              classHeadName={classHeadName}
              draft={classAmounts[selectedClass.id] ?? ""}
              hasDuplicate={classesWithDuplicate.has(selectedClass.id)}
              tableSaving={tableSaving}
              onDraftChange={(value) =>
                setClassAmounts((prev) => ({ ...prev, [selectedClass.id]: value }))
              }
              onSave={saveSingleClass}
            />
          ) : null}

          {tableProgress && (
            <p className="text-center text-xs text-white/50">{tableProgress}</p>
          )}

          {classView === "all" && (
          <div className="flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-white/45">
              Showing {filteredClasses.length} of {sortedClasses.length} classes · only changed rows
              are saved
            </p>
            <PrimaryButton
              title={
                tableSaving
                  ? "Saving…"
                  : pendingChangeCount > 0
                    ? `Save ${pendingChangeCount} class(es)`
                    : "Save all class mess fees"
              }
              loading={tableSaving}
              onClick={saveAllClassAmounts}
            />
          </div>
          )}
        </div>
        )}
      </div>
    </section>
  );
}
