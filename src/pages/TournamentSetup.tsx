import { useState, useRef, useEffect, useCallback } from "react";
import React from 'react';
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/integrations/supabase/client";
import { uploadFile, getSignedUrl } from "@/lib/storage";
import { tournamentDetailsSchema, TournamentDetailsForm, categorySchema, CategoryForm } from "@/lib/validations";
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
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Upload, ArrowRight, X, Save } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { BackBar } from "@/components/BackBar";
import ErrorPanel from "@/components/ui/ErrorPanel";
import { useErrorPanel } from "@/hooks/useErrorPanel";
import CategoryPrizesEditor, { PrizeDelta, CategoryPrizesEditorHandle } from '@/components/prizes/CategoryPrizesEditor';
import { useDirty } from "@/contexts/DirtyContext";

export default function TournamentSetup() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "details";
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { error, showError, clearError } = useErrorPanel();
  const { setDirty, resetDirty, registerOnSave } = useDirty();
  
  const [uploading, setUploading] = useState(false);
  const [brochureSignedUrl, setBrochureSignedUrl] = useState<string | null>(null);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [criteriaSheet, setCriteriaSheet] = useState<{
    open: boolean;
    category: any | null;
  }>({ open: false, category: null });
  const [savedCriteria, setSavedCriteria] = useState<any>(null);
  const [prizes, setPrizes] = useState([
    { place: 1, cash_amount: 0, has_trophy: false, has_medal: false },
  ]);
  const [initialPrizes, setInitialPrizes] = useState([
    { place: 1, cash_amount: 0, has_trophy: false, has_medal: false },
  ]);
  const [copyFromCategoryId, setCopyFromCategoryId] = useState<string | null>(null);
  const [includeCriteriaOnCopy, setIncludeCriteriaOnCopy] = useState(true);
  const [dupDialog, setDupDialog] = useState<{
    open: boolean;
    sourceId: string | null;
  }>({ open: false, sourceId: null });
  const [savingAll, setSavingAll] = useState(false);
  const editorRefs = useRef(new Map<string, React.RefObject<CategoryPrizesEditorHandle>>());

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
      public_results_url: ''
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
        .select('id, title, start_date, end_date, venue, city, event_code, notes, brochure_url, chessresults_url, public_results_url, owner_id, status')
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
        public_results_url: tournament.public_results_url || ''
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournament?.id]);

  // Track Details form dirty state
  useEffect(() => {
    if (activeTab === 'details') {
      setDirty('details', detailsForm.formState.isDirty);
    }
  }, [activeTab, detailsForm.formState.isDirty, setDirty]);

  // Track Main prizes table dirty state
  useEffect(() => {
    if (activeTab === 'prizes') {
      const isDirty = JSON.stringify(prizes) !== JSON.stringify(initialPrizes);
      setDirty('main-prizes', isDirty);
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
      const isDirty = JSON.stringify(criteriaSheet.category.criteria_json) !== JSON.stringify(savedCriteria);
      setDirty('criteria-sheet', isDirty);
    } else {
      resetDirty('criteria-sheet');
    }
  }, [criteriaSheet, savedCriteria, setDirty, resetDirty]);

  // Initialize savedCriteria when criteria sheet opens
  useEffect(() => {
    if (criteriaSheet.open && criteriaSheet.category) {
      setSavedCriteria(criteriaSheet.category.criteria_json);
    }
  }, [criteriaSheet.open]);

  // Organizer guard: owner or master
  const isOrganizer = 
    (user && tournament && tournament.owner_id === user.id) || !!isMaster;

  // Fetch categories
  const { data: categories, isLoading: categoriesLoading } = useQuery({
    queryKey: ['categories', id],
    queryFn: async () => {
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
    enabled: !!id && activeTab === 'prizes'
  });

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

  // Delete category mutation
  const deleteCategoryMutation = useMutation({
    mutationFn: async (categoryId: string) => {
      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', categoryId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', id] });
      toast.success('Category deleted');
    }
  });

  // Save prizes mutation
  const savePrizesMutation = useMutation({
    mutationFn: async () => {
      console.log('[prizes] saving main prizes', prizes);
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

      // Delete existing prizes for main category
      await supabase
        .from('prizes')
        .delete()
        .eq('category_id', mainCategoryId);

      // Insert new prizes
      const prizesToInsert = prizes.map(p => ({
        category_id: mainCategoryId,
        place: p.place,
        cash_amount: p.cash_amount,
        has_trophy: p.has_trophy,
        has_medal: p.has_medal
      }));

      const { error } = await supabase
        .from('prizes')
        .insert(prizesToInsert);
      
      if (error) throw error;
    },
    onSuccess: () => {
      console.log('[prizes] main prizes saved successfully');
      resetDirty('main-prizes');
      setInitialPrizes(prizes);
      queryClient.invalidateQueries({ queryKey: ['categories', id] });
      toast.success(`${prizes.length} main prizes saved successfully`, { duration: 3000 });
      // small delay so user sees the toast
      setTimeout(() => navigate(`/t/${id}/order-review`), 600);
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

      // client-side duplicate guard
      const places = [...delta.inserts.map(p => p.place), ...delta.updates.map(p => p.place)];
      const seen = new Set<number>(), dup = new Set<number>();
      for (const n of places) { 
        if (seen.has(n)) dup.add(n); 
        seen.add(n); 
      }
      if (dup.size) throw new Error('Each place must be unique within the category.');

      // Order: deletes → updates → inserts (avoid unique constraint conflicts)
      const ops = [];
      if (delta.deletes.length) {
        ops.push(supabase.from('prizes').delete().in('id', delta.deletes).then(r => r));
      }
      if (delta.updates.length) {
        for (const p of delta.updates) {
          ops.push(
            supabase.from('prizes').update({
              place: p.place,
              cash_amount: p.cash_amount,
              has_trophy: p.has_trophy,
              has_medal: p.has_medal,
              is_active: p.is_active ?? true
            }).eq('id', p.id).then(r => r)
          );
        }
      }
      if (delta.inserts.length) {
        const rows = delta.inserts.map(p => ({
          category_id: categoryId,
          place: p.place,
          cash_amount: p.cash_amount,
          has_trophy: p.has_trophy,
          has_medal: p.has_medal,
          is_active: p.is_active ?? true
        }));
        ops.push(supabase.from('prizes').insert(rows).select('id').then(r => r));
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', id] });
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

  // Register Save & Continue on Prizes tab
  useEffect(() => {
    if (activeTab === 'prizes') {
      registerOnSave(handleSaveAllCategories);
    } else {
      registerOnSave(null);
    }
    return () => registerOnSave(null);
  }, [activeTab, registerOnSave, handleSaveAllCategories]);

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
    dobOnOrAfter,
  }: {
    sourceId: string;
    newName: string;
    dobOnOrAfter?: string | null;
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

    // 2) Create new category with cloned criteria
    const criteria = (src.criteria_json && typeof src.criteria_json === 'object' && !Array.isArray(src.criteria_json))
      ? { ...(src.criteria_json as Record<string, any>) } 
      : {} as Record<string, any>;
    if (dobOnOrAfter) criteria.dob_on_or_after = dobOnOrAfter;

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
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Tournament Setup</h1>
          <p className="text-muted-foreground">Configure your tournament details and prize structure</p>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => navigate(`/t/${id}/setup?tab=${v}`)}>
          <TabsList className="mb-6">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="prizes">Prize Structure</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-6">
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
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Main Prizes (Open)</CardTitle>
                    <CardDescription>Define prizes for top finishers</CardDescription>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Prize allocation rules are configured in{" "}
                    <button 
                      className="underline hover:no-underline text-primary font-medium" 
                      onClick={() => navigate(`/t/${id}/settings`)}
                    >
                      Settings
                    </button>
                  </p>
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
                    {prizes.map((prize, index) => (
                      <TableRow key={index} className="border-border">
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
                    ))}
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
                {categories.filter(c => !c.is_main).map((cat) => (
                  <div key={cat.id} data-category-id={cat.id}>
                    <CategoryPrizesEditor
                      ref={getEditorRef(cat.id)}
                      category={cat}
                      onSave={(categoryId, delta) => 
                        saveCategoryPrizesMutation.mutateAsync({ categoryId, delta })
                      }
                      onToggleCategory={toggleCategoryActive}
                      isOrganizer={isOrganizer}
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
                  variant="outline"
                  onClick={() => {
                    toast.success('Draft saved');
                  }}
                >
                  Save Draft
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => navigate(`/t/${id}/order-review`)}
                >
                  Review Category Order
                </Button>
                <Button
                  onClick={async () => {
                    try {
                      if (savePrizesMutation?.mutateAsync) {
                        await savePrizesMutation.mutateAsync();
                      }
                    } catch (e) {
                      // ignore save errors for navigation UX; user will be notified by toast already
                    }
                    if (playerCount > 0) {
                      navigate(`/t/${id}/review`);
                    } else {
                      navigate(`/t/${id}/import`);
                    }
                  }}
                  disabled={savePrizesMutation?.isPending || loadingPlayerCount}
                  className="gap-2"
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

            <div>
              <Label htmlFor="dup-dob">DOB On or After (optional override)</Label>
              <Input id="dup-dob" type="date" />
              <p className="text-xs text-muted-foreground mt-1">
                Leave empty to keep the original DOB rule.
              </p>
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
                  const dob = (document.getElementById('dup-dob') as HTMLInputElement)?.value || null;
                  if (!dupDialog.sourceId) throw new Error('Source missing');
                  if (!name) { toast.error('Please enter a name'); return; }

                  await duplicateCategoryWithPrizes({ 
                    sourceId: dupDialog.sourceId, 
                    newName: name, 
                    dobOnOrAfter: dob || undefined 
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
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
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
                    const el = document.getElementById('criteria-dob') as HTMLInputElement;
                    if (el) el.value = '2016-01-01';
                  }}
                >
                  U-9 (DOB ≥ 2016)
                </Button>
                <Button 
                  variant="secondary" 
                  size="sm" 
                  onClick={() => {
                    const el = document.getElementById('criteria-dob') as HTMLInputElement;
                    if (el) el.value = '2014-01-01';
                  }}
                >
                  U-11 (DOB ≥ 2014)
                </Button>
                <Button 
                  variant="secondary" 
                  size="sm" 
                  onClick={() => {
                    const el = document.getElementById('criteria-dob') as HTMLInputElement;
                    if (el) el.value = '2012-01-01';
                  }}
                >
                  U-13 (DOB ≥ 2012)
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Click a preset to quickly fill fields. You can adjust values after clicking.
              </p>
            </div>

            {/* DOB Cutoff */}
            {(() => {
              const criteria = criteriaSheet.category?.criteria_json as any;
              return (
                <>
                  <div>
                    <Label htmlFor="criteria-dob">
                      Date of Birth On or After (minimum age)
                    </Label>
                    <Input
                      id="criteria-dob"
                      type="date"
                      defaultValue={criteria?.dob_on_or_after}
                      placeholder="YYYY-MM-DD"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Only players born on or after this date will be eligible
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
                      />
                    </div>
                  </div>

                  {/* Include Unrated */}
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="criteria-include-unrated"
                      defaultChecked={criteria?.include_unrated ?? true}
                    />
                    <Label htmlFor="criteria-include-unrated">
                      Include unrated players
                    </Label>
                  </div>

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
                      placeholder="e.g., Hearing, Visual, Physical"
                      defaultValue={criteria?.disability_types?.join(', ')}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Leave empty for no disability restriction
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
                </>
              );
            })()}
          </div>

          <SheetFooter>
            <Button
              onClick={() => {
                const dob = (document.getElementById('criteria-dob') as HTMLInputElement)?.value || null;
                const minRating = Number((document.getElementById('criteria-min-rating') as HTMLInputElement)?.value) || null;
                const maxRating = Number((document.getElementById('criteria-max-rating') as HTMLInputElement)?.value) || null;
                const includeUnrated = (document.getElementById('criteria-include-unrated') as HTMLInputElement)?.checked ?? true;
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

                const criteria: any = {};
                if (dob) criteria.dob_on_or_after = dob;
                if (minRating) criteria.min_rating = minRating;
                if (maxRating) criteria.max_rating = maxRating;
                criteria.include_unrated = includeUnrated;
                if (gender) criteria.gender = gender;
                if (disability_types.length > 0) criteria.disability_types = disability_types;
                if (allowed_cities.length > 0) criteria.allowed_cities = allowed_cities;
                if (allowed_clubs.length > 0) criteria.allowed_clubs = allowed_clubs;

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
    </div>
  );
}
