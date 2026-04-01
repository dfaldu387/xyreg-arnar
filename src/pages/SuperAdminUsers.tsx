import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Shield, Users, Search, Building2, Eye, Clock, Mail, Calendar, Activity, List, Grid3X3, ChevronUp, ChevronDown, ArrowUpDown } from "lucide-react";
import { GlobalPasswordPolicySettings } from "@/components/settings/GlobalPasswordPolicySettings";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface User {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  role?: string;
  created_at: string;
  is_active?: boolean;
  companies?: Array<{
    company_id: string;
    company_name: string;
    access_level: string;
    is_internal: boolean;
    is_primary: boolean;
  }>;
}

// Type for the raw database response
interface RawUserData {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  created_at: string;
  companies: Array<{
    company_id: string;
    company_name: string;
    access_level: string;
    is_internal: boolean;
    is_primary: boolean;
  }>;
}

export default function SuperAdminUsers() {
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showCompaniesModal, setShowCompaniesModal] = useState(false);
  
  // Sorting state
  const [sortField, setSortField] = useState<'name' | 'email' | 'role' | 'company' | 'created_at' | 'status'>('created_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const isSuperAdmin = user?.user_metadata?.role === 'super_admin';

  useEffect(() => {
    if (!isSuperAdmin) {
      toast.error('Access denied. Super admin privileges required.');
      return;
    }
    fetchUsers();
  }, [isSuperAdmin]);

  const fetchUsers = async () => {
    try {
      setIsLoading(true);
      
      // Use type assertion since the function exists but TypeScript doesn't recognize it
      const { data, error } = await supabase
        .rpc('fetch_all_users_with_companies' as any);
      
      if (error) {
        console.error('Database function error:', error);
        throw error;
      }
      
      // Properly type the raw data as an array
      const rawData = data as RawUserData[];
      
      const transformedUsers: User[] = rawData.map((user: RawUserData) => ({
        id: user.id,
        email: user.email,
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        role: user.role || 'user',
        created_at: user.created_at,
        is_active: true,
        companies: user.companies || []
      }));
      
      setUsers(transformedUsers);
    } catch (error: any) {
      console.error('Error fetching users:', error);
      
      if (user) {
        setUsers([{
          id: user.id,
          email: user.email || '',
          first_name: user.user_metadata?.first_name,
          last_name: user.user_metadata?.last_name,
          role: user.user_metadata?.role,
          created_at: (user as any).created_at || new Date().toISOString(),
          is_active: true,
          companies: []
        }]);
      }
      
      toast.error('Failed to fetch users. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Sorting function
  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Sort helper function
  const getSortedUsers = (usersToSort: User[]) => {
    return [...usersToSort].sort((a, b) => {
      let aValue: string | number;
      let bValue: string | number;

      switch (sortField) {
        case 'name':
          aValue = `${a.first_name || ''} ${a.last_name || ''}`.trim() || 'No Name';
          bValue = `${b.first_name || ''} ${b.last_name || ''}`.trim() || 'No Name';
          break;
        case 'email':
          aValue = a.email;
          bValue = b.email;
          break;
        case 'role':
          aValue = a.role || '';
          bValue = b.role || '';
          break;
        case 'company':
          aValue = a.companies?.[0]?.company_name || '';
          bValue = b.companies?.[0]?.company_name || '';
          break;
        case 'created_at':
          aValue = new Date(a.created_at).getTime();
          bValue = new Date(b.created_at).getTime();
          break;
        case 'status':
          aValue = a.is_active ? 'Active' : 'Inactive';
          bValue = b.is_active ? 'Active' : 'Inactive';
          break;
        default:
          aValue = '';
          bValue = '';
      }

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        const comparison = aValue.toLowerCase().localeCompare(bValue.toLowerCase());
        return sortDirection === 'asc' ? comparison : -comparison;
      } else {
        const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
        return sortDirection === 'asc' ? comparison : -comparison;
      }
    });
  };

  const filteredUsers = getSortedUsers(users.filter(user => {
    const matchesSearch = user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.first_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.last_name?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    const matchesStatus = statusFilter === 'all' || 
                         (statusFilter === 'active' && user.is_active) ||
                         (statusFilter === 'inactive' && !user.is_active);
    
    const matchesCompany = companyFilter === 'all' || 
                          (user.companies && user.companies.some(c => c.company_name === companyFilter));
    
    return matchesSearch && matchesRole && matchesStatus && matchesCompany;
  }));

  // Render sort icon for table headers
  const renderSortIcon = (field: typeof sortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-4 w-4 text-slate-400" />;
    }
    return sortDirection === 'asc' 
      ? <ChevronUp className="h-4 w-4 text-purple-600" />
      : <ChevronDown className="h-4 w-4 text-purple-600" />;
  };

  const getRoleBadgeColor = (role?: string) => {
    switch (role) {
      case 'admin':
        return 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 hover:border-red-300';
      case 'expert':
        return 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 hover:border-blue-300';
      case 'editor':
        return 'bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 hover:border-purple-300';
      case 'company_user':
        return 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 hover:border-green-300';
      case 'super_admin':
        return 'bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100 hover:border-orange-300';
      default:
        return 'bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100 hover:border-gray-300';
    }
  };

  const uniqueRoles = React.useMemo(() => {
    const roles = users
      .map(user => user.role)
      .filter((role): role is string => !!role) 
      .filter((role, index, arr) => arr.indexOf(role) === index);
    return roles.sort();
  }, [users]);

  // Get unique companies for the filter dropdown
  const uniqueCompanies = React.useMemo(() => {
    const companies = users
      .flatMap(user => user.companies || [])
      .filter(company => company.company_name)
      .map(company => company.company_name)
      .filter((companyName, index, arr) => arr.indexOf(companyName) === index);
    return companies.sort();
  }, [users]);

  const handleLoginAsUser = async (userId: string, userEmail: string) => {
    try {
      // Get current session for authorization
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        toast.error('Authentication required');
        return;
      }

      // Store impersonation data in localStorage
      const impersonationData = {
        impersonatedBy: user?.id,
        impersonatedByEmail: user?.email,
        impersonatedAt: new Date().toISOString(),
        originalUserEmail: userEmail,
        targetUserId: userId
      };
      
      localStorage.setItem('impersonation_data', JSON.stringify(impersonationData));

      // Call the edge function to impersonate the user
      const { data, error } = await supabase.functions.invoke('impersonate-user', {
        body: { targetUserId: userId },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) {
        console.error('Impersonation error:', error);
        toast.error('Failed to impersonate user: ' + error.message);
        localStorage.removeItem('impersonation_data');
        return;
      }

      if (data?.success && data?.loginUrl) {
        toast.success(`Logging in as ${userEmail}...`);
        
        // Open the login URL in the current window to complete the impersonation
        window.location.href = data.loginUrl;
      } else {
        toast.error('Failed to generate impersonation link');
        localStorage.removeItem('impersonation_data');
      }
    } catch (error: any) {
      console.error('Error impersonating user:', error);
      toast.error('Failed to impersonate user: ' + error.message);
      localStorage.removeItem('impersonation_data');
    }
  };

  const handleViewAllCompanies = (user: User) => {
    setSelectedUser(user);
    setShowCompaniesModal(true);
  };

  if (!isSuperAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        {/* Enhanced Page Header */}
        <div className="mb-8 pt-5">
          <div className="flex items-center space-x-4 mb-6">
            <div className="p-4 bg-gradient-to-r from-purple-600 via-blue-600 to-indigo-600 rounded-2xl shadow-2xl">
              <Shield className="h-10 w-10 text-white" />
            </div>
            <div className="flex-1">
              <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-purple-600 via-blue-600 to-indigo-600 bg-clip-text text-transparent mb-2">
                User Management
              </h1>
              <p className="text-slate-600 text-lg">
                Manage all users across the system with comprehensive control
              </p>
            </div>
          </div>
        </div>

        {/* Enhanced Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="group border-0 shadow-lg bg-white/90 backdrop-blur-sm hover:shadow-2xl transition-all duration-300 hover:scale-105 pt-3">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600 mb-2">Active Users</p>
                  <p className="text-3xl font-bold text-green-600">{filteredUsers.filter(u => u.is_active).length}</p>
                </div>
                <div className="p-4 bg-gradient-to-r from-green-400 to-emerald-500 rounded-2xl shadow-lg group-hover:scale-110 transition-transform duration-300">
                  <Users className="h-7 w-7 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="group border-0 shadow-lg bg-white/90 backdrop-blur-sm hover:shadow-2xl transition-all duration-300 hover:scale-105 pt-3">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600 mb-2">Total Users</p>
                  <p className="text-3xl font-bold text-blue-600">{users.length}</p>
                  <p className="text-xs text-slate-500 mt-1">Registered accounts</p>
                </div>
                <div className="p-4 bg-gradient-to-r from-blue-400 to-indigo-500 rounded-2xl shadow-lg group-hover:scale-110 transition-transform duration-300">
                  <Building2 className="h-7 w-7 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          {/* <Card className="group border-0 shadow-lg bg-white/90 backdrop-blur-sm hover:shadow-2xl transition-all duration-300 hover:scale-105 pt-3">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600 mb-2">Filtered Results</p>
                  <p className="text-3xl font-bold text-purple-600">{filteredUsers.length}</p>
                  <p className="text-xs text-slate-500 mt-1">Matching criteria</p>
                </div>
                <div className="p-4 bg-gradient-to-r from-purple-400 to-pink-500 rounded-2xl shadow-lg group-hover:scale-110 transition-transform duration-300">
                  <Filter className="h-7 w-7 text-white" />
                </div>
              </div>
            </CardContent>
          </Card> */}
        </div>

        {/* Password Expiration Policy - Platform Level */}
        <div className="mb-8">
          <GlobalPasswordPolicySettings />
        </div>

        {/* Enhanced User Management Section */}
        <div className="space-y-6">
          {/* Enhanced Header with View Toggle */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-2">
              <h2 className="text-3xl font-bold text-slate-800 flex items-center space-x-3">
                <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg">
                  <Users className="h-6 w-6 text-white" />
                </div>
                <span>System Users</span>
              </h2>
              <p className="text-slate-600 text-lg">
                All registered users in the system with advanced filtering
              </p>
            </div>
            
            {/* Enhanced View Mode Toggle with Better UI */}
            <div className="flex items-center space-x-3">
              <div className="flex bg-slate-100 rounded-xl p-2 shadow-md border border-slate-200">
                <Button
                  variant={viewMode === 'table' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('table')}
                  className={`rounded-lg flex items-center space-x-3 mr-3 px-4 py-3 transition-all duration-200 ${
                    viewMode === 'table' 
                      ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg scale-105' 
                      : 'hover:bg-slate-200 text-slate-600 hover:text-slate-800'
                  }`}
                >
                  <List className="h-5 w-5" />
                  <span className="hidden sm:inline font-medium">List View</span>
                </Button>
                <Button
                  variant={viewMode === 'grid' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('grid')}
                  className={`rounded-lg flex items-center space-x-3 px-4 py-3 transition-all duration-200 ${
                    viewMode === 'grid' 
                      ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg scale-105' 
                      : 'hover:bg-slate-200 text-slate-600 hover:text-slate-800'
                  }`}
                >
                  <Grid3X3 className="h-5 w-5" />
                  <span className="hidden sm:inline font-medium">Grid View</span>
                </Button>
              </div>
            </div>
          </div>

          {/* Enhanced Search and Filters */}
          <Card className="border-0 shadow-xl bg-white/95 backdrop-blur-sm pt-4">
            <CardContent className="p-6">
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                {/* Search */}
                <div className="lg:col-span-2">
                  <Label htmlFor="search" className="text-sm font-medium text-slate-700 mb-2 block">Search Users</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
                    <Input
                      id="search"
                      placeholder="Search by name, email, or role..."
                      className="pl-12 h-12 border-slate-200 focus:border-purple-500 focus:ring-purple-500 rounded-xl text-base"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>
                
                {/* Role Filter */}
                <div>
                  <Label className="text-sm font-medium text-slate-700 mb-2 block">Role</Label>
                  <Select value={roleFilter} onValueChange={setRoleFilter}>
                    <SelectTrigger className="h-12 border-slate-200 rounded-xl">
                      <SelectValue placeholder="All Roles" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Roles</SelectItem>
                      {uniqueRoles.map((role) => (
                        <SelectItem key={role} value={role}>
                          {role.charAt(0).toUpperCase() + role.slice(1).replace(/_/g, ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {/* Company Filter - New */}
                <div>
                  <Label className="text-sm font-medium text-slate-700 mb-2 block">Company</Label>
                  <Select value={companyFilter} onValueChange={setCompanyFilter}>
                    <SelectTrigger className="h-12 border-slate-200 rounded-xl">
                      <SelectValue placeholder="All Companies" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Companies</SelectItem>
                      {uniqueCompanies.map((companyName) => (
                        <SelectItem key={companyName} value={companyName}>
                          {companyName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {/* Status Filter */}
                <div>
                  <Label className="text-sm font-medium text-slate-700 mb-2 block">Status</Label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-12 border-slate-200 rounded-xl">
                      <SelectValue placeholder="All Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Enhanced Users Display */}
          <Card className="border-0 shadow-xl bg-white/95 backdrop-blur-sm">
            <CardHeader className="bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 border-b border-slate-200/60 px-6 sm:px-8 py-6">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <CardTitle className="text-2xl font-bold text-slate-800 flex items-center space-x-3">
                    <span>User List</span>
                    <Badge variant="secondary" className="bg-gradient-to-r from-blue-500 to-purple-600 text-white border-0 px-4 py-2 text-sm font-semibold rounded-full">
                      {filteredUsers.length} Users
                    </Badge>
                  </CardTitle>
                  <CardDescription className="text-slate-600 text-base font-medium">
                    Manage users across the system with full administrative control
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            
            <CardContent className="p-0">
              {isLoading ? (
                <div className="text-center py-16">
                  <div className="inline-flex items-center justify-center w-16 h-16 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin mb-4"></div>
                  <p className="text-lg font-medium text-slate-600">Loading users...</p>
                  <p className="text-slate-500">Please wait while we fetch the latest data</p>
                </div>
              ) : viewMode === 'table' ? (
                // Enhanced Table View
                <div className="overflow-hidden">
                   {/* Enhanced Table Header with Sorting */}
                   <div className="grid grid-cols-12 gap-4 px-4 sm:px-6 lg:px-8 py-5 bg-gradient-to-r from-slate-50 to-blue-50 border-b border-slate-200 font-semibold text-slate-700 text-sm uppercase tracking-wide">
                     <button 
                       onClick={() => handleSort('name')}
                       className="col-span-3 flex items-center space-x-2 hover:text-purple-600 transition-colors cursor-pointer text-left"
                     >
                       <Users className="h-4 w-4" />
                       <span>User Information</span>
                       {renderSortIcon('name')}
                     </button>
                     <button 
                       onClick={() => handleSort('role')}
                       className="col-span-2 text-center flex items-center justify-center space-x-2 hover:text-purple-600 transition-colors cursor-pointer"
                     >
                       <Shield className="h-4 w-4" />
                       <span>Role</span>
                       {renderSortIcon('role')}
                     </button>
                     <button 
                       onClick={() => handleSort('company')}
                       className="col-span-2 text-center flex items-center justify-center space-x-2 hover:text-purple-600 transition-colors cursor-pointer"
                     >
                       <Building2 className="h-4 w-4" />
                       <span>Company</span>
                       {renderSortIcon('company')}
                     </button>
                     <button 
                       onClick={() => handleSort('status')}
                       className="col-span-2 text-center flex items-center justify-center space-x-2 hover:text-purple-600 transition-colors cursor-pointer"
                     >
                       <Activity className="h-4 w-4" />
                       <span>Status</span>
                       {renderSortIcon('status')}
                     </button>
                     <button 
                       onClick={() => handleSort('created_at')}
                       className="col-span-2 text-center flex items-center justify-center space-x-2 hover:text-purple-600 transition-colors cursor-pointer"
                     >
                       <Calendar className="h-4 w-4" />
                       <span>Created</span>
                       {renderSortIcon('created_at')}
                     </button>
                     {/* <div className="col-span-1 text-center flex items-center justify-center space-x-2">
                       <span>Actions</span>
                     </div> */}
                   </div>

                   {/* Enhanced Table Body */}
                   <div className="divide-y divide-slate-100">
                     {filteredUsers.map((user, index) => (
                       <div 
                         key={user.id} 
                         className="grid grid-cols-12 gap-4 px-4 sm:px-6 lg:px-8 py-6 hover:bg-gradient-to-r hover:from-slate-50 hover:to-blue-50 transition-all duration-300 bg-white group"
                       >
                         {/* Enhanced User Information */}
                         <div className="col-span-3 flex items-center space-x-4">
                           <div className="w-14 h-14 bg-gradient-to-r from-blue-500 via-purple-500 to-indigo-500 rounded-2xl flex items-center justify-center shadow-lg flex-shrink-0 group-hover:scale-110 transition-transform duration-300">
                             <Users className="h-7 w-7 text-white" />
                           </div>
                           <div className="min-w-0 flex-1">
                             <p className="font-semibold text-slate-800 text-lg leading-tight mb-2">
                               {user.first_name && user.last_name
                                 ? `${user.first_name} ${user.last_name}`
                                 : 'No Name'
                               }
                             </p>
                             <div className="flex items-center space-x-2 text-sm text-slate-500">
                               <Mail className="h-4 w-4" />
                               <span className="truncate">{user.email}</span>
                            </div>
                          </div>
                        </div>

                        {/* Enhanced Role */}
                        <div className="col-span-2 flex items-center justify-center">
                          <Badge className={`px-4 py-2.5 text-sm font-medium rounded-full transition-all duration-300 hover:scale-105 hover:shadow-lg ${getRoleBadgeColor(user.role)}`}>
                            {user.role ? user.role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'No Role'}
                          </Badge>
                        </div>

                        {/* Company Information - Reduced width from col-span-3 to col-span-2 */}
                        <div className="col-span-2 flex items-center justify-center">
                          {user.companies && user.companies.length > 0 && user.companies.some(c => c.company_name) ? (
                            <div className="text-center max-w-full">
                              <div className="space-y-1">
                                {/* Show primary company prominently */}
                                {user.companies.find(c => c.is_primary && c.company_name) && (
                                  <div className="mb-2">
                                    <Badge 
                                      variant="outline" 
                                      className="bg-blue-50 text-blue-700 border-blue-200 px-2 py-1 text-xs font-medium rounded-full"
                                    >
                                      {user.companies.find(c => c.is_primary && c.company_name)?.company_name}
                                    </Badge>
                                  </div>
                                )}
                                
                                {/* Show first 2 additional companies */}
                                {user.companies.filter(c => !c.is_primary && c.company_name).length > 0 && (
                                  <div className="flex flex-wrap gap-1 justify-center">
                                    {user.companies
                                      .filter(c => !c.is_primary && c.company_name)
                                      .slice(0, 2)
                                      .map((company) => (
                                        <Badge 
                                          key={company.company_id}
                                          variant="outline" 
                                          className="bg-slate-50 text-slate-600 border-slate-200 px-2 py-1 text-xs font-medium rounded-full"
                                        >
                                          {company.company_name}
                                        </Badge>
                                      ))}
                                    
                                    {/* Show count and view all button if there are more companies */}
                                    {user.companies.filter(c => !c.is_primary && c.company_name).length > 2 && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleViewAllCompanies(user)}
                                        className="px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-full border border-blue-200 hover:border-blue-300"
                                      >
                                        +{user.companies.filter(c => !c.is_primary && c.company_name).length - 2} more
                                      </Button>
                                    )}
                                  </div>
                                )}
                                
                                {/* Show only company if that's all they have */}
                                {user.companies.filter(c => !c.is_primary && c.company_name).length === 0 && !user.companies.find(c => c.is_primary && c.company_name) && (
                                  <Badge 
                                    variant="outline" 
                                    className="bg-slate-50 text-slate-600 border-slate-200 px-2 py-1 text-xs font-medium rounded-full"
                                  >
                                    {user.companies.find(c => c.company_name)?.company_name}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="text-sm text-slate-400 italic">No Company</span>
                          )}
                        </div>

                        {/* Enhanced Status */}
                        <div className="col-span-2 flex items-center justify-center">
                          <Badge 
                            variant={user.is_active ? "default" : "destructive"} 
                            className="px-4 py-2.5 text-sm font-medium rounded-full flex items-center space-x-2"
                          >
                            <div className={`w-2 h-2 rounded-full ${user.is_active ? 'bg-green-400' : 'bg-red-400'}`}></div>
                            <span>{user.is_active ? 'Active' : 'Inactive'}</span>
                          </Badge>
                        </div>

                        {/* Enhanced Created Date */}
                        <div className="col-span-2 flex items-center justify-center">
                          <div className="text-sm text-slate-600 font-medium flex items-center space-x-2">
                            <Clock className="h-4 w-4 text-slate-400" />
                            <span>
                              {new Date(user.created_at).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric'
                              })}
                            </span>
                          </div>
                        </div>

                        {/* Enhanced Actions - Now has more space */}
                        {/* <div className="col-span-1 flex items-center justify-center">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleLoginAsUser(user.id, user.email)}
                            className="flex items-center space-x-2 px-3 py-2 hover:bg-gradient-to-r hover:from-purple-600 hover:to-blue-600 hover:text-white transition-all duration-300 border-purple-200 hover:border-transparent rounded-xl shadow-sm hover:shadow-lg text-xs whitespace-nowrap"
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            <span className="font-medium">Login as User</span>
                          </Button>
                        </div> */}
                      </div>
                    ))}
                  </div>
                  
                  {/* Enhanced Empty State */}
                  {filteredUsers.length === 0 && !isLoading && (
                    <div className="text-center py-20">
                      <div className="w-24 h-24 bg-gradient-to-r from-slate-100 to-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Users className="h-12 w-12 text-slate-400" />
                      </div>
                      <h3 className="text-xl font-semibold text-slate-700 mb-3">No users found</h3>
                      <p className="text-slate-500 max-w-md mx-auto text-lg">
                        No users match your current search criteria. Try adjusting your filters or search terms.
                      </p>
                      <Button 
                        variant="outline" 
                        className="mt-4 hover:bg-slate-50"
                        onClick={() => {
                          setSearchTerm('');
                          setRoleFilter('all');
                          setStatusFilter('all');
                          setCompanyFilter('all');
                        }}
                      >
                        Clear Filters
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                // Grid View
                <div className="p-4 sm:p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
                    {filteredUsers.map((user) => (
                      <Card key={user.id} className="group hover:shadow-xl transition-all duration-300 hover:scale-105 border-0 bg-white/80 backdrop-blur-sm">
                        <CardContent className="p-4 sm:p-6">
                          <div className="flex items-center space-x-4 mb-4">
                            <div className="w-16 h-16 bg-gradient-to-r from-blue-500 via-purple-500 to-indigo-500 rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
                              <Users className="h-8 w-8 text-white" />
                            </div>
                            <div className="flex-1">
                              <h3 className="font-semibold text-slate-800 text-lg mb-1">
                                {user.first_name && user.last_name
                                  ? `${user.first_name} ${user.last_name}`
                                  : 'No Name'
                                }
                              </h3>
                              <p className="text-sm text-slate-500">{user.email}</p>
                            </div>
                          </div>
                          
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-slate-600">Role:</span>
                              <Badge className={getRoleBadgeColor(user.role)}>
                                {user.role ? user.role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'No Role'}
                              </Badge>
                            </div>
                            
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-slate-600">Company:</span>
                              <div className="text-right max-w-32">
                                {user.companies && user.companies.length > 0 && user.companies.some(c => c.company_name) ? (
                                  <div className="space-y-1">
                                    {/* Show first company */}
                                    <Badge 
                                      variant="outline" 
                                      className="bg-slate-50 text-slate-600 border-slate-200 px-2 py-1 text-xs font-medium rounded-full w-full justify-center"
                                    >
                                      {user.companies.find(c => c.company_name)?.company_name}
                                    </Badge>
                                    
                                    {/* Show additional companies count if there are more than 1 */}
                                    {user.companies.filter(c => c.company_name).length > 1 && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleViewAllCompanies(user)}
                                        className="px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-full border border-blue-200 hover:border-blue-300 w-full"
                                      >
                                        +{user.companies.filter(c => c.company_name).length - 1} more
                                      </Button>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-sm text-slate-400 italic">No Company</span>
                                )}
                              </div>
                            </div>
                            
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-slate-600">Status:</span>
                              <Badge variant={user.is_active ? "default" : "destructive"}>
                                {user.is_active ? 'Active' : 'Inactive'}
                              </Badge>
                            </div>
                            
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-slate-600">Created:</span>
                              <span className="text-sm text-slate-700 font-medium">
                                {new Date(user.created_at).toLocaleDateString('en-US', {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric'
                                })}
                              </span>
                            </div>
                          </div>
                          
                          <div className="mt-6">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleLoginAsUser(user.id, user.email)}
                              className="w-full hover:bg-gradient-to-r hover:from-purple-600 hover:to-blue-600 hover:text-white transition-all duration-300 border-purple-200 hover:border-transparent rounded-xl"
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              Login as User
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Companies Modal */}
        <Dialog open={showCompaniesModal} onOpenChange={setShowCompaniesModal}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden p-0">
            <DialogHeader className="px-6 py-6 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <DialogTitle className="text-2xl font-bold text-slate-800">
                    Company Access
                  </DialogTitle>
                  <DialogDescription className="text-slate-600 mt-2">
                    {selectedUser?.first_name && selectedUser?.last_name 
                      ? `${selectedUser.first_name} ${selectedUser.last_name}`
                      : selectedUser?.email
                    } has access to the following companies:
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            
            <div className="px-6 overflow-y-auto max-h-[60vh] pr-6">
              {selectedUser?.companies && selectedUser.companies.length > 0 && selectedUser.companies.some(c => c.company_name) ? (
                <div className="space-y-3">
                  {/* All Companies List */}
                  <div className="space-y-2">
                    <h4 className="font-medium text-slate-700 text-sm uppercase tracking-wide">
                      Companies ({selectedUser.companies.filter(c => c.company_name).length})
                    </h4>
                    <div className="grid grid-cols-1 gap-3">
                      {selectedUser.companies
                        .filter(c => c.company_name)
                        .map((company, index) => (
                          <div 
                            key={company.company_id || index}
                            className="bg-slate-50 border border-slate-200 rounded-lg p-4 hover:bg-slate-100 transition-colors"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-3">
                                <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                                  <Building2 className="h-5 w-5 text-white" />
                                </div>
                                <div>
                                  <p className="font-semibold text-slate-800 text-lg">
                                    {company.company_name}
                                  </p>
                                  <div className="flex items-center space-x-4 mt-1">
                                    <span className="text-slate-600 text-sm">
                                      Access: {company.access_level || 'Standard'}
                                    </span>
                                    <Badge 
                                      variant="outline" 
                                      className="text-xs"
                                    >
                                      {company.is_internal ? 'Internal' : 'External'}
                                    </Badge>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Building2 className="h-12 w-12 text-slate-400 mx-auto mb-3" />
                  <p className="text-slate-600 font-medium">No company access</p>
                  <p className="text-slate-500 text-sm">This user doesn't have access to any companies.</p>
                </div>
              )}
            </div>
            
            <div className="px-6 py-6 border-t border-slate-200 mt-4">
              <div className="flex justify-end">
                <Button
                  onClick={() => setShowCompaniesModal(false)}
                  className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 border-2 border-blue-500 hover:border-blue-600 focus:ring-4 focus:ring-blue-200 focus:outline-none"
                >
                  Close
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
