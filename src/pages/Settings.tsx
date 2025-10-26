import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/integrations/supabase/client";
import { ruleConfigSchema, RuleConfigForm } from "@/lib/validations";
import { AppNav } from "@/components/AppNav";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Save } from "lucide-react";
import { toast } from "sonner";

export default function Settings() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  console.log('[settings] mount', { id });

  const form = useForm<RuleConfigForm>({
    resolver: zodResolver(ruleConfigSchema),
    defaultValues: {
      strict_age: true,
      allow_unrated_in_rating: false,
      prefer_main_on_equal_value: true,
      prefer_category_rank_on_tie: false,
      category_priority_order: []
    }
  });

  // TODO Phase 2: Replace with real categories from DB
  // Fetch real categories from the database
  const { data: categories = [] } = useQuery({
    queryKey: ['categories', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name, is_main, order_idx')
        .eq('tournament_id', id)
        .order('order_idx');
      
      console.log('[settings] categories render', { count: data?.length, sample: data?.[0] });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!id
  });

  // Fetch rule_config
  const { isLoading } = useQuery({
    queryKey: ['rule_config', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rule_config')
        .select('strict_age, allow_unrated_in_rating, prefer_main_on_equal_value, prefer_category_rank_on_tie, category_priority_order, tournament_id')
        .eq('tournament_id', id)
        .maybeSingle();
      
      console.log('[settings] load rules', { id, found: !!data });
      
      if (error && error.code !== 'PGRST116') {
        if (error.message?.includes('row-level security')) {
          toast.error("You don't have access to this tournament");
          navigate('/dashboard');
        }
        throw error;
      }
      
      if (data) {
        form.reset({
          strict_age: data.strict_age,
          allow_unrated_in_rating: data.allow_unrated_in_rating,
          prefer_main_on_equal_value: data.prefer_main_on_equal_value,
          prefer_category_rank_on_tie: data.prefer_category_rank_on_tie,
          category_priority_order: data.category_priority_order as string[] || []
        });
      }
      return data;
    },
    enabled: !!id
  });

  // Upsert mutation
  const saveMutation = useMutation({
    mutationFn: async (values: RuleConfigForm) => {
      console.log('[settings] save rules', { id, payload: values });
      
      const { error } = await supabase
        .from('rule_config')
        .upsert({
          tournament_id: id,
          ...values,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'tournament_id'
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rule_config', id] });
      toast.success('Settings saved successfully');
      navigate('/dashboard');
    },
    onError: (error: any) => {
      if (error.message?.includes('row-level security')) {
        toast.error("You don't have permission to update settings");
      } else {
        toast.error('Failed to save settings: ' + error.message);
      }
    }
  });

  const onSubmit = (values: RuleConfigForm) => {
    saveMutation.mutate(values);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <AppNav />
        <div className="container mx-auto px-6 py-8">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppNav />
      
      <div className="container mx-auto px-6 py-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Tournament Settings</h1>
          <p className="text-muted-foreground">Configure allocation rules and preferences</p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Default Allocation Rules</CardTitle>
                <CardDescription>
                  These rules govern how prizes are automatically allocated
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <FormField
                  control={form.control}
                  name="strict_age"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between py-2">
                      <div>
                        <FormLabel className="text-foreground font-medium">
                          Strict Age Eligibility
                        </FormLabel>
                        <FormDescription className="text-sm text-muted-foreground mt-1">
                          Players can only win prizes in their exact age category
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="allow_unrated_in_rating"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between py-2">
                      <div>
                        <FormLabel className="text-foreground font-medium">
                          Allow Unrated in Rating Categories
                        </FormLabel>
                        <FormDescription className="text-sm text-muted-foreground mt-1">
                          Include unrated players when allocating rating bracket prizes
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="prefer_main_on_equal_value"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between py-2">
                      <div>
                        <FormLabel className="text-foreground font-medium">
                          Prefer Main on Equal Value
                        </FormLabel>
                        <FormDescription className="text-sm text-muted-foreground mt-1">
                          When prizes have equal cash value, prefer main category over others
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="prefer_category_rank_on_tie"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between py-2">
                      <div>
                        <FormLabel className="text-foreground font-medium">
                          Prefer Category Rank on Tie
                        </FormLabel>
                        <FormDescription className="text-sm text-muted-foreground mt-1">
                          When values are equal, prefer higher category priority
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Tournament Policy Summary</CardTitle>
                <CardDescription>
                  Effective allocation configuration for this tournament
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  <li>Strict Age: <strong>{form.watch('strict_age') ? 'ON' : 'OFF'}</strong></li>
                  <li>Allow Unrated in Rating: <strong>{form.watch('allow_unrated_in_rating') ? 'ON' : 'OFF'}</strong></li>
                  <li>Prefer Main on Equal Value: <strong>{form.watch('prefer_main_on_equal_value') ? 'ON' : 'OFF'}</strong></li>
                  <li>Prefer Category Rank on Tie: <strong>{form.watch('prefer_category_rank_on_tie') ? 'ON' : 'OFF'}</strong></li>
                </ul>
                <div className="mt-4 text-sm text-muted-foreground">
                  💡 For per-category eligibility (age/rating/gender etc.), use <strong>Prize Structure → Edit Rules</strong> on each category.
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Category Priority Order</CardTitle>
                <CardDescription>
                  Categories are evaluated in this order during prize allocation
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ol className="space-y-2 mb-4">
                  {categories.map((c, idx) => (
                    <li key={c.id} className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground font-mono">#{idx + 1}</span>
                      <span className="font-medium">{c.name}</span>
                      {c.is_main && (
                        <Badge variant="secondary" className="ml-auto">Main (Fixed)</Badge>
                      )}
                    </li>
                  ))}
                </ol>
                <Button 
                  variant="outline" 
                  onClick={() => navigate(`/t/${id}/order-review`)}
                >
                  Edit Category Order
                </Button>
              </CardContent>
            </Card>

            <div className="flex justify-between pt-4">
              <Button type="button" variant="outline" onClick={() => navigate("/dashboard")}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveMutation.isPending} className="gap-2">
                <Save className="h-4 w-4" />
                {saveMutation.isPending ? 'Saving...' : 'Save Settings'}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
