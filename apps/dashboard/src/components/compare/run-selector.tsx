/**
 * Purpose: Dropdown selector component for choosing runs to compare.
 */
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { RunListItem } from "@/lib/types";
import { formatDate, formatDuration } from "@/lib/utils";

interface RunSelectorProps {
  runs: RunListItem[];
  value: string | undefined;
  onValueChange: (value: string) => void;
  placeholder?: string;
  label?: string;
}

export function RunSelector({
  runs,
  value,
  onValueChange,
  placeholder = "Select a run",
  label,
}: RunSelectorProps) {
  return (
    <div className="space-y-1">
      {label && (
        <label className="text-sm font-medium text-foreground-muted">
          {label}
        </label>
      )}
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="w-full md:w-[300px]">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {runs.map((run) => (
            <SelectItem key={run.runId} value={run.runId}>
              <div className="flex flex-col">
                <span className="truncate">{run.runId}</span>
                <span className="text-xs text-foreground-faint">
                  {formatDate(run.startedAt)} · {formatDuration(run.durationMs)}
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
