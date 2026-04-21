import React, { useEffect, useState } from 'react';
import { List, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DocumentOutlinePanel } from './DocumentOutlinePanel';
import { DocumentConfigPanel } from './DocumentConfigPanel';

type Tab = 'outline' | 'configure';
const STORAGE_KEY = 'xyreg.draft.leftRail';

interface LeftRailTabsProps {
  editorContainerRef: React.RefObject<HTMLDivElement | null>;
  refreshTrigger?: number;
  documentId?: string | null;
  companyId?: string;
  externalCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

export function LeftRailTabs({
  editorContainerRef,
  refreshTrigger,
  documentId,
  companyId,
  externalCollapsed,
  onCollapsedChange,
}: LeftRailTabsProps) {
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      return v === 'configure' ? 'configure' : 'outline';
    } catch {
      return 'outline';
    }
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, activeTab); } catch { /* ignore */ }
  }, [activeTab]);

  // When collapsed externally, hide the entire rail (parent handles the reveal button)
  if (externalCollapsed) return null;

  return (
    <div className="flex shrink-0 h-full">
      {/* Vertical icon strip */}
      <div className="flex flex-col items-center gap-1 w-10 border-r bg-muted/30 py-2">
        <button
          onClick={() => setActiveTab('outline')}
          className={cn(
            'p-1.5 rounded-md transition-colors',
            activeTab === 'outline'
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground'
          )}
          title="Outline"
        >
          <List className="w-4 h-4" />
        </button>
        <button
          onClick={() => setActiveTab('configure')}
          className={cn(
            'p-1.5 rounded-md transition-colors',
            activeTab === 'configure'
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground'
          )}
          title="Configure document"
        >
          <Settings2 className="w-4 h-4" />
        </button>
      </div>

      {/* Active panel */}
      {activeTab === 'outline' ? (
        <DocumentOutlinePanel
          editorContainerRef={editorContainerRef}
          refreshTrigger={refreshTrigger}
          onCollapsedChange={onCollapsedChange}
        />
      ) : (
        <DocumentConfigPanel documentId={documentId} companyId={companyId} />
      )}
    </div>
  );
}