import { useMemo, useState, useEffect } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, Users } from 'lucide-react';
import { useFinalPrizeData, FinalPrizeWinnerRow } from '@/hooks/useFinalPrizeData';
import { useTeamPrizeResults, GroupResponse } from '@/components/team-prizes/useTeamPrizeResults';
import { formatCurrencyINR } from '@/utils/currency';

const STORAGE_KEY = 'pm.ceremony.announceSmallestToBiggest';

interface CeremonyScriptViewProps {
  tournamentId: string;
}

// Ceremony announcement item - unified for both individual and team prizes
interface CeremonyItem {
  type: 'individual' | 'team';
  // For sorting
  isMain: boolean;
  categoryOrder: number;
  place: number;
  amount: number;
  // Display data
  categoryName: string;
  playerName: string; // or institution name for teams
  prizeId: string;
  rank?: number | null;
  sno?: string | null;
  club?: string | null;
  state?: string | null;
  hasTrophy?: boolean;
  hasMedal?: boolean;
  // Team-specific
  teamPlayers?: Array<{ name: string; rank: number }>;
  totalPoints?: number;
}

/**
 * Build ceremony script items with correct announcement order:
 * 1. Non-main individual categories (lowest place first within each category)
 * 2. Team prizes (lowest place first within each group)
 * 3. Main category (lowest place first, Champion LAST)
 * 
 * Within each section, categories are ordered by brochure order (categoryOrder).
 * Within each category, prizes go from lowest place → highest (e.g., 3rd, 2nd, 1st).
 */
function buildCeremonyScript(
  winners: FinalPrizeWinnerRow[],
  teamGroups: GroupResponse[]
): CeremonyItem[] {
  const items: CeremonyItem[] = [];

  // Group winners by category
  const byCategory = new Map<string, FinalPrizeWinnerRow[]>();
  winners.forEach(w => {
    if (!byCategory.has(w.categoryId)) {
      byCategory.set(w.categoryId, []);
    }
    byCategory.get(w.categoryId)!.push(w);
  });

  // Sort categories: non-main first by order, then main
  const categoryIds = Array.from(byCategory.keys());
  const categoryMeta = new Map<string, { isMain: boolean; order: number; name: string }>();
  winners.forEach(w => {
    if (!categoryMeta.has(w.categoryId)) {
      categoryMeta.set(w.categoryId, {
        isMain: w.isMain,
        order: w.categoryOrder,
        name: w.categoryName,
      });
    }
  });

  // Separate main and non-main categories
  const nonMainCategories = categoryIds.filter(id => !categoryMeta.get(id)?.isMain);
  const mainCategories = categoryIds.filter(id => categoryMeta.get(id)?.isMain);

  // Sort each by brochure order
  nonMainCategories.sort((a, b) => (categoryMeta.get(a)?.order ?? 999) - (categoryMeta.get(b)?.order ?? 999));
  mainCategories.sort((a, b) => (categoryMeta.get(a)?.order ?? 999) - (categoryMeta.get(b)?.order ?? 999));

  // Add non-main individual prizes (lowest place first = highest place number first)
  nonMainCategories.forEach(catId => {
    const catWinners = byCategory.get(catId) || [];
    const meta = categoryMeta.get(catId)!;
    // Sort by place DESC (3rd, 2nd, 1st)
    catWinners.sort((a, b) => b.place - a.place);
    catWinners.forEach(w => {
      items.push({
        type: 'individual',
        isMain: false,
        categoryOrder: meta.order,
        place: w.place,
        amount: w.amount,
        categoryName: w.categoryName,
        playerName: w.playerName,
        prizeId: w.prizeId,
        rank: w.rank,
        sno: w.sno,
        club: w.club,
        state: w.state,
        hasTrophy: w.hasTrophy,
        hasMedal: w.hasMedal,
      });
    });
  });

  // Add team prizes (lowest place first within each group)
  teamGroups.forEach((group, groupIndex) => {
    const filledPrizes = group.prizes
      .filter(p => p.winner_institution !== null)
      .sort((a, b) => b.place - a.place); // 3rd, 2nd, 1st
    
    filledPrizes.forEach(prize => {
      const winner = prize.winner_institution!;
      items.push({
        type: 'team',
        isMain: false,
        categoryOrder: 1000 + groupIndex, // After non-main individual
        place: prize.place,
        amount: prize.cash_amount,
        categoryName: group.name,
        playerName: winner.label,
        prizeId: prize.id,
        hasTrophy: prize.has_trophy,
        hasMedal: prize.has_medal,
        teamPlayers: winner.players.map(p => ({ name: p.name, rank: p.rank })),
        totalPoints: winner.total_points,
      });
    });
  });

  // Add main category prizes LAST (lowest place first = 8th, 7th, ..., 2nd, 1st)
  mainCategories.forEach(catId => {
    const catWinners = byCategory.get(catId) || [];
    const meta = categoryMeta.get(catId)!;
    // Sort by place DESC (Champion = 1st is LAST)
    catWinners.sort((a, b) => b.place - a.place);
    catWinners.forEach(w => {
      items.push({
        type: 'individual',
        isMain: true,
        categoryOrder: meta.order,
        place: w.place,
        amount: w.amount,
        categoryName: w.categoryName,
        playerName: w.playerName,
        prizeId: w.prizeId,
        rank: w.rank,
        sno: w.sno,
        club: w.club,
        state: w.state,
        hasTrophy: w.hasTrophy,
        hasMedal: w.hasMedal,
      });
    });
  });

  return items;
}

