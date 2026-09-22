"use client";

import { BookOpen, Calendar, CheckCircle2 } from "lucide-react";
import PageHeader from "../../common/PageHeader";
import TimellyLoader from "../../common/TimellyLoader";
import { ChevronDown } from "lucide-react";
import { useExamsTabState } from "./shared/useExamsTabState";
import { ExamTypesManager } from "./shared/ExamTypesManager";
import { SubjectsManager } from "./shared/SubjectsManager";

export default function ExamsTab() {
    const {
        examTypes,
        examTypesLoading,
        newExamType,
        setNewExamType,
        newExamTypeMax,
        setNewExamTypeMax,
        examTypeError,
        examTypeSaving,
        maxMarksDrafts,
        setMaxMarksDrafts,
        sectionDraftsByType,
        setSectionDraftsByType,
        expandedExamType,
        setExpandedExamType,
        sectionSaving,
        sectionError,
        subjects,
        subjectsLoading,
        newSubject,
        setNewSubject,
        subjectError,
        setSubjectError,
        subjectSaving,
        editingSubject,
        setEditingSubject,
        editingSubjectValue,
        setEditingSubjectValue,
        classes,
        selectedClassId,
        setSelectedClassId,
        selectedTermName,
        setSelectedTermName,
        selectedSubject,
        setSelectedSubject,
        loading,
        showAllSchedules,
        setShowAllSchedules,
        deleteExamType,
        saveExamTypeMaxMarks,
        addExamType,
        deleteSubject,
        renameSubject,
        addSubject,
        uniqueTerms,
        saveExamTypeSections,
        isTermCompleted,
        activeSchedules,
        activeSubjects,
        activeTermData,
        nextExamDate,
        daysLeft,
    } = useExamsTabState();

    if (loading)
        return (
            <TimellyLoader
                title="Loading exams"
                steps={["Terms", "Schedules", "Subjects"]}
            />
        );

    return (
        <div className="min-h-screen text-white max-w-7xl mx-auto md:p-0">
            <PageHeader
                title={
                    <div className="flex items-center gap-3">
                        <span>Exams & Syllabus</span>
                        <span
                            className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md uppercase ${isTermCompleted ? "bg-white/20 text-white" : "bg-[#B4F42A] text-black"
                                }`}
                        >
                            {isTermCompleted ? "Completed" : "Active Term"}
                        </span>
                    </div>
                }
                subtitle={`Viewing details for ${selectedTermName}`}
                rightSlot={
                    <div className="flex gap-2 md:gap-6">
                        <div className="text-right md:text-center border-r border-white/10 pr-6 text-white/40">
                            <p className="text-xs">Next Exam</p>
                            <p className="text-sm font-bold text-white">
                                {nextExamDate
                                    ? nextExamDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })
                                    : "--"}
                            </p>
                        </div>
                        <div className="text-right md:text-center">
                            <p className="text-xs">Days Left</p>
                            <p className="text-sm font-bold text-[#B4F42A]">{daysLeft}</p>
                        </div>
                    </div>
                }
                className="somu border-none bg-white/5! mb-6"
            />

            <ExamTypesManager
                examTypesLoading={examTypesLoading}
                examTypes={examTypes}
                newExamType={newExamType}
                onNewExamTypeChange={setNewExamType}
                newExamTypeMax={newExamTypeMax}
                onNewExamTypeMaxChange={setNewExamTypeMax}
                onAddExamType={addExamType}
                examTypeSaving={examTypeSaving}
                examTypeError={examTypeError}
                sectionDraftsByType={sectionDraftsByType}
                onSectionDraftsByTypeChange={setSectionDraftsByType}
                expandedExamType={expandedExamType}
                onExpandedExamTypeChange={setExpandedExamType}
                maxMarksDrafts={maxMarksDrafts}
                onMaxMarksDraftsChange={setMaxMarksDrafts}
                onSaveExamTypeMaxMarks={saveExamTypeMaxMarks}
                onDeleteExamType={deleteExamType}
                onSaveExamTypeSections={saveExamTypeSections}
                sectionSaving={sectionSaving}
                sectionError={sectionError}
            />

            <SubjectsManager
                newSubject={newSubject}
                onNewSubjectChange={setNewSubject}
                onAddSubject={addSubject}
                subjectSaving={subjectSaving}
                subjectError={subjectError}
                onSubjectErrorChange={setSubjectError}
                subjectsLoading={subjectsLoading}
                subjects={subjects}
                editingSubject={editingSubject}
                onEditingSubjectChange={setEditingSubject}
                editingSubjectValue={editingSubjectValue}
                onEditingSubjectValueChange={setEditingSubjectValue}
                onRenameSubject={renameSubject}
                onDeleteSubject={deleteSubject}
            />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-3 space-y-4">
                    {/* CLASS DROPDOWN */}
                    <div className="mb-4 relative">
                        <label className="text-xs text-white/60 mb-1 block font-bold">Select Class</label>

                        <div className="relative">
                            <select
                                value={selectedClassId ?? ""}
                                onChange={(e) => {
                                    const id = e.target.value || null;
                                    setSelectedClassId(id);
                                    setSelectedTermName(""); // reset term selection
                                    setSelectedSubject("all");
                                }}
                                className="w-full p-2 pl-4 pr-10 rounded-2xl border transition-all text-white  border-gray-600 hover:bg-gray-700 focus:ring-1 focus:ring-[#B4F42A]/50 focus:border-[#B4F42A]/50 outline-none appearance-none"
                            >
                                <option className="bg-gray-800 text-white" value="">All Classes</option>
                                {classes.map((cls) => (
                                    <option className="bg-gray-800 text-white" key={cls.id} value={cls.id}>
                                        {cls.name} {cls.section}
                                    </option>
                                ))}
                            </select>

                            {/* Dropdown icon */}
                            
                            <ChevronDown
                                size={20}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 pointer-events-none"
                            />
                        </div>
                    </div>


                    {/* TERMS LIST */}
                    <div className="flex flex-col gap-3 mt-4">
                        {uniqueTerms.map((term) => (
                            <button
                                key={term.name}
                                onClick={() => {
                                    setSelectedTermName(term.name);
                                    setSelectedSubject("all");
                                    setShowAllSchedules(false);
                                }}
                                className={`p-2 pl-4 rounded-2xl text-left transition-all border ${selectedTermName === term.name
                                    ? "border-[#B4F42A]/50 bg-white/10 ring-1 ring-[#B4F42A]/20"
                                    : "border-white/5 bg-white/5 hover:bg-white/10"
                                    }`}
                            >
                                <p className="font-bold text-[12px] capitalize">{term.name} Examination</p>
                                <span
                                    className={`text-[10px] font-bold uppercase tracking-wider ${term.status === "UPCOMING" ? "text-[#B4F42A]" : "text-white/40"
                                        }`}
                                >
                                    {term.status}
                                </span>
                            </button>
                        ))}
                    </div>

                    {/* SCHEDULE */}
                    <div className="somu rounded-3xl p-5 border-none mt-4">
                        <h3 className="font-bold mb-4 flex items-center gap-2 text-white/80">
                            <Calendar size={16} className="text-[#B4F42A]" /> Schedule
                        </h3>
                        <div className="space-y-3">
                            {(showAllSchedules ? activeSchedules : activeSchedules.slice(0, 2)).map((exam) => (
                                <div
                                    key={exam.id}
                                    className="bg-white/5 p-4 rounded-2xl flex items-center gap-4 border border-white/5"
                                >
                                    <div className="text-center border-r border-white/10 pr-3">
                                        <p className="text-lg font-bold leading-tight">{new Date(exam.examDate).getDate()}</p>
                                        <p className="text-[9px] text-white/40 uppercase">
                                            {new Date(exam.examDate).toLocaleString("default", { month: "short" })}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="font-bold capitalize text-sm">{exam.subject}</p>
                                        <p className="text-[10px] text-white/40">{exam.startTime}</p>
                                    </div>
                                </div>
                            ))}
                            {activeSchedules.length > 2 && (
                                <button
                                    onClick={() => setShowAllSchedules(!showAllSchedules)}
                                    className="w-full text-center text-[#B4F42A] text-xs font-bold pt-1 hover:underline transition-all"
                                >
                                    {showAllSchedules ? "Show less" : "View all"}
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* RIGHT SIDE: SUBJECTS & SYLLABUS */}
                <div className="lg:col-span-9 space-y-6">
                    {isTermCompleted ? (
                        <div className="somu rounded-3xl p-12 border-none flex flex-col items-center justify-center text-center">
                            <div className="bg-white/5 p-6 rounded-full mb-4">
                                <CheckCircle2 size={48} className="text-[#B4F42A]" />
                            </div>
                            <h2 className="text-2xl font-bold mb-2">Examination Completed</h2>
                            <p className="text-white/40 max-w-xs">
                                All syllabus and exams for {selectedTermName} have been concluded.
                            </p>
                        </div>
                    ) : (
                        <>
                            {/* SUBJECT FILTER */}
                            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
                                <button
                                    onClick={() => setSelectedSubject("all")}
                                    className={`px-5 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${selectedSubject === "all" ? "bg-[#B4F42A] text-black" : "somu border-none"
                                        }`}
                                >
                                    All Subjects
                                </button>
                                {activeSubjects.map((sub) => (
                                    <button
                                        key={sub}
                                        onClick={() => setSelectedSubject(sub)}
                                        className={`px-5 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all capitalize ${selectedSubject === sub ? "bg-[#B4F42A] text-black" : "somu border-none"
                                            }`}
                                    >
                                        {sub}
                                    </button>
                                ))}
                            </div>

                            {/* SYLLABUS ITEMS */}
                            {(selectedSubject === "all" ? activeSubjects : [selectedSubject]).map((subName) => {
                                const syllabusItem = activeTermData.flatMap((t) => t.syllabus).find((s) => s.subject === subName);
                                if (!syllabusItem) return null;

                                const unitCount = syllabusItem.units.length;
                                const calculatedProgress = unitCount > 0
                                    ? Math.round(syllabusItem.units.reduce((acc, u) => acc + u.completedPercent, 0) / unitCount)
                                    : syllabusItem.completedPercent;

                                return (
                                    <div key={subName} className="somu rounded-3xl p-6 md:p-8 border-none mb-6">
                                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
                                            <div className="flex items-center gap-4">
                                                <div className="bg-white/10 p-3 rounded-2xl">
                                                    <BookOpen className="text-[#B4F42A]" size={24} />
                                                </div>
                                                <div>
                                                    <h2 className="text-xl font-bold capitalize">{subName}</h2>
                                                    {activeTermData[0]?.class?.teacher?.name && (
                                                        <div className="flex items-center gap-2 text-white/40 text-xs">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-white/40"></span>
                                                            <span>{activeTermData[0].class.teacher.name}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="w-full md:w-auto">
                                                <div className="flex justify-between md:justify-end items-center gap-3 mb-2">
                                                    <span className="text-[10px] text-white/40 uppercase font-bold tracking-widest">
                                                        Completion
                                                    </span>
                                                    <span className="text-lg font-bold">{calculatedProgress}%</span>
                                                </div>
                                                <div className="w-full md:w-40 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                                    <div
                                                        className="bg-[#B4F42A] h-full rounded-full transition-all duration-500"
                                                        style={{ width: `${calculatedProgress}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {syllabusItem.units.map((unit) => (
                                                <div
                                                    key={unit.id}
                                                    className="bg-white/5 p-4 rounded-2xl flex justify-between items-center border border-white/5"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div
                                                            className={`w-2 h-2 rounded-full ${unit.completedPercent === 100 ? "bg-[#B4F42A]" : "bg-blue-400"
                                                                }`}
                                                        />
                                                        <span className="text-sm font-medium text-white/90">{unit.unitName}</span>
                                                    </div>
                                                    {unit.completedPercent === 100 ? (
                                                        <div className="flex items-center gap-1.5 bg-[#B4F42A]/10 px-3 py-1 rounded-lg border border-[#B4F42A]/20">
                                                            <CheckCircle2 size={12} className="text-[#B4F42A]" />
                                                            <span className="text-[10px] font-bold text-[#B4F42A] uppercase">Done</span>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-3">
                                                            <span className="text-[10px] font-bold text-white/30 uppercase">
                                                                {unit.completedPercent}%
                                                            </span>
                                                            <div className="w-10 h-1 bg-white/10 rounded-full overflow-hidden">
                                                                <div className="bg-blue-400 h-full" style={{ width: `${unit.completedPercent}%` }} />
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
