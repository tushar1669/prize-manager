import { useState, useRef } from "react";
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Plus, Trash2, Upload, ArrowRight, X } from "lucide-react";
import { toast } from "sonner";

export default function TournamentSetup() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "details";
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [uploading, setUploading] = useState(false);
  const [brochureSignedUrl, setBrochureSignedUrl] = useState<string | null>(null);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [prizes, setPrizes] = useState([
    { place: 1, cash_amount: 0, has_trophy: false, has_medal: false },
  ]);

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
      brochure_url: ''
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

  // Fetch tournament data
  const { data: tournament, isLoading: tournamentLoading } = useQuery({
    queryKey: ['tournament', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tournaments')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error) {
        if (error.message?.includes('row-level security')) {
          toast.error("You don't have access to this tournament");
          navigate('/dashboard');
        }
        throw error;
      }
      
      detailsForm.reset({
        title: data.title,
        start_date: data.start_date,
        end_date: data.end_date,
        venue: data.venue || '',
        city: data.city || '',
        event_code: data.event_code || '',
        notes: data.notes || '',
        brochure_url: data.brochure_url || ''
      });

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

  // Fetch categories
  const { data: categories, isLoading: categoriesLoading } = useQuery({
    queryKey: ['categories', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select(`
          *,
          prizes (*)
        `)
        .eq('tournament_id', id)
        .order('order_idx');
      
      if (error) throw error;
      return data;
    },
    enabled: !!id && activeTab === 'prizes'
  });

  // Update tournament mutation
  const updateTournamentMutation = useMutation({
    mutationFn: async (values: TournamentDetailsForm) => {
      const { error } = await supabase
        .from('tournaments')
        .update(values)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournament', id] });
      toast.success('Tournament details saved');
      navigate(`/t/${id}/setup?tab=prizes`);
    },
    onError: (error: any) => {
      if (error.message?.includes('row-level security')) {
        toast.error("You don't have access to this tournament");
      } else {
        toast.error('Failed to save: ' + error.message);
      }
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
        .select()
        .single();
      
      if (error) throw error;
      return category;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', id] });
      toast.success('Category added');
      setCategoryDialogOpen(false);
      categoryForm.reset();
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
          .select()
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
      queryClient.invalidateQueries({ queryKey: ['categories', id] });
      toast.success('Prize structure saved');
      navigate(`/t/${id}/import`);
    },
    onError: (error: any) => {
      toast.error('Failed to save prizes: ' + error.message);
    }
  });

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
                <CardTitle>Main Prizes (Open)</CardTitle>
                <CardDescription>Define prizes for top finishers</CardDescription>
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
                          <DialogFooter>
                            <Button type="submit" disabled={createCategoryMutation.isPending}>
                              {createCategoryMutation.isPending ? 'Adding...' : 'Add Category'}
                            </Button>
                          </DialogFooter>
                        </form>
                      </Form>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                {categoriesLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                  </div>
                ) : categories && categories.length > 0 ? (
                  <div className="space-y-3">
                    {categories.filter(c => !c.is_main).map((cat) => (
                      <div
                        key={cat.id}
                        className="flex items-center justify-between p-4 border border-border rounded-lg"
                      >
                        <div>
                          <h4 className="font-medium text-foreground">{cat.name}</h4>
                          <p className="text-sm text-muted-foreground">
                            {Object.keys(cat.criteria_json || {}).length > 0 
                              ? JSON.stringify(cat.criteria_json) 
                              : 'No criteria set'}
                          </p>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => deleteCategoryMutation.mutate(cat.id)}
                          disabled={deleteCategoryMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
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
                <CardTitle>Allocation Rules</CardTitle>
                <CardDescription>Default rules for prize allocation</CardDescription>
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
              <Button 
                onClick={() => savePrizesMutation.mutate()} 
                disabled={savePrizesMutation.isPending}
                className="gap-2"
              >
                {savePrizesMutation.isPending ? 'Saving...' : 'Next: Import Players'}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
