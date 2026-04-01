import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Shield, Info, Users } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useTranslation } from '@/hooks/useTranslation';

export function GlobalPasswordPolicySettings() {
  const { lang } = useTranslation();
  const [globalEnabled, setGlobalEnabled] = useState(false);
  const [globalDays, setGlobalDays] = useState('90');
  const [isSaving, setIsSaving] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [userCount, setUserCount] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      // Get user count
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id', { count: 'exact', head: true });

      // Load current global policy from first company that has one (as indicator)
      const { data: companies } = await supabase
        .from('companies')
        .select('description')
        .eq('is_archived', false)
        .limit(1);

      if (companies && companies.length > 0 && companies[0].description) {
        try {
          const parsed = JSON.parse(companies[0].description);
          if (parsed.passwordPolicy) {
            setGlobalEnabled(parsed.passwordPolicy.enabled === true);
            setGlobalDays(String(parsed.passwordPolicy.expirationDays || 90));
          }
        } catch {
          // ignore
        }
      }

      setUserCount((profiles as any)?.length || 0);
      setIsLoaded(true);
    };
    loadData();
  }, []);

  const handleApplyToAllUsers = async () => {
    setIsSaving(true);
    try {
      // Apply the policy to all companies — this enforces it for all users
      const { data: allCompanies, error: fetchError } = await supabase
        .from('companies')
        .select('id, description')
        .eq('is_archived', false);

      if (fetchError) throw fetchError;

      const policyData = {
        enabled: globalEnabled,
        expirationDays: parseInt(globalDays, 10),
      };

      const total = allCompanies?.length || 0;
      setProgress({ current: 0, total });
      let successCount = 0;

      for (let i = 0; i < (allCompanies || []).length; i++) {
        const company = allCompanies![i];
        let existingOrgData: Record<string, any> = {};
        if (company.description) {
          try {
            existingOrgData = JSON.parse(company.description);
          } catch {
            existingOrgData = {};
          }
        }

        const { error: updateError } = await supabase
          .from('companies')
          .update({
            description: JSON.stringify({
              ...existingOrgData,
              passwordPolicy: policyData,
            }),
          })
          .eq('id', company.id);

        if (!updateError) successCount++;
        setProgress({ current: i + 1, total });
      }

      toast.success(
        globalEnabled
          ? `Password expiration (${globalDays} days) enforced for all users`
          : 'Password expiration disabled for all users'
      );
    } catch (err: any) {
      console.error('Failed to apply password policy:', err);
      toast.error(err.message || 'Failed to apply password policy');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isLoaded) return null;

  return (
    <Card className="border-0 shadow-lg bg-white/90 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-3 text-lg">
          <div className="p-2 bg-gradient-to-r from-orange-400 to-red-500 rounded-xl shadow-lg">
            <Shield className="h-5 w-5 text-white" />
          </div>
          {lang('settings.administration.passwordPolicy.title')}
          <Badge variant="outline" className="ml-2 text-xs font-normal">
            21 CFR Part 11
          </Badge>
        </CardTitle>
        <CardDescription>
          Enforce password expiration for all platform users. Required for regulatory compliance.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Enable toggle */}
        <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-slate-500" />
            <Label htmlFor="global-password-expiration-toggle" className="text-sm font-medium">
              {lang('settings.administration.passwordPolicy.enable')}
            </Label>
          </div>
          <Switch
            id="global-password-expiration-toggle"
            checked={globalEnabled}
            onCheckedChange={setGlobalEnabled}
          />
        </div>

        {/* Expiration days selection */}
        {globalEnabled && (
          <div className="space-y-2 pl-1">
            <Label className="text-sm text-slate-600">Password must be changed every:</Label>
            <Select value={globalDays} onValueChange={setGlobalDays}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 day</SelectItem>
                <SelectItem value="5">5 days</SelectItem>
                <SelectItem value="60">60 days</SelectItem>
                <SelectItem value="90">
                  90 days
                </SelectItem>
                <SelectItem value="120">120 days</SelectItem>
                <SelectItem value="180">180 days</SelectItem>
                <SelectItem value="360">360 days</SelectItem>
              </SelectContent>
            </Select>
            {globalDays === '90' && (
              <Badge variant="secondary" className="text-xs">
                {lang('settings.administration.passwordPolicy.recommended')}
              </Badge>
            )}
          </div>
        )}

        {/* Info text */}
        <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg border border-blue-100">
          <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
          <div className="text-xs text-blue-700 space-y-1">
            <p>Users with expired passwords will be blocked and forced to create a new password on login.</p>
            <p>Google OAuth users are automatically exempt. Super admins are always exempt.</p>
          </div>
        </div>

        {/* Apply button */}
        <Button
          onClick={handleApplyToAllUsers}
          disabled={isSaving}
          className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700"
        >
          {isSaving
            ? `Applying... ${progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0}%`
            : 'Apply to All Users'}
        </Button>
      </CardContent>
    </Card>
  );
}
