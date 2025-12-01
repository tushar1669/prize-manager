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
import CategoryPrizesEditor, { PrizeDelta, CategoryPrizesEditorHandle } from '@/components/prizes/CategoryPrizesEditor';
import { TournamentProgressBreadcrumbs } from '@/components/TournamentProgressBreadcrumbs';
import { useDirty } from "@/contexts/DirtyContext";
import { makeKey, getDraft, setDraft, clearDraft, formatAge } from '@/utils/autosave';
import { useAutosaveEffect } from '@/hooks/useAutosaveEffect';
import { deepEqualNormalized, normalizeCriteria } from '@/utils/deepNormalize';

// Flip to true only when debugging
const DEBUG = false;
const dlog = (...args: any[]) => { if (DEBUG) console.log(...args); };

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
    category: any | null;
  }>({ open: false, category: null });
  const [savedCriteria, setSavedCriteria] = useState<any>(null);
  // Start with empty arrays - will be populated during hydration
  const [prizes, setPrizes] = useState<Array<{place: number; cash_amount: number; has_trophy: boolean; has_medal: boolean}>>([]);
  const [initialPrizes, setInitialPrizes] = useState<Array<{place: number; cash_amount: number; has_trophy: boolean; has_medal: boolean}>>([]);
  const [copyFromCategoryId, setCopyFromCategoryId] = useState<string | null>(null);
  const [includeCriteriaOnCopy, setIncludeCriteriaOnCopy] = useState(true);
  const [dupDialog, setDupDialog] = useState<{
    open: boolean;
    sourceId: string | null;
  }>({ open: false, sourceId: null });
  const [savingAll, setSavingAll] = useState(false);
  const editorRefs = useRef(new Map<string, React.RefObject<CategoryPrizesEditorHandle>>());
  
  // Category delete dialog state
  const [catDelete, setCatDelete] = useState<{ open: boolean; id?: string; name?: string; prizeCount?: number; confirm?: string }>({ open: false });

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
    onError: (err: any) => {
      console.error('[prizes] delete category error', err);
      toast.error(err?.message || 'Failed to delete category');
    }
  });

  // Autosave state for Details form
  const detailsDraftKey = makeKey(`t:${id}:details`);
  const [detailsRestore, setDetailsRestore] = useState<null | { data: any; ageMs: number }>(null);

  // Autosave key: compute only when a valid id exists (prevents "undefined" keys)
  const tid = useMemo(() => (id ? String(id).trim() : ''), [id]);
  const mainPrizesDraftKey = useMemo(() => (
    tid ? makeKey(`t:${tid}:main-prizes`) : ''
  ), [tid]);
  const [mainPrizesRestore, setMainPrizesRestore] = useState<null | { data: any; ageMs: number }>(null);
  const [hasPendingDraft, setHasPendingDraft] = useState(false);

  // Helper to get/create editor refs
  const getEditorRef = (catId: string): React.RefObject<CategoryPrizesEditorHandle> => {
    if (!editorRefs.current.has(catId)) {
      editorRefs.current.set(catId, React.createRef());
    }
    return editorRefs.current.get(catId)!;
  };

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

  // Reset form only when tournament ID changes, not on every refetch
  useEffect(() => {
    if (tournament && !detailsForm.formState.isDirty) {
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournament?.id]);

  // Check for Details form draft on tab switch
  useEffect(() => {
    if (activeTab !== 'details' || detailsForm.formState.isDirty) return;
    const draft = getDraft<any>(detailsDraftKey, 1);
    if (draft) setDetailsRestore(draft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, tournament?.id]);

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
    
    const draft = getDraft<any>(mainPrizesDraftKey, 1);
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
      const isDirty = !deepEqualNormalized(criteriaSheet.category.criteria_json, savedCriteria);
      if (isDirty !== lastCriteriaSheetDirty.current) {
        lastCriteriaSheetDirty.current = isDirty;
        setDirty('criteria-sheet', isDirty);
      }
    } else {
      lastCriteriaSheetDirty.current = false;
      resetDirty('criteria-sheet');
    }
  }, [criteriaSheet, savedCriteria, setDirty, resetDirty]);

  // Initialize savedCriteria when criteria sheet opens (normalize for stable comparison)
  useEffect(() => {
    if (criteriaSheet.open && criteriaSheet.category) {
      setSavedCriteria(normalizeCriteria(criteriaSheet.category.criteria_json));
    }
  }, [criteriaSheet.open]);

  // Organizer guard: owner or master
  const isOrganizer = 
    (user && tournament && tournament.owner_id === user.id) || !!isMaster;

  // Fetch categories
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
    staleTime: 30_000,
    refetchOnWindowFocus: false
  });

  // UI-only sort for Setup page: show newest categories at top for better editing UX
  // (CategoryOrderReview still uses order_idx ASC for brochure order)
  const sortedCategories = useMemo(() => {
    if (!categories) return [];
    return categories
      .filter(c => !c.is_main)
      .sort((a, b) => (b.order_idx ?? 0) - (a.order_idx ?? 0)); // DESC = newest first
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
    
    const mainCat = categories.find(c => c.is_main);
    
    // Check if draft exists first
    const draft = getDraft<any>(mainPrizesDraftKey, 1);
    
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
    onError: (error: any) => {
      console.error('[details] save error', error);
      showError({
        title: "Failed to save details",
        message: error?.message || "Unknown error",
        hint: "Please check your connection and try again."
      });
      toast.error(error?.message || 'Failed to save');
    }
  });

  // Create category mutation
  const createCategoryMutation = useMutation({
    mutationFn: async (values: CategoryForm) => {
      const { data: category, error } = await supabase
        .from('categories')
        .insert({
          tournament_id: id,
          name: values.name,
          is_main: values.is_main,
          criteria_json: values.criteria_json || {},
          order_idx: categories?.length || 0
        })
        .select('id, name, criteria_json, is_main, order_idx')
        .single();
      
      if (error) throw error;
      return category;
    },
    onSuccess: async (createdCategory) => {
      try {
        if (copyFromCategoryId) {
          await copyPrizesForCategory(copyFromCategoryId, createdCategory.id);
        }
      } catch (err: any) {
        console.warn('[copy prizes] failed', err);
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
    onError: (error: any) => {
      toast.error('Failed to add category: ' + error.message);
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
      
      // Find or create main category
      let mainCategoryId = categories?.find(c => c.is_main)?.id;
      
      if (!mainCategoryId) {
        const { data, error } = await supabase
          .from('categories')
          .insert({
            tournament_id: id,
            name: 'Main (Open)',
            is_main: true,
            criteria_json: {},
            order_idx: 0
          })
          .select('id')
          .single();
        
        if (error) throw error;
        mainCategoryId = data.id;
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
    onError: (error: any) => {
      console.error('[prizes] save main prizes error', error);
      showError({
        title: "Failed to save prizes",
        message: error?.message || "Unknown error",
        hint: "Please check your connection and try again."
      });
      toast.error(`Failed to save prizes: ${error?.message || 'Unknown error'}`);
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
      console.log('[prizes-cat] save category', { 
        categoryId, 
        inserts: delta.inserts.length, 
        updates: delta.updates.length, 
        deletes: delta.deletes.length 
      });

      // Preflight: filter valid places (positive int only)
      const validInserts = delta.inserts.filter(p => Number.isInteger(p.place) && p.place > 0);
      const validUpdates = delta.updates.filter(p => Number.isInteger(p.place) && p.place > 0);
      
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

      // Use upsert for inserts + updates combined (with onConflict)
      const upsertRows = [
        ...validUpdates.map(p => ({
          id: p.id,
          category_id: categoryId,
          place: p.place,
          cash_amount: p.cash_amount,
          has_trophy: p.has_trophy,
          has_medal: p.has_medal,
          is_active: p.is_active ?? true
        })),
        ...validInserts.map(p => ({
          category_id: categoryId,
          place: p.place,
          cash_amount: p.cash_amount,
          has_trophy: p.has_trophy,
          has_medal: p.has_medal,
          is_active: p.is_active ?? true
        }))
      ];

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
          throw new Error(msg);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', id] });
    },
    onError: (error: any) => {
      console.error('[prizes-cat] error', { scope: 'category', message: error?.message });
      toast.error(error?.message || 'Failed to save prizes');
    }
  });

  // Save criteria mutation
  const saveCriteriaMutation = useMutation({
    mutationFn: async ({
      categoryId,
      criteria,
    }: {
      categoryId: string;
      criteria: any;
    }) => {
      const { error } = await supabase
        .from('categories')
        .update({ criteria_json: criteria })
        .eq('id', categoryId);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      console.log('[rules] save ok', { categoryId: variables.categoryId });
      queryClient.invalidateQueries({ queryKey: ['categories', id] });
      toast.info('Rules saved', { duration: 1500 });
      toast.success('Rules saved');
      resetDirty('criteria-sheet');
      setSavedCriteria(null);
      setCriteriaSheet({ open: false, category: null });
    },
    onError: (e: any) => toast.error(e.message || 'Failed to save rules'),
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
      } catch (err: any) {
        console.error('[prizes-cat] save all fail', { cat: cat.name, err });
        results.push({ 
          ok: false, 
          categoryId: cat.id, 
          categoryName: cat.name, 
          error: err.message || 'Unknown error' 
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
  }, [categories, editorRefs, showError, clearError, toast, queryClient, id, saveCategoryPrizesMutation, setDirty, getEditorRef]);

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
    // 1) Fetch source category
    const { data: cats, error: catError } = await supabase
      .from('categories')
      .select('id, criteria_json, name, order_idx, is_main, tournament_id')
      .eq('id', sourceId)
      .single();

    if (catError) throw catError;
    const src = cats;
    if (!src) throw new Error('Source category not found');

    // 2) Create new category with cloned criteria (excluding legacy dob_on_or_after)
    const criteria = (src.criteria_json && typeof src.criteria_json === 'object' && !Array.isArray(src.criteria_json))
      ? { ...(src.criteria_json as Record<string, any>) }
      : {} as Record<string, any>;
    delete criteria.dob_on_or_after;

    const { data: created, error: createError } = await supabase
      .from('categories')
      .insert({
        tournament_id: src.tournament_id,
        name: newName,
        is_main: false,
        criteria_json: criteria,
        order_idx: (src.order_idx ?? 0) + 1,
      })
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
    // If copying from a category, optionally include criteria (controlled state)
    if (copyFromCategoryId && includeCriteriaOnCopy) {
      const source = categories?.find(c => c.id === copyFromCategoryId);
      if (source?.criteria_json && typeof source.criteria_json === 'object' && !Array.isArray(source.criteria_json)) {
        values.criteria_json = { ...(source.criteria_json as Record<string, any>) };
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
                  <div className="flex items-center gap-2">
                    <div>
                      <CardTitle>Main Prizes (Open)</CardTitle>
                      <CardDescription>Define prizes for top finishers</CardDescription>
                    </div>
                    {isMainPrizesDirty && (
                      <Badge variant="secondary" className="text-xs">
                        Unsaved changes
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-muted-foreground">
                      Prize allocation rules are configured in{" "}
                      <button 
                        className="underline hover:no-underline text-primary font-medium" 
                        onClick={() => navigate(`/t/${id}/settings`)}
                      >
                        Settings
                      </button>
                    </p>
                    {isOrganizer && (
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => savePrizesMutation.mutate({ shouldNavigate: false })}
                        disabled={!isMainPrizesDirty || savePrizesMutation.isPending}
                        className="gap-2"
                      >
                        {savePrizesMutation.isPending ? (
                          <>
                            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity="0.25"/>
                              <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="4" opacity="0.75"/>
                            </svg>
                            Saving...
                          </>
                        ) : (
                          <>
                            <Save className="h-4 w-4" />
                            Save Main Prizes
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-border">
                      <TableHead className="w-20">Place</TableHead>
                      <TableHead>Cash Amount</TableHead>
                      <TableHead className="w-24">Trophy</TableHead>
                      <TableHead className="w-24">Medal</TableHead>
                      <TableHead className="w-16"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {prizes.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No prizes defined yet. Click "Add Prize Row" to start.
                        </TableCell>
                      </TableRow>
                    ) : (
                      prizes.map((prize, index) => (
                        <TableRow key={index} className="border-border" data-testid="prize-row">
                          <TableCell className="font-medium">{prize.place}</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="0"
                              value={prize.cash_amount}
                              onChange={(e) => {
                                const newPrizes = [...prizes];
                                newPrizes[index].cash_amount = parseInt(e.target.value) || 0;
                                setPrizes(newPrizes);
                              }}
                              className="w-32"
                            />
                          </TableCell>
                          <TableCell>
                            <Checkbox
                              checked={prize.has_trophy}
                              onCheckedChange={(checked) => {
                                const newPrizes = [...prizes];
                                newPrizes[index].has_trophy = checked as boolean;
                                setPrizes(newPrizes);
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <Checkbox
                              checked={prize.has_medal}
                              onCheckedChange={(checked) => {
                                const newPrizes = [...prizes];
                                newPrizes[index].has_medal = checked as boolean;
                                setPrizes(newPrizes);
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            {prizes.length > 1 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRemovePrize(index)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
                <Button variant="outline" size="sm" onClick={handleAddPrize} className="mt-4 gap-2">
                  <Plus className="h-4 w-4" />
                  Add Prize Row
                </Button>
              </CardContent>
            </Card>

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
                      category={cat}
                      onEditRules={(category) => setCriteriaSheet({ open: true, category })}
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
                <div className="flex flex-wrap gap-2">
                  <RuleChip icon="lock" locked>One-Prize Rule</RuleChip>
                  <RuleChip icon="trend">Main Priority</RuleChip>
                  <RuleChip icon="alert">Strict Age: ON</RuleChip>
                  <RuleChip>Unrated in Rating: OFF</RuleChip>
                  <RuleChip>Tie Rule: Prefer Main</RuleChip>
                </div>
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
                } catch (e: any) {
                  console.error('[duplicate]', e);
                  toast.error(e?.message || 'Failed to duplicate');
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
        onOpenChange={(open) =>
          setCriteriaSheet({ open, category: criteriaSheet.category })
        }
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
                    if (el) el.value = 'M';
                  }}
                >
                  Boys Only
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
              const criteria = criteriaSheet.category?.criteria_json as any;
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
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        For "Under X" categories. E.g., U-9 = max age 9.
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="criteria-min-age">Min Age (for Veteran/Senior)</Label>
                      <Input
                        id="criteria-min-age"
                        type="number"
                        min="0"
                        defaultValue={criteria?.min_age ?? ''}
                        placeholder="e.g., 60"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        For "60+ Veteran" categories. Leave empty for no minimum.
                      </p>
                    </div>
                  </div>

                  {/* Unrated-only Category */}
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="criteria-unrated-only"
                        defaultChecked={criteria?.unrated_only ?? false}
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
                        defaultValue={criteria?.min_rating}
                        placeholder="e.g., 1200"
                        disabled={criteria?.unrated_only === true}
                        className={criteria?.unrated_only === true ? 'opacity-50' : ''}
                      />
                    </div>
                    <div>
                      <Label htmlFor="criteria-max-rating">Max Rating</Label>
                      <Input
                        id="criteria-max-rating"
                        type="number"
                        min="0"
                        defaultValue={criteria?.max_rating}
                        placeholder="e.g., 1800"
                        disabled={criteria?.unrated_only === true}
                        className={criteria?.unrated_only === true ? 'opacity-50' : ''}
                      />
                    </div>
                  </div>
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
                      disabled={criteria?.unrated_only === true}
                      className={criteria?.unrated_only === true ? 'opacity-50 cursor-not-allowed' : ''}
                    />
                    <Label 
                      htmlFor="criteria-include-unrated"
                      className={criteria?.unrated_only === true ? 'opacity-50' : ''}
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
                      defaultValue={criteria?.gender || ''}
                    >
                      <option value="">Any</option>
                      <option value="F">Girls Only</option>
                      <option value="M">Boys Only</option>
                    </select>
                    <p className="text-xs text-muted-foreground mt-1">
                      Optional. Restrict eligibility by gender.
                    </p>
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
                const gender = (document.getElementById('criteria-gender') as HTMLSelectElement)?.value || '';
                
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
                const unratedOnly = unratedOnlyEl?.getAttribute('data-state') === 'checked';

                const criteria: any = {};
                
                // Age fields (used by allocator)
                if (maxAge != null && !isNaN(maxAge)) criteria.max_age = maxAge;
                if (minAge != null && !isNaN(minAge)) criteria.min_age = minAge;
                
                // Only save rating fields if not unrated-only mode
                if (!unratedOnly) {
                  if (minRating != null && !isNaN(minRating)) criteria.min_rating = minRating;
                  if (maxRating != null && !isNaN(maxRating)) criteria.max_rating = maxRating;
                  criteria.include_unrated = includeUnrated;
                }
                
                // Save unrated_only flag
                criteria.unrated_only = unratedOnly;
                
                if (gender) criteria.gender = gender;
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
