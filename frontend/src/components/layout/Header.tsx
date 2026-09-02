import { IconFilter, IconRefresh, IconSearch } from "../ui/Icons";

type Props = {
  query: string;
  onQuery: (value: string) => void;
  onRefresh: () => void;
};

export function Header({ query, onQuery, onRefresh }: Props) {
  return (
    <div className="flex items-center gap-3 border-b border-line px-8 py-5">
      <label className="relative min-w-0 flex-1">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#9a9a9a]">
          <IconSearch />
        </span>
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search"
          className="h-10 w-full rounded-full border-0 bg-wash pl-11 pr-4 text-sm outline-none placeholder:text-[#9a9a9a] focus:ring-2 focus:ring-brand/20"
        />
      </label>
      <button type="button" className="flex h-10 w-10 items-center justify-center text-[#9a9a9a] hover:text-ink" title="Filter" aria-label="Filter">
        <IconFilter />
      </button>
      <button type="button" className="flex h-10 w-10 items-center justify-center text-[#9a9a9a] hover:text-ink" title="Refresh" aria-label="Refresh" onClick={onRefresh}>
        <IconRefresh />
      </button>
    </div>
  );
}
