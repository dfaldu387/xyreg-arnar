
import React, { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Paperclip, Download, X, FileText, Image as ImageIcon } from "lucide-react";
import { formatDistanceToNow } from 'date-fns';
import { CommunicationMessage } from '@/types/communications';
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from '@/hooks/useTranslation';

interface MessageTimelineProps {
  messages: CommunicationMessage[];
  threadId?: string;
  onSendMessage?: (content: string) => Promise<void>;
}

interface PendingAttachment {
  id: string;
  file: File;
  preview?: string;
}

export function MessageTimeline({ messages, threadId, onSendMessage }: MessageTimelineProps) {
  const { lang } = useTranslation();
  const [newMessage, setNewMessage] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const getSenderName = (message: CommunicationMessage) => {
    if (message.sender_profile) {
      const name = [message.sender_profile.first_name, message.sender_profile.last_name].filter(Boolean).join(' ');
      return name || message.sender_profile.email;
    }
    return 'Unknown';
  };

  const getSenderInitials = (message: CommunicationMessage) => {
    const name = getSenderName(message);
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const formatTimestamp = (timestamp: string | null) => {
    if (!timestamp) return lang('communications.messageTimeline.unknownTime');
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
    } catch {
      return lang('communications.messageTimeline.unknownTime');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: lang('communications.messageTimeline.toast.fileTooLarge'),
          description: lang('communications.messageTimeline.toast.fileTooLargeDesc'),
          variant: "destructive"
        });
        return;
      }

      const newAttachment: PendingAttachment = {
        id: Math.random().toString(36).substr(2, 9),
        file
      };

      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          newAttachment.preview = e.target?.result as string;
          setPendingAttachments(prev => [...prev, newAttachment]);
        };
        reader.readAsDataURL(file);
      } else {
        setPendingAttachments(prev => [...prev, newAttachment]);
      }
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (attachmentId: string) => {
    setPendingAttachments(prev => prev.filter(att => att.id !== attachmentId));
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() && pendingAttachments.length === 0) {
      toast({
        title: lang('communications.messageTimeline.toast.emptyMessage'),
        description: lang('communications.messageTimeline.toast.emptyMessageDesc'),
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);

    try {
      if (onSendMessage) {
        await onSendMessage(newMessage);
      }

      toast({
        title: lang('communications.messageTimeline.toast.messageSent'),
        description: lang('communications.messageTimeline.toast.messageSentDesc'),
      });

      setNewMessage('');
      setPendingAttachments([]);
    } catch (error) {
      toast({
        title: lang('communications.messageTimeline.toast.errorSending'),
        description: lang('communications.messageTimeline.toast.errorSendingDesc'),
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getFileIcon = (fileName: string) => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(extension || '')) {
      return <ImageIcon className="h-4 w-4" />;
    }
    return <FileText className="h-4 w-4" />;
  };

  return (
    <div className="space-y-6">
      {/* Message Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{lang('communications.messageTimeline.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {messages.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {lang('communications.messageTimeline.noMessages')}
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((message) => (
                <div key={message.id} className="flex gap-4">
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarImage src="" />
                    <AvatarFallback className="bg-muted">
                      {getSenderInitials(message)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium text-sm">
                        {getSenderName(message)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatTimestamp(message.created_at)}
                      </span>
                    </div>

                    <div className="rounded-lg p-3 bg-muted/50 border">
                      <p className="text-sm whitespace-pre-wrap">
                        {message.content}
                      </p>

                      {/* Attachments */}
                      {message.attachments && message.attachments.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-border/20">
                          <div className="flex items-center gap-1 mb-2">
                            <Paperclip className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">
                              {message.attachments.length} attachment{message.attachments.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <div className="space-y-1">
                            {message.attachments.map((attachment) => (
                              <div
                                key={attachment.id}
                                className="flex items-center gap-2 text-xs hover:bg-background/50 rounded p-1 cursor-pointer"
                              >
                                {getFileIcon(attachment.file_name)}
                                <span className="font-medium truncate flex-1">
                                  {attachment.file_name}
                                </span>
                                <span className="text-muted-foreground">
                                  ({formatFileSize(attachment.file_size)})
                                </span>
                                <Download className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Message Input */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{lang('communications.messageTimeline.compose.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {pendingAttachments.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium">{lang('communications.messageTimeline.compose.attachments')}</div>
                <div className="space-y-2">
                  {pendingAttachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      className="flex items-center gap-2 p-2 bg-muted rounded-md"
                    >
                      {getFileIcon(attachment.file.name)}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {attachment.file.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatFileSize(attachment.file.size)}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeAttachment(attachment.id)}
                        className="h-8 w-8 p-0"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Textarea
              placeholder={lang('communications.messageTimeline.compose.placeholder')}
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              className="min-h-[100px] resize-none"
              disabled={isLoading}
            />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  multiple
                  className="hidden"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif"
                />
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading}
                >
                  <Paperclip className="h-4 w-4" />
                  {lang('communications.messageTimeline.compose.attachFiles')}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {lang('communications.messageTimeline.compose.maxFileSize')}
                </span>
              </div>

              <Button
                className="gap-2"
                onClick={handleSendMessage}
                disabled={isLoading || (!newMessage.trim() && pendingAttachments.length === 0)}
              >
                <Send className="h-4 w-4" />
                {isLoading ? lang('communications.messageTimeline.compose.sending') : lang('communications.messageTimeline.compose.send')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
