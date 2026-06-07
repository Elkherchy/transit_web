'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Check, Loader2, Phone, Mail, Plus, ChevronsUpDown, X as XIcon } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const DEBOUNCE_MS = 250;

interface AdminClientOption {
  _id: string;
  nom: string;
  telephone?: string;
  email?: string;
}

async function searchClients(q: string): Promise<AdminClientOption[]> {
  try {
    const url = q.trim()
      ? `/api/admin/clients?q=${encodeURIComponent(q.trim())}`
      : '/api/admin/clients';
    const res = await fetch(url, { credentials: 'include' });
    const json = await res.json();
    if (!json.success || !Array.isArray(json.data)) return [];
    return json.data as AdminClientOption[];
  } catch {
    return [];
  }
}

export interface AdminClientComboboxProps {
  valueId: string;
  onChange: (id: string, client: AdminClientOption | null) => void;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * Combobox client (admin) avec :
 *   - recherche debounce sur nom / téléphone / email
 *   - affichage riche (nom + tél + email + initiales)
 *   - lien "Nouveau client" vers la page de gestion
 *   - clear button quand un client est sélectionné
 */
export function AdminClientCombobox({
  valueId,
  onChange,
  disabled,
  placeholder,
}: AdminClientComboboxProps) {
  const { t } = useTranslation();
  const placeholderText = placeholder ?? t('components.combobox.selectClient');
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [list, setList] = useState<AdminClientOption[]>([]);
  const [selected, setSelected] = useState<AdminClientOption | null>(null);
  const [loading, setLoading] = useState(false);
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

  // Synchronise `selected` quand `valueId` change. On résout d'abord depuis
  // la liste courante puis on déclenche un fetch si nécessaire (cas où le
  // client n'apparaît pas dans le résultat filtré).
  useEffect(() => {
    if (!valueId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelected((s) => (s ? null : s));
      return;
    }
    // Déjà résolu → rien à faire.
    if (selected?._id === valueId) return;

    const fromList = list.find((c) => c._id === valueId);
    if (fromList) {
      setSelected(fromList);
      return;
    }
    // Sinon : on récupère la liste complète une fois pour résoudre l'ID.
    let cancelled = false;
    void searchClients('').then((all) => {
      if (cancelled) return;
      const m = all.find((c) => c._id === valueId);
      if (m) setSelected(m);
    });
    return () => {
      cancelled = true;
    };
  }, [valueId, list, selected]);

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      setInputValue('');
      runSearch('');
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const handleSelect = (c: AdminClientOption) => {
    setSelected(c);
    onChange(String(c._id), c);
    setOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelected(null);
    onChange('', null);
  };

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'group flex h-12 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm text-left ring-offset-background',
            'hover:bg-accent/30 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
            disabled && 'cursor-not-allowed opacity-50'
          )}
        >
          {selected ? (
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Avatar nom={selected.nom} />
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{selected.nom}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {[selected.telephone, selected.email]
                    .filter(Boolean)
                    .join(' · ') || t('components.combobox.noContact')}
                </div>
              </div>
            </div>
          ) : (
            <span className="text-muted-foreground">{placeholderText}</span>
          )}
          <div className="flex items-center gap-1 shrink-0">
            {selected && !disabled && (
              <span
                role="button"
                aria-label={t('components.combobox.clear')}
                tabIndex={0}
                onClick={handleClear}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleClear(e as unknown as React.MouseEvent);
                  }
                }}
                className="rounded-full p-1 text-muted-foreground hover:bg-muted"
              >
                <XIcon className="h-3.5 w-3.5" />
              </span>
            )}
            <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] min-w-[300px] p-0"
        align="start"
      >
        <div className="border-b p-2">
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={t('components.combobox.searchPlaceholder')}
            className="border-0 focus-visible:ring-0 h-9 shadow-none px-1"
            autoComplete="off"
          />
        </div>
        <div className="max-h-72 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : list.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              {t('components.combobox.noClient')}
            </div>
          ) : (
            <ul className="py-1">
              {list.map((c) => {
                const isSelected = valueId === c._id;
                return (
                  <li key={c._id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(c)}
                      className={cn(
                        'flex w-full items-center gap-2 px-2.5 py-2 text-left hover:bg-accent text-sm',
                        isSelected && 'bg-accent/60'
                      )}
                    >
                      <Avatar nom={c.nom} />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{c.nom}</div>
                        <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                          {c.telephone && (
                            <span className="inline-flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              <span className="tabular-nums">
                                {c.telephone}
                              </span>
                            </span>
                          )}
                          {c.email && (
                            <span className="inline-flex items-center gap-1 truncate">
                              <Mail className="h-3 w-3" />
                              <span className="truncate">{c.email}</span>
                            </span>
                          )}
                          {!c.telephone && !c.email && (
                            <span className="italic">{t('components.combobox.noContact')}</span>
                          )}
                        </div>
                      </div>
                      {isSelected && (
                        <Check className="h-4 w-4 shrink-0 text-primary" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="border-t p-1">
          <Link
            href="/dashboard/admin/clients"
            className="flex items-center gap-2 rounded-sm px-2.5 py-2 text-sm hover:bg-accent text-primary font-medium"
            onClick={() => setOpen(false)}
          >
            <Plus className="h-4 w-4" />
            {t('dashboard.clients.title')}
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function initials(nom: string): string {
  const parts = nom.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return '?';
  return parts.map((p) => p[0]?.toUpperCase()).join('');
}

function Avatar({ nom }: { nom: string }) {
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
      {initials(nom)}
    </div>
  );
}
