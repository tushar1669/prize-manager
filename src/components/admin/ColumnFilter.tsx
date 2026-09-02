import { useMemo, useState } from "react";
import { Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Excel-style column filter.
 *
 * Renders a funnel button next to a column header. Clicking it opens a
 * searchable list of the distinct values present in that column, each with a
 * count, each toggleable.
 *
 * Semantics, chosen to match a spreadsheet rather than a search box:
 *   - an EMPTY selection means "no filter" and shows every row;
 *   - a non-empty selection shows only rows whose value is selected.
 * This keeps the default state (nothing ticked) equal to the previous
 * behaviour, so adding a filter to a column cannot hide rows until the user
 * actually picks something.
 *
 * Values are supplied already-extracted by the parent so this component never
 * needs to know the row shape.
 */

export const EMPTY_LABEL = "(blank)";

export interface ColumnFilterProps {
  /** Column name, used in the popover heading and the accessible label. */
  label: string;
  /** One entry per row: the value of this column for that row. */
  values: string[];
  /** Currently selected values. Empty means unfiltered. */
  selected: string[];
  onChange: (next: string[]) => void;
}

export function ColumnFilter({ label, values, selected, onChange }: ColumnFilterProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  // Distinct values with counts, blanks folded into one bucket, sorted by
  // frequency so the owner with the most tournaments is first.
  const options = useMemo(() => {
    const counts = new Map<string, number>();
    for (const raw of values) {
      const key = raw && raw.trim() !== "" ? raw : EMPTY_LABEL;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  }, [values]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.value.toLowerCase().includes(q));
  }, [options, query]);

  const toggle = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value]
    );
  };

  const active = selected.length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Filter by ${label}`}
          className={`h-7 w-7 p-0 ml-1 align-middle ${
            active ? "text-primary" : "text-muted-foreground"
          }`}
        >
          <Filter className={`h-3.5 w-3.5 ${active ? "fill-current" : ""}`} />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-72 p-0" align="start">
        <div className="p-2 border-b border-border">
          <Input
            autoFocus
            placeholder={`Search ${label.toLowerCase()}...`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8"
          />
        </div>

        <ScrollArea className="max-h-64">
          <div className="p-1">
            {visible.length === 0 ? (
              <p className="px-2 py-4 text-sm text-muted-foreground text-center">
                No matches
              </p>
            ) : (
              visible.map((o) => (
                <label
                  key={o.value}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-accent cursor-pointer"
                >
                  <Checkbox
                    checked={selected.includes(o.value)}
                    onCheckedChange={() => toggle(o.value)}
                  />
                  <span className="flex-1 text-sm truncate" title={o.value}>
                    {o.value}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {o.count}
                  </span>
                </label>
              ))
            )}
          </div>
        </ScrollArea>

        <div className="flex items-center justify-between gap-2 p-2 border-t border-border">
          <span className="text-xs text-muted-foreground">
            {active ? `${selected.length} selected` : "Showing all"}
          </span>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => onChange(visible.map((o) => o.value))}
            >
              Select all
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              disabled={!active}
              onClick={() => onChange([])}
            >
              Clear
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
