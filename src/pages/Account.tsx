import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AppNav } from '@/components/AppNav';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function Account() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <AppNav />
      <div className="container mx-auto px-6 py-8 max-w-2xl">
        <h1 className="text-3xl font-bold text-foreground mb-6">Account Settings</h1>
        
        <Card>
          <CardHeader>
            <CardTitle>Account Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Email Address</p>
              <p className="font-medium text-foreground">{email ?? '—'}</p>
            </div>
            <p className="text-sm text-muted-foreground pt-4">
              More account preferences can be added here later.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