function renderPlace(place: number, isMain: boolean) {
  if (isMain) {
    if (place === 1) return 'Champion';
    if (place === 2) return 'Runner-up';
    if (place === 3) return 'Second Runner-up';
  }
  if (place === 1) return '1st Place';
  if (place === 2) return '2nd Place';
  if (place === 3) return '3rd Place';
  return `${place}th Place`;
}

function getStoredPreference(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === null ? true : stored === 'true';
  } catch {
    return true;
  }
}

function setStoredPreference(value: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // Ignore storage errors
  }
}

export function CeremonyScriptView({ tournamentId }: CeremonyScriptViewProps) {
  const { data, isLoading, error } = useFinalPrizeData(tournamentId);
  const { 
    hasTeamPrizes, 
    data: teamData, 
    isLoading: teamLoading 
  } = useTeamPrizeResults(tournamentId, { enabled: true });

  const [announceSmallestFirst, setAnnounceSmallestFirst] = useState(getStoredPreference);

  useEffect(() => {
    setStoredPreference(announceSmallestFirst);
  }, [announceSmallestFirst]);

  const ceremonyItems = useMemo(() => {
    const winners = data?.winners ?? [];
    const teamGroups = teamData?.groups ?? [];
    const items = buildCeremonyScript(winners, teamGroups);
    // If toggle OFF, reverse the entire list (Champion first)
    return announceSmallestFirst ? items : [...items].reverse();
  }, [data?.winners, teamData?.groups, announceSmallestFirst]);

  if (isLoading || teamLoading) {
    return (
      <div className="flex h-48 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-6 w-6 animate-spin" /> Preparing ceremony script…
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="mx-auto mt-10 max-w-2xl">
        <AlertDescription>
          Unable to load the ceremony script. Please refresh the page and try again.
        </AlertDescription>
      </Alert>
    );
  }

  if (ceremonyItems.length === 0) {
    return (
      <Alert className="mx-auto mt-10 max-w-2xl">
        <AlertDescription>No winners have been allocated yet.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="mx-auto mt-8 max-w-5xl px-6 pb-16 print:mt-3 print:px-0 print:pb-4">
      <div className="mb-6 rounded-lg border border-border bg-muted/30 p-4 print:mb-3 print:p-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground print:text-xs">Ceremony Order</h3>
            <p className="mt-1 text-sm text-muted-foreground print:text-xs">
              {announceSmallestFirst 
                ? 'Prizes are announced from lowest to highest. Champion is announced last.'
                : 'Prizes are announced from highest to lowest. Champion is announced first.'}
              {hasTeamPrizes && ' Team prizes are included.'}
            </p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <Switch
              id="ceremony-order-toggle"
              checked={announceSmallestFirst}
              onCheckedChange={setAnnounceSmallestFirst}
              aria-describedby="ceremony-order-help"
            />
            <Label 
              htmlFor="ceremony-order-toggle" 
              className="cursor-pointer text-sm font-medium whitespace-nowrap"
            >
              Smallest → biggest
            </Label>
          </div>
        </div>
        <p id="ceremony-order-help" className="mt-2 text-xs text-muted-foreground/80 print:hidden">
          When ON, Champion is announced last.
        </p>
      </div>
      <ol className="ceremony-script flex flex-col gap-5 text-foreground print:gap-2.5 print:text-black">
        {ceremonyItems.map((item, index) => (
          <li
            key={item.prizeId}
            className="ceremony-line pm-print-avoid-break rounded-lg border border-border bg-card px-6 py-6 shadow-sm transition hover:border-primary/50 print:rounded-md print:border-black/30 print:bg-white print:px-4 print:py-3 print:shadow-none"
          >
            <div className="flex flex-wrap items-end gap-x-6 gap-y-3 print:gap-x-3 print:gap-y-2">
              <div className="flex items-center gap-4 print:gap-2">
                <div className="text-5xl font-black leading-none text-primary print:text-2xl print:text-black">{index + 1}</div>
                <div className="space-y-1 print:space-y-0">
                  <div className="flex items-center gap-2">
                    <div className="text-xs font-semibold uppercase tracking-[0.3em] text-primary/80 print:text-[9px] print:tracking-wider print:text-black/70">
                      {item.categoryName}
                    </div>
                    {item.type === 'team' && (
                      <Badge variant="secondary" className="text-xs print:text-[8px]">
                        <Users className="mr-1 h-3 w-3" />
                        Team
                      </Badge>
                    )}
                    {item.isMain && (
                      <Badge className="bg-primary text-primary-foreground text-xs print:text-[8px]">
                        Main
                      </Badge>
                    )}
                  </div>
                  <div className="text-2xl font-bold leading-tight text-foreground print:text-sm print:text-black">
                    {renderPlace(item.place, item.isMain)}
                  </div>
                </div>
              </div>
              <div className="min-w-[12rem] flex-1">
                <div 
                  className="text-3xl font-bold leading-none text-foreground print:text-base print:text-black truncate"
                  title={item.playerName}
                >
                  {item.playerName}
                </div>
                {item.type === 'team' && item.teamPlayers && item.teamPlayers.length > 0 && (
                  <div className="mt-2 text-sm text-muted-foreground print:mt-1 print:text-xs print:text-black/60">
                    {item.teamPlayers.map((p, i) => (
                      <span key={i}>
                        {i > 0 && ', '}
                        <span title={p.name}>{p.name}</span>
                        <span className="text-muted-foreground/70"> (#{p.rank})</span>
                      </span>
                    ))}
                    {item.totalPoints !== undefined && (
                      <span className="ml-2 font-medium">• {item.totalPoints} pts</span>
                    )}
                  </div>
                )}
              </div>
              <div className="text-2xl font-bold leading-none text-success print:text-base print:text-black">
                {formatCurrencyINR(item.amount)}
              </div>
            </div>
            {item.type === 'individual' && (
              <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-base text-muted-foreground print:mt-1.5 print:gap-x-3 print:text-[10px] print:text-black/60">
                <span>{item.club || '—'}</span>
                <span>{item.state || '—'}</span>
                <span>Rank {item.rank ?? '—'}</span>
                <span>Seed #{item.sno ?? '—'}</span>
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}