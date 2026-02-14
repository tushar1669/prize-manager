import { useMemo, useState } from "react";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface DateTimePickerProps {
  value: Date | null;
  onChange: (value: Date | null) => void;
  label?: string;
  min?: Date;
  max?: Date;
  disabled?: boolean;
  includeTime?: boolean;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

function toLocalDisplay(value: Date, includeTime: boolean) {
  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(includeTime
      ? {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }
      : {}),
  }).format(value);
}

export function DateTimePicker({
  value,
  onChange,
  label,
  min,
  max,
  disabled,
  includeTime = true,
}: DateTimePickerProps) {
  const [open, setOpen] = useState(false);

  const selectedHour = useMemo(() => (value ? String(value.getHours()).padStart(2, "0") : "00"), [value]);
  const selectedMinute = useMemo(() => (value ? String(value.getMinutes()).padStart(2, "0") : "00"), [value]);

  const updateDatePart = (nextDate: Date | undefined) => {
    if (!nextDate) return;
    const next = new Date(nextDate);
    if (value) {
      next.setHours(value.getHours(), value.getMinutes(), 0, 0);
    } else {
      next.setHours(0, 0, 0, 0);
    }
    onChange(next);
  };

  const updateHour = (hour: string) => {
    if (!value) return;
    const next = new Date(value);
    next.setHours(Number(hour));
    onChange(next);
  };

  const updateMinute = (minute: string) => {
    if (!value) return;
    const next = new Date(value);
    next.setMinutes(Number(minute));
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {label ? <Label>{label}</Label> : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            disabled={disabled}
            className="w-full justify-between font-normal"
          >
            <span>{value ? toLocalDisplay(value, includeTime) : "Select date"}</span>
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3" align="start">
          <div className="space-y-3">
            <Calendar
              mode="single"
              selected={value ?? undefined}
              onSelect={updateDatePart}
              fromDate={min}
              toDate={max}
              initialFocus
            />

            {includeTime ? (
              <div className="grid grid-cols-2 gap-2">
                <Select value={selectedHour} onValueChange={updateHour} disabled={!value}>
                  <SelectTrigger>
                    <SelectValue placeholder="HH" />
                  </SelectTrigger>
                  <SelectContent>
                    {HOURS.map((hour) => {
                      const hourValue = String(hour).padStart(2, "0");
                      return (
                        <SelectItem key={hourValue} value={hourValue}>
                          {hourValue}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>

                <Select value={selectedMinute} onValueChange={updateMinute} disabled={!value}>
                  <SelectTrigger>
                    <SelectValue placeholder="MM" />
                  </SelectTrigger>
                  <SelectContent>
                    {MINUTES.map((minute) => {
                      const minuteValue = String(minute).padStart(2, "0");
                      return (
                        <SelectItem key={minuteValue} value={minuteValue}>
                          {minuteValue}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <p className="text-xs text-muted-foreground">Saved in local time and converted to ISO.</p>

            <div className="flex justify-between gap-2">
              <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
                Clear
              </Button>
              <Button size="sm" onClick={() => setOpen(false)}>
                Done
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
