import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { IUserResponse } from '@/types';

interface ChauffeurComboboxProps {
  value: string;
  onChange: (value: string) => void;
}

export default function ChauffeurCombobox({
  value,
  onChange,
}: ChauffeurComboboxProps) {
  const { t } = useTranslation();
  const [items, setItems] = useState<IUserResponse[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    const fetchChauffeurs = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/logistique/chauffeurs', { credentials: 'include' });
        const json = await res.json();
        if (!mounted) return;
        if (json.success) {
          setItems(json.data || []);
        } else {
          setItems([]);
        }
      } catch {
        if (mounted) setItems([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void fetchChauffeurs();
    return () => {
      mounted = false;
    };
  }, []);

  const selectedLabel = useMemo(
    () => items.find((row) => row._id === value)?.nom,
    [items, value]
  );

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue
          placeholder={loading ? t('components.combobox.loading') : t('components.combobox.selectChauffeur')}
        >
          {selectedLabel}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {items.length === 0 ? (
          <SelectItem value="__none__" disabled>
            {t('components.combobox.noChauffeur')}
          </SelectItem>
        ) : (
          items.map((item) => (
            <SelectItem key={item._id} value={item._id}>
              {item.nom}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}
