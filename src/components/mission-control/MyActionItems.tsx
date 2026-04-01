import React, { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Clock, FileCheck, AlertTriangle, Search, GraduationCap, Shield, Calendar, MessageSquare } from "lucide-react";
import { useMissionControlData } from "@/hooks/useMissionControlData";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";
import { NotificationService } from "@/services/notificationService";
import { ThreadDetailSheet } from "@/components/communications/ThreadDetailSheet";
import { useCommunicationThreads } from "@/hooks/useCommunicationThreads";
import { TrainingDetailModal } from "./TrainingDetailModal";

export interface ActionItem {
  id: string;
  title: string;
  description: string;
  type: "approval" | "deadline" | "training" | "audit" | "communication";
  priority: "high" | "medium" | "low";
  dueDate?: Date;
  productName?: string;
  companyName?: string;
  url?: string;
  threadId?: string;
}

interface MyActionItemsProps {
  className?: string;
  productId?: string;
  companyId?: string;
  showDeadlinesOnly?: boolean;
}

const TYPE_FILTERS = ['all', 'approval', 'deadline', 'training', 'audit', 'communication'] as const;
type TypeFilter = typeof TYPE_FILTERS[number];

export function MyActionItems({ className, productId, companyId, showDeadlinesOnly }: MyActionItemsProps) {
  const { actionItems, isLoading, refetch } = useMissionControlData({ companyId });
  const { threads } = useCommunicationThreads({ companyId: companyId || undefined });
  const navigate = useNavigate();
  const { lang } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<TypeFilter>("all");
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [selectedTrainingRecordId, setSelectedTrainingRecordId] = useState<string | null>(null);

  const selectedThread = selectedThreadId ? threads.find(t => t.id === selectedThreadId) || null : null;

  const filteredItems = useMemo(() => {
    let items = actionItems || [];
    
    if (showDeadlinesOnly) {
      items = items.filter(item => item.type === "deadline");
    }

    if (activeFilter !== "all") {
      items = items.filter(item => item.type === activeFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(item =>
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.productName?.toLowerCase().includes(q) ||
        item.companyName?.toLowerCase().includes(q)
      );
    }

    return items.sort((a, b) => {
      if (a.priority === 'high' && b.priority !== 'high') return -1;
      if (b.priority === 'high' && a.priority !== 'high') return 1;
      if (a.dueDate && b.dueDate) return a.dueDate.getTime() - b.dueDate.getTime();
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return 0;
    });
  }, [actionItems, searchQuery, activeFilter, showDeadlinesOnly]);

  const handleItemClick = async (item: ActionItem) => {
    if (item.type === "communication" && item.id.startsWith("comm-")) {
      const notificationId = item.id.replace("comm-", "");
      
      // Mark notification as read
      const notificationService = new NotificationService();
      await notificationService.markAsRead(notificationId);
      
      // Open thread if we have a threadId
      if (item.threadId) {
        setSelectedThreadId(item.threadId);
      }
      
      await refetch();
      return;
    }

    if (item.type === "training" && item.id.startsWith("training-")) {
      const recordId = item.id.replace("training-", "");
      setSelectedTrainingRecordId(recordId);
      return;
    }

    if (item.url) navigate(item.url);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high": return "bg-destructive text-destructive-foreground";
      case "medium": return "bg-warning text-warning-foreground";
      default: return "bg-secondary text-secondary-foreground";
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "approval": return <FileCheck className="h-3.5 w-3.5" />;
      case "deadline": return <Clock className="h-3.5 w-3.5" />;
      case "training": return <GraduationCap className="h-3.5 w-3.5" />;
      case "audit": return <Shield className="h-3.5 w-3.5" />;
      case "communication": return <MessageSquare className="h-3.5 w-3.5" />;
      default: return <AlertTriangle className="h-3.5 w-3.5" />;
    }
  };

  const formatDate = (date: Date) => {
    const now = new Date();
    const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return lang('missionControl.overdue');
    if (diffDays === 0) return lang('missionControl.dueToday');
    if (diffDays === 1) return lang('missionControl.dueTomorrow');
    return lang('missionControl.dueInDays').replace('{{days}}', String(diffDays));
  };

  const filterLabels: Record<TypeFilter, string> = {
    all: lang('missionControl.widgets.filterAll'),
    approval: lang('missionControl.widgets.filterApprovals'),
    deadline: lang('missionControl.widgets.filterDeadlines'),
    training: lang('missionControl.widgets.filterTraining'),
    audit: lang('missionControl.widgets.filterAudits'),
    communication: lang('missionControl.widgets.filterCommunications'),
  };

  return (
    <>
      <Card className={className}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <FileCheck className="h-5 w-5" />
            {lang('missionControl.myActionItems')}
          </CardTitle>
          <CardDescription>
            {lang('missionControl.tasksRequiringAttention')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={lang('missionControl.widgets.searchActions')}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 h-9"
            />
          </div>

          {/* Type filter chips */}
          {!showDeadlinesOnly && (
            <div className="flex flex-wrap gap-1.5">
              {TYPE_FILTERS.map(filter => (
                <button
                  key={filter}
                  onClick={() => setActiveFilter(filter)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    activeFilter === filter
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  }`}
                >
                  {filter !== 'all' && getTypeIcon(filter)}
                  {filterLabels[filter]}
                </button>
              ))}
            </div>
          )}

          {/* Items list */}
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                {lang('common.loading')}
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {searchQuery || activeFilter !== 'all'
                  ? lang('missionControl.widgets.noMatchingActions')
                  : lang('missionControl.widgets.noActionsRequired')
                }
              </div>
            ) : (
              filteredItems.map((item) => (
                <div
                  key={item.id}
                  className="p-3 border rounded-lg hover:bg-accent/50 cursor-pointer transition-colors"
                  onClick={() => handleItemClick(item)}
                >
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 text-muted-foreground">
                      {getTypeIcon(item.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-sm">{item.title}</h4>
                      <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                      {item.productName && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {item.productName} • {item.companyName}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <Badge className={`text-xs ${getPriorityColor(item.priority)}`}>
                        {item.priority}
                      </Badge>
                      {item.dueDate && (
                        <div className="flex items-center gap-1 mt-1.5 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {formatDate(item.dueDate)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Thread detail sheet for communication items */}
      <ThreadDetailSheet
        thread={selectedThread}
        open={!!selectedThread}
        onOpenChange={(open) => { if (!open) setSelectedThreadId(null); }}
      />

      {/* Training detail modal */}
      <TrainingDetailModal
        open={!!selectedTrainingRecordId}
        onOpenChange={(open) => { if (!open) setSelectedTrainingRecordId(null); }}
        trainingRecordId={selectedTrainingRecordId}
      />
    </>
  );
}
