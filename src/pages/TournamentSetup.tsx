import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import React from 'react';
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/integrations/supabase/client";
import { uploadFile, getSignedUrl } from "@/lib/storage";
import { tournamentDetailsSchema, TournamentDetailsForm, categorySchema, CategoryForm } from "@/lib/validations";
import { classifyTimeControl } from "@/utils/timeControl";
import { cn } from "@/lib/utils";
import { AppNav } from "@/components/AppNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RuleChip } from "@/components/ui/rule-chip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Upload, ArrowRight, X, Save } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { BackBar } from "@/components/BackBar";
import ErrorPanel from "@/components/ui/ErrorPanel";
import { useErrorPanel } from "@/hooks/useErrorPanel";
import CategoryPrizesEditor, { PrizeDelta, PrizeRow, CategoryPrizesEditorHandle, CategoryRow } from '@/components/prizes/CategoryPrizesEditor';
import { prepareCategoryPrizeUpsertRows } from '@/components/prizes/prizeDeltaUtils';
import { TournamentProgressBreadcrumbs } from '@/components/TournamentProgressBreadcrumbs';
import { useDirty } from "@/contexts/DirtyContext.shared";
import { makeKey, getDraft, setDraft, clearDraft, formatAge } from '@/utils/autosave';
import { useAutosaveEffect } from '@/hooks/useAutosaveEffect';
import { deepEqualNormalized, normalizeCriteria } from '@/utils/deepNormalize';
import { TeamPrizesEditor } from '@/components/team-prizes';
import { ensureMainCategoryExists, MAIN_CATEGORY_NAME } from "@/pages/TournamentSetup.helpers";
import { Switch } from "@/components/ui/switch";

// Flip to true only when debugging
const DEBUG = false;
const dlog = (...args: unknown[]) => { if (DEBUG) console.log(...args); };

type CriteriaJson = Record<string, unknown>;
type CriteriaCategory = {
  id?: string;
  name?: string;
  criteria_json?: CriteriaJson;
  category_type?: string | null;
};

// Helper to safely get criteria_json as CriteriaJson
const asCriteriaJson = (val: unknown): CriteriaJson => {
  if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
    return val as CriteriaJson;
  }
  return {};
};


