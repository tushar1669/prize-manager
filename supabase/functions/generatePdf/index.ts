import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GeneratePdfRequest {
  tournamentId: string;
  version: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const payload: GeneratePdfRequest = await req.json();
    const { tournamentId, version } = payload;

    console.log(`[generatePdf] Generating PDF for tournament ${tournamentId}, version ${version}`);

    // 1) Fetch tournament details
    const { data: tournament, error: tournamentError } = await supabaseClient
      .from('tournaments')
      .select('*')
      .eq('id', tournamentId)
      .single();

    if (tournamentError) throw new Error(`Tournament not found: ${tournamentError.message}`);

    // 2) Fetch allocations with related data
    const { data: allocations, error: allocationsError } = await supabaseClient
      .from('allocations')
      .select(`
        *,
        prizes:prize_id (
          *,
          categories:category_id (*)
        ),
        players:player_id (*)
      `)
      .eq('tournament_id', tournamentId)
      .eq('version', version);

    if (allocationsError) throw new Error(`Failed to fetch allocations: ${allocationsError.message}`);

    // 3) Generate HTML report
    const htmlContent = generateHtmlReport(tournament, allocations, version);

    // 4) Generate CSV
    const csvContent = generateCsvReport(tournament, allocations);

    // 5) For now, return the HTML/CSV as data URLs
    // In production, you'd use a PDF generation library and upload to storage
    const pdfDataUrl = `data:text/html;base64,${btoa(htmlContent)}`;
    const csvDataUrl = `data:text/csv;base64,${btoa(csvContent)}`;

    // TODO: Upload to storage/exports bucket and return signed URLs
    // const { data: pdfUpload } = await supabaseClient.storage
    //   .from('exports')
    //   .upload(`${tournamentId}/v${version}/report.pdf`, pdfBlob);

    console.log(`[generatePdf] PDF generated successfully for tournament ${tournamentId}`);

    return new Response(
      JSON.stringify({ 
        pdfUrlSigned: pdfDataUrl,
        csvUrlSigned: csvDataUrl,
        version 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[generatePdf] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function generateHtmlReport(tournament: any, allocations: any[], version: number): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <title>${tournament.title} - Prize Allocations v${version}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    h1 { color: #1F6E5B; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
    th { background-color: #1F6E5B; color: white; }
    .meta { color: #666; margin: 10px 0; }
  </style>
</head>
<body>
  <h1>${tournament.title}</h1>
  <div class="meta">
    <p><strong>Date:</strong> ${tournament.start_date} to ${tournament.end_date}</p>
    <p><strong>Venue:</strong> ${tournament.venue || 'N/A'}</p>
    <p><strong>Version:</strong> ${version}</p>
  </div>
  
  <h2>Prize Allocations</h2>
  <table>
    <thead>
      <tr>
        <th>Rank</th>
        <th>Player</th>
        <th>Category</th>
        <th>Prize</th>
        <th>Cash</th>
        <th>Trophy</th>
        <th>Medal</th>
      </tr>
    </thead>
    <tbody>
      ${allocations.map(a => `
        <tr>
          <td>${a.players?.rank || 'N/A'}</td>
          <td>${a.players?.name || 'N/A'}</td>
          <td>${a.prizes?.categories?.name || 'N/A'}</td>
          <td>Place ${a.prizes?.place || 'N/A'}</td>
          <td>₹${a.prizes?.cash_amount || 0}</td>
          <td>${a.prizes?.has_trophy ? '✓' : '—'}</td>
          <td>${a.prizes?.has_medal ? '✓' : '—'}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  
  <p class="meta">Generated on ${new Date().toLocaleDateString()}</p>
</body>
</html>
  `;
}

function generateCsvReport(tournament: any, allocations: any[]): string {
  const headers = 'Rank,Player,Category,Prize Place,Cash Amount,Trophy,Medal\n';
  const rows = allocations.map(a => 
    `${a.players?.rank || ''},${a.players?.name || ''},${a.prizes?.categories?.name || ''},${a.prizes?.place || ''},${a.prizes?.cash_amount || 0},${a.prizes?.has_trophy ? 'Yes' : 'No'},${a.prizes?.has_medal ? 'Yes' : 'No'}`
  ).join('\n');
  
  return headers + rows;
}
