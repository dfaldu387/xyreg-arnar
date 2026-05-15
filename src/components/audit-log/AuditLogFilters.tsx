
import React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import { Download, Search, AlertCircle } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import type { UnifiedAuditTrailEntry } from '@/types/auditTrail';

interface AuditLogFiltersProps {
  entries: UnifiedAuditTrailEntry[];
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  selectedUser: string;
  onUserChange: (value: string) => void;
  startDate: Date | undefined;
  onStartDateChange: (date: Date | undefined) => void;
  endDate: Date | undefined;
  onEndDateChange: (date: Date | undefined) => void;
  onExportCSV: () => void;
  disabled?: boolean;
}

export function AuditLogFilters({
  entries,
  searchTerm,
  onSearchTermChange,
  selectedUser,
  onUserChange,
  startDate,
  onStartDateChange,
  endDate,
  onEndDateChange,
  onExportCSV,
  disabled = false,
}: AuditLogFiltersProps) {
  const { lang } = useTranslation();

  const cachedUsersRef = React.useRef<{ id: string; name: string }[]>([]);
  const uniqueUsers = React.useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of entries) {
      if (!e.userId) continue;
      const name = (e.userName || '').trim();
      if (!name || name === 'Unknown') continue;
      if (!seen.has(e.userId)) seen.set(e.userId, name);
    }
    const fromEntries = Array.from(seen.entries()).map(([id, name]) => ({ id, name }));

    if (selectedUser === 'All' || cachedUsersRef.current.length === 0) {
      cachedUsersRef.current = fromEntries;
    } else {
      // Merge cached snapshot with anyone newly present in current entries.
      const merged = new Map(cachedUsersRef.current.map(u => [u.id, u.name]));
      for (const u of fromEntries) merged.set(u.id, u.name);
      cachedUsersRef.current = Array.from(merged.entries()).map(([id, name]) => ({ id, name }));
    }

    const list = [...cachedUsersRef.current].sort((a, b) => a.name.localeCompare(b.name));
    return [{ id: 'All', name: 'All' }, ...list];
  }, [entries, selectedUser]);

  const handleClearFilters = () => {
    onSearchTermChange('');
    onUserChange('All');
    onStartDateChange(undefined);
    onEndDateChange(undefined);
  };

  // Validation: end date set without start date
  const endDateOnlyError = !!endDate && !startDate;

  return (
    <div className="bg-card rounded-lg border p-6">
      <div className="flex flex-wrap items-end gap-4">
        {/* Search */}
        <div className="flex flex-col flex-shrink-0 w-72 gap-2">
          <Label>{lang('auditLog.filters.search')}</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={lang('auditLog.filters.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => onSearchTermChange(e.target.value)}
              className="pl-8"
              disabled={disabled}
            />
          </div>
        </div>

        {/* User Filter */}
        <div className="flex flex-col flex-shrink-0 w-48 gap-2">
          <Label>{lang('auditLog.filters.user')}</Label>
          <Select value={selectedUser} onValueChange={onUserChange} disabled={disabled}>
            <SelectTrigger>
              <SelectValue placeholder={lang('auditLog.filters.allUsers')} />
            </SelectTrigger>
            <SelectContent>
              {uniqueUsers.map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Start Date Filter */}
        <div className="relative flex flex-col flex-shrink-0 w-44 gap-2">
          <Label className={endDateOnlyError ? 'text-destructive' : ''}>
            {lang('auditLog.filters.startDate')}
            {endDateOnlyError && <span className="text-destructive ml-0.5">*</span>}
          </Label>
          <DatePicker
            date={startDate}
            setDate={onStartDateChange}
            placeholder={lang('auditLog.filters.startDatePlaceholder')}
            disabled={disabled ? undefined : (date) => {
              if (!endDate) return false;
              return date > endDate;
            }}
            className={endDateOnlyError ? 'border-destructive' : ''}
          />
          {endDateOnlyError && (
            <div className="absolute left-0 top-full mt-1 flex items-center gap-1 text-xs text-destructive whitespace-nowrap">
              <AlertCircle className="h-3 w-3 shrink-0" />
              <span>{lang('auditLog.filters.startDateRequired')}</span>
            </div>
          )}
        </div>

        {/* End Date Filter */}
        <div className="flex flex-col flex-shrink-0 w-40 gap-2">
          <Label>{lang('auditLog.filters.endDate')}</Label>
          <DatePicker
            date={endDate}
            setDate={onEndDateChange}
            placeholder={lang('auditLog.filters.endDatePlaceholder')}
            disabled={disabled ? undefined : (date) => {
              if (!startDate) return false;
              return date < startDate;
            }}
          />
        </div>

        {/* Export CSV */}
        <div className="flex flex-col flex-shrink-0 gap-2">
          <Label className="text-transparent">Actions</Label>
          <Button
            variant="outline"
            onClick={onExportCSV}
            disabled={disabled || entries.length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            {lang('auditLog.filters.exportCsv')}
          </Button>
        </div>

        {/* Clear Filters */}
        <div className="flex items-center flex-shrink-0">
          <Button variant="outline" onClick={handleClearFilters} disabled={disabled}>
            {lang('auditLog.filters.clearFilters')}
          </Button>
        </div>
      </div>
    </div>
  );
}