export default function TournamentSetup() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "details";
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { error, showError, clearError } = useErrorPanel();
  const { setDirty, resetDirty, registerOnSave, sources } = useDirty();
  
  dlog('[boot] setup mount', { path: window.location.pathname, id, activeTab });

  // Compute dirty counts for tab indicators
  const detailsDirty = !!sources['details'];
  const mainPrizesDirty = !!sources['main-prizes'];
  const categoryPrizesCount = Object.keys(sources).filter(k => k.startsWith('cat-')).length;
  const prizesDirtyCount = (mainPrizesDirty ? 1 : 0) + categoryPrizesCount;
  
  const [uploading, setUploading] = useState(false);
  const [brochureSignedUrl, setBrochureSignedUrl] = useState<string | null>(null);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [criteriaSheet, setCriteriaSheet] = useState<{
    open: boolean;
    category: CriteriaCategory | null;
  }>({ open: false, category: null });
  const [savedCriteria, setSavedCriteria] = useState<{ criteria: CriteriaJson; category_type: string } | null>(null);
  const [categoryTypeSelection, setCategoryTypeSelection] = useState<string>('standard');
  // Start with empty arrays - will be populated during hydration
  const [prizes, setPrizes] = useState<Array<{place: number; cash_amount: number; has_trophy: boolean; has_medal: boolean}>>([]);
  const [initialPrizes, setInitialPrizes] = useState<Array<{place: number; cash_amount: number; has_trophy: boolean; has_medal: boolean}>>([]);
  const [copyFromCategoryId, setCopyFromCategoryId] = useState<string | null>(null);
  const [includeCriteriaOnCopy, setIncludeCriteriaOnCopy] = useState(true);
  // Prize mode toggle: 'individual' (default) vs 'team' (institution prizes)
  const [prizeMode, setPrizeMode] = useState<'individual' | 'team'>('individual');
  const [dupDialog, setDupDialog] = useState<{
    open: boolean;
    sourceId: string | null;
  }>({ open: false, sourceId: null });
  const [savingAll, setSavingAll] = useState(false);
  const editorRefs = useRef(new Map<string, React.RefObject<CategoryPrizesEditorHandle>>());
  
  // Category delete dialog state
  const [catDelete, setCatDelete] = useState<{ open: boolean; id?: string; name?: string; prizeCount?: number; confirm?: string }>({ open: false });

  // Criteria validation errors (for blocking save)
  const [criteriaErrors, setCriteriaErrors] = useState<{ ageRange?: string; ratingRange?: string }>({});
  
  // Track selected gender in criteria sheet for reactive warning
  const [criteriaGenderSelection, setCriteriaGenderSelection] = useState<string>('');
  
  // Track age input values for reactive helper text display
  const [criteriaMaxAgeInput, setCriteriaMaxAgeInput] = useState<string>('');
  const [criteriaMinAgeInput, setCriteriaMinAgeInput] = useState<string>('');
  const [criteriaMaxAgeInclusiveOverride, setCriteriaMaxAgeInclusiveOverride] = useState<boolean | null>(null);
  
  const ensuringMainCategory = useRef(false);

  // Delete category mutation (non-main only). FK CASCADE deletes prizes automatically.
  const deleteCategoryMutation = useMutation({
    mutationFn: async (categoryId: string) => {
      const { error } = await supabase.from('categories').delete().eq('id', categoryId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['categories', id] });
      toast.success('Category deleted');
      setCatDelete({ open: false });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Failed to delete category';
      console.error('[prizes] delete category error', message);
      toast.error(message);
    }
  });

  // Autosave state for Details form
  const detailsDraftKey = makeKey(`t:${id}:details`);
  const [detailsRestore, setDetailsRestore] = useState<null | { data: TournamentDetailsForm; ageMs: number }>(null);

  // Autosave key: compute only when a valid id exists (prevents "undefined" keys)
  const tid = useMemo(() => (id ? String(id).trim() : ''), [id]);
  const mainPrizesDraftKey = useMemo(() => (
    tid ? makeKey(`t:${tid}:main-prizes`) : ''
  ), [tid]);
  const [mainPrizesRestore, setMainPrizesRestore] = useState<null | { data: PrizeRow[]; ageMs: number }>(null);
  const [hasPendingDraft, setHasPendingDraft] = useState(false);

  // Helper to get/create editor refs
  const getEditorRef = useCallback((catId: string): React.RefObject<CategoryPrizesEditorHandle> => {
    if (!editorRefs.current.has(catId)) {
      editorRefs.current.set(catId, React.createRef());
    }
    return editorRefs.current.get(catId)!;
  }, []);

  // Details form
  const detailsForm = useForm<TournamentDetailsForm>({
    resolver: zodResolver(tournamentDetailsSchema),
    defaultValues: {
      title: '',
      start_date: '',
      end_date: '',
      venue: '',
      city: '',
      event_code: '',
      notes: '',
      brochure_url: '',
      chessresults_url: '',
      public_results_url: '',
      time_control_base_minutes: undefined,
      time_control_increment_seconds: undefined,
      chief_arbiter: '',
      tournament_director: '',
      entry_fee_amount: undefined,
      cash_prize_total: undefined
    }
  });

  // Category form
  const categoryForm = useForm<CategoryForm>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: '',
      is_main: false,
      criteria_json: {}
    }
  });

  // Auth & role for organizer guard
  const { user } = useAuth();
  const { isMaster } = useUserRole();

  // Fetch tournament data
  const { data: tournament, isLoading: tournamentLoading } = useQuery({
    queryKey: ['tournament', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tournaments')
        .select('id, title, start_date, end_date, venue, city, event_code, notes, brochure_url, chessresults_url, public_results_url, owner_id, status, time_control_base_minutes, time_control_increment_seconds, chief_arbiter, tournament_director, entry_fee_amount, cash_prize_total')
        .eq('id', id)
        .single();
      
      if (error) {
        if (error.message?.includes('row-level security')) {
          toast.error("You don't have access to this tournament");
          navigate('/dashboard');
        }
        throw error;
      }

      // Load signed URL for brochure if exists
      if (data.brochure_url) {
        getSignedUrl('brochures', data.brochure_url).then(({ url }) => {
          if (url) setBrochureSignedUrl(url);
        });
      }
      
      return data;
    },
    enabled: !!id && id !== 'new'
  });

  // Fetch rule_config for allocation rules display (including age settings for helper text)
  const { data: ruleConfig } = useQuery({
    queryKey: ['rule_config', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rule_config')
        .select('strict_age, allow_unrated_in_rating, multi_prize_policy, main_vs_side_priority_mode, max_age_inclusive, age_cutoff_policy, age_cutoff_date')
        .eq('tournament_id', id)
        .maybeSingle();
      
      if (error && (error as { code?: string }).code !== 'PGRST116') {
        console.error('[setup] rule_config fetch error', error);
        return null;
      }
      return data;
    },
    enabled: !!id && id !== 'new',
    staleTime: 60_000,
  });
  
  // Helper to format age cutoff description for Edit Rules sheet
  const getAgeCutoffDescription = useCallback(() => {
    const policy = (ruleConfig as { age_cutoff_policy?: string })?.age_cutoff_policy ?? 'JAN1_TOURNAMENT_YEAR';
    const customDate = (ruleConfig as { age_cutoff_date?: string })?.age_cutoff_date;
    
    if (policy === 'TOURNAMENT_START_DATE') {
      return tournament?.start_date ? `tournament start (${tournament.start_date})` : 'tournament start';
    } else if (policy === 'CUSTOM_DATE' && customDate) {
      return customDate;
    } else {
      // JAN1_TOURNAMENT_YEAR (default)
      const year = tournament?.start_date ? new Date(tournament.start_date).getFullYear() : new Date().getFullYear();
      return `Jan 1, ${year}`;
    }
  }, [ruleConfig, tournament?.start_date]);

  const lastHandledTournamentIdRef = useRef<string | null>(null);

  // Reset form only when tournament ID changes, not on every refetch
  useEffect(() => {
    if (!tournament) return;
    if (lastHandledTournamentIdRef.current === tournament.id) return;

    // Preserve prior behavior: if details are already dirty when id changes, do not reset.
    lastHandledTournamentIdRef.current = tournament.id;

    if (detailsForm.formState.isDirty) return;

    detailsForm.reset({
      title: tournament.title,
      start_date: tournament.start_date,
      end_date: tournament.end_date,
      venue: tournament.venue || '',
      city: tournament.city || '',
      event_code: tournament.event_code || '',
      notes: tournament.notes || '',
      brochure_url: tournament.brochure_url || '',
      chessresults_url: tournament.chessresults_url || '',
      public_results_url: tournament.public_results_url || '',
      time_control_base_minutes: tournament.time_control_base_minutes ?? undefined,
      time_control_increment_seconds: tournament.time_control_increment_seconds ?? undefined,
      chief_arbiter: tournament.chief_arbiter || '',
      tournament_director: tournament.tournament_director || '',
      entry_fee_amount: tournament.entry_fee_amount ?? undefined,
      cash_prize_total: tournament.cash_prize_total ?? undefined
    });
  }, [detailsForm, tournament]);

  const detailsDirtyRef = useRef(detailsForm.formState.isDirty);
  useEffect(() => {
    detailsDirtyRef.current = detailsForm.formState.isDirty;
  }, [detailsForm.formState.isDirty]);

  // Check for Details form draft on tab switch
  useEffect(() => {
    if (activeTab !== 'details' || detailsDirtyRef.current) return;
    const draft = getDraft<TournamentDetailsForm>(detailsDraftKey, 1);
    if (draft) setDetailsRestore(draft);
  }, [activeTab, detailsDraftKey]);

  // Autosave Details form while dirty
  useAutosaveEffect({
    key: detailsDraftKey,
    data: detailsForm.getValues(),
    enabled: activeTab === 'details' && detailsForm.formState.isDirty,
    debounceMs: 1200,
    version: 1,
  });

  // Check for Main Prizes draft when opening Prizes tab (only when we have a valid key)
  useEffect(() => {
    if (activeTab !== 'prizes' || !mainPrizesDraftKey || !id) return;
    
    const draft = getDraft<PrizeRow[]>(mainPrizesDraftKey, 1);
    if (draft) {
      // Show banner for manual restore (no more silent auto-restore)
      setMainPrizesRestore(draft);
      setHasPendingDraft(true);
    } else {
      setHasPendingDraft(false);
    }
  }, [activeTab, mainPrizesDraftKey, id]);

  // Track if we've hydrated prizes from DB (to guard autosave)
  const [hasHydratedPrizes, setHasHydratedPrizes] = useState(false);

  // Reset hydration state when tournament changes
  useEffect(() => {
    setHasHydratedPrizes(false);
  }, [id]);

  // Force fresh fetch and reset hydration when switching TO prizes tab
  // This handles navigation back from Import Players
  useEffect(() => {
    if (activeTab === 'prizes' && id) {
      // Invalidate categories to force fresh fetch
      queryClient.invalidateQueries({ queryKey: ['categories', id] });
      // Reset hydration ONLY if there's no pending draft the user might want to restore
      if (!hasPendingDraft) {
        setHasHydratedPrizes(false);
      }
      dlog('[prizes tab] invalidated categories, reset hydration', { hasPendingDraft });
    }
  }, [activeTab, id, queryClient, hasPendingDraft]);

  // Autosave Main Prizes while dirty (only after hydration)
  const isMainPrizesDirty = useMemo(() => {
    if (!hasHydratedPrizes) return false;
    if (!Array.isArray(prizes)) return false;
    
    // Simple comparison: has state changed from baseline?
    return JSON.stringify(prizes) !== JSON.stringify(initialPrizes);
  }, [prizes, initialPrizes, hasHydratedPrizes]);
  
  useAutosaveEffect({
    key: mainPrizesDraftKey,
    data: prizes,
    enabled: !!mainPrizesDraftKey && hasHydratedPrizes && prizes.length > 0 && activeTab === 'prizes' && isMainPrizesDirty,
    debounceMs: 1000,
    version: 1,
  });

  // Refs for debouncing setDirty calls
  const lastDetailsDirty = useRef(false);
  const lastMainPrizesDirty = useRef(false);
  const lastCriteriaSheetDirty = useRef(false);

  // Track Details form dirty state
  useEffect(() => {
    if (activeTab === 'details') {
      const isDirty = detailsForm.formState.isDirty;
      if (isDirty !== lastDetailsDirty.current) {
        lastDetailsDirty.current = isDirty;
        setDirty('details', isDirty);
      }
    }
  }, [activeTab, detailsForm.formState.isDirty, setDirty]);

  // Track Main prizes table dirty state
  useEffect(() => {
    if (activeTab === 'prizes') {
      const isDirty = JSON.stringify(prizes) !== JSON.stringify(initialPrizes);
      if (isDirty !== lastMainPrizesDirty.current) {
        lastMainPrizesDirty.current = isDirty;
        setDirty('main-prizes', isDirty);
      }
    }
  }, [activeTab, prizes, initialPrizes, setDirty]);

  // Track Add Category dialog dirty state
  useEffect(() => {
    if (categoryDialogOpen) {
      setDirty('add-category', categoryForm.formState.isDirty);
    } else {
      resetDirty('add-category');
    }
  }, [categoryDialogOpen, categoryForm.formState.isDirty, setDirty, resetDirty]);

  // Track Criteria sheet dirty state (only when draft differs from saved)
  useEffect(() => {
    if (criteriaSheet.open && criteriaSheet.category) {
      const snapshot = {
        criteria: normalizeCriteria(criteriaSheet.category.criteria_json),
        category_type: categoryTypeSelection,
      };
      const isDirty = !deepEqualNormalized(snapshot, savedCriteria);
      if (isDirty !== lastCriteriaSheetDirty.current) {
        lastCriteriaSheetDirty.current = isDirty;
        setDirty('criteria-sheet', isDirty);
      }
    } else {
      lastCriteriaSheetDirty.current = false;
      resetDirty('criteria-sheet');
    }
  }, [criteriaSheet, savedCriteria, setDirty, resetDirty, categoryTypeSelection]);

  // Initialize savedCriteria when criteria sheet opens (normalize for stable comparison)
  useEffect(() => {
    if (criteriaSheet.open && criteriaSheet.category) {
      // category_type is stored in criteria_json (not as a top-level column)
      const catCriteria = asCriteriaJson(criteriaSheet.category.criteria_json);
      const nextType = String(catCriteria?.category_type ?? 'standard');
      setCategoryTypeSelection(nextType);
      setSavedCriteria({
        criteria: normalizeCriteria(catCriteria) as CriteriaJson,
        category_type: nextType,
      });
      // Initialize gender selection for reactive warning
      const storedGender = catCriteria?.gender;
      setCriteriaGenderSelection(storedGender === 'M' ? 'M_OR_UNKNOWN' : String(storedGender ?? ''));
      // Initialize age input values for reactive helper text
      setCriteriaMaxAgeInput(String(catCriteria?.max_age ?? ''));
      setCriteriaMinAgeInput(String(catCriteria?.min_age ?? ''));
      setCriteriaMaxAgeInclusiveOverride(
        typeof catCriteria?.max_age_inclusive === 'boolean' ? catCriteria.max_age_inclusive : null
      );
    }
  }, [criteriaSheet.open, criteriaSheet.category]);

  useEffect(() => {
    if (!criteriaSheet.open) return;
    const genderEl = document.getElementById('criteria-gender') as HTMLSelectElement | null;
    if (!genderEl) return;

    if (categoryTypeSelection === 'youngest_female') {
      genderEl.value = 'F';
      setCriteriaGenderSelection('F');
    } else if (categoryTypeSelection === 'youngest_male') {
      genderEl.value = 'M_OR_UNKNOWN';
      setCriteriaGenderSelection('M_OR_UNKNOWN');
    } else if (criteriaSheet.category?.criteria_json) {
      const catCriteria = asCriteriaJson(criteriaSheet.category.criteria_json);
      const storedGender = catCriteria.gender;
      genderEl.value = storedGender === 'M' ? 'M_OR_UNKNOWN' : String(storedGender ?? '');
    } else {
      genderEl.value = '';
    }
  }, [categoryTypeSelection, criteriaSheet]);

  // Organizer guard: owner or master
  const isOrganizer = 
    (user && tournament && tournament.owner_id === user.id) || !!isMaster;

  // Fetch categories - force fresh fetch on mount to handle navigation back scenarios
  const { data: categories, isLoading: categoriesLoading } = useQuery({
    queryKey: ['categories', id],
    queryFn: async () => {
      dlog('[categories] query start', { id, tab: activeTab });
      const { data, error } = await supabase
        .from('categories')
        .select(`
          *,
          prizes (id, place, cash_amount, has_trophy, has_medal, is_active)
        `)
        .eq('tournament_id', id)
        .order('order_idx');
      
      if (error) throw error;
      return data;
    },
    enabled: !!id && activeTab === 'prizes',
    staleTime: 0, // Always consider stale to ensure fresh data on navigation
    refetchOnWindowFocus: false,
    refetchOnMount: 'always', // Force fresh fetch when returning to this page
    refetchOnReconnect: true
  });

  // Ensure Main Prize category exists for individual prize mode
  useEffect(() => {
    ensureMainCategoryExists({
      prizeMode,
      categories,
      categoriesLoading,
      tournamentId: id,
      supabaseClient: supabase,
      queryClient,
      ensuringRef: ensuringMainCategory,
    }).catch((err) => {
      if (err) {
        console.error('[prizes] failed to ensure main category', err);
      }
    });
  }, [categories, categoriesLoading, id, prizeMode, queryClient]);

  // UI-only sort for Setup page: show newest categories at top for better editing UX
  // (CategoryOrderReview still uses order_idx ASC for brochure order)
  // DETERMINISTIC: If multiple main categories exist (legacy), pick oldest by created_at
  const sortedCategories = useMemo(() => {
    if (!categories) return [];
    const mainCategories = categories.filter((c) => c.is_main);
    let mainCategory = mainCategories[0];
    if (mainCategories.length > 1) {
      // Pick oldest by created_at for consistency
      mainCategory = mainCategories.sort((a, b) => 
        new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
      )[0];
      console.warn('[TournamentSetup] Multiple main categories found, using oldest:', mainCategory.id);
    }
    const otherCategories = categories
      .filter(c => !c.is_main)
      .sort((a, b) => (b.order_idx ?? 0) - (a.order_idx ?? 0)); // DESC = newest first
    return mainCategory ? [mainCategory, ...otherCategories] : otherCategories;
  }, [categories]);

  // Hydrate main prizes from DB when categories load
  useEffect(() => {
    console.log('[setup] hydration check', { 
      tid: id,
      hasHydratedPrizes, 
      activeTab, 
      hasCategories: !!categories, 
      hasPendingDraft 
    });
    
    if (!categories || hasHydratedPrizes || activeTab !== 'prizes' || hasPendingDraft) return;
    
    // DETERMINISTIC: If multiple main categories exist (legacy), pick oldest by created_at
    const mainCats = categories.filter(c => c.is_main);
    const mainCat = mainCats.length > 1
      ? mainCats.sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime())[0]
      : mainCats[0];
    
    // Check if draft exists first
    const draft = getDraft<PrizeRow[]>(mainPrizesDraftKey, 1);
    
    if (draft) {
      // Draft exists - check if it's recent (within last 5 minutes)
      if (draft.ageMs < 300000) { // 5 minutes
        console.log('[setup] recent draft found, showing restore banner', { ageMs: draft.ageMs });
        setHasPendingDraft(true);
        setMainPrizesRestore(draft);
        setHasHydratedPrizes(true);
        return;
      } else {
        // Draft is too old, clear it
        console.log('[setup] stale draft found, clearing', { ageMs: draft.ageMs });
        clearDraft(mainPrizesDraftKey);
      }
    }
    
    // No draft or draft was cleared
    if (mainCat?.prizes && mainCat.prizes.length > 0) {
      // Load from DB
      const dbPrizes = mainCat.prizes.map(p => ({
        place: p.place,
        cash_amount: p.cash_amount,
        has_trophy: p.has_trophy,
        has_medal: p.has_medal
      }));
      
      console.log('[setup] hydrated setup from Supabase', { 
        tournamentId: id,
        categoryId: mainCat.id,
        prizeCount: dbPrizes.length 
      });
      setPrizes(dbPrizes);
      setInitialPrizes(dbPrizes);
      setHasHydratedPrizes(true);
    } else if (mainCat && (!mainCat.prizes || mainCat.prizes.length === 0)) {
      // Main category exists but has no prizes - set empty state
      console.log('[setup] main category exists with no prizes, setting empty state');
      setPrizes([]);
      setInitialPrizes([]);
      setHasHydratedPrizes(true);
    } else {
      // No main category exists - seed default single-row placeholder
      console.log('[setup] seeding default prizes for new tournament', { tournamentId: id });
      const defaultPrizes = [{ place: 1, cash_amount: 0, has_trophy: false, has_medal: false }];
      setPrizes(defaultPrizes);
      setInitialPrizes(defaultPrizes);
      setHasHydratedPrizes(true);
    }
  }, [categories, hasHydratedPrizes, activeTab, hasPendingDraft, id, mainPrizesDraftKey]);

  // Player count for conditional CTA
  const { data: playerCount = 0, isLoading: loadingPlayerCount } = useQuery({
    queryKey: ['player-count', id],
    enabled: !!id && activeTab === 'prizes',
    queryFn: async () => {
      const { count, error } = await supabase
        .from('players')
        .select('id', { head: true, count: 'exact' })
        .eq('tournament_id', id);
      if (error) throw error;
      return count ?? 0;
    },
  });

  // Gating logic: can only proceed when Main category exists in DB with prizes AND no unsaved changes
  const canProceed = useMemo(() => {
    const mainCat = categories?.find(c => c.is_main);
    const hasPrizesInDB = mainCat?.prizes && mainCat.prizes.length > 0;
    return hasPrizesInDB && !isMainPrizesDirty;
  }, [categories, isMainPrizesDirty]);

  // Update tournament mutation
  const updateTournamentMutation = useMutation({
    mutationFn: async (values: TournamentDetailsForm) => {
      console.log('[details] saving tournament', id, values);
      const { error } = await supabase
        .from('tournaments')
        .update(values)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      console.log('[details] save success');
      clearDraft(detailsDraftKey);
      resetDirty('details');
      queryClient.invalidateQueries({ queryKey: ['tournament', id] });
      toast.success('Tournament details saved');
      navigate(`/t/${id}/setup?tab=prizes`);
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[details] save error', message);
      showError({
        title: "Failed to save details",
        message,
        hint: "Please check your connection and try again."
      });
      toast.error(message || 'Failed to save');
    }
  });

  // Create category mutation
  const createCategoryMutation = useMutation({
    mutationFn: async (values: CategoryForm) => {
      // Store category_type inside criteria_json (column doesn't exist in DB yet)
      const categoryType = values.criteria_json?.category_type || values.category_type || 'standard';
      const criteriaWithType = {
        ...(values.criteria_json || {}),
        category_type: categoryType,
      };
      const { data: category, error } = await supabase
        .from('categories')
        .insert({
          tournament_id: id,
          name: values.name,
          is_main: values.is_main,
          criteria_json: criteriaWithType,
          order_idx: categories?.length || 0
        })
        .select('id, name, criteria_json, is_main, order_idx')
        .single();
      
      if (error) throw error;
      // Return with category_type extracted from criteria_json for frontend compatibility
      return { ...category, category_type: criteriaWithType.category_type };
    },
    onSuccess: async (createdCategory) => {
      try {
        if (copyFromCategoryId) {
          await copyPrizesForCategory(copyFromCategoryId, createdCategory.id);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn('[copy prizes] failed', message);
        toast.error('Category created. Failed to copy prizes.');
      } finally {
        queryClient.invalidateQueries({ queryKey: ['categories', id] });
        toast.success('Category saved');
        resetDirty('add-category');
        setCategoryDialogOpen(false);
        setIncludeCriteriaOnCopy(true);
        setCopyFromCategoryId(null);
        categoryForm.reset();
      }
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Failed to add category';
      toast.error('Failed to add category: ' + message);
    }
  });

  // Save prizes mutation (refactored to support inline save + navigate)
  const savePrizesMutation = useMutation({
    mutationFn: async ({ shouldNavigate }: { shouldNavigate?: boolean } = {}) => {
      console.log('[prizes] mutate start', { count: prizes?.length, shouldNavigate });
      
      if (!id) throw new Error('No tournament ID');
      if (!Array.isArray(prizes)) throw new Error('No prizes in state');
      
      // Filter out invalid rows with better validation
      const validPrizes = prizes.filter(
        p => p && Number.isFinite(p.place) && Number.isFinite(p.cash_amount)
      );
      
      // Prevent accidental deletion of all prizes
      if (validPrizes.length === 0) {
        throw new Error('Cannot save an empty prize list. Add at least one row or keep existing prizes.');
      }
      
      console.log('[prizes] valid prizes count', { total: prizes.length, valid: validPrizes.length });
      
      // Find main category - use oldest if multiple exist (deterministic selection)
      let mainCategoryId = categories
        ?.filter(c => c.is_main)
        ?.sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime())[0]?.id;
      
      if (!mainCategoryId) {
        const { data, error } = await supabase
          .from('categories')
          .insert({
            tournament_id: id,
            name: MAIN_CATEGORY_NAME,
            is_main: true,
            criteria_json: {},
            order_idx: 0
          })
          .select('id')
          .single();
        
        if (error) {
          // Handle unique constraint violation - main already exists, refetch
          if (error.code === '23505') {
            console.warn('[prizes] Main category already exists, refetching');
            const { data: existingCat } = await supabase
              .from('categories')
              .select('id')
              .eq('tournament_id', id)
              .eq('is_main', true)
              .single();
            if (existingCat) mainCategoryId = existingCat.id;
            else throw error;
          } else {
            throw error;
          }
        } else {
          mainCategoryId = data.id;
        }
      }

      console.log('[prizes] deleting then inserting', { mainCategoryId });
      
      // Delete existing prizes for main category
      const { error: delErr } = await supabase
        .from('prizes')
        .delete()
        .eq('category_id', mainCategoryId);
      if (delErr) throw delErr;
      
      console.log('[prizes] inserting', { rows: validPrizes.length });

      // Insert new prizes (use validPrizes)
      const prizesToInsert = validPrizes.map(p => ({
        category_id: mainCategoryId,
        place: p.place,
        cash_amount: p.cash_amount,
        has_trophy: p.has_trophy,
        has_medal: p.has_medal
      }));

      const { error, data } = await supabase
        .from('prizes')
        .insert(prizesToInsert)
        .select('id');
      
      console.log('[prizes] inserted count', { count: data?.length });
      
      if (error) throw error;
      
      return { shouldNavigate };
    },
    onSuccess: async ({ shouldNavigate }) => {
      console.log('[prizes] save ok', { count: prizes.length, shouldNavigate });
      
      // Clear draft and reset dirty state
      clearDraft(mainPrizesDraftKey);
      resetDirty('main-prizes');
      
      // Refetch categories to sync local state with DB
      await queryClient.invalidateQueries({ queryKey: ['categories', id] });
      
      // Update baseline to current prizes
      setInitialPrizes([...prizes]);
      
      toast.success(`${prizes.length} main prizes saved successfully`);
      
      if (shouldNavigate) {
        setTimeout(() => navigate(`/t/${id}/order-review`), 600);
      }
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[prizes] save main prizes error', message);
      showError({
        title: "Failed to save prizes",
        message,
        hint: "Please check your connection and try again."
      });
      toast.error(`Failed to save prizes: ${message || 'Unknown error'}`);
    }
  });

  // Toggle category active
  const toggleCategoryActive = async (categoryId: string, isActive: boolean) => {
    console.log('[prizes-cat] toggle category', { categoryId, is_active: isActive });
    const { error } = await supabase
      .from('categories')
      .update({ is_active: isActive })
      .eq('id', categoryId);
    
    if (error) {
      console.error('[prizes-cat] error', { scope: 'toggle', message: error.message });
      toast.error('Failed to update category');
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['categories', id] });
  };

  // Save category prizes mutation
  const saveCategoryPrizesMutation = useMutation({
    mutationFn: async ({ categoryId, delta }: { categoryId: string; delta: PrizeDelta }) => {
      const { validInserts, validUpdates, upsertRows } = prepareCategoryPrizeUpsertRows(categoryId, delta);

      console.log('[prizes-cat] save category', {
        categoryId,
        inserts: delta.inserts.length,
        updates: delta.updates.length,
        deletes: delta.deletes.length
      });

      console.log('[prizes-cat.preflight]', {
        categoryId,
        inserts: validInserts.length,
        updates: validUpdates.length,
        deletes: delta.deletes.length,
        filtered: (delta.inserts.length - validInserts.length) + (delta.updates.length - validUpdates.length)
      });

      // Client-side duplicate guard
      const places = [...validInserts.map(p => p.place), ...validUpdates.map(p => p.place)];
      const seen = new Set<number>(), dup = new Set<number>();
      for (const n of places) { 
        if (seen.has(n)) dup.add(n); 
        seen.add(n); 
      }
      if (dup.size) throw new Error('Each place must be unique within the category.');

      // Order: deletes first to free up place constraints
      const ops = [];
      if (delta.deletes.length) {
        ops.push(supabase.from('prizes').delete().in('id', delta.deletes).then(r => r));
      }

      if (upsertRows.length > 0) {
        ops.push(
          supabase
            .from('prizes')
            .upsert(upsertRows, { onConflict: 'category_id,place' })
            .select('id')
            .then(r => r)
        );
      }

      const results = await Promise.all(ops);
      for (const r of results) {
        if (r?.error) {
          const msg = r.error.message || 'Unknown error';
          if (String(msg).includes('prizes_category_id_place_key') || r.error.code === '23505') {
            throw new Error('Each place must be unique within the category.');
          }
          if (r.error.code === '23502' && msg.toLowerCase().includes('column "id"')) {
            throw new Error('Internal error: prize row saved without an ID (violates NOT NULL). Please contact support.');
          }
          throw new Error(msg);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', id] });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Failed to save prizes';
      console.error('[prizes-cat] error', { scope: 'category', message });
      toast.error(message);
    }
  });

  // Save criteria mutation
  const saveCriteriaMutation = useMutation({
    mutationFn: async ({
      categoryId,
      criteria,
      categoryType,
    }: {
      categoryId: string;
      criteria: CriteriaJson;
      categoryType: string;
    }) => {
      // Store category_type inside criteria_json (column doesn't exist in DB yet)
      const criteriaWithType = {
        ...criteria,
        category_type: categoryType || 'standard',
      };
      const { error } = await supabase
        .from('categories')
        .update({ criteria_json: criteriaWithType })
        .eq('id', categoryId);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      console.log('[rules] save ok', { categoryId: variables.categoryId });
      setSavedCriteria({
        criteria: normalizeCriteria(variables.criteria) as CriteriaJson,
        category_type: variables.categoryType,
      });
      queryClient.invalidateQueries({ queryKey: ['categories', id] });
      toast.info('Rules saved', { duration: 1500 });
      toast.success('Rules saved');
      resetDirty('criteria-sheet');
      setSavedCriteria(null);
      setCriteriaSheet({ open: false, category: null });
    },
    onError: (e: unknown) => {
      const message = e instanceof Error ? e.message : 'Failed to save rules';
      toast.error(message);
    },
  });

  // Save All Categories handler
  const handleSaveAllCategories = useCallback(async () => {
    clearError();
    setSavingAll(true);
    
    const nonMainCats = categories?.filter(c => !c.is_main) || [];
    if (!nonMainCats.length) {
      toast.info('No categories to save');
      setSavingAll(false);
      return;
    }

    const results: Array<{ ok: boolean; categoryId: string; categoryName: string; error?: string }> = [];
    
    for (const cat of nonMainCats) {
      const editorRef = getEditorRef(cat.id);
      if (!editorRef.current?.hasDirty()) {
        console.log('[prizes-cat] skip clean', { cat: cat.name });
        continue;
      }

      const delta = editorRef.current.computeDelta();
      if (!delta.inserts.length && !delta.updates.length && !delta.deletes.length) {
        console.log('[prizes-cat] skip empty delta', { cat: cat.name });
        continue;
      }

      try {
        console.log('[prizes-cat] saving', { 
          cat: cat.name, 
          inserts: delta.inserts.length,
          updates: delta.updates.length,
          deletes: delta.deletes.length 
        });
        
        // Reuse the existing mutation (already handles delete→update→insert + constraint errors)
        await saveCategoryPrizesMutation.mutateAsync({ categoryId: cat.id, delta });
        
        console.log('[prizes-cat] save all ok', { categoryId: cat.id });
        results.push({ ok: true, categoryId: cat.id, categoryName: cat.name });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('[prizes-cat] save all fail', { cat: cat.name, message });
        results.push({ 
          ok: false, 
          categoryId: cat.id, 
          categoryName: cat.name, 
          error: message 
        });
        continue;
      }
    }

    setSavingAll(false);

    const succeeded = results.filter(r => r.ok);
    const failed = results.filter(r => !r.ok);

    if (succeeded.length && !failed.length) {
      toast.success('All categories saved');
      for (const s of succeeded) {
        const ref = getEditorRef(s.categoryId);
        ref.current?.markSaved();
      }
      await queryClient.invalidateQueries({ queryKey: ['categories', id] });
    } else if (succeeded.length && failed.length) {
      const failedNames = failed.map(f => f.categoryName).join(', ');
      toast.warning(`Saved ${succeeded.length}, failed ${failed.length}: ${failedNames}`);
      for (const s of succeeded) {
        const ref = getEditorRef(s.categoryId);
        ref.current?.markSaved();
      }
      await queryClient.invalidateQueries({ queryKey: ['categories', id] });
      
      const errorMsg = failed.map(f => `${f.categoryName}: ${f.error}`).join('\n');
      showError({
        title: 'Some categories failed to save',
        message: errorMsg
      });
    } else if (failed.length) {
      const failedNames = failed.map(f => f.categoryName).join(', ');
      toast.error(`Failed to save: ${failedNames}`);
      
      const errorMsg = failed.map(f => `${f.categoryName}: ${f.error}`).join('\n');
      showError({
        title: 'Categories failed to save',
        message: errorMsg
      });
    }

    try {
      await queryClient.invalidateQueries({ queryKey: ['tournament', id] });
    } catch (err) {
      console.error('[prizes-cat] save all err', err);
    }
  }, [categories, showError, clearError, queryClient, id, saveCategoryPrizesMutation, getEditorRef]);

  // Keep latest values in refs so handler stays stable
  const prizesRef = useRef(prizes);
  useEffect(() => { prizesRef.current = prizes; }, [prizes]);

  const draftKeyRef = useRef(mainPrizesDraftKey);
  useEffect(() => { draftKeyRef.current = mainPrizesDraftKey; }, [mainPrizesDraftKey]);

  // Register keyboard Save (Cmd/Ctrl+S) on Prizes tab => save to DB
  const savePrizesHotkey = useCallback(async () => {
    if (!isMainPrizesDirty) return;
    dlog('[shortcut] saving main prizes to DB from keyboard');
    await savePrizesMutation.mutateAsync({ shouldNavigate: false });
  }, [isMainPrizesDirty, savePrizesMutation]);

  useEffect(() => {
    if (activeTab === 'prizes') {
      registerOnSave(savePrizesHotkey);
    } else {
      registerOnSave(null);
    }
    return () => registerOnSave(null);
  }, [activeTab, registerOnSave, savePrizesHotkey]);

  // Register Details tab save handler for Cmd/Ctrl+S
  useEffect(() => {
    if (activeTab === 'details') {
      const saveDetailsHandler = async () => {
        if (!detailsForm.formState.isDirty) return;
        console.log('[shortcut] saving details');
        const values = detailsForm.getValues();
        await updateTournamentMutation.mutateAsync(values);
      };
      registerOnSave(saveDetailsHandler);
    }
    return () => {
      if (activeTab === 'details') registerOnSave(null);
    };
  }, [activeTab, detailsForm, updateTournamentMutation, registerOnSave]);

  // Copy prizes helper
  const copyPrizesForCategory = async (sourceCategoryId: string, targetCategoryId: string) => {
    const { data: srcPrizes, error } = await supabase
      .from('prizes')
      .select('place, cash_amount, has_trophy, has_medal')
      .eq('category_id', sourceCategoryId);

    if (error) throw error;
    if (!srcPrizes || srcPrizes.length === 0) return;

    const rows = srcPrizes.map(p => ({
      category_id: targetCategoryId,
      place: p.place,
      cash_amount: p.cash_amount,
      has_trophy: p.has_trophy,
      has_medal: p.has_medal,
    }));

    const { error: insertError } = await supabase.from('prizes').insert(rows);
    if (insertError) throw insertError;
  };

  // Duplicate category helper
  const duplicateCategoryWithPrizes = async ({
    sourceId,
    newName,
  }: {
    sourceId: string;
    newName: string;
  }) => {
    // 1) Fetch source category (category_type is stored in criteria_json)
    const { data: cats, error: catError } = await supabase
      .from('categories')
      .select('id, criteria_json, name, order_idx, is_main, tournament_id')
      .eq('id', sourceId)
      .single();

    if (catError) throw catError;
    const src = cats;
    if (!src) throw new Error('Source category not found');

    // 2) Create new category with cloned criteria (excluding legacy dob_on_or_after)
    const srcCriteria = (src.criteria_json && typeof src.criteria_json === 'object' && !Array.isArray(src.criteria_json))
      ? (src.criteria_json as Record<string, unknown>)
      : ({} as Record<string, unknown>);
    const criteria = { ...srcCriteria };
    delete criteria.dob_on_or_after;
    // Preserve category_type in criteria_json
    criteria.category_type = srcCriteria.category_type || 'standard';

    const { data: created, error: createError } = await supabase
      .from('categories')
      .insert([{
        tournament_id: src.tournament_id,
        name: newName,
        is_main: false,
        criteria_json: JSON.parse(JSON.stringify(criteria)),
        order_idx: (src.order_idx ?? 0) + 1,
      }])
      .select('id')
      .single();

    if (createError) throw createError;

    // 3) Copy prizes
    await copyPrizesForCategory(sourceId, created.id);

    return created.id;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const filePath = `${id}/${Date.now()}_${file.name}`;
    const { path, error } = await uploadFile('brochures', filePath, file);
    
    if (error) {
      toast.error('Upload failed: ' + error.message);
    } else if (path) {
      detailsForm.setValue('brochure_url', path);
      // Generate signed URL for display
      const { url } = await getSignedUrl('brochures', path);
      if (url) setBrochureSignedUrl(url);
      toast.success('Brochure uploaded');
    }
    setUploading(false);
  };

  const onDetailsSubmit = (values: TournamentDetailsForm) => {
    updateTournamentMutation.mutate(values);
  };

  const onCategorySubmit = (values: CategoryForm) => {
    // Guard: Prevent creating a category with reserved "Main Prize" name
    const normalizedName = values.name.trim().toLowerCase().replace(/\s+/g, ' ');
    if (normalizedName === 'main prize') {
      toast.error('Main Prize is reserved and already exists. Add a different category name.');
      return;
    }

    // If copying from a category, optionally include criteria (controlled state)
    if (copyFromCategoryId && includeCriteriaOnCopy) {
      const source = categories?.find(c => c.id === copyFromCategoryId);
      if (source?.criteria_json && typeof source.criteria_json === 'object' && !Array.isArray(source.criteria_json)) {
        values.criteria_json = { ...(source.criteria_json as Record<string, unknown>) };
      }
    }
    
    createCategoryMutation.mutate(values);
  };

  const handleAddPrize = () => {
    setPrizes([...prizes, { place: prizes.length + 1, cash_amount: 0, has_trophy: false, has_medal: false }]);
  };

  const handleRemovePrize = (index: number) => {
    const newPrizes = prizes.filter((_, i) => i !== index);
    // Renumber places
    setPrizes(newPrizes.map((p, i) => ({ ...p, place: i + 1 })));
  };

  const handleCancel = () => {
    navigate("/dashboard");
  };

  if (tournamentLoading) {
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
      <BackBar label="Back to Dashboard" to="/dashboard" />
      <AppNav />
      
      <div className="container mx-auto px-6 py-8">
        <TournamentProgressBreadcrumbs />
        
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Tournament Setup</h1>
          <p className="text-muted-foreground">Configure your tournament details and prize structure</p>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => navigate(`/t/${id}/setup?tab=${v}`)}>
          <TabsList className="mb-6">
            <TabsTrigger value="details">
              Details{detailsDirty && <span className="ml-1 text-amber-500">•</span>}
            </TabsTrigger>
            <TabsTrigger value="prizes">
              Prize Structure{prizesDirtyCount > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center h-5 min-w-[1.25rem] px-1 text-xs font-medium rounded-full bg-amber-100 text-amber-700">
                  {prizesDirtyCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-6">
            {detailsRestore && activeTab === 'details' && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    A saved draft from <strong>{formatAge(detailsRestore.ageMs)}</strong> is available.
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        detailsForm.reset(detailsRestore.data);
                        setDetailsRestore(null);
                      }}
                    >
                      Restore draft
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        clearDraft(detailsDraftKey);
                        setDetailsRestore(null);
                      }}
                    >
                      Discard
                    </Button>
                  </div>
                </div>
              </div>
            )}
            <Form {...detailsForm}>
              <form onSubmit={detailsForm.handleSubmit(onDetailsSubmit)} className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Tournament Information</CardTitle>
                    <CardDescription>Basic details about your tournament</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <FormField
                      control={detailsForm.control}
                      name="title"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Tournament Title <span className="text-destructive">*</span>
                          </FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., National Chess Championship 2024" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={detailsForm.control}
                        name="start_date"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              Start Date <span className="text-destructive">*</span>
                            </FormLabel>
                            <FormControl>
                              <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={detailsForm.control}
                        name="end_date"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              End Date <span className="text-destructive">*</span>
                            </FormLabel>
                            <FormControl>
                              <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={detailsForm.control}
                        name="venue"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Venue</FormLabel>
                            <FormControl>
                              <Input placeholder="Tournament venue" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={detailsForm.control}
                        name="city"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>City</FormLabel>
                            <FormControl>
                              <Input placeholder="City name" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={detailsForm.control}
                      name="event_code"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Event Code</FormLabel>
                          <FormControl>
                            <Input placeholder="Optional event identifier" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Time Control with FIDE Badge */}
                    <div className="space-y-4 p-4 border border-border rounded-lg bg-muted/30">
                      <div className="flex items-center gap-2">
                        <Label className="text-base font-semibold">Time Control</Label>
                        {(() => {
                          const baseMin = detailsForm.watch('time_control_base_minutes');
                          const incSec = detailsForm.watch('time_control_increment_seconds');
                          const category = classifyTimeControl(baseMin, incSec);
                          
                          if (category === 'UNKNOWN') return null;
                          
                          const variantMap = {
                            'BLITZ': 'destructive' as const,
                            'RAPID': 'default' as const,
                            'CLASSICAL': 'secondary' as const
                          };
                          
                          return (
                            <Badge variant={variantMap[category]} className="text-xs">
                              {category}
                            </Badge>
                          );
                        })()}
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={detailsForm.control}
                          name="time_control_base_minutes"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Base time (minutes)</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min="0"
                                  placeholder="e.g., 5, 15, 90"
                                  {...field}
                                  value={field.value ?? ''}
                                  onChange={e => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={detailsForm.control}
                          name="time_control_increment_seconds"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Increment (seconds per move)</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min="0"
                                  placeholder="e.g., 3, 10, 30"
                                  {...field}
                                  value={field.value ?? ''}
                                  onChange={e => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Example: 5 + 3 means 5 minutes base + 3 seconds per move
                      </p>
                    </div>

                    {/* Organizer Information */}
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={detailsForm.control}
                        name="chief_arbiter"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Chief Arbiter</FormLabel>
                            <FormControl>
                              <Input placeholder="Name of chief arbiter" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={detailsForm.control}
                        name="tournament_director"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Tournament Director</FormLabel>
                            <FormControl>
                              <Input placeholder="Name of tournament director" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Financial Information */}
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={detailsForm.control}
                        name="entry_fee_amount"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Entry Fee</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="e.g., 500"
                                {...field}
                                value={field.value ?? ''}
                                onChange={e => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                              />
                            </FormControl>
                            <FormDescription className="text-xs">
                              Entry fee per player in tournament currency
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={detailsForm.control}
                        name="cash_prize_total"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Total Cash Prize</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="e.g., 50000"
                                {...field}
                                value={field.value ?? ''}
                                onChange={e => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                              />
                            </FormControl>
                            <FormDescription className="text-xs">
                              Sum of all cash prizes (approx, for reference)
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={detailsForm.control}
                      name="notes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Notes</FormLabel>
                          <FormControl>
                            <Textarea placeholder="Additional information..." rows={4} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="space-y-2">
                      <Label>Tournament Brochure</Label>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,.pdf"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                      <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary transition-colors cursor-pointer"
                      >
                        {uploading ? (
                          <div className="flex items-center justify-center gap-2">
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
                            <span className="text-sm text-muted-foreground">Uploading...</span>
                          </div>
                        ) : brochureSignedUrl ? (
                          <div>
                            <p className="text-sm text-foreground mb-2">✓ Brochure uploaded</p>
                            <p className="text-xs text-muted-foreground">Click to replace</p>
                          </div>
                        ) : (
                          <>
                            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                            <p className="text-sm text-muted-foreground">Click to upload or drag and drop</p>
                            <p className="text-xs text-muted-foreground mt-1">PNG, JPG, PDF up to 10MB</p>
                          </>
                        )}
                      </div>
                    </div>

                    <FormField
                      control={detailsForm.control}
                      name="chessresults_url"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>ChessResults URL (optional)</FormLabel>
                          <FormControl>
                            <Input placeholder="https://chess-results.com/..." {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={detailsForm.control}
                      name="public_results_url"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>External Final Results URL (optional)</FormLabel>
                          <FormControl>
                            <Input placeholder="https://example.com/final-results" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                <div className="flex justify-between">
                  <Button type="button" variant="outline" onClick={handleCancel}>Cancel</Button>
                  <Button type="submit" disabled={updateTournamentMutation.isPending} className="gap-2">
                    {updateTournamentMutation.isPending ? 'Saving...' : 'Save & Continue'}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </form>
            </Form>
          </TabsContent>

          <TabsContent value="prizes" className="space-y-6">
            {/* Prize Mode Toggle */}
            <div className="flex items-center gap-4 p-4 rounded-lg border bg-muted/30">
              <span className="text-sm font-medium">Prize Mode:</span>
              <div className="flex rounded-lg border p-1 bg-background">
                <button
                  type="button"
                  className={cn(
                    "px-4 py-1.5 text-sm rounded-md transition-colors",
                    prizeMode === 'individual' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                  )}
                  onClick={() => setPrizeMode('individual')}
                >
                  Individual Prizes
                </button>
                <button
                  type="button"
                  className={cn(
                    "px-4 py-1.5 text-sm rounded-md transition-colors",
                    prizeMode === 'team' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                  )}
                  onClick={() => setPrizeMode('team')}
                >
                  Team / Institution Prizes
                </button>
              </div>
            </div>

            {prizeMode === 'team' ? (
              <TeamPrizesEditor tournamentId={id || ''} isOrganizer={isOrganizer} />
            ) : (
              <>
                {mainPrizesRestore && activeTab === 'prizes' && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        A saved draft for main prizes from <strong>{formatAge(mainPrizesRestore.ageMs)}</strong> is available.
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            dlog('[draft] restoring draft', { count: mainPrizesRestore.data?.length });
                            setPrizes(mainPrizesRestore.data || []);
                            setInitialPrizes(mainPrizesRestore.data || []);
                            setMainPrizesRestore(null);
                            setHasPendingDraft(false);
                            setHasHydratedPrizes(true);
                          }}
                        >
                          Restore draft
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            dlog('[draft] discarding draft');
                            clearDraft(mainPrizesDraftKey);
                            setMainPrizesRestore(null);
                            setHasPendingDraft(false);
                          }}
                        >
                          Discard
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Category Prizes</CardTitle>
                        <CardDescription>Age, rating, and special categories</CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        {isOrganizer && (
                          <>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              disabled={savingAll || !categories?.some(c => !c.is_main)}
                              onClick={handleSaveAllCategories}
                              title="Saves all edited category prizes in one go"
                            >
                              {savingAll ? (
                                <>
                                  <svg className="h-4 w-4 mr-2 animate-spin" viewBox="0 0 24 24" fill="none">
                                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity="0.25"/>
                                    <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="4" opacity="0.75"/>
                                  </svg>
                                  Saving All…
                                </>
                              ) : (
                                <>
                                  <Save className="h-4 w-4 mr-2" />
                                  {(() => {
                                    const dirtyCount = Array.from(editorRefs.current.values())
                                      .filter(ref => ref.current?.hasDirty())
                                      .length;
                                    return dirtyCount > 0 
                                      ? `Save All Categories (${dirtyCount})` 
                                      : 'Save All Categories';
                                  })()}
                                </>
                              )}
                            </Button>
                            <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
                              <DialogTrigger asChild>
                                <Button size="sm" variant="outline" className="gap-2">
                                  <Plus className="h-4 w-4" />
                                  Add Category
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Add Category</DialogTitle>
                                  <DialogDescription>Create a new prize category</DialogDescription>
                                </DialogHeader>
                                <Form {...categoryForm}>
                                  <form onSubmit={categoryForm.handleSubmit(onCategorySubmit)} className="space-y-4">
                                    <FormField
                                      control={categoryForm.control}
                                      name="name"
                                      render={({ field }) => (
                                        <FormItem>
                                          <FormLabel>Category Name</FormLabel>
                                          <FormControl>
                                            <Input placeholder="e.g., Under 13, Female, U1800" {...field} />
                                          </FormControl>
                                          <FormMessage />
                                        </FormItem>
                                      )}
                                    />
                                    <div>
                                      <Label htmlFor="copy-from">Copy prize structure from</Label>
                                      <select
                                        id="copy-from"
                                        className="border border-zinc-700 bg-zinc-800 text-zinc-100 rounded px-2 py-1 w-full mt-2"
                                        value={copyFromCategoryId || ''}
                                        onChange={(e) => setCopyFromCategoryId(e.target.value || null)}
                                      >
                                        <option value="">Do not copy</option>
                                        {Array.isArray(categories) &&
                                          categories.map((c) => (
                                            <option key={c.id} value={c.id}>
                                              {c.name} ({c.prizes?.length || 0} prizes)
                                            </option>
                                          ))}
                                      </select>
                                      <p className="text-xs text-muted-foreground mt-1">
                                        Optional. Saves time when multiple categories share the same prize structure.
                                      </p>
                                      {copyFromCategoryId && (
                                        <div className="flex items-center gap-2 mt-3">
                                          <Checkbox 
                                            checked={includeCriteriaOnCopy}
                                            onCheckedChange={(checked) => setIncludeCriteriaOnCopy(!!checked)}
                                          />
                                          <Label htmlFor="copy-criteria-checkbox">
                                            Include Rules (criteria)
                                          </Label>
                                        </div>
                                      )}
                                    </div>
                                    <DialogFooter>
                                      <Button type="submit" disabled={createCategoryMutation.isPending}>
                                        {createCategoryMutation.isPending ? 'Adding...' : 'Add Category'}
                                      </Button>
                                    </DialogFooter>
                                  </form>
                                </Form>
                              </DialogContent>
                            </Dialog>
                          </>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {categoriesLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                      </div>
                    ) : categories && categories.length > 0 ? (
                      <div className="space-y-4">
                        {sortedCategories.map((cat) => (
                          <div key={cat.id} data-category-id={cat.id}>
                            <CategoryPrizesEditor
                              ref={getEditorRef(cat.id)}
                              category={{ ...cat, criteria_json: asCriteriaJson(cat.criteria_json) }}
                              onEditRules={(category) => setCriteriaSheet({ open: true, category: category as CriteriaCategory })}
                              onSave={(categoryId, delta) => 
                                saveCategoryPrizesMutation.mutateAsync({ categoryId, delta })
                              }
                              onToggleCategory={toggleCategoryActive}
                              isOrganizer={isOrganizer}
                              onDeleteCategory={(category) => {
                                setCatDelete({ 
                                  open: true, 
                                  id: category.id, 
                                  name: category.name, 
                                  prizeCount: category.prizes?.length ?? 0 
                                });
                              }}
                              onDuplicateCategory={(category) => {
                                setDupDialog({ open: true, sourceId: category.id });
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-center text-muted-foreground py-8">
                        No categories added yet
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Allocation Rules</CardTitle>
                        <CardDescription>Default rules for prize allocation</CardDescription>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate(`/t/${id}/settings`)}
                      >
                        Edit Rules
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {ruleConfig ? (
                      <div className="flex flex-wrap gap-2">
                        <RuleChip icon="lock" locked>
                          {ruleConfig.multi_prize_policy === 'single' ? 'One-Prize Rule' 
                            : ruleConfig.multi_prize_policy === 'main_plus_one_side' ? 'Main+1 Side'
                            : 'Unlimited Prizes'}
                        </RuleChip>
                        <RuleChip icon="trend">
                          {ruleConfig.main_vs_side_priority_mode === 'main_first' ? 'Main Priority' : 'Place Priority'}
                        </RuleChip>
                        <RuleChip icon="alert">
                          Age Rules: {ruleConfig.strict_age ? 'ON' : 'OFF'}
                        </RuleChip>
                        <RuleChip>
                          Unrated in Rating: {ruleConfig.allow_unrated_in_rating ? 'ON' : 'OFF'}
                        </RuleChip>
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">Not configured</div>
                    )}
                  </CardContent>
                </Card>

                <div className="flex justify-between">
                  <Button variant="outline" onClick={handleCancel}>Cancel</Button>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => navigate(`/t/${id}/order-review`)}
                    >
                      Review Category Order
                    </Button>
                    <Button
                      onClick={() => {
                        console.log('[nav] next clicked', { playerCount, canProceed });
                        if (playerCount > 0) {
                          navigate(`/t/${id}/review`);
                        } else {
                          navigate(`/t/${id}/import`);
                        }
                      }}
                      disabled={loadingPlayerCount || !canProceed}
                      className="gap-2"
                      title={!canProceed ? "Please save main prizes before continuing" : undefined}
                    >
                      {loadingPlayerCount
                        ? '...'
                        : playerCount > 0
                          ? 'Next: Review & Allocate'
                          : 'Next: Import Players'}
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Duplicate Category Dialog */}
      <Dialog 
        open={dupDialog.open} 
        onOpenChange={(open) => setDupDialog({ open, sourceId: dupDialog.sourceId })}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duplicate Category</DialogTitle>
            <DialogDescription>
              Clone rules & prizes from "{categories?.find(c => c.id === dupDialog.sourceId)?.name}" into a new category.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label htmlFor="dup-new-name">New Category Name</Label>
              <Input id="dup-new-name" placeholder="e.g., U-9 Girls" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDupDialog({ open: false, sourceId: null })}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                try {
                  const name = (document.getElementById('dup-new-name') as HTMLInputElement)?.value?.trim();
                  if (!dupDialog.sourceId) throw new Error('Source missing');
                  if (!name) { toast.error('Please enter a name'); return; }

                  await duplicateCategoryWithPrizes({
                    sourceId: dupDialog.sourceId,
                    newName: name,
                  });
                  toast.success('Category duplicated');
                  setDupDialog({ open: false, sourceId: null });
                  queryClient.invalidateQueries({ queryKey: ['categories', id] });
                } catch (e: unknown) {
                  const message = e instanceof Error ? e.message : 'Failed to duplicate';
                  console.error('[duplicate]', message);
                  toast.error(message);
                }
              }}
            >
              Duplicate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Criteria Editor Sheet */}
      <Sheet
        open={criteriaSheet.open}
        onOpenChange={(open) => {
          setCriteriaSheet({ open, category: criteriaSheet.category });
          // Clear validation errors when closing sheet
          if (!open) setCriteriaErrors({});
        }}
      >
        {/* Key forces re-render when category changes, ensuring defaultChecked/defaultValue are applied fresh */}
        <SheetContent key={criteriaSheet.category?.id || 'new'} className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              Edit Rules: {criteriaSheet.category?.name}
            </SheetTitle>
            <SheetDescription>
              Define eligibility criteria for this category
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-6 py-6">
            {/* Preset Chips */}
            <div className="border-b pb-4 mb-4">
              <Label className="mb-2 block">Quick Presets</Label>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-zinc-800 text-zinc-100 border-zinc-700 hover:bg-zinc-700"
                  onClick={() => {
                    const el = document.getElementById('criteria-gender') as HTMLSelectElement;
                    if (el) el.value = 'F';
                  }}
                >
                  Girls Only
                </Button>
                <Button 
                  variant="outline"
                  size="sm"
                  className="bg-zinc-800 text-zinc-100 border-zinc-700 hover:bg-zinc-700"
                  onClick={() => {
                    const el = document.getElementById('criteria-gender') as HTMLSelectElement;
                    if (el) el.value = 'M_OR_UNKNOWN';
                  }}
                >
                  Boys (not F)
                </Button>
                <Button 
                  variant="outline"
                  size="sm"
                  className="bg-zinc-800 text-zinc-100 border-zinc-700 hover:bg-zinc-700"
                  onClick={() => {
                    const el = document.getElementById('criteria-gender') as HTMLSelectElement;
                    if (el) el.value = '';
                  }}
                >
                  Any Gender
                </Button>
                <Button 
                  variant="outline"
                  size="sm"
                  className="bg-zinc-800 text-zinc-100 border-zinc-700 hover:bg-zinc-700"
                  onClick={() => {
                    const el = document.getElementById('criteria-include-unrated') as HTMLInputElement;
                    if (el) el.checked = true;
                  }}
                >
                  Include Unrated
                </Button>
                <Button 
                  variant="outline"
                  size="sm"
                  className="bg-zinc-800 text-zinc-100 border-zinc-700 hover:bg-zinc-700"
                  onClick={() => {
                    const el = document.getElementById('criteria-include-unrated') as HTMLInputElement;
                    if (el) el.checked = false;
                  }}
                >
                  Exclude Unrated
                </Button>
                <Button 
                  variant="outline"
                  size="sm"
                  className="bg-zinc-800 text-zinc-100 border-zinc-700 hover:bg-zinc-700"
                  onClick={() => {
                    const el = document.getElementById('criteria-max-age') as HTMLInputElement;
                    if (el) el.value = '9';
                    setCriteriaMaxAgeInput('9');
                  }}
                >
                  U-9
                </Button>
                <Button 
                  variant="secondary" 
                  size="sm" 
                  onClick={() => {
                    const el = document.getElementById('criteria-max-age') as HTMLInputElement;
                    if (el) el.value = '11';
                    setCriteriaMaxAgeInput('11');
                  }}
                >
                  U-11
                </Button>
                <Button 
                  variant="secondary" 
                  size="sm" 
                  onClick={() => {
                    const el = document.getElementById('criteria-max-age') as HTMLInputElement;
                    if (el) el.value = '13';
                    setCriteriaMaxAgeInput('13');
                  }}
                >
                  U-13
                </Button>
                <Button 
                  variant="secondary" 
                  size="sm" 
                  onClick={() => {
                    const el = document.getElementById('criteria-min-age') as HTMLInputElement;
                    if (el) el.value = '60';
                    setCriteriaMinAgeInput('60');
                  }}
                >
                  Veteran 60+
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Click a preset to quickly fill fields. You can adjust values after clicking.
              </p>
            </div>

            {/* Age Range */}
            {(() => {
              const criteria = asCriteriaJson(criteriaSheet.category?.criteria_json) as {
                max_age?: number | string;
                min_age?: number | string;
                unrated_only?: boolean;
                min_rating?: number | string;
                max_rating?: number | string;
                include_unrated?: boolean;
                gender?: string;
                allowed_disabilities?: string[];
                allowed_cities?: string[];
                allowed_clubs?: string[];
                allowed_states?: string[];
                allowed_groups?: string[];
                allowed_types?: string[];
                max_age_inclusive?: boolean;
              };
              const youngestCategory = categoryTypeSelection === 'youngest_female' || categoryTypeSelection === 'youngest_male';
              const maxAgeOverrideActive = criteriaMaxAgeInclusiveOverride != null;
              const effectiveMaxAgeInclusive = criteriaMaxAgeInclusiveOverride ?? ((ruleConfig as { max_age_inclusive?: boolean })?.max_age_inclusive ?? true);
              const effectiveMaxAgeSymbol = effectiveMaxAgeInclusive ? '≤' : '<';
              const maxAgeSourceLabel = maxAgeOverrideActive ? 'category override' : 'tournament default';
              return (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="criteria-max-age">Max Age (for Under-X categories)</Label>
                      <Input
                        id="criteria-max-age"
                        type="number"
                        min="0"
                        defaultValue={criteria?.max_age ?? ''}
                        placeholder="e.g., 9, 11, 13"
                        disabled={youngestCategory}
                        className={criteriaErrors.ageRange ? 'border-destructive' : ''}
                        onChange={(e) => {
                          setCriteriaErrors(prev => ({ ...prev, ageRange: undefined }));
                          setCriteriaMaxAgeInput(e.target.value);
                        }}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        For "Under X" categories. E.g., U-9 = max age 9.
                      </p>
                      {/* Dynamic helper showing age comparison rule */}
                      {criteriaMaxAgeInput && (
                        <p className="text-xs text-primary mt-1 font-medium">
                          Meaning: age {effectiveMaxAgeSymbol} {criteriaMaxAgeInput} on {getAgeCutoffDescription()} ({maxAgeSourceLabel})
                        </p>
                      )}
                      {!youngestCategory && (
                        <div className="mt-3 rounded-md border border-zinc-700/60 bg-zinc-900/40 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <Label htmlFor="criteria-max-age-inclusive">Include players exactly at max age</Label>
                              <p className="text-xs text-muted-foreground mt-1">
                                ON = age ≤ max, OFF = age &lt; max
                              </p>
                            </div>
                            <Switch
                              id="criteria-max-age-inclusive"
                              checked={effectiveMaxAgeInclusive}
                              onCheckedChange={(checked) => {
                                setCriteriaMaxAgeInclusiveOverride(checked);
                              }}
                            />
                          </div>
                          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs text-muted-foreground">
                              Effective: age {effectiveMaxAgeSymbol} max on {getAgeCutoffDescription()} ({maxAgeSourceLabel})
                            </p>
                            {maxAgeOverrideActive && (
                              <Button
                                type="button"
                                variant="link"
                                className="h-auto px-0 text-xs"
                                onClick={() => setCriteriaMaxAgeInclusiveOverride(null)}
                              >
                                Use tournament default
                              </Button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="criteria-min-age">Min Age (for Veteran/Senior)</Label>
                      <Input
                        id="criteria-min-age"
                        type="number"
                        min="0"
                        defaultValue={criteria?.min_age ?? ''}
                        placeholder="e.g., 60"
                        disabled={youngestCategory}
                        className={criteriaErrors.ageRange ? 'border-destructive' : ''}
                        onChange={(e) => {
                          setCriteriaErrors(prev => ({ ...prev, ageRange: undefined }));
                          setCriteriaMinAgeInput(e.target.value);
                        }}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        For "60+ Veteran" categories. Leave empty for no minimum.
                      </p>
                      {/* Dynamic helper showing age comparison rule */}
                      {criteriaMinAgeInput && (
                        <p className="text-xs text-primary mt-1 font-medium">
                          Meaning: age ≥ {criteriaMinAgeInput} on {getAgeCutoffDescription()}
                        </p>
                      )}
                    </div>
                  </div>
                  {criteriaErrors.ageRange && (
                    <p className="text-sm text-destructive font-medium">{criteriaErrors.ageRange}</p>
                  )}

                  {/* Unrated-only Category */}
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="criteria-unrated-only"
                        defaultChecked={criteria?.unrated_only ?? false}
                        disabled={youngestCategory}
                        onCheckedChange={(checked) => {
                          // When toggled, we need to update dependent fields visually
                          const minRatingEl = document.getElementById('criteria-min-rating') as HTMLInputElement;
                          const maxRatingEl = document.getElementById('criteria-max-rating') as HTMLInputElement;
                          const includeUnratedEl = document.getElementById('criteria-include-unrated');
                          
                          if (checked) {
                            // Disable rating inputs when unrated-only is checked
                            if (minRatingEl) minRatingEl.disabled = true;
                            if (maxRatingEl) maxRatingEl.disabled = true;
                            // Force include_unrated checkbox to checked and disabled
                            if (includeUnratedEl) {
                              includeUnratedEl.setAttribute('data-state', 'checked');
                              includeUnratedEl.setAttribute('aria-disabled', 'true');
                              includeUnratedEl.classList.add('opacity-50', 'cursor-not-allowed');
                            }
                          } else {
                            // Re-enable rating inputs
                            if (minRatingEl) minRatingEl.disabled = false;
                            if (maxRatingEl) maxRatingEl.disabled = false;
                            // Re-enable include_unrated checkbox
                            if (includeUnratedEl) {
                              includeUnratedEl.removeAttribute('aria-disabled');
                              includeUnratedEl.classList.remove('opacity-50', 'cursor-not-allowed');
                            }
                          }
                        }}
                      />
                      <Label htmlFor="criteria-unrated-only">
                        Unrated-only category
                      </Label>
                    </div>
                    <p className="text-xs text-muted-foreground ml-6">
                      Only players without a rating are eligible. All rated players are excluded.
                    </p>
                  </div>

                  {/* Rating Range */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="criteria-min-rating">Min Rating</Label>
                      <Input
                        id="criteria-min-rating"
                        type="number"
                        min="0"
                        defaultValue={criteria?.min_rating ?? ''}
                        placeholder="e.g., 1200"
                        disabled={criteria?.unrated_only === true || youngestCategory}
                        className={cn(
                          criteria?.unrated_only === true || youngestCategory ? 'opacity-50' : '',
                          criteriaErrors.ratingRange ? 'border-destructive' : ''
                        )}
                        onChange={() => setCriteriaErrors(prev => ({ ...prev, ratingRange: undefined }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="criteria-max-rating">Max Rating</Label>
                      <Input
                        id="criteria-max-rating"
                        type="number"
                        min="0"
                        defaultValue={criteria?.max_rating ?? ''}
                        placeholder="e.g., 1800"
                        disabled={criteria?.unrated_only === true || youngestCategory}
                        className={cn(
                          criteria?.unrated_only === true || youngestCategory ? 'opacity-50' : '',
                          criteriaErrors.ratingRange ? 'border-destructive' : ''
                        )}
                        onChange={() => setCriteriaErrors(prev => ({ ...prev, ratingRange: undefined }))}
                      />
                    </div>
                  </div>
                  {criteriaErrors.ratingRange && (
                    <p className="text-sm text-destructive font-medium">{criteriaErrors.ratingRange}</p>
                  )}
                  {criteria?.unrated_only && (
                    <p className="text-xs text-amber-500">
                      Rating range is ignored when "Unrated-only" is enabled.
                    </p>
                  )}

                  {/* Include Unrated */}
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="criteria-include-unrated"
                      defaultChecked={criteria?.unrated_only === true ? true : (criteria?.include_unrated ?? true)}
                      disabled={criteria?.unrated_only === true || youngestCategory}
                      className={criteria?.unrated_only === true || youngestCategory ? 'opacity-50 cursor-not-allowed' : ''}
                    />
                    <Label 
                      htmlFor="criteria-include-unrated"
                      className={criteria?.unrated_only === true || youngestCategory ? 'opacity-50' : ''}
                    >
                      Include unrated players
                    </Label>
                  </div>
                  {criteria?.unrated_only && (
                    <p className="text-xs text-muted-foreground ml-6">
                      This is implied when "Unrated-only" is enabled.
                    </p>
                  )}

                  {/* Gender Filter */}
                  <div>
                    <Label htmlFor="criteria-gender">Gender</Label>
                    <select 
                      id="criteria-gender" 
                      className="border border-zinc-700 bg-zinc-800 text-zinc-100 rounded px-2 py-1 w-full mt-2"
                      defaultValue={
                        // Normalize legacy 'M' to 'M_OR_UNKNOWN' for display
                        criteria?.gender === 'M' ? 'M_OR_UNKNOWN' : (criteria?.gender || '')
                      }
                      disabled={youngestCategory}
                      onChange={(e) => setCriteriaGenderSelection(e.target.value)}
                    >
                      <option value="">Any – No gender restriction</option>
                      <option value="F">Girls Only – Requires explicit F</option>
                      <option value="M_OR_UNKNOWN">Boys (not F) – M or unknown</option>
                    </select>
                    <div className="text-xs text-muted-foreground mt-2 space-y-1">
                      <p><strong>Any:</strong> Both boys and girls can win this prize.</p>
                      <p><strong>Girls Only:</strong> Only players marked as Female (F) are eligible. Players with missing or unknown gender are excluded.</p>
                      <p><strong>Boys (not F):</strong> Excludes players marked as Female. Male players and those with missing/unknown gender are treated as eligible.</p>
                    </div>
                    {/* Gender warning for Girls Only */}
                    {criteriaGenderSelection === 'F' && (
                      <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        <strong>Reminder:</strong> Ensure your player import file has female players marked with gender=F. 
                        Otherwise these prizes will stay unfilled.
                      </div>
                    )}
                  </div>

                  {/* Disability Types */}
                  <div>
                    <Label htmlFor="criteria-disability">Disability Types (comma-separated)</Label>
                    <Input
                      id="criteria-disability"
                      placeholder="e.g., PC, Hearing, Visual"
                      defaultValue={criteria?.allowed_disabilities?.join(', ')}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Uses the disability field. "PC" is auto-detected from Swiss-Manager Gr column.
                    </p>
                  </div>

                  {/* Allowed Cities */}
                  <div>
                    <Label htmlFor="criteria-cities">Allowed Cities (comma-separated)</Label>
                    <Input
                      id="criteria-cities"
                      placeholder="e.g., Mumbai, Bengaluru, Delhi"
                      defaultValue={criteria?.allowed_cities?.join(', ')}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Leave empty to allow all cities
                    </p>
                  </div>

                  {/* Allowed Clubs */}
                  <div>
                    <Label htmlFor="criteria-clubs">Allowed Clubs (comma-separated)</Label>
                    <Input
                      id="criteria-clubs"
                      placeholder="e.g., Mumbai Chess Club, Karnataka CA"
                      defaultValue={criteria?.allowed_clubs?.join(', ')}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Leave empty to allow all clubs
                    </p>
                  </div>

                  {/* Allowed States */}
                  <div>
                    <Label htmlFor="criteria-states">Allowed States (comma-separated)</Label>
                    <Input
                      id="criteria-states"
                      placeholder="e.g., Maharashtra, Karnataka, MH, KA"
                      defaultValue={criteria?.allowed_states?.join(', ') ?? ''}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Leave empty to allow all states. Accepts full names or abbreviations.
                    </p>
                  </div>

                  {/* Allowed Groups (Gr column) */}
                  <div>
                    <Label htmlFor="criteria-groups">Group (Gr column from Swiss-Manager)</Label>
                    <Input
                      id="criteria-groups"
                      placeholder="e.g., Raipur, Section A, Senior"
                      defaultValue={criteria?.allowed_groups?.join(', ')}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Uses the Gr column from Swiss-Manager ranking file. Only players whose Gr value matches one of these groups will be eligible. Leave empty to allow all.
                    </p>
                  </div>

                  {/* Allowed Types (Type column) */}
                  <div>
                    <Label htmlFor="criteria-types">Type (Type column from Swiss-Manager)</Label>
                    <Input
                      id="criteria-types"
                      placeholder="e.g., PC, S60, F14, U15, Section A"
                      defaultValue={criteria?.allowed_types?.join(', ')}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Uses the Type column from Swiss-Manager ranking file (e.g., PC, S60, F14, U15). Only players whose Type matches will be eligible. Leave empty to allow all.
                    </p>
                  </div>
                </>
              );
            })()}
          </div>

          <SheetFooter>
            <Button
              onClick={() => {
                const categoryType = categoryTypeSelection || 'standard';
                const isYoungest = categoryType === 'youngest_female' || categoryType === 'youngest_male';

                // Age fields (min_age/max_age)
                const maxAgeRaw = (document.getElementById('criteria-max-age') as HTMLInputElement)?.value;
                const minAgeRaw = (document.getElementById('criteria-min-age') as HTMLInputElement)?.value;
                const maxAge = maxAgeRaw ? Number(maxAgeRaw) : null;
                const minAge = minAgeRaw ? Number(minAgeRaw) : null;

                const minRatingRaw = (document.getElementById('criteria-min-rating') as HTMLInputElement)?.value;
                const maxRatingRaw = (document.getElementById('criteria-max-rating') as HTMLInputElement)?.value;
                const minRating = minRatingRaw ? Number(minRatingRaw) : null;
                const maxRating = maxRatingRaw ? Number(maxRatingRaw) : null;

                const includeUnratedEl = document.getElementById('criteria-include-unrated');
                const includeUnrated = includeUnratedEl?.getAttribute('data-state') === 'checked';
                const rawGender = (document.getElementById('criteria-gender') as HTMLSelectElement)?.value || '';
                const gender = rawGender === 'M' ? 'M_OR_UNKNOWN' : rawGender;
                
                const disabilityStr = (document.getElementById('criteria-disability') as HTMLInputElement)?.value || '';
                const disability_types = disabilityStr
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean);

                const citiesStr = (document.getElementById('criteria-cities') as HTMLInputElement)?.value || '';
                const allowed_cities = citiesStr
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean);

                const clubsStr = (document.getElementById('criteria-clubs') as HTMLInputElement)?.value || '';
                const allowed_clubs = clubsStr
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean);

                const statesStr = (document.getElementById('criteria-states') as HTMLInputElement)?.value || '';
                const allowed_states = statesStr
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean);

                const groupsStr = (document.getElementById('criteria-groups') as HTMLInputElement)?.value || '';
                const allowed_groups = groupsStr
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean);

                const typesStr = (document.getElementById('criteria-types') as HTMLInputElement)?.value || '';
                const allowed_types = typesStr
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean);

                // Read unrated-only checkbox
                const unratedOnlyEl = document.getElementById('criteria-unrated-only');
                const unratedOnly = !isYoungest && unratedOnlyEl?.getAttribute('data-state') === 'checked';

                // === VALIDATION GUARDRAILS ===
                const validationErrors: { ageRange?: string; ratingRange?: string } = {};

                // Age range validation: min_age > max_age is impossible
                if (minAge != null && maxAge != null && !isNaN(minAge) && !isNaN(maxAge) && minAge > maxAge) {
                  validationErrors.ageRange = `Min age (${minAge}) cannot be greater than max age (${maxAge}).`;
                }

                // Rating range validation: min_rating > max_rating is impossible
                if (minRating != null && maxRating != null && !isNaN(minRating) && !isNaN(maxRating) && minRating > maxRating) {
                  validationErrors.ratingRange = `Min rating (${minRating}) cannot be greater than max rating (${maxRating}).`;
                }

                // Block save if there are validation errors
                if (validationErrors.ageRange || validationErrors.ratingRange) {
                  setCriteriaErrors(validationErrors);
                  toast.error('Please fix the errors before saving.');
                  return;
                }

                // Clear any previous errors
                setCriteriaErrors({});

                const criteria: Record<string, unknown> = {};

                // Age fields (used by allocator)
                if (!isYoungest) {
                  if (maxAge != null && !isNaN(maxAge)) criteria.max_age = maxAge;
                  if (minAge != null && !isNaN(minAge)) criteria.min_age = minAge;
                  if (criteriaMaxAgeInclusiveOverride != null) {
                    criteria.max_age_inclusive = criteriaMaxAgeInclusiveOverride;
                  }
                }

                // Only save rating fields if not unrated-only mode
                if (!isYoungest && !unratedOnly) {
                  if (minRating != null && !isNaN(minRating)) criteria.min_rating = minRating;
                  if (maxRating != null && !isNaN(maxRating)) criteria.max_rating = maxRating;
                  criteria.include_unrated = includeUnrated;
                }

                // Save unrated_only flag
                if (!isYoungest) criteria.unrated_only = unratedOnly;

                if (isYoungest) {
                  criteria.gender = categoryType === 'youngest_female' ? 'F' : 'M_OR_UNKNOWN';
                } else if (gender) {
                  criteria.gender = gender;
                }
                if (disability_types.length > 0) criteria.allowed_disabilities = disability_types;
                if (allowed_cities.length > 0) criteria.allowed_cities = allowed_cities;
                if (allowed_clubs.length > 0) criteria.allowed_clubs = allowed_clubs;
                if (allowed_states.length > 0) criteria.allowed_states = allowed_states;
                if (allowed_groups.length > 0) criteria.allowed_groups = allowed_groups;
                if (allowed_types.length > 0) criteria.allowed_types = allowed_types;

                if (criteriaSheet.category?.id) {
                  saveCriteriaMutation.mutate({
                    categoryId: criteriaSheet.category.id,
                    criteria,
                    categoryType,
                  });
                }
              }}
              disabled={saveCriteriaMutation.isPending}
            >
              {saveCriteriaMutation.isPending ? 'Saving...' : 'Save Rules'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Delete Category Confirmation Dialog */}
      <AlertDialog open={!!catDelete.open} onOpenChange={(open) => !open && setCatDelete({ open: false })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Category: {catDelete.name}</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the category and <strong>{catDelete.prizeCount ?? 0} prize(s)</strong> associated with it. This action cannot be undone.
              <div className="mt-3 font-medium">Type the category name to confirm:</div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            className="mt-2"
            placeholder="Type category name to confirm"
            onChange={(e) => setCatDelete(prev => ({ ...prev, confirm: e.target.value }))}
            autoFocus
          />
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setCatDelete({ open: false })}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={catDelete.confirm !== catDelete.name || deleteCategoryMutation.isPending}
              onClick={() => {
                if (catDelete.id && catDelete.confirm === catDelete.name) {
                  deleteCategoryMutation.mutate(catDelete.id);
                }
              }}
            >
              {deleteCategoryMutation.isPending ? 'Deleting…' : 'Delete Category'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
