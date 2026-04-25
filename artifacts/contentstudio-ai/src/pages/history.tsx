import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Trash2,
  Copy as CopyIcon,
  FolderOpen,
  Play,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { storage, type Project } from "@/lib/storage";

type SortKey = "newest" | "oldest" | "most_shots";
type DateRange = "all" | "today" | "week" | "month";
type DurationRange = "all" | "short" | "medium" | "long";

export default function History() {
  const [, navigate] = useLocation();
  const [projects, setProjects] = useState<Project[]>([]);
  const [filterStyle, setFilterStyle] = useState<string>("__all");
  const [filterDuration, setFilterDuration] = useState<DurationRange>("all");
  const [filterDate, setFilterDate] = useState<DateRange>("all");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("newest");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    refresh();
    // open a project if ?id= is set
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    if (id) {
      storage.setCurrentProjectId(id);
    }
  }, []);

  const refresh = () => setProjects(storage.getProjects());

  const styles = useMemo(() => {
    const set = new Set<string>();
    projects.forEach((p) => p.style && set.add(p.style));
    return Array.from(set);
  }, [projects]);

  const visible = useMemo(() => {
    let list = [...projects];
    if (filterStyle !== "__all") {
      list = list.filter((p) => p.style === filterStyle);
    }
    if (filterDuration !== "all") {
      list = list.filter((p) => {
        if (filterDuration === "short") return p.totalDuration <= 15;
        if (filterDuration === "medium")
          return p.totalDuration > 15 && p.totalDuration <= 30;
        return p.totalDuration > 30;
      });
    }
    if (filterDate !== "all") {
      const now = Date.now();
      const cutoff =
        filterDate === "today"
          ? now - 24 * 60 * 60 * 1000
          : filterDate === "week"
            ? now - 7 * 24 * 60 * 60 * 1000
            : now - 30 * 24 * 60 * 60 * 1000;
      list = list.filter((p) => new Date(p.updatedAt).getTime() >= cutoff);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.brief.toLowerCase().includes(q),
      );
    }
    list.sort((a, b) => {
      if (sortKey === "newest")
        return b.updatedAt.localeCompare(a.updatedAt);
      if (sortKey === "oldest")
        return a.updatedAt.localeCompare(b.updatedAt);
      return storage.totalShots(b) - storage.totalShots(a);
    });
    return list;
  }, [projects, filterStyle, filterDuration, filterDate, search, sortKey]);

  const open = (p: Project) => {
    storage.setCurrentProjectId(p.id);
    window.dispatchEvent(new Event("cs:projects-changed"));
    navigate("/story");
  };

  const duplicate = (p: Project) => {
    const copy = storage.duplicateProject(p.id);
    if (copy) {
      window.dispatchEvent(new Event("cs:projects-changed"));
      refresh();
      toast.success("Project duplicated");
    }
  };

  const remove = (id: string) => {
    storage.deleteProject(id);
    window.dispatchEvent(new Event("cs:projects-changed"));
    setConfirmDelete(null);
    refresh();
    toast.success("Project deleted");
  };

  return (
    <div className="px-4 py-8 md:px-12 md:py-14 max-w-6xl mx-auto">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
            All projects
          </div>
          <h1 className="mt-1 font-display text-4xl md:text-5xl tracking-tight">
            History
          </h1>
        </div>
        <Link
          href="/story"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-black font-mono text-xs uppercase tracking-widest hover:bg-[#D4EB3A] transition-colors"
          data-testid="button-new-from-history"
        >
          <Play className="w-4 h-4" /> New project
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="mt-10 border border-border rounded-md p-12 text-center text-muted-foreground">
          <FolderOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-mono text-xs uppercase tracking-widest">
            No projects yet
          </p>
          <p className="text-xs mt-2">Start creating to see them here.</p>
          <Link
            href="/story"
            className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-black font-mono text-xs uppercase tracking-widest hover:bg-[#D4EB3A] transition-colors"
          >
            Start a project
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="relative lg:col-span-2">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                className="w-full bg-background border border-border rounded-md pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-primary"
                data-testid="input-search"
              />
            </div>
            <select
              value={filterStyle}
              onChange={(e) => setFilterStyle(e.target.value)}
              className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary"
              data-testid="select-filter-style"
            >
              <option value="__all">All styles</option>
              {styles.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              value={filterDuration}
              onChange={(e) =>
                setFilterDuration(e.target.value as DurationRange)
              }
              className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary"
              data-testid="select-filter-duration"
            >
              <option value="all">Any duration</option>
              <option value="short">Short (≤15s)</option>
              <option value="medium">Medium (16–30s)</option>
              <option value="long">Long (&gt;30s)</option>
            </select>
            <select
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value as DateRange)}
              className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary"
              data-testid="select-filter-date"
            >
              <option value="all">Any date</option>
              <option value="today">Last 24 hours</option>
              <option value="week">Last 7 days</option>
              <option value="month">Last 30 days</option>
            </select>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary lg:col-span-1"
              data-testid="select-sort"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="most_shots">Most shots</option>
            </select>
          </div>

          <div className="mt-6 divide-y divide-border border border-border rounded-md">
            {visible.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-4 p-4 hover:bg-secondary/30 transition-colors"
                data-testid={`history-row-${p.id}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-display text-2xl tracking-tight truncate">
                    {p.title}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                    {p.style && (
                      <span className="px-1.5 py-0.5 border border-border rounded">
                        {p.style}
                      </span>
                    )}
                    <span className="px-1.5 py-0.5 border border-border rounded">
                      {p.totalDuration}s
                    </span>
                    <span className="px-1.5 py-0.5 border border-border rounded">
                      {storage.totalShots(p)} shots
                    </span>
                    <span>· {new Date(p.updatedAt).toLocaleString()}</span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => open(p)}
                    className="px-3 py-1.5 rounded-md border border-border font-mono text-[10px] uppercase tracking-widest hover:border-primary hover:text-primary transition-colors"
                    data-testid={`button-open-${p.id}`}
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    onClick={() => duplicate(p)}
                    title="Duplicate"
                    className="p-1.5 rounded-md border border-border hover:border-primary hover:text-primary transition-colors"
                    data-testid={`button-duplicate-${p.id}`}
                  >
                    <CopyIcon className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(p.id)}
                    title="Delete"
                    className="p-1.5 rounded-md border border-border hover:border-[#FF4444] hover:text-[#FF4444] transition-colors"
                    data-testid={`button-delete-${p.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
            {visible.length === 0 && (
              <div className="p-6 text-center text-xs text-muted-foreground">
                No projects match the current filters.
              </div>
            )}
          </div>
        </>
      )}

      {confirmDelete && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4"
          data-testid="confirm-delete-modal"
        >
          <div className="border border-border bg-card rounded-md p-6 max-w-md w-full">
            <div className="font-display text-2xl tracking-tight">
              Delete this project?
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              This is permanent. The project, story, prompts, music, and
              voiceover will all be removed from this browser.
            </p>
            <div className="mt-5 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 rounded-md border border-border font-mono text-xs uppercase tracking-widest hover:border-foreground"
                data-testid="button-cancel-delete"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => remove(confirmDelete)}
                className="px-4 py-2 rounded-md bg-[#FF4444] text-white font-mono text-xs uppercase tracking-widest hover:bg-[#FF6666]"
                data-testid="button-confirm-delete"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
