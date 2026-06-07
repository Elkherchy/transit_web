'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Loader2, Plus } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { ITransitClient } from '@/types';

const DEBOUNCE_MS = 300;

async function searchClients(q: string): Promise<ITransitClient[]> {
  try {
    const res = await fetch(
      `/api/transit/clients?q=${encodeURIComponent(q)}`,
      { credentials: 'include' }
    );
    const json = await res.json();
    if (!json.success || !Array.isArray(json.data)) return [];
    return json.data as ITransitClient[];
  } catch {
    return [];
  }
}

async function createClientApi(nom: string): Promise<ITransitClient> {
  const res = await fetch('/api/transit/clients', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nom: nom.trim() }),
  });
  const json = await res.json();
  if (!json.success || !json.data) {
    throw new Error(json.error || 'Création impossible');
  }
  return json.data as ITransitClient;
}

export function ClientCombobox({
  valueId,
  valueName,
  onChange,
  disabled,
  label,
  required,
  placeholder,
}: {
  valueId: string;
  valueName: string;
  onChange: (id: string, name: string) => void;
  disabled?: boolean;
  label?: string;
  required?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [list, setList] = useState<ITransitClient[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const runSearch = useCallback((q: string) => {
    setLoading(true);
    searchClients(q)
      .then(setList)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      runSearch(inputValue);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [inputValue, runSearch]);

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      setInputValue('');
      runSearch('');
      setTimeout(() => inputRef.current?.focus(), 0);
    } else if (valueName) {
      setInputValue(valueName);
    }
  };

  const handleSelect = (p: ITransitClient) => {
    onChange(String(p._id), p.nom);
    setInputValue(p.nom);
    setOpen(false);
  };

  const handleCreate = () => {
    const nom = inputValue.trim();
    if (!nom) return;
    setCreating(true);
    createClientApi(nom)
      .then((created) => {
        onChange(String(created._id), created.nom);
        setInputValue(created.nom);
        setOpen(false);
      })
      .catch(() => {
        /* erreur affichée par le parent si besoin */
      })
      .finally(() => setCreating(false));
  };

  const showCreate =
    inputValue.trim().length > 0 &&
    !list.some((p) => p.nom.toLowerCase() === inputValue.trim().toLowerCase());

  return (
    <div className="space-y-2">
      {label ? (
        <Label>
          {label}
          {required ? ' *' : ''}
        </Label>
      ) : null}
      <Popover open={open} onOpenChange={handleOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex h-11 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm text-left ring-offset-background',
              'hover:bg-accent/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
              disabled && 'cursor-not-allowed opacity-50'
            )}
            disabled={disabled}
          >
            <span
              className={cn(
                'truncate',
                !valueName && !open && 'text-muted-foreground'
              )}
            >
              {open
                ? 'Rechercher ou créer…'
                : valueName || placeholder || 'Sélectionner un client…'}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] min-w-[280px] p-0"
          align="start"
        >
          <div className="p-1 border-b border-border">
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={placeholder || 'Nom du client…'}
              className="border-0 focus-visible:ring-0 h-9 shadow-none"
              autoComplete="off"
            />
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            {loading ? (
              <div className="flex items-center justify-center py-6 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : (
              <>
                {list.map((p) => (
                  <button
                    key={p._id}
                    type="button"
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground text-left"
                    onClick={() => handleSelect(p)}
                  >
                    {valueId === String(p._id) ? (
                      <Check className="h-4 w-4 shrink-0 text-primary" />
                    ) : (
                      <span className="w-4 shrink-0" />
                    )}
                    <span className="truncate">{p.nom}</span>
                  </button>
                ))}
                {showCreate ? (
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground text-left text-primary font-medium"
                    onClick={() => void handleCreate()}
                    disabled={creating}
                  >
                    {creating ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4 shrink-0" />
                    )}
                    Créer « {inputValue.trim()} »
                  </button>
                ) : null}
                {!loading && list.length === 0 && !showCreate ? (
                  <p className="py-4 px-2 text-center text-sm text-muted-foreground">
                    Aucun client. Saisissez un nom pour créer.
                  </p>
                ) : null}
              </>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
