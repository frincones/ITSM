'use client';

import { useState } from 'react';
import { X } from 'lucide-react';

import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';

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

interface TicketFiltersProps {
  filters: FilterValues;
  onApply: (filters: Record<string, string | undefined>) => void;
  onClear: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'pending', label: 'Pending' },
  { value: 'testing', label: 'Testing' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const TYPE_OPTIONS = [
  { value: 'incident', label: 'Incident' },
  { value: 'service_request', label: 'Service Request' },
  { value: 'question', label: 'Question' },
  { value: 'problem', label: 'Problem' },
  { value: 'change', label: 'Change' },
];

const PRIORITY_OPTIONS = [
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TicketFilters({
  filters,
  onApply,
  onClear,
}: TicketFiltersProps) {
  const [localFilters, setLocalFilters] = useState<FilterValues>(filters);

  const updateFilter = (key: keyof FilterValues, value: string) => {
    setLocalFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleApply = () => {
    const result: Record<string, string | undefined> = {};

    Object.entries(localFilters).forEach(([key, value]) => {
      result[key] = value || undefined;
    });

    onApply(result);
  };

  const hasActiveFilters = Object.values(localFilters).some(
    (v) => v !== '',
  );

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
        {/* Status */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            Status
          </label>
          <Select
            value={localFilters.status || undefined}
            onValueChange={(value) => updateFilter('status', value)}
          >
            <SelectTrigger className="h-9 bg-white">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Type */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            Type
          </label>
          <Select
            value={localFilters.type || undefined}
            onValueChange={(value) => updateFilter('type', value)}
          >
            <SelectTrigger className="h-9 bg-white">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              {TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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

      {/* Assigned Agent */}
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            Assigned Agent
          </label>
          <Input
            placeholder="Agent ID..."
            className="h-9 bg-white"
            value={localFilters.agent}
            onChange={(e) => updateFilter('agent', e.target.value)}
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
