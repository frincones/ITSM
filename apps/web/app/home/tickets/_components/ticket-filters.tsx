'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';

import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@kit/ui/popover';
import { Badge } from '@kit/ui/badge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FilterValues {
  status: string;
  type: string;
  priority: string;
  category: string;
  agent: string;
  from: string;
  to: string;
}

interface AgentOption {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  role: string;
}

interface TicketFiltersProps {
  filters: FilterValues;
  agents?: AgentOption[];
  onApply: (filters: Record<string, string | undefined>) => void;
  onClear: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'backlog', label: 'Backlog' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'pending', label: 'Pending' },
  { value: 'detenido', label: 'Detenido' },
  { value: 'testing', label: 'Testing' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const TYPE_OPTIONS = [
  { value: 'incident', label: 'Incident' },
  { value: 'request', label: 'Request' },
  { value: 'warranty', label: 'Warranty' },
  { value: 'support', label: 'Support' },
  { value: 'backlog', label: 'Backlog' },
  { value: 'desarrollo_pendiente', label: 'Desarrollo Pendiente' },
];

const PRIORITY_OPTIONS = [
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

// ---------------------------------------------------------------------------
// Reusable MultiSelect primitive (popover + search + checkboxes)
// ---------------------------------------------------------------------------

interface MultiSelectProps {
  placeholder: string;
  options: Array<{ value: string; label: string; subLabel?: string | null }>;
  selected: string[];
  onChange: (next: string[]) => void;
  searchable?: boolean;
  width?: string;
}

function MultiSelect({
  placeholder,
  options,
  selected,
  onChange,
  searchable = false,
  width = 'w-full',
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    if (!q.trim()) return options;
    const qq = q.toLowerCase();
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(qq) ||
        (o.subLabel?.toLowerCase().includes(qq) ?? false),
    );
  }, [options, q]);

  const toggle = (value: string) => {
    const exists = selected.includes(value);
    onChange(exists ? selected.filter((v) => v !== value) : [...selected, value]);
  };

  const selectedLabels = options
    .filter((o) => selected.includes(o.value))
    .map((o) => o.label);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`h-9 ${width} justify-between bg-white font-normal`}
        >
          <span className="truncate text-left">
            {selected.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : selected.length === 1 ? (
              selectedLabels[0]
            ) : (
              <span>
                {selectedLabels[0]}{' '}
                <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                  +{selected.length - 1}
                </Badge>
              </span>
            )}
          </span>
          <ChevronDown className="h-3.5 w-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        {searchable && (
          <div className="border-b px-3 py-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar…"
                className="h-8 pl-7 text-sm"
              />
            </div>
          </div>
        )}
        <div className="max-h-64 overflow-y-auto p-1">
          {filtered.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">Sin resultados</p>
          )}
          {filtered.map((opt) => {
            const isSel = selected.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggle(opt.value)}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
              >
                <span className="flex h-4 w-4 items-center justify-center rounded border border-input">
                  {isSel && <Check className="h-3 w-3" />}
                </span>
                <span className="flex flex-col">
                  <span>{opt.label}</span>
                  {opt.subLabel && (
                    <span className="text-[11px] text-muted-foreground">
                      {opt.subLabel}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
        {selected.length > 0 && (
          <div className="border-t px-3 py-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-full text-xs"
              onClick={() => onChange([])}
            >
              Limpiar selección
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function TicketFilters({
  filters,
  agents = [],
  onApply,
  onClear,
}: TicketFiltersProps) {
  const [localFilters, setLocalFilters] = useState<FilterValues>(filters);

  const updateFilter = (key: keyof FilterValues, value: string) => {
    setLocalFilters((prev) => ({ ...prev, [key]: value }));
  };

  const statusValues = localFilters.status
    ? localFilters.status.split(',').filter(Boolean)
    : [];
  const typeValues = localFilters.type
    ? localFilters.type.split(',').filter(Boolean)
    : [];
  const agentValues = localFilters.agent
    ? localFilters.agent.split(',').filter(Boolean)
    : [];

  const agentOptions = [
    { value: 'unassigned', label: 'Sin asignar', subLabel: null },
    ...agents.map((a) => ({
      value: a.id,
      label: a.name,
      subLabel: a.email,
    })),
  ];

  const handleApply = () => {
    const result: Record<string, string | undefined> = {};
    Object.entries(localFilters).forEach(([key, value]) => {
      result[key] = value || undefined;
    });
    onApply(result);
  };

  const hasActiveFilters = Object.values(localFilters).some((v) => v !== '');

  return (
    <div className="border-b border-gray-200 bg-gray-50 px-6 py-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700">Advanced Filters</h3>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-gray-500"
            onClick={() => {
              setLocalFilters({
                status: '',
                type: '',
                priority: '',
                category: '',
                agent: '',
                from: '',
                to: '',
              });
              onClear();
            }}
          >
            <X className="h-3.5 w-3.5" />
            Clear All
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        {/* Status — multi-select */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            Status
          </label>
          <MultiSelect
            placeholder="All statuses"
            options={STATUS_OPTIONS}
            selected={statusValues}
            onChange={(next) => updateFilter('status', next.join(','))}
          />
        </div>

        {/* Type — multi-select */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            Type
          </label>
          <MultiSelect
            placeholder="All types"
            options={TYPE_OPTIONS}
            selected={typeValues}
            onChange={(next) => updateFilter('type', next.join(','))}
          />
        </div>

        {/* Priority */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            Priority
          </label>
          <Select
            value={localFilters.priority || undefined}
            onValueChange={(value) => updateFilter('priority', value)}
          >
            <SelectTrigger className="h-9 bg-white">
              <SelectValue placeholder="All priorities" />
            </SelectTrigger>
            <SelectContent>
              {PRIORITY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Category (text input - IDs would come from server in production) */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            Category
          </label>
          <Input
            placeholder="Category ID..."
            className="h-9 bg-white"
            value={localFilters.category}
            onChange={(e) => updateFilter('category', e.target.value)}
          />
        </div>

        {/* Date From */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            From
          </label>
          <Input
            type="date"
            className="h-9 bg-white"
            value={localFilters.from}
            onChange={(e) => updateFilter('from', e.target.value)}
          />
        </div>

        {/* Date To */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            To
          </label>
          <Input
            type="date"
            className="h-9 bg-white"
            value={localFilters.to}
            onChange={(e) => updateFilter('to', e.target.value)}
          />
        </div>
      </div>

      {/* Assigned Agent — multi-select */}
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <div className="lg:col-span-2">
          <label className="mb-1 block text-xs font-medium text-gray-500">
            Assigned Agent
          </label>
          <MultiSelect
            placeholder="Cualquier agente"
            options={agentOptions}
            selected={agentValues}
            onChange={(next) => updateFilter('agent', next.join(','))}
            searchable
          />
        </div>

        <div className="flex items-end">
          <Button size="sm" onClick={handleApply}>
            Apply Filters
          </Button>
        </div>
      </div>
    </div>
  );
}
