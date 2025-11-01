import { Document, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PUBLIC_DOB_MASKING } from './featureFlags';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

const LOG_PREFIX = '[pdf] downloadPlayersPdf';
const DEFAULT_TOURNAMENT_NAME = 'Tournament Players';

export type PlayersSummaryRow = Pick<
  Database['public']['Tables']['players']['Row'],
  'id' | 'rank' | 'name' | 'rating' | 'dob' | 'gender' | 'state' | 'city' | 'club'
>;

const styles = StyleSheet.create({
  page: {
    padding: 32,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#1f2937'
  },
  header: {
    marginBottom: 16
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4
  },
  subtitle: {
    fontSize: 10,
    color: '#4b5563'
  },
  table: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 4,
    overflow: 'hidden'
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f9fafb',
    borderBottomWidth: 1,
    borderColor: '#d1d5db',
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontWeight: 'bold'
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderColor: '#e5e7eb',
    paddingVertical: 6,
    paddingHorizontal: 8
  },
  cellRank: {
    width: '8%',
    paddingRight: 6
  },
  cellName: {
    width: '24%',
    paddingRight: 6
  },
  cellRating: {
    width: '12%',
    paddingRight: 6
  },
  cellDob: {
    width: '16%',
    paddingRight: 6
  },
  cellGender: {
    width: '10%',
    paddingRight: 6
  },
  cellState: {
    width: '10%',
    paddingRight: 6
  },
  cellCity: {
    width: '10%',
    paddingRight: 6
  },
  cellClub: {
    width: '10%'
  },
  footer: {
    marginTop: 12,
    fontSize: 9,
    color: '#6b7280'
  }
});

function sanitizeSlug(slug?: string | null) {
  if (!slug) return 'tournament';
  return slug
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function formatTimestampForFile(date: Date) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(date).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== 'literal') {
      acc[part.type] = part.value;
    }
    return acc;
  }, {});

  return `${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}IST`;
}

function formatHumanTimestamp(date: Date) {
  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

export function maskDobForPublic(
  dob?: string | null,
  shouldMask: boolean = PUBLIC_DOB_MASKING
): string {
  if (!dob) return '—';
  if (!shouldMask) return dob;

  const [year, month, day] = dob.split('-');
  if (!year) return '—';

  const maskSegment = (segment?: string) => {
    if (!segment || segment === '00') return '00';
    return 'XX';
  };

  const maskedMonth = maskSegment(month);
  const maskedDay = maskSegment(day);

  if (!month && !day) {
    return `${year}`;
  }

  if (!day) {
    return `${year}-${maskedMonth}`;
  }

  return `${year}-${maskedMonth}-${maskedDay}`;
}

export interface PlayersSummaryDocProps {
  tournamentName?: string | null;
  generatedAt?: Date;
  players: PlayersSummaryRow[];
  maskDob?: boolean;
}

export const PlayersSummaryDoc = ({
  tournamentName,
  generatedAt = new Date(),
  players,
  maskDob = PUBLIC_DOB_MASKING
}: PlayersSummaryDocProps) => (
  <Document>
    <Page size="A4" style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.title}>{tournamentName || DEFAULT_TOURNAMENT_NAME}</Text>
        <Text style={styles.subtitle}>
          Generated at {formatHumanTimestamp(generatedAt)} • Total Players: {players.length}
        </Text>
      </View>

      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={styles.cellRank}>Rank</Text>
          <Text style={styles.cellName}>Name</Text>
          <Text style={styles.cellRating}>Rating</Text>
          <Text style={styles.cellDob}>DOB</Text>
          <Text style={styles.cellGender}>Gender</Text>
          <Text style={styles.cellState}>State</Text>
          <Text style={styles.cellCity}>City</Text>
          <Text style={styles.cellClub}>Club</Text>
        </View>
        {players.map(player => (
          <View key={player.id} style={styles.tableRow}>
            <Text style={styles.cellRank}>{formatValue(player.rank)}</Text>
            <Text style={styles.cellName}>{formatValue(player.name)}</Text>
            <Text style={styles.cellRating}>{formatValue(player.rating)}</Text>
            <Text style={styles.cellDob}>{maskDobForPublic(player.dob, maskDob)}</Text>
            <Text style={styles.cellGender}>{formatValue(player.gender)}</Text>
            <Text style={styles.cellState}>{formatValue(player.state)}</Text>
            <Text style={styles.cellCity}>{formatValue(player.city)}</Text>
            <Text style={styles.cellClub}>{formatValue(player.club)}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.footer}>
        Prize Manager • Exported via Players Summary • {formatHumanTimestamp(generatedAt)}
      </Text>
    </Page>
  </Document>
);

interface DownloadPlayersPdfOptions {
  tournamentId: string;
  tournamentName?: string | null;
  tournamentSlug?: string | null;
  maskDob?: boolean;
  supabaseClient?: SupabaseClient<Database>;
}

export async function downloadPlayersPdf({
  tournamentId,
  tournamentName,
  tournamentSlug,
  maskDob = PUBLIC_DOB_MASKING,
  supabaseClient
}: DownloadPlayersPdfOptions) {
  console.log(`${LOG_PREFIX}:start`, { tournamentId });

  try {
    const client = supabaseClient ?? supabase;
    if (!client) {
      throw new Error('Supabase client is not available');
    }

    const { data, error } = await client
      .from('players')
      .select('id, rank, name, rating, dob, gender, state, city, club')
      .eq('tournament_id', tournamentId)
      .order('rank', { ascending: true, nullsFirst: true })
      .order('name', { ascending: true });

    if (error) {
      throw error;
    }

    const players: PlayersSummaryRow[] = data ?? [];
    const generatedAt = new Date();

    const blob = await pdf(
      <PlayersSummaryDoc
        tournamentName={tournamentName}
        generatedAt={generatedAt}
        players={players}
        maskDob={maskDob}
      />
    ).toBlob();

    const slug = sanitizeSlug(tournamentSlug || tournamentName || undefined);
    const timestamp = formatTimestampForFile(generatedAt);
    const filename = `players_${slug}_${timestamp}.pdf`;

    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);

    console.log(`${LOG_PREFIX}:ok`, { filename, rows: players.length });
  } catch (error) {
    console.error(`${LOG_PREFIX}:error`, error);
    throw error;
  }
}
