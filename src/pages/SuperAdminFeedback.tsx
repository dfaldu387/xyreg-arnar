import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Search, Filter, TrendingUp, Eye, MessageSquare, Clock, CheckCircle, AlertCircle, Star, Calendar, User, Building2, Image, X, Save, Edit3, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
import { useAuth } from '@/context/AuthContext';

interface FeedbackEntry {
  id: string;
  type: string;
  title: string;
  description: string;
  screenshot_url?: string;
  company_id?: string;
  created_at: string;
  user_id: string | null;
  status: string;
  admin_notes?: string | null;
  priority?: string | null;
  resolved_at?: string | null;
  resolved_by?: string | null;
  companies?: {
    name?: string;
  };
}

export default function SuperAdminFeedback() {
  const { user } = useAuth();
  const [feedbackEntries, setFeedbackEntries] = useState<FeedbackEntry[]>([]);
  const [filteredEntries, setFilteredEntries] = useState<FeedbackEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedEntry, setSelectedEntry] = useState<FeedbackEntry | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editNotes, setEditNotes] = useState('');
  const [editPriority, setEditPriority] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    fetchFeedbackEntries();
  }, []);

  useEffect(() => {
    filterEntries();
  }, [feedbackEntries, searchTerm, typeFilter, statusFilter]);

  const fetchFeedbackEntries = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('feedback_submissions')
        .select(`
          *,
          companies (
            name
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setFeedbackEntries(data || []);
    } catch (error) {
      console.error('Error fetching feedback:', error);
      toast.error('Failed to load feedback entries');
    } finally {
      setIsLoading(false);
    }
  };

  const filterEntries = () => {
    let filtered = feedbackEntries;

    if (searchTerm) {
      filtered = filtered.filter(entry =>
        entry.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.user_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.companies?.name?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (typeFilter !== 'all') {
      filtered = filtered.filter(entry => {
        const entryType = entry.type?.toLowerCase()?.trim();
        const filterType = typeFilter.toLowerCase().trim();
        const matches = entryType === filterType;
        return matches;
      });
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(entry => {
        const entryStatus = entry.status?.toLowerCase()?.trim();
        const filterStatus = statusFilter.toLowerCase().trim();
        const matches = entryStatus === filterStatus;
        return matches;
      });
    }

    setFilteredEntries(filtered);
  };

  const updateFeedbackEntry = async (entryId: string, updates: Partial<FeedbackEntry>) => {
    try {
      setIsUpdating(true);
      const { error } = await supabase
        .from('feedback_submissions')
        .update(updates)
        .eq('id', entryId);

      if (error) throw error;

      // Update local state
      const updatedEntry = { ...updates };
      setFeedbackEntries(prev => 
        prev.map(entry => 
          entry.id === entryId ? { ...entry, ...updates } : entry
        )
      );

      // Update selectedEntry if it's the same entry being updated
      if (selectedEntry && selectedEntry.id === entryId) {
        setSelectedEntry(prev => prev ? { ...prev, ...updates } : null);
      }

      toast.success('Feedback entry updated successfully');

      setIsEditing(false);
    } catch (error) {
      console.error('Error updating feedback:', error);
      toast.error('Failed to update feedback entry');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleEditStart = (entry: FeedbackEntry) => {
    setSelectedEntry(entry);
    setEditNotes(entry.admin_notes || '');
    setEditPriority(entry.priority || '');
    setEditStatus(entry.status);
    setIsEditing(true);
  };

  const handleEditSave = () => {
    if (!selectedEntry) return;
    
    updateFeedbackEntry(selectedEntry.id, {
      admin_notes: editNotes,
      priority: editPriority,
      status: editStatus,
      resolved_at: editStatus === 'resolved' ? new Date().toISOString() : null,
      resolved_by: editStatus === 'resolved' ? user?.id : null,
    });
  };

  const exportToCSV = () => {
    const headers = ['Date', 'Type', 'Title', 'Description', 'User ID', 'Company', 'Status', 'Priority'];
    const csvData = filteredEntries.map(entry => [
      format(new Date(entry.created_at), 'yyyy-MM-dd HH:mm:ss'),
      entry.type,
      entry.title,
      entry.description || '',
      entry.user_id || 'N/A',
      entry.companies?.name || 'N/A',
      entry.status,
      entry.priority || 'N/A'
    ]);

    const csvContent = [headers, ...csvData]
      .map(row => row.map(field => `"${field}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `feedback-export-${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getTypeColor = (type: string) => {
    switch (type.toLowerCase()) {
      case 'bug_report':
        return 'bg-red-100 text-red-800 border-red-200 hover:bg-red-200';
      case 'feature_request':
        return 'bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-200';
      case 'improvement_suggestion':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200 hover:bg-yellow-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200 hover:bg-gray-200';
    }
  };

  // Debug function to get unique values
  const getUniqueTypes = () => {
    const types = feedbackEntries.map(entry => entry.type).filter(Boolean);
    return [...new Set(types)];
  };

  const getUniqueStatuses = () => {
    const statuses = feedbackEntries.map(entry => entry.status).filter(Boolean);
    return [...new Set(statuses)];
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
        <div className="container mx-auto p-8">
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center space-y-6">
              <div className="relative">
                <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <MessageSquare className="h-6 w-6 text-blue-600 animate-pulse" />
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-semibold text-slate-900">Loading Feedback</h3>
                <p className="text-slate-600">Fetching the latest feedback entries...</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      <div className="container mx-auto p-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between bg-white rounded-2xl p-6 shadow-sm border border-slate-100 gap-4">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl shadow-lg">
              <MessageSquare className="h-7 w-7 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-transparent">
                Feedback Management
              </h1>
              <p className="text-slate-600 mt-1">Monitor and analyze user feedback across the system</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <Button 
              onClick={fetchFeedbackEntries}
              variant="outline" 
              size="sm"
              className="flex items-center space-x-2 bg-white hover:bg-slate-50 border-slate-200 shadow-sm"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Refresh</span>
            </Button>
            {/* <Button 
              onClick={exportToCSV} 
              variant="outline" 
              className="flex items-center space-x-2 bg-white hover:bg-slate-50 border-slate-200 shadow-sm"
            >
              <Download className="h-4 w-4" />
              <span>Export CSV</span>
            </Button> */}
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-100 shadow-sm hover:shadow-md transition-all duration-300 group cursor-pointer">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className='mt-5'>
                  <p className="text-sm font-semibold text-blue-600 uppercase tracking-wide">Total Feedback</p>
                  <p className="text-3xl font-bold text-blue-700 mt-2">{feedbackEntries.length}</p>
                  <p className="text-xs text-blue-500 mt-1">All submissions</p>
                </div>
                <div className="p-3 bg-blue-100 rounded-xl group-hover:bg-blue-200 transition-colors">
                  <MessageSquare className="h-6 w-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-100 shadow-sm hover:shadow-md transition-all duration-300 group cursor-pointer">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className='mt-5'>
                  <p className="text-sm font-semibold text-green-600 uppercase tracking-wide">Resolved</p>
                  <p className="text-3xl font-bold text-green-700 mt-2">
                    {feedbackEntries.filter(f => f.status === 'resolved').length}
                  </p>
                  <p className="text-xs text-green-500 mt-1">Completed items</p>
                </div>
                <div className="p-3 bg-green-100 rounded-xl group-hover:bg-green-200 transition-colors">
                  <CheckCircle className="h-6 w-6 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-red-50 to-rose-50 border-red-100 shadow-sm hover:shadow-md transition-all duration-300 group cursor-pointer">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className='mt-5'>
                  <p className="text-sm font-semibold text-red-600 uppercase tracking-wide">Bug Reports</p>
                  <p className="text-3xl font-bold text-red-700 mt-2">
                    {feedbackEntries.filter(f => f.type === 'bug_report' && f.status !== 'resolved').length}
                  </p>
                  <p className="text-xs text-red-500 mt-1">Issues reported</p>
                </div>
                <div className="p-3 bg-red-100 rounded-xl group-hover:bg-red-200 transition-colors">
                  <AlertCircle className="h-6 w-6 text-red-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-yellow-50 to-amber-50 border-yellow-100 shadow-sm hover:shadow-md transition-all duration-300 group cursor-pointer">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className='mt-5'>
                  <p className="text-sm font-semibold text-yellow-600 uppercase tracking-wide">Improvements</p>
                  <p className="text-3xl font-bold text-yellow-700 mt-2">
                    {feedbackEntries.filter(f => f.type === 'improvement_suggestion' && f.status !== 'resolved').length}
                  </p>
                  <p className="text-xs text-yellow-500 mt-1">Enhancements</p>
                </div>
                <div className="p-3 bg-yellow-100 rounded-xl group-hover:bg-yellow-200 transition-colors">
                  <TrendingUp className="h-6 w-6 text-yellow-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="bg-white shadow-sm border-slate-100">
          <CardContent className="!p-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Filter className="h-5 w-5 text-slate-600" />
                  <h3 className="text-lg font-semibold text-slate-900">Filters</h3>
                </div>
                {/* Debug info */}
                {/* {feedbackEntries.length > 0 && (
                  <div className="text-xs text-slate-500">
                    Available types: {getUniqueTypes().join(', ')} | 
                    Available statuses: {getUniqueStatuses().join(', ')}
                  </div>
                )} */}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Search</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 h-4 w-4" />
                    <Input
                      placeholder="Search feedback..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 h-10 border-slate-200 focus:border-blue-300 focus:ring-blue-200 rounded-lg"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Type</label>
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="h-10 border-slate-200 focus:border-blue-300 focus:ring-blue-200 rounded-lg">
                      <SelectValue placeholder="All Types" />
                    </SelectTrigger>
                    <SelectContent className="rounded-lg">
                      <SelectItem value="all">All Types</SelectItem>
                      {getUniqueTypes().map(type => (
                        <SelectItem key={type} value={type.toLowerCase()}>
                          {type === "bug_report" ? "Bug Report" : type === "improvement_suggestion" ? "Improvement Suggestion" : type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Status</label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-10 border-slate-200 focus:border-blue-300 focus:ring-blue-200 rounded-lg">
                      <SelectValue placeholder="All Statuses" />
                    </SelectTrigger>
                    <SelectContent className="rounded-lg">
                      <SelectItem value="all">All Statuses</SelectItem>
                      {getUniqueStatuses().map(status => (
                        <SelectItem key={status} value={status.toLowerCase()}>
                          {status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {(searchTerm || typeFilter !== 'all' || statusFilter !== 'all') && (
                <div className="pt-4 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-sm text-slate-600">
                      Showing {filteredEntries.length} of {feedbackEntries.length} entries
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSearchTerm('');
                        setTypeFilter('all');
                        setStatusFilter('all');
                      }}
                      className="text-slate-600 hover:text-slate-900"
                    >
                      Clear filters
                    </Button>
                  </div>
                  
                  {/* Active Filters Display */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-slate-500 font-medium">Active filters:</span>
                    {searchTerm && (
                      <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                        Search: "{searchTerm}"
                      </Badge>
                    )}
                    {typeFilter !== 'all' && (
                      <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                        Type: {typeFilter}
                      </Badge>
                    )}
                    {statusFilter !== 'all' && (
                      <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                        Status: {statusFilter}
                      </Badge>
                    )}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Feedback List */}
        <div className="space-y-4">
          {filteredEntries.length === 0 ? (
            <Card className="bg-white shadow-sm border-slate-100">
              <CardContent className="p-12 text-center">
                <div className="mx-auto w-20 h-20 bg-gradient-to-br from-slate-100 to-slate-200 rounded-full flex items-center justify-center mb-6">
                  <MessageSquare className="h-10 w-10 text-slate-500" />
                </div>
                <h3 className="text-2xl font-semibold text-slate-900 mb-3">No feedback found</h3>
                <p className="text-slate-600 max-w-md mx-auto mb-6">
                  {feedbackEntries.length === 0 
                    ? "No feedback has been submitted yet. Check back later for user feedback."
                    : "No feedback entries match your current filters. Try adjusting your search criteria."
                  }
                </p>
                {feedbackEntries.length > 0 && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearchTerm('');
                      setTypeFilter('all');
                      setStatusFilter('all');
                    }}
                    className="text-slate-600 hover:text-slate-900"
                  >
                    Clear all filters
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            filteredEntries.map((entry) => (
              <Card key={entry.id} className="bg-white shadow-sm border-slate-100 hover:shadow-lg hover:border-blue-200 transition-all duration-300 group">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between gap-6">
                    <div className="flex-1 mt-5">
                      <div className="flex items-center gap-3 mb-4">
                        <Badge className={`${getTypeColor(entry.type)} font-medium px-3 py-1 rounded-full`}>
                          {entry.type === "bug_report" ? "Bug Report" : entry.type === "improvement_suggestion" ? "Improvement Suggestion" : entry.type}
                        </Badge>
                        <div className="flex items-center gap-1 text-slate-500">
                          <Calendar className="h-4 w-4" />
                          <span className="text-sm font-medium">
                            {format(new Date(entry.created_at), 'MMM dd, yyyy')}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-slate-500">
                          <Clock className="h-4 w-4" />
                          <span className="text-sm font-medium">
                            {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                      
                      <h3 className="text-xl font-semibold text-slate-900 mb-3 group-hover:text-blue-600 transition-colors">
                        {entry.title}
                      </h3>
                      
                      <p className="text-slate-700 mb-4 line-clamp-2 leading-relaxed">
                        {entry.description}
                      </p>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-slate-500" />
                          <span className="text-sm font-medium text-slate-700">User:</span>
                          <span className="text-slate-600 font-mono text-xs bg-slate-100 px-2 py-1 rounded">
                            {entry.user_id || 'N/A'}
                          </span>
                        </div>
                        
                        {entry.companies?.name && (
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-slate-500" />
                            <span className="text-sm font-medium text-slate-700">Company:</span>
                            <span className="text-slate-600">{entry.companies.name}</span>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex items-center flex-wrap gap-3">
                        <Badge variant="outline" className={`text-xs font-medium ${
                          entry.status === 'resolved' ? 'bg-green-50 text-green-700 border-green-200' : 
                          entry.status === 'in_review' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                          'bg-slate-50 text-slate-700 border-slate-200'
                        }`}>
                          {entry.status === 'resolved' && <CheckCircle className="h-3 w-3 mr-1" />}
                          {entry.status === 'in_review' && <Clock className="h-3 w-3 mr-1" />}
                          {entry.status === 'pending' && <AlertCircle className="h-3 w-3 mr-1" />}
                          {entry.status.replace('_', ' ')}
                        </Badge>
                        
                        {entry.priority && (
                          <Badge variant="outline" className={`text-xs font-medium ${
                            entry.priority === 'high' ? 'bg-red-50 text-red-700 border-red-200' :
                            entry.priority === 'medium' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                            'bg-green-50 text-green-700 border-green-200'
                          }`}>
                            <Star className="h-3 w-3 mr-1" />
                            {entry.priority}
                          </Badge>
                        )}
                        
                        {entry.screenshot_url && (
                          <Badge variant="outline" className="text-xs font-medium bg-blue-50 text-blue-700 border-blue-200">
                            <Image className="h-3 w-3 mr-1" />
                            Screenshot
                          </Badge>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex flex-col gap-2 mt-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedEntry(entry)}
                        className="bg-white hover:bg-blue-50 border-slate-200 hover:border-blue-300 text-slate-700 hover:text-blue-700 transition-all duration-200"
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        View Details
                      </Button>
                      {/* <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditStart(entry)}
                        className="bg-white hover:bg-slate-50 border-slate-200 hover:border-slate-300 text-slate-700 hover:text-slate-900 transition-all duration-200"
                      >
                        <Edit3 className="h-4 w-4 mr-2" />
                        Edit
                      </Button> */}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Detail Modal */}
        {selectedEntry && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <Card className="max-w-4xl w-full max-h-[90vh] overflow-y-auto bg-white shadow-2xl border-0">
              <CardHeader className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white sticky top-0 z-10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-gradient-to-r from-purple-600 to-blue-600 rounded-lg">
                      <MessageSquare className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-xl text-slate-900">Feedback Details</CardTitle>
                      <p className="text-sm text-slate-600 mt-1">
                        {format(new Date(selectedEntry.created_at), 'MMMM dd, yyyy HH:mm')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!isEditing && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditStart(selectedEntry)}
                        className="text-slate-600 hover:text-slate-900"
                      >
                        <Edit3 className="h-4 w-4 mr-2" />
                        Edit
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedEntry(null);
                        setIsEditing(false);
                      }}
                      className="h-8 w-8 p-0 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-8 space-y-6">
                {/* Header Info */}
                <div className="flex items-center gap-4 mb-6">
                  <Badge className={`${getTypeColor(selectedEntry.type)} font-medium px-3 py-1 rounded-full`}>
                    {selectedEntry.type}
                  </Badge>
                  <Badge variant="outline" className={`text-xs font-medium ${
                    selectedEntry.status === 'resolved' ? 'bg-green-50 text-green-700 border-green-200' : 
                    selectedEntry.status === 'in_review' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                    'bg-slate-50 text-slate-700 border-slate-200'
                  }`}>
                    {selectedEntry.status === 'resolved' && <CheckCircle className="h-3 w-3 mr-1" />}
                    {selectedEntry.status === 'in_review' && <Clock className="h-3 w-3 mr-1" />}
                    {selectedEntry.status === 'pending' && <AlertCircle className="h-3 w-3 mr-1" />}
                    {selectedEntry.status.replace('_', ' ')}
                  </Badge>
                  {selectedEntry.priority && (
                    <Badge variant="outline" className={`text-xs font-medium ${
                      selectedEntry.priority === 'high' ? 'bg-red-50 text-red-700 border-red-200' :
                      selectedEntry.priority === 'medium' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                      'bg-green-50 text-green-700 border-green-200'
                    }`}>
                      <Star className="h-3 w-3 mr-1" />
                      {selectedEntry.priority}
                    </Badge>
                  )}
                </div>
                
                {/* Title */}
                <div className="bg-slate-50 rounded-xl p-6">
                  <h3 className="font-bold text-2xl text-slate-900 mb-2">{selectedEntry.title}</h3>
                  <div className="flex items-center gap-4 text-sm text-slate-600">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      <span>{format(new Date(selectedEntry.created_at), 'MMMM dd, yyyy')}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      <span>{formatDistanceToNow(new Date(selectedEntry.created_at), { addSuffix: true })}</span>
                    </div>
                  </div>
                </div>
                
                {/* Description */}
                <div>
                  <h4 className="font-semibold text-slate-900 mb-3 text-lg">Description</h4>
                  <div className="bg-white border border-slate-200 rounded-xl p-6">
                    <p className="text-slate-700 whitespace-pre-wrap leading-relaxed text-base">{selectedEntry.description}</p>
                  </div>
                </div>
                
                {/* User & Company Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-slate-50 rounded-xl p-6">
                    <h4 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                      <User className="h-5 w-5" />
                      User Information
                    </h4>
                    <div className="space-y-3">
                      <div>
                        <span className="text-sm font-medium text-slate-700">User ID:</span>
                        <div className="mt-1">
                          <span className="font-mono text-sm bg-white px-3 py-2 rounded-lg border border-slate-200">
                            {selectedEntry.user_id || 'N/A'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {selectedEntry.companies?.name && (
                    <div className="bg-slate-50 rounded-xl p-6">
                      <h4 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                        <Building2 className="h-5 w-5" />
                        Company
                      </h4>
                      <p className="text-slate-700 text-lg">{selectedEntry.companies.name}</p>
                    </div>
                  )}
                </div>
                
                {/* Admin Notes */}
                {isEditing ? (
                  <div>
                    <h4 className="font-semibold text-slate-900 mb-3 text-lg">Admin Notes</h4>
                    <Textarea
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      placeholder="Add admin notes..."
                      className="min-h-[120px] border-slate-200 focus:border-blue-300 focus:ring-blue-200"
                    />
                  </div>
                ) : selectedEntry.admin_notes ? (
                  <div>
                    <h4 className="font-semibold text-slate-900 mb-3 text-lg">Admin Notes</h4>
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
                      <p className="text-amber-800 whitespace-pre-wrap leading-relaxed">{selectedEntry.admin_notes}</p>
                    </div>
                  </div>
                ) : (
                  <div>
                    <h4 className="font-semibold text-slate-900 mb-3 text-lg">Admin Notes</h4>
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
                      <p className="text-slate-500 italic">No admin notes added yet.</p>
                    </div>
                  </div>
                )}
                
                {/* Status & Priority Controls */}
                {isEditing && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="text-sm font-medium text-slate-700 mb-2 block">Status</label>
                      <Select value={editStatus} onValueChange={setEditStatus}>
                        <SelectTrigger className="border-slate-200 focus:border-blue-300 focus:ring-blue-200">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="in_review">In Review</SelectItem>
                          <SelectItem value="resolved">Resolved</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-700 mb-2 block">Priority</label>
                      <Select value={editPriority} onValueChange={setEditPriority}>
                        <SelectTrigger className="border-slate-200 focus:border-blue-300 focus:ring-blue-200">
                          <SelectValue placeholder="Select priority" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
                
                {/* Screenshot */}
                {selectedEntry.screenshot_url && (
                  <div>
                    <h4 className="font-semibold text-slate-900 mb-3 text-lg flex items-center gap-2">
                      <Image className="h-5 w-5" />
                      Screenshot
                    </h4>
                    <div className="bg-slate-50 rounded-xl p-6">
                      <img
                        src={`${supabase.storage.from('feedback-screenshots').getPublicUrl(selectedEntry.screenshot_url).data.publicUrl}`}
                        alt="Feedback screenshot"
                        className="w-full rounded-lg border border-slate-200 shadow-sm"
                      />
                    </div>
                  </div>
                )}
                
                {/* Action Buttons */}
                {isEditing && (
                  <div className="flex items-center justify-end gap-3 pt-6 border-t border-slate-100">
                    <Button
                      variant="outline"
                      onClick={() => setIsEditing(false)}
                      disabled={isUpdating}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleEditSave}
                      disabled={isUpdating}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      {isUpdating ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4 mr-2" />
                          Save Changes
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}