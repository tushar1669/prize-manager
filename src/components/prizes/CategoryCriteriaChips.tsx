import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Crown, Users, Star, Baby, Zap } from 'lucide-react';

interface CriteriaJson {
  gender?: string | null;
  min_age?: number | null;
  max_age?: number | null;
  min_rating?: number | null;
  max_rating?: number | null;
  unrated_only?: boolean;
  category_type?: string;
  allowed_disabilities?: string[];
  allowed_states?: string[];
  allowed_cities?: string[];
  allowed_groups?: string[];
  allowed_types?: string[];
}

interface Props {
  isMain: boolean;
  criteria?: CriteriaJson | null;
  categoryType?: string | null;
  className?: string;
}

/**
 * Renders compact chips summarizing category criteria at a glance.
 * Informational only - does not modify any values.
 */
export function CategoryCriteriaChips({ isMain, criteria, categoryType, className }: Props) {
  const chips: React.ReactNode[] = [];
  const c = criteria || {};

  // 1. Determine basis type (Main/Open, Age, Rating, Youngest)
  const isYoungest = categoryType === 'youngest_female' || categoryType === 'youngest_male';
  const hasAge = c.min_age != null || c.max_age != null;
  const hasRating = c.min_rating != null || c.max_rating != null || c.unrated_only;

  if (isYoungest) {
    const label = categoryType === 'youngest_female' ? 'Youngest Girl' : 'Youngest Boy';
    chips.push(
      <Badge key="youngest" variant="outline" className="bg-violet-500/10 text-violet-700 border-violet-300 gap-1">
        <Baby className="h-3 w-3" />
        {label}
      </Badge>
    );
  } else if (isMain) {
    chips.push(
      <Badge key="main" variant="outline" className="bg-primary/10 text-primary border-primary/30 gap-1">
        <Crown className="h-3 w-3" />
        Main Open
      </Badge>
    );
  } else if (hasAge) {
    // Age-based category
    let ageLabel = 'Age';
    if (c.max_age != null && c.min_age == null) {
      ageLabel = `Under ${c.max_age}`;
    } else if (c.min_age != null && c.max_age == null) {
      ageLabel = `${c.min_age}+`;
    } else if (c.min_age != null && c.max_age != null) {
      ageLabel = `Age ${c.min_age}–${c.max_age}`;
    }
    chips.push(
      <Badge key="age" variant="outline" className="bg-blue-500/10 text-blue-700 border-blue-300 gap-1">
        <Users className="h-3 w-3" />
        {ageLabel}
      </Badge>
    );
  }

  // Rating chip (can coexist with age)
  if (hasRating && !isYoungest) {
    let ratingLabel = 'Rating';
    if (c.unrated_only) {
      ratingLabel = 'Unrated Only';
    } else if (c.min_rating != null && c.max_rating != null) {
      ratingLabel = `Rating ${c.min_rating}–${c.max_rating}`;
    } else if (c.min_rating != null) {
      ratingLabel = `Rating ${c.min_rating}+`;
    } else if (c.max_rating != null) {
      ratingLabel = `Rating ≤${c.max_rating}`;
    }
    chips.push(
      <Badge key="rating" variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-300 gap-1">
        <Star className="h-3 w-3" />
        {ratingLabel}
      </Badge>
    );
  }

  // If no basis yet and not main, show "Open"
  if (chips.length === 0 && !isMain) {
    chips.push(
      <Badge key="open" variant="outline" className="bg-muted text-muted-foreground border-muted-foreground/30">
        Open
      </Badge>
    );
  }

  // 2. Gender chip
  const gender = c.gender?.toUpperCase?.() || null;
  if (gender === 'F') {
    chips.push(
      <Badge key="gender" variant="outline" className="bg-pink-500/10 text-pink-700 border-pink-300">
        Girls Only
      </Badge>
    );
  } else if (gender === 'M' || gender === 'M_OR_UNKNOWN') {
    chips.push(
      <Badge key="gender" variant="outline" className="bg-sky-500/10 text-sky-700 border-sky-300">
        Boys (not F)
      </Badge>
    );
  }
  // If gender is null/Any, no chip needed (reduces noise)

  // 3. Special criteria chips
  if (c.allowed_disabilities?.length) {
    chips.push(
      <Badge key="disability" variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-300 gap-1">
        <Zap className="h-3 w-3" />
        {c.allowed_disabilities.join(', ')}
      </Badge>
    );
  }

  if (c.allowed_states?.length) {
    chips.push(
      <Badge key="states" variant="outline" className="bg-orange-500/10 text-orange-700 border-orange-300">
        {c.allowed_states.length === 1 ? c.allowed_states[0] : `${c.allowed_states.length} states`}
      </Badge>
    );
  }

  if (c.allowed_groups?.length) {
    chips.push(
      <Badge key="groups" variant="outline" className="bg-teal-500/10 text-teal-700 border-teal-300">
        Group: {c.allowed_groups.join(', ')}
      </Badge>
    );
  }

  if (c.allowed_types?.length) {
    chips.push(
      <Badge key="types" variant="outline" className="bg-indigo-500/10 text-indigo-700 border-indigo-300">
        Type: {c.allowed_types.join(', ')}
      </Badge>
    );
  }

  if (chips.length === 0) return null;

  return (
    <div className={`flex flex-wrap gap-1.5 ${className || ''}`}>
      {chips}
    </div>
  );
}
