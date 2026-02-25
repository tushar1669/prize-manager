import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/integrations/supabase/client";
import { ruleConfigSchema, RuleConfigForm } from "@/lib/validations";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Info } from "lucide-react";
import { AppNav } from "@/components/AppNav";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { coerceGiftItems } from "@/lib/utils";
import { useMemo } from "react";

// ── Helpers ──────────────────────────────────────────────────────────

type CategoryWithCriteria = {
  id: string;
  name: string;
  is_main: boolean | null;
  order_idx: number | null;
  criteria_json?: Record<string, unknown> | null;
};

interface EffectiveBand {
  label: string;
  min: number;
  max: number;
  maxAge: number;
  categoryCount: number;
}

function computeEffectiveBands(
  categories: CategoryWithCriteria[],
  policy: 'non_overlapping' | 'overlapping',
  inclusive: boolean
): { bands: EffectiveBand[]; hasAnyMaxAgeCategories: boolean; dualFilterCount: number; dualFilterNames: string[]; ageLimitsCategoryCount: number } {
  let dualFilterCount = 0;
  const dualFilterNames: string[] = [];

  // Groups by max_age
  const maxAgeMap = new Map<number, { names: string[]; count: number }>();

  for (const cat of categories) {
    const cj = cat.criteria_json as Record<string, unknown> | null | undefined;
    if (!cj) continue;

    const rawMax = cj.max_age;
    const rawMin = cj.min_age;
    const hasAgeRule = (typeof rawMax === 'number' && isFinite(rawMax)) || (typeof rawMin === 'number' && isFinite(rawMin));
    const allowedTypes = Array.isArray(cj.allowed_types) ? cj.allowed_types : [];

    if (hasAgeRule && allowedTypes.length > 0) {
      dualFilterCount++;
      dualFilterNames.push(cat.name);
    }

    if (typeof rawMax === 'number' && isFinite(rawMax)) {
      const existing = maxAgeMap.get(rawMax);
      if (existing) {
        existing.names.push(cat.name);
        existing.count++;
      } else {
        maxAgeMap.set(rawMax, { names: [cat.name], count: 1 });
      }
    }
  }

  const hasAnyMaxAgeCategories = maxAgeMap.size > 0;
  const ageLimitsCategoryCount = categories.filter(cat => {
    const cj2 = cat.criteria_json as Record<string, unknown> | null | undefined;
    if (!cj2) return false;
    return (typeof cj2.max_age === 'number' && isFinite(cj2.max_age)) || (typeof cj2.min_age === 'number' && isFinite(cj2.min_age));
  }).length;
  if (!hasAnyMaxAgeCategories) {
    return { bands: [], hasAnyMaxAgeCategories: false, dualFilterCount, dualFilterNames, ageLimitsCategoryCount };
  }

  const sortedMaxAges = Array.from(maxAgeMap.keys()).sort((a, b) => a - b);
  const bands: EffectiveBand[] = [];
  let prevMax = -1;

  for (const maxAge of sortedMaxAges) {
    const group = maxAgeMap.get(maxAge)!;
    const min = policy === 'overlapping' ? 0 : prevMax + 1;
    const max = inclusive ? maxAge : maxAge - 1;

    bands.push({
      label: `Under ${maxAge}`,
      min,
      max,
      maxAge,
      categoryCount: group.count,
    });

    if (policy === 'non_overlapping') {
      prevMax = inclusive ? maxAge : maxAge - 1;
    }
  }

  return { bands, hasAnyMaxAgeCategories: true, dualFilterCount, dualFilterNames, ageLimitsCategoryCount };
}

