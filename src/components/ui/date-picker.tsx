'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { fr as frDF } from 'date-fns/locale';
import { fr } from 'react-day-picker/locale/fr';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DatePickerProps {
  /** Valeur `yyyy-MM-dd` (compatible `<input type="date" />`) */
  value: string;
  onChange: (isoDate: string) => void;
  id?: string;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
}

export function DatePicker({
  value,
  onChange,
  id,
  className,
  disabled,
  placeholder = 'Choisir une date',
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);

  const selected = React.useMemo(() => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
    return new Date(`${value}T12:00:00`);
  }, [value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn('w-full justify-start font-normal', className)}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
          {selected
            ? format(selected, 'd MMMM yyyy', { locale: frDF })
            : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={fr}
          selected={selected}
          captionLayout="dropdown"
          defaultMonth={selected}
          onSelect={(d) => {
            onChange(d ? format(d, 'yyyy-MM-dd') : '');
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
