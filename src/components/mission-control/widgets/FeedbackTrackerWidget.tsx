import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageSquare, X, Loader2, ChevronRight, ChevronDown, Save, Bug, Lightbulb, Sparkles } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";


interface FeedbackTrackerWidgetProps {
  companyId?: string;
  onRemove?: () => void;
}

const typeBadgeVariant: Record<string, string> = {
  bug_report: "bg-destructive/15 text-destructive border-destructive/30",
  improvement_suggestion: "bg-yellow-500/15 text-yellow-700 border-yellow-500/30",
  feature_request: "bg-blue-500/15 text-blue-700 border-blue-500/30",
};

const formatLabel = (value: string) =>
  value.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

const statusBadgeVariant: Record<string, string> = {
  open: "bg-orange-500/15 text-orange-700 border-orange-500/30",
  in_progress: "bg-blue-500/15 text-blue-700 border-blue-500/30",
  resolved: "bg-green-500/15 text-green-700 border-green-500/30",
  closed: "bg-muted text-muted-foreground border-border",
};

const STATUS_OPTIONS = ["open", "in_progress", "resolved", "closed"];
const PRIORITY_OPTIONS = ["low", "medium", "high", "critical"];

function getScreenshotUrl(path: string | null): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const { data } = supabase.storage.from("feedback-screenshots").getPublicUrl(path);
  return data.publicUrl;
}

