import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { CommunicationThread, CommunicationMessage, ThreadParticipant } from '@/types/communications';
import { toast } from 'sonner';

interface UseCommunicationThreadsOptions {
  companyId?: string;
  status?: string;
  searchQuery?: string;
}

export function useCommunicationThreads(options: UseCommunicationThreadsOptions = {}) {
  const { user, session } = useAuth();
  const queryClient = useQueryClient();

  const queryKey = ['communication-threads', user?.id, options.companyId, options.status, options.searchQuery];

  const { data: threads = [], isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: async (): Promise<CommunicationThread[]> => {
      if (!user) throw new Error('Not authenticated');

      // Fetch threads where user is a participant
      let query = supabase
        .from('communication_threads')
        .select(`
          *,
          thread_participants!inner(
            id, thread_id, user_id, role, is_internal, joined_at,
            last_read_at, unread_count, external_email, external_name, external_organization
          )
        `)
        .order('last_activity_at', { ascending: false });

      if (options.companyId) {
        query = query.eq('company_id', options.companyId);
      }

      if (options.status && options.status !== 'all') {
        const statusMap: Record<string, string> = {
          'active': 'Active',
          'awaiting-response': 'Awaiting Response',
          'closed': 'Closed',
        };
        const dbStatus = statusMap[options.status] || options.status;
        query = query.eq('status', dbStatus);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Now fetch ALL participants for these threads (not just current user)
      const threadIds = (data || []).map((t: any) => t.id);
      let allParticipants: any[] = [];
      if (threadIds.length > 0) {
        const { data: pData } = await supabase
          .from('thread_participants')
          .select(`
            id, thread_id, user_id, role, is_internal, joined_at,
            last_read_at, unread_count, external_email, external_name, external_organization
          `)
          .in('thread_id', threadIds);
        allParticipants = pData || [];
      }

      // Collect user_ids to fetch profiles
      const userIds = [...new Set(allParticipants.filter((p: any) => p.user_id).map((p: any) => p.user_id))];
      let profilesMap: Record<string, any> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('user_profiles')
          .select('id, email, first_name, last_name')
          .in('id', userIds);
        (profiles || []).forEach((p: any) => { profilesMap[p.id] = p; });
      }

      // Map threads
      const threads: CommunicationThread[] = (data || []).map((thread: any) => {
        const threadParticipants = allParticipants
          .filter((p: any) => p.thread_id === thread.id)
          .map((p: any) => ({
            ...p,
            unread_count: p.unread_count || 0,
            is_internal: p.is_internal ?? true,
            user_profile: p.user_id ? profilesMap[p.user_id] : undefined,
          }));

        // Find current user's participant record for unread count
        const myParticipant = threadParticipants.find((p: any) => p.user_id === user.id);

        return {
          ...thread,
          participants: threadParticipants,
          my_unread_count: myParticipant?.unread_count || 0,
        };
      });

      // Client-side search filtering
      if (options.searchQuery?.trim()) {
        const q = options.searchQuery.toLowerCase();
        return threads.filter(t => {
          if (t.title.toLowerCase().includes(q)) return true;
          if (t.related_entity_name?.toLowerCase().includes(q)) return true;
          if (t.participants?.some(p => {
            const name = p.user_profile
              ? [p.user_profile.first_name, p.user_profile.last_name].filter(Boolean).join(' ')
              : p.external_name || '';
            return name.toLowerCase().includes(q);
          })) return true;
          return false;
        });
      }

      return threads;
    },
    enabled: !!user,
    staleTime: 30 * 1000,
  });

  // Create thread
  const createThread = useMutation({
    mutationFn: async (params: {
      title: string;
      companyId: string;
      participantUserIds: string[];
      initialMessage?: string;
      threadType?: string;
      relatedEntityId?: string;
      relatedEntityName?: string;
      relatedEntityType?: string;
      productId?: string;
    }) => {
      if (!user) throw new Error('Not authenticated');

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const activeSession = sessionData?.session;
      if (sessionError || !activeSession || !session) {
        throw new Error('No active auth session. Please sign in again (or disable DevMode) and retry.');
      }

      if (activeSession.user.id !== user.id) {
        throw new Error('Auth session mismatch. Please reload and sign in again.');
      }

      // 1. Create thread (avoid INSERT ... RETURNING to prevent SELECT policy gate before participants exist)
      const threadId = crypto.randomUUID();
      const { error: threadError } = await supabase
        .from('communication_threads')
        .insert({
          id: threadId,
          title: params.title,
          company_id: params.companyId,
          created_by: user.id,
          status: 'Active',
          thread_type: params.threadType || 'general',
          last_activity_at: new Date().toISOString(),
          related_entity_id: params.relatedEntityId || null,
          related_entity_name: params.relatedEntityName || null,
          related_entity_type: params.relatedEntityType || null,
          product_id: params.productId || null,
        });

      if (threadError) throw threadError;
      const thread = { id: threadId };

      // 2. Add participants (creator + selected)
      const allUserIds = [user.id, ...params.participantUserIds.filter(id => id !== user.id)];
      const participantInserts = allUserIds.map(uid => ({
        thread_id: thread.id,
        user_id: uid,
        role: uid === user.id ? 'owner' : 'participant',
        is_internal: true,
        unread_count: uid === user.id ? 0 : 1,
      }));

      const { error: partError } = await supabase
        .from('thread_participants')
        .insert(participantInserts);

      if (partError) throw partError;

      // 3. Add initial message if provided
      if (params.initialMessage?.trim()) {
        const { error: msgError } = await supabase
          .from('communication_messages')
          .insert({
            thread_id: thread.id,
            sender_user_id: user.id,
            content: params.initialMessage,
            message_type: 'text',
          });
        if (msgError) throw msgError;
      }

      // 4. Create notifications for other participants
      const { NotificationService } = await import('@/services/notificationService');
      const notificationService = new NotificationService();
      const otherUserIds = params.participantUserIds.filter(id => id !== user.id);

      await Promise.all(otherUserIds.map(uid =>
        notificationService.addNotification({
          title: `New Communication: ${params.title}`,
          message: params.initialMessage || `You were added to: "${params.title}"`,
          type: 'communication',
          company_id: params.companyId,
          user_id: uid,
          data: {
            thread_id: thread.id,
            communication_title: params.title,
            sender_id: user.id,
          },
        })
      ));

      return thread;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['communication-threads'] });
    },
  });

  // Send message
  const sendMessage = useMutation({
    mutationFn: async (params: { threadId: string; content: string }) => {
      if (!user) throw new Error('Not authenticated');

      const { data: msg, error: msgError } = await supabase
        .from('communication_messages')
        .insert({
          thread_id: params.threadId,
          sender_user_id: user.id,
          content: params.content,
          message_type: 'text',
        })
        .select('id')
        .single();

      if (msgError) throw msgError;

      // Update thread last_activity_at
      await supabase
        .from('communication_threads')
        .update({ last_activity_at: new Date().toISOString() })
        .eq('id', params.threadId);

      // Increment unread_count for other participants
      const { data: participants } = await supabase
        .from('thread_participants')
        .select('id, user_id, unread_count')
        .eq('thread_id', params.threadId)
        .neq('user_id', user.id);

      if (participants && participants.length > 0) {
        await Promise.all(participants.map(p =>
          supabase
            .from('thread_participants')
            .update({ unread_count: (p.unread_count || 0) + 1 })
            .eq('id', p.id)
        ));
      }

      return msg;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['communication-threads'] });
      queryClient.invalidateQueries({ queryKey: ['thread-messages'] });
    },
  });

  // Mark thread as read
  const markThreadRead = useMutation({
    mutationFn: async (threadId: string) => {
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('thread_participants')
        .update({
          last_read_at: new Date().toISOString(),
          unread_count: 0,
        })
        .eq('thread_id', threadId)
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['communication-threads'] });
    },
  });

  // Stats
  const unreadCount = threads.reduce((sum, t) => sum + (t.my_unread_count || 0), 0);
  const activeCount = threads.filter(t => t.status === 'Active').length;

  return {
    threads,
    isLoading,
    error,
    refetch,
    createThread,
    sendMessage,
    markThreadRead,
    unreadCount,
    activeCount,
  };
}

// Hook to fetch messages for a specific thread
export function useThreadMessages(threadId: string | null) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['thread-messages', threadId],
    queryFn: async (): Promise<CommunicationMessage[]> => {
      if (!threadId) return [];

      const { data, error } = await supabase
        .from('communication_messages')
        .select('*')
        .eq('thread_id', threadId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Fetch sender profiles
      const senderIds = [...new Set((data || []).filter(m => m.sender_user_id).map(m => m.sender_user_id!))];
      let profilesMap: Record<string, any> = {};
      if (senderIds.length > 0) {
        const { data: profiles } = await supabase
          .from('user_profiles')
          .select('id, email, first_name, last_name')
          .in('id', senderIds);
        (profiles || []).forEach(p => { profilesMap[p.id] = p; });
      }

      return (data || []).map(msg => ({
        ...msg,
        sender_profile: msg.sender_user_id ? profilesMap[msg.sender_user_id] : undefined,
        attachments: [],
      }));
    },
    enabled: !!threadId && !!user,
    staleTime: 10 * 1000,
  });
}