export default function Settings() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  

  const form = useForm<RuleConfigForm>({
    resolver: zodResolver(ruleConfigSchema),
    defaultValues: {
      strict_age: true,
      allow_unrated_in_rating: false,
      allow_missing_dob_for_age: false,
      max_age_inclusive: true,
      main_vs_side_priority_mode: 'main_first' as const,
      non_cash_priority_mode: 'TGM' as const,
      age_band_policy: 'non_overlapping' as const,
      multi_prize_policy: 'single' as const,
      age_cutoff_policy: 'JAN1_TOURNAMENT_YEAR' as const,
      age_cutoff_date: null
    }
  });

  // Fetch categories for display (using a separate query key to avoid cache collision
  // with TournamentSetup which includes prizes in its categories query)
  const { data: categories = [] } = useQuery({
    queryKey: ['categories-settings', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name, is_main, order_idx, criteria_json')
        .eq('tournament_id', id)
        .order('order_idx');
      
      
      
      if (error) throw error;
      return (data || []) as CategoryWithCriteria[];
    },
    enabled: !!id
  });

  // Compute effective age bands from categories
  const ageBandPolicy = form.watch('age_band_policy') || 'non_overlapping';
  const maxAgeInclusive = form.watch('max_age_inclusive') ?? true;

  const { bands: effectiveBands, hasAnyMaxAgeCategories, dualFilterCount, dualFilterNames, ageLimitsCategoryCount } = useMemo(
    () => computeEffectiveBands(categories, ageBandPolicy as 'non_overlapping' | 'overlapping', maxAgeInclusive),
    [categories, ageBandPolicy, maxAgeInclusive]
  );

  const { data: hasActiveGiftPrizes = false } = useQuery({
    queryKey: ['settings-has-gifts', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('prizes(is_active, gift_items)')
        .eq('tournament_id', id);

      if (error) throw error;
      return (data || []).some((category) =>
        (category.prizes || []).some((prize: { is_active?: boolean; gift_items?: unknown }) =>
          prize.is_active !== false && coerceGiftItems(prize.gift_items).length > 0
        )
      );
    },
    enabled: !!id,
  });
  type RuleConfigData = {
    strict_age?: boolean;
    allow_unrated_in_rating?: boolean;
    allow_missing_dob_for_age?: boolean;
    max_age_inclusive?: boolean;
    prefer_main_on_equal_value?: boolean;
    main_vs_side_priority_mode?: 'main_first' | 'place_first';
    non_cash_priority_mode?: 'TGM' | 'TMG' | 'GTM' | 'GMT' | 'MTG' | 'MGT';
    age_band_policy?: 'non_overlapping' | 'overlapping';
    multi_prize_policy?: 'single' | 'main_plus_one_side' | 'unlimited';
    age_cutoff_policy?: 'JAN1_TOURNAMENT_YEAR' | 'TOURNAMENT_START_DATE' | 'CUSTOM_DATE';
    age_cutoff_date?: string | null;
    tournament_id?: string;
  };

  // Fetch rule_config
  const { isLoading } = useQuery({
    queryKey: ['rule_config', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rule_config')
        .select('strict_age, allow_unrated_in_rating, allow_missing_dob_for_age, max_age_inclusive, prefer_main_on_equal_value, main_vs_side_priority_mode, non_cash_priority_mode, age_band_policy, multi_prize_policy, age_cutoff_policy, age_cutoff_date, tournament_id')
        .eq('tournament_id', id)
        .maybeSingle();
      
      
      
      const err = error as { code?: string; message?: string } | null;
      if (err && err.code !== 'PGRST116') {
        if (err.message?.includes('row-level security')) {
          toast.error("You don't have access to this tournament");
          navigate('/dashboard');
        }
        throw error;
      }
      
      const ruleData = data as RuleConfigData | null;
      if (ruleData) {
        const mainVsSidePriorityMode = ruleData.main_vs_side_priority_mode
          ?? (ruleData.prefer_main_on_equal_value === false ? 'place_first' : 'main_first');
        form.reset({
          strict_age: ruleData.strict_age,
          allow_unrated_in_rating: ruleData.allow_unrated_in_rating,
          allow_missing_dob_for_age: ruleData.allow_missing_dob_for_age,
          max_age_inclusive: ruleData.max_age_inclusive,
          main_vs_side_priority_mode: mainVsSidePriorityMode,
          non_cash_priority_mode: ruleData.non_cash_priority_mode || 'TGM',
          age_band_policy: ruleData.age_band_policy || 'non_overlapping',
          multi_prize_policy: ruleData.multi_prize_policy || 'single',
          age_cutoff_policy: ruleData.age_cutoff_policy || 'JAN1_TOURNAMENT_YEAR',
          age_cutoff_date: ruleData.age_cutoff_date || null
        });
      }
      return data;
    },
    enabled: !!id
  });

  // Upsert mutation
  const saveMutation = useMutation({
    mutationFn: async (values: RuleConfigForm) => {
      
      
      const { error } = await supabase
        .from('rule_config')
        .upsert({
          tournament_id: id,
          ...values,
          age_cutoff_date: values.age_cutoff_date || null,
          main_vs_side_priority_mode: values.main_vs_side_priority_mode,
          non_cash_priority_mode: values.non_cash_priority_mode,
          prefer_main_on_equal_value: values.main_vs_side_priority_mode === 'main_first',
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'tournament_id'
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rule_config', id] });
      toast.success('Settings saved successfully');
      navigate(`/t/${id}/setup?tab=prizes`);
    },
    onError: (error: unknown) => {
      const err = error as { message?: string };
      if (err.message?.includes('row-level security')) {
        toast.error("You don't have permission to update settings");
      } else {
        toast.error('Failed to save settings: ' + (err.message || 'Unknown error'));
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
                          Enforce age rules
                        </FormLabel>
                        <FormDescription className="text-sm text-muted-foreground mt-1">
                          When OFF, age limits are ignored for prize eligibility.
                        </FormDescription>
                        <p className="text-xs text-muted-foreground mt-1">
                          When ON, players without a birth date can be excluded from age categories. Use "Allow Missing DOB" below if your import has missing DOBs.
                        </p>
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
                  name="allow_missing_dob_for_age"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between py-2">
                      <div>
                        <FormLabel className="text-foreground font-medium">
                          Allow Missing DOB for Age Rules
                        </FormLabel>
                        <FormDescription className="text-sm text-muted-foreground mt-1">
                          Treat players with missing birthdates as eligible but flag them for review
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
                  name="max_age_inclusive"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between py-2">
                      <div>
                        <FormLabel className="text-foreground font-medium">
                          Inclusive Maximum Age
                        </FormLabel>
                        <FormDescription className="text-sm text-muted-foreground mt-1">
                          When enabled, players exactly at the maximum age remain eligible
                        </FormDescription>
                        {/* Explicit comparison text */}
                        <p className="text-xs text-primary font-medium mt-1">
                          {field.value 
                            ? 'Allows age == max (age ≤ max)' 
                            : 'Excludes age == max (age < max)'}
                        </p>
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
                  name="age_cutoff_policy"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground font-medium">
                        Age Eligibility Cutoff
                      </FormLabel>
                      <FormDescription className="text-sm text-muted-foreground mt-1 mb-4">
                        Choose which date is used to calculate player ages.
                      </FormDescription>
                      <FormControl>
                        <RadioGroup
                          value={field.value || 'JAN1_TOURNAMENT_YEAR'}
                          onValueChange={field.onChange}
                          className="space-y-3"
                        >
                          <div className="flex items-start space-x-3">
                            <RadioGroupItem value="JAN1_TOURNAMENT_YEAR" id="age-cutoff-jan1" className="mt-1" />
                            <div className="space-y-1">
                              <Label htmlFor="age-cutoff-jan1" className="font-medium cursor-pointer">
                                Jan 1 of tournament year (default)
                              </Label>
                              <p className="text-sm text-muted-foreground">
                                Age is computed as of January 1 in the tournament's start year.
                              </p>
                            </div>
                          </div>
                          <div className="flex items-start space-x-3">
                            <RadioGroupItem value="TOURNAMENT_START_DATE" id="age-cutoff-start" className="mt-1" />
                            <div className="space-y-1">
                              <Label htmlFor="age-cutoff-start" className="font-medium cursor-pointer">
                                Tournament start date
                              </Label>
                              <p className="text-sm text-muted-foreground">
                                Age is computed as of the tournament start date.
                              </p>
                            </div>
                          </div>
                          <div className="flex items-start space-x-3">
                            <RadioGroupItem value="CUSTOM_DATE" id="age-cutoff-custom" className="mt-1" />
                            <div className="space-y-1">
                              <Label htmlFor="age-cutoff-custom" className="font-medium cursor-pointer">
                                Custom date
                              </Label>
                              <p className="text-sm text-muted-foreground">
                                Use a specific cutoff date for age eligibility.
                              </p>
                            </div>
                          </div>
                        </RadioGroup>
                      </FormControl>
                      {/* E) How age is calculated micro-callout */}
                      <p className="text-xs text-muted-foreground mt-3">
                        Age is computed in whole years on the cutoff date (months are not considered).
                      </p>
                    </FormItem>
                  )}
                />

                {form.watch('age_cutoff_policy') === 'CUSTOM_DATE' && (
                  <FormField
                    control={form.control}
                    name="age_cutoff_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-foreground font-medium">
                          Custom Age Cutoff Date
                        </FormLabel>
                        <FormDescription className="text-sm text-muted-foreground mt-1">
                          Enter the cutoff date used to calculate ages (YYYY-MM-DD).
                        </FormDescription>
                        <FormControl>
                          <Input
                            type="date"
                            value={field.value ?? ''}
                            onChange={(event) => field.onChange(event.target.value)}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                )}



                {hasActiveGiftPrizes && (
                  <div className="space-y-4">
                    <Alert className="border-amber-300 bg-amber-50 text-amber-900">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        Gifts detected. If your intent differs, adjust ordering here.
                      </AlertDescription>
                    </Alert>

                    <FormField
                      control={form.control}
                      name="non_cash_priority_mode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-foreground font-medium">
                            Non-cash prize priority
                          </FormLabel>
                          <FormDescription className="text-sm text-muted-foreground mt-1 mb-2">
                            Used when cash amounts are equal. Components are compared lexicographically in this order.
                          </FormDescription>
                          <FormControl>
                            <Select value={field.value || 'TGM'} onValueChange={field.onChange}>
                              <SelectTrigger>
                                <SelectValue placeholder="Select non-cash priority" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="TGM">Trophy {'>'} Gift {'>'} Medal (TGM)</SelectItem>
                                <SelectItem value="TMG">Trophy {'>'} Medal {'>'} Gift (TMG)</SelectItem>
                                <SelectItem value="GTM">Gift {'>'} Trophy {'>'} Medal (GTM)</SelectItem>
                                <SelectItem value="GMT">Gift {'>'} Medal {'>'} Trophy (GMT)</SelectItem>
                                <SelectItem value="MTG">Medal {'>'} Trophy {'>'} Gift (MTG)</SelectItem>
                                <SelectItem value="MGT">Medal {'>'} Gift {'>'} Trophy (MGT)</SelectItem>
                              </SelectContent>
                            </Select>
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                <FormField
                  control={form.control}
                  name="main_vs_side_priority_mode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground font-medium">
                        Main vs Place Priority
                      </FormLabel>
                      <FormDescription className="text-sm text-muted-foreground mt-1 mb-4">
                        Decide which prize wins when cash and prize type match
                      </FormDescription>
                        <FormControl>
                          <RadioGroup
                          value={field.value || 'main_first'}
                          onValueChange={field.onChange}
                          className="space-y-3"
                        >
                          <div className="flex items-start space-x-3">
                            <RadioGroupItem value="place_first" id="priority-place-first" className="mt-1" />
                            <div className="space-y-1">
                              <Label htmlFor="priority-place-first" className="font-medium cursor-pointer">
                                Place before Main
                              </Label>
                              <p className="text-sm text-muted-foreground">
                                Keep the higher place prize when cash and prize type match.
                              </p>
                            </div>
                          </div>
                          <div className="flex items-start space-x-3">
                            <RadioGroupItem value="main_first" id="priority-main-first" className="mt-1" />
                            <div className="space-y-1">
                              <Label htmlFor="priority-main-first" className="font-medium cursor-pointer">
                                Main before Place
                              </Label>
                              <p className="text-sm text-muted-foreground">
                                Prefer the main category when cash and prize type match.
                              </p>
                            </div>
                          </div>
                        </RadioGroup>
                      </FormControl>
                    </FormItem>
                  )}
                />

                {/* C) Age Band Policy — RadioGroup instead of Switch */}
                <FormField
                  control={form.control}
                  name="age_band_policy"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground font-medium">
                        Age Band Policy
                      </FormLabel>
                      <FormDescription className="text-sm text-muted-foreground mt-1 mb-4">
                        Controls how Under-X age categories divide the age range.
                      </FormDescription>
                      <FormControl>
                        <RadioGroup
                          value={field.value || 'non_overlapping'}
                          onValueChange={field.onChange}
                          className="space-y-3"
                        >
                          <div className="flex items-start space-x-3">
                            <RadioGroupItem value="non_overlapping" id="age-band-non-overlapping" className="mt-1" />
                            <div className="space-y-1">
                              <Label htmlFor="age-band-non-overlapping" className="font-medium cursor-pointer">
                                Non-overlapping
                                <span className="ml-2 text-xs text-muted-foreground font-normal">(recommended)</span>
                              </Label>
                              <p className="text-sm text-muted-foreground">
                                Each player fits exactly one Under-X band. Best when you want one age prize per child.
                              </p>
                            </div>
                          </div>
                          <div className="flex items-start space-x-3">
                            <RadioGroupItem value="overlapping" id="age-band-overlapping" className="mt-1" />
                            <div className="space-y-1">
                              <Label htmlFor="age-band-overlapping" className="font-medium cursor-pointer">
                                Overlapping
                              </Label>
                              <p className="text-sm text-muted-foreground">
                                A player can qualify for multiple Under-X bands. Use when younger children should also compete in older bands.
                              </p>
                            </div>
                          </div>
                        </RadioGroup>
                      </FormControl>

                      {/* D) Dynamic bands or no-effect note */}
                      <div className="mt-4">
                        {hasAnyMaxAgeCategories ? (
                          <>
                            <div className="rounded-md border border-border bg-muted/50 p-3 text-sm">
                              <p className="font-medium text-foreground mb-1">
                                Age Limits used in: <strong>{ageLimitsCategoryCount} {ageLimitsCategoryCount === 1 ? 'category' : 'categories'}</strong>
                              </p>
                              <p className="font-medium text-foreground mb-2">
                                Your effective age bands ({ageBandPolicy === 'non_overlapping' ? 'non-overlapping' : 'overlapping'}):
                              </p>
                              <ul className="list-disc ml-5 space-y-0.5 text-muted-foreground">
                                {effectiveBands.map((band) => (
                                  <li key={band.maxAge}>
                                    {band.label}:{' '}
                                    {band.max < band.min ? (
                                      <span className="text-destructive">empty with current Inclusive setting</span>
                                    ) : (
                                      <span>ages {band.min}–{band.max}</span>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="mt-2"
                              onClick={() => navigate(`/t/${id}/setup?tab=prizes`)}
                            >
                              Open Prize Structure
                            </Button>
                          </>
                        ) : (
                          <div className="rounded-md border border-amber-700 bg-amber-600 text-white dark:border-amber-500 dark:bg-amber-600 p-4 text-sm space-y-2">
                            <p className="font-semibold text-base">Not used yet</p>
                            <p>
                              This setting only works when you set Age Limits (Max Age / Min Age) inside a prize category.
                            </p>
                            <p>
                              To set Age Limits: <strong>Prize Structure → Edit Rules</strong>
                            </p>
                            <p>
                              Age Limits used in: <strong>{ageLimitsCategoryCount} categories</strong>
                            </p>
                            <p className="text-white/80 text-xs">
                              Categories using Type labels (U13, F09, etc.) are <strong>not</strong> affected by this setting.
                            </p>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="mt-1 border-white/70 text-white hover:bg-amber-700 dark:hover:bg-amber-700"
                              onClick={() => navigate(`/t/${id}/setup?tab=prizes`)}
                            >
                              Open Prize Structure
                            </Button>
                          </div>
                        )}
                      </div>

                      {/* F) Dual-filter warning */}
                      <Alert className="mt-4 border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 text-amber-900 dark:text-amber-200">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle className="font-semibold">Watch out: dual filters</AlertTitle>
                        <AlertDescription>
                          If a category uses both Type labels (like U13) <strong>and</strong> Age Limits (Max/Min Age), players must match <strong>both</strong> to be eligible. This often causes unexpected exclusions.
                          {dualFilterCount > 0 && (
                            <span className="block mt-1 font-medium">
                              You currently have {dualFilterCount} {dualFilterCount === 1 ? 'category' : 'categories'} using both filters
                              {dualFilterNames.length > 0 && (
                                <>: {dualFilterNames.slice(0, 5).join(', ')}{dualFilterNames.length > 5 && `, +${dualFilterNames.length - 5} more`}</>
                              )}
                              .
                            </span>
                          )}
                        </AlertDescription>
                      </Alert>
                    </FormItem>
                  )}
                />

                <div className="border-t pt-6 mt-6">
                  <FormField
                    control={form.control}
                    name="multi_prize_policy"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-foreground font-medium text-base">
                          Prize Stacking Policy
                        </FormLabel>
                        <FormDescription className="text-sm text-muted-foreground mt-1 mb-4">
                          Controls how many prizes a single player can receive
                        </FormDescription>
                        <FormControl>
                          <RadioGroup
                            value={field.value || 'single'}
                            onValueChange={field.onChange}
                            className="space-y-3"
                          >
                            <div className="flex items-start space-x-3">
                              <RadioGroupItem value="single" id="policy-single" className="mt-1" />
                              <div className="space-y-1">
                                <Label htmlFor="policy-single" className="font-medium cursor-pointer">
                                  Strict – One prize per player
                                  <span className="ml-2 text-xs text-muted-foreground font-normal">(recommended)</span>
                                </Label>
                                <p className="text-sm text-muted-foreground">
                                  Each player receives at most one prize in this tournament. Best for maximizing distinct winners.
                                </p>
                              </div>
                            </div>
                            
                            <div className="flex items-start space-x-3">
                              <RadioGroupItem value="main_plus_one_side" id="policy-main-plus-one" className="mt-1" />
                              <div className="space-y-1">
                                <Label htmlFor="policy-main-plus-one" className="font-medium cursor-pointer">
                                  Main + one extra prize
                                </Label>
                                <p className="text-sm text-muted-foreground">
                                  A player can win one main prize plus one side prize (rating, age, best female, etc.).
                                </p>
                              </div>
                            </div>
                            
                            <div className="flex items-start space-x-3">
                              <RadioGroupItem value="unlimited" id="policy-unlimited" className="mt-1" />
                              <div className="space-y-1">
                                <Label htmlFor="policy-unlimited" className="font-medium cursor-pointer">
                                  Unlimited stacking
                                  <span className="ml-2 text-xs text-muted-foreground font-normal">(advanced)</span>
                                </Label>
                                <p className="text-sm text-muted-foreground">
                                  No cap. If a player is best in multiple categories, they can receive multiple prizes.
                                </p>
                              </div>
                            </div>
                          </RadioGroup>
                        </FormControl>
                        
                        {/* Warning for non-strict modes */}
                        {(field.value === 'main_plus_one_side' || field.value === 'unlimited') && (
                          <div className="mt-4 flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                            <span>
                              Allowing multiple prizes per player reduces the number of distinct winners. 
                              Use only when the brochure explicitly allows prize stacking.
                            </span>
                          </div>
                        )}
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            {/* G) Policy Summary — updated with Age Band Policy */}
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Tournament Policy Summary</CardTitle>
                <CardDescription>
                  Effective allocation configuration for this tournament
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  <li>Age Rules: <strong>{form.watch('strict_age') ? 'ON' : 'OFF'}</strong></li>
                  <li>Allow Missing DOB for Age: <strong>{form.watch('allow_missing_dob_for_age') ? 'ON' : 'OFF'}</strong></li>
                  <li>Inclusive Max Age: <strong>{form.watch('max_age_inclusive') ? 'ON' : 'OFF'}</strong></li>
                  <li>
                    Age Cutoff:{' '}
                    <strong>
                      {form.watch('age_cutoff_policy') === 'CUSTOM_DATE'
                        ? `Custom (${form.watch('age_cutoff_date') || 'unset'})`
                        : form.watch('age_cutoff_policy') === 'TOURNAMENT_START_DATE'
                        ? 'Tournament start date'
                        : 'Jan 1 of tournament year'}
                    </strong>
                  </li>
                  <li>
                    Age Band Policy:{' '}
                    <strong>
                      {ageBandPolicy === 'overlapping' ? 'Overlapping' : 'Non-overlapping'}
                    </strong>
                    {!hasAnyMaxAgeCategories && (
                      <span className="text-muted-foreground"> (not active — no categories have Age Limits)</span>
                    )}
                  </li>
                  {hasActiveGiftPrizes && (
                    <li>
                      Non-cash Priority:{' '}
                      <strong>{form.watch('non_cash_priority_mode')}</strong>
                    </li>
                  )}
                  <li>
                    Main vs Place Priority:{' '}
                    <strong>
                      {form.watch('main_vs_side_priority_mode') === 'main_first'
                        ? 'Main before Place'
                        : 'Place before Main'}
                    </strong>
                  </li>
                  <li>Prize Stacking: <strong>
                    {form.watch('multi_prize_policy') === 'unlimited' ? 'Unlimited' :
                     form.watch('multi_prize_policy') === 'main_plus_one_side' ? 'Main + one extra' :
                     'One prize per player'}
                  </strong></li>
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
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => {
                  if (window.history.length > 1) navigate(-1);
                  else navigate(`/t/${id}/setup?tab=prizes`);
                }}
              >
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