export function FeedbackTrackerWidget({ companyId, onRemove }: FeedbackTrackerWidgetProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState("");
  const [editPriority, setEditPriority] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editAssignedTo, setEditAssignedTo] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const queryClient = useQueryClient();

  const { data: feedback = [], isLoading, error } = useQuery({
    queryKey: ["feedback-tracker-widget", companyId, isExpanded],
    queryFn: async () => {
      let query = supabase
        .from("feedback_submissions")
        .select("id, type, title, description, status, priority, created_at, user_id, page_url, admin_notes, screenshot_url, assigned_to")
        .order("created_at", { ascending: false })
        .limit(isExpanded ? 50 : 10);

      if (companyId) {
        query = query.eq("company_id", companyId);
      }

      const { data, error } = await query;
      if (error) {
        console.error("Feedback query error:", error);
        throw error;
      }
      return data || [];
    },
  });

  const userIds = [...new Set(feedback.map(f => f.user_id).filter(Boolean))] as string[];
  const { data: profiles = [] } = useQuery({
    queryKey: ["feedback-profiles", userIds],
    queryFn: async () => {
      if (userIds.length === 0) return [];
      const { data } = await supabase
        .from("user_profiles")
        .select("id, first_name, last_name")
        .in("id", userIds);
      return data || [];
    },
    enabled: userIds.length > 0,
  });

  const filteredFeedback = showClosed ? feedback : feedback.filter(f => f.status !== 'closed');

  // Summary counts (always from full feedback)
  const statusCounts = {
    open: feedback.filter(f => f.status === 'open').length,
    in_progress: feedback.filter(f => f.status === 'in_progress').length,
    resolved: feedback.filter(f => f.status === 'resolved').length,
    closed: feedback.filter(f => f.status === 'closed').length,
  };
  const typeCounts = {
    bug_report: feedback.filter(f => f.type === 'bug_report').length,
    improvement_suggestion: feedback.filter(f => f.type === 'improvement_suggestion').length,
    feature_request: feedback.filter(f => f.type === 'feature_request').length,
  };

  const profileMap = new Map(profiles.map(p => [p.id, `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Unknown"]));

  const selectItem = (item: typeof feedback[0]) => {
    if (selectedId === item.id) {
      setSelectedId(null);
      return;
    }
    setSelectedId(item.id);
    setEditStatus(item.status || "open");
    setEditPriority(item.priority || "medium");
    setEditNotes((item as any).admin_notes || "");
    setEditAssignedTo((item as any).assigned_to || undefined);
  };

  const handleSave = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      const updateData: Record<string, any> = {
        status: editStatus,
        priority: editPriority,
        admin_notes: editNotes,
        assigned_to: editAssignedTo || null,
      };
      if (editStatus === "resolved") {
        const { data: { user } } = await supabase.auth.getUser();
        updateData.resolved_at = new Date().toISOString();
        updateData.resolved_by = user?.id || null;
      }
      const { error } = await supabase
        .from("feedback_submissions")
        .update(updateData)
        .eq("id", selectedId);
      if (error) throw error;
      toast.success("Feedback updated");
      queryClient.invalidateQueries({ queryKey: ["feedback-tracker-widget"] });
    } catch (err) {
      console.error(err);
      toast.error("Failed to update feedback");
    } finally {
      setSaving(false);
    }
  };

  const detailPanel = (item: typeof feedback[0]) => (
    <div className="bg-muted/30 border border-border rounded-md p-4 space-y-3">
      <div className="grid grid-cols-2 gap-4 text-sm">
        {/* Row 1: Title left, Submitted By right */}
        <div>
          <span className="text-muted-foreground text-xs">Title</span>
          <p className="font-medium">{item.title}</p>
        </div>
        <div>
          <span className="text-muted-foreground text-xs">Submitted By</span>
          <p className="font-medium">{item.user_id ? (profileMap.get(item.user_id) || "Unknown") : "Anonymous"}</p>
        </div>
        {/* Row 2: Date, Type */}
        <div>
          <span className="text-muted-foreground text-xs">Date</span>
          <p className="font-medium">{format(new Date(item.created_at), "MMM d, yyyy HH:mm")}</p>
        </div>
        <div>
          <span className="text-muted-foreground text-xs">Type</span>
          <p><Badge variant="outline" className={`text-xs px-1.5 py-0 ${typeBadgeVariant[item.type] || ""}`}>{formatLabel(item.type)}</Badge></p>
        </div>
        {/* Row 3: Description */}
        <div className="col-span-2">
          <span className="text-muted-foreground text-xs">Description</span>
          <p className="text-sm mt-0.5">{item.description || "No description provided"}</p>
        </div>
        {/* Row 4: Screenshot */}
        {(item as any).screenshot_url && (() => {
          const url = getScreenshotUrl((item as any).screenshot_url);
          return (
            <div className="col-span-2">
              <span className="text-muted-foreground text-xs">Screenshot</span>
              <img
                src={url!}
                alt="Screenshot"
                className="mt-1 max-h-40 rounded border border-border cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => setLightboxUrl(url)}
              />
            </div>
          );
        })()}
      </div>
      {/* Row 5: Status, Priority, Assigned To */}
      <div className="border-t border-border pt-3 grid grid-cols-3 gap-4">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Status</label>
          <Select value={editStatus} onValueChange={setEditStatus}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{formatLabel(s)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Priority</label>
          <Select value={editPriority} onValueChange={setEditPriority}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PRIORITY_OPTIONS.map(p => <SelectItem key={p} value={p}>{formatLabel(p)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Assigned To</label>
          <Select value={editAssignedTo || "none"} onValueChange={(v) => setEditAssignedTo(v === "none" ? undefined : v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Unassigned</SelectItem>
              {companyUsers.map(u => (
                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {/* Row 6: Admin Notes */}
        <div className="col-span-3">
          <label className="text-xs text-muted-foreground mb-1 block">Admin Notes</label>
          <Textarea
            value={editNotes}
            onChange={e => setEditNotes(e.target.value)}
            placeholder="Add internal notes..."
            className="text-xs min-h-[60px]"
          />
        </div>
        {/* Row 7: Save */}
        <div className="col-span-3 flex justify-end">
          <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
            <Save className="h-3 w-3" />
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  );

  const summaryView = (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <span className="text-xs text-muted-foreground font-medium mr-1">Status:</span>
        <Badge variant="outline" className={`text-xs px-2 py-0.5 ${statusBadgeVariant.open}`}>Open: {statusCounts.open}</Badge>
        <Badge variant="outline" className={`text-xs px-2 py-0.5 ${statusBadgeVariant.in_progress}`}>In Progress: {statusCounts.in_progress}</Badge>
        <Badge variant="outline" className={`text-xs px-2 py-0.5 ${statusBadgeVariant.resolved}`}>Resolved: {statusCounts.resolved}</Badge>
        <Badge variant="outline" className={`text-xs px-2 py-0.5 ${statusBadgeVariant.closed}`}>Closed: {statusCounts.closed}</Badge>
      </div>
      <div className="flex flex-wrap gap-2">
        <span className="text-xs text-muted-foreground font-medium mr-1">Type:</span>
        <Badge variant="outline" className={`text-xs px-2 py-0.5 ${typeBadgeVariant.bug_report}`}>
          <Bug className="h-3 w-3 mr-1" />Bug Reports: {typeCounts.bug_report}
        </Badge>
        <Badge variant="outline" className={`text-xs px-2 py-0.5 ${typeBadgeVariant.improvement_suggestion}`}>
          <Lightbulb className="h-3 w-3 mr-1" />Suggestions: {typeCounts.improvement_suggestion}
        </Badge>
        <Badge variant="outline" className={`text-xs px-2 py-0.5 ${typeBadgeVariant.feature_request}`}>
          <Sparkles className="h-3 w-3 mr-1" />Feature Requests: {typeCounts.feature_request}
        </Badge>
      </div>
    </div>
  );

  // Resolve assigned_to names
  const assignedIds = [...new Set(feedback.map(f => (f as any).assigned_to).filter(Boolean))] as string[];
  const { data: assignedProfiles = [] } = useQuery({
    queryKey: ["feedback-assigned-profiles", assignedIds],
    queryFn: async () => {
      if (assignedIds.length === 0) return [];
      const { data } = await supabase
        .from("user_profiles")
        .select("id, first_name, last_name")
        .in("id", assignedIds);
      return data || [];
    },
    enabled: assignedIds.length > 0,
  });
  const assignedMap = new Map(assignedProfiles.map(p => [p.id, `${p.first_name || ""} ${p.last_name || ""}`.trim() || "—"]));

  // Fetch company users for Assigned To dropdown
  const { data: companyUsers = [] } = useQuery({
    queryKey: ["feedback-company-users", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data } = await supabase
        .from("user_company_access")
        .select("user_id, user_profiles!inner(id, first_name, last_name)")
        .eq("company_id", companyId);
      return (data || []).map((item: any) => ({
        id: item.user_profiles.id,
        name: `${item.user_profiles.first_name || ""} ${item.user_profiles.last_name || ""}`.trim() || item.user_profiles.id,
      }));
    },
    enabled: !!companyId,
  });

  const expandedTable = (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="w-8"></th>
            <th className="text-left py-2 pr-3 font-medium">Date</th>
            <th className="text-left py-2 pr-3 font-medium">Submitted By</th>
            <th className="text-left py-2 pr-3 font-medium">Type</th>
            <th className="text-left py-2 pr-3 font-medium">Title</th>
            <th className="text-left py-2 pr-3 font-medium">Responsible</th>
            <th className="text-left py-2 pr-3 font-medium">Priority</th>
            <th className="text-left py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {filteredFeedback.map((item) => (
            <React.Fragment key={item.id}>
              <tr
                className="border-b border-border/50 hover:bg-muted/50 cursor-pointer"
                onClick={() => selectItem(item)}
              >
                <td className="py-2 pl-2">
                  {selectedId === item.id
                    ? <ChevronDown className="h-4 w-4 text-primary" />
                    : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                </td>
                <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">
                  {format(new Date(item.created_at), "MMM d, yyyy")}
                </td>
                <td className="py-2 pr-3 whitespace-nowrap">
                  {item.user_id ? (profileMap.get(item.user_id) || "Unknown") : "Anonymous"}
                </td>
                <td className="py-2 pr-3">
                  <Badge variant="outline" className={`text-xs px-1.5 py-0 ${typeBadgeVariant[item.type] || ""}`}>
                    {formatLabel(item.type)}
                  </Badge>
                </td>
                <td className="py-2 pr-3 font-medium max-w-[200px] truncate">{item.title}</td>
                <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">
                  {(item as any).assigned_to ? (assignedMap.get((item as any).assigned_to) || "—") : "—"}
                </td>
                <td className="py-2 pr-3 capitalize text-muted-foreground">{item.priority || "—"}</td>
                <td className="py-2">
                  <Badge variant="outline" className={`text-xs px-1.5 py-0 ${statusBadgeVariant[item.status] || ""}`}>
                    {formatLabel(item.status || "")}
                  </Badge>
                </td>
              </tr>
              {selectedId === item.id && (
                <tr>
                  <td colSpan={8} className="p-3">
                    {detailPanel(item)}
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );

  const content = error ? (
    <p className="text-xs text-destructive text-center py-4">Unable to load feedback</p>
  ) : isLoading ? (
    <div className="flex items-center justify-center py-4">
      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
    </div>
  ) : feedback.length === 0 ? (
    <p className="text-xs text-muted-foreground text-center py-4">No feedback submitted yet</p>
  ) : null;

  return (
    <Card className="border-border">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          Feedback Tracker
          {filteredFeedback.length > 0 && (
            <Badge variant="secondary" className="ml-1 text-xs">{filteredFeedback.length}</Badge>
          )}
        </CardTitle>
        <div className="flex items-center gap-2">
          {isExpanded && (
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <Checkbox
                checked={showClosed}
                onCheckedChange={(checked) => setShowClosed(checked === true)}
                className="h-3.5 w-3.5"
              />
              Show closed
            </label>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </Button>
          {onRemove && (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onRemove}>
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isExpanded
          ? (content || expandedTable)
          : (content || summaryView)
        }
      </CardContent>

      {/* Screenshot lightbox */}
      <Dialog open={!!lightboxUrl} onOpenChange={(open) => !open && setLightboxUrl(null)}>
        <DialogContent className="sm:max-w-4xl p-2">
          {lightboxUrl && (
            <img src={lightboxUrl} alt="Screenshot" className="w-full h-auto rounded" />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
