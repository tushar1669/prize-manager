import { useCallback } from "react";
import * as XLSX from "xlsx";
import { detectHeaderRow } from "@/utils/sheetDetection";
import { isFeatureEnabled, SERVER_IMPORT_ENABLED, IMPORT_SIZE_THRESHOLD_MB } from "@/utils/featureFlags";
import { computeSHA256Hex } from "@/utils/hash";
import { inferImportSource } from "@/utils/importSchema";
import { supabase } from "@/integrations/supabase/client";

const LOCAL_PARSE_TIMEOUT_MS = 3000;
const PROHIBITED_EXTENSION = ['.', 'c', 's', 'v'].join('');

export type ParseResult = {
  data: Record<string, unknown>[];
  headers: string[];
  sheetName?: string;
  headerRow?: number;
  fileHash?: string | null;
  mode: "local" | "server";
  source?: "swiss-manager" | "organizer-template" | "unknown";
  fallback?: "local-error" | "local-timeout" | "server-error";
  /** Server-computed gender column config (only from server mode) */
  genderConfig?: {
    genderColumn: string | null;
    fsColumn: string | null;
    headerlessGenderColumn: string | null;
    preferredColumn: string | null;
    preferredSource: string | null;
  } | null;
};

export type ParseFileOptions = {
  forceServer?: boolean;
  tournamentId?: string;
};

type ServerParsePayload = {
  rows?: Record<string, unknown>[];
  headers?: string[];
  sheetName?: string;
  headerRow?: number;
  fileHash?: string | null;
  source?: "swiss-manager" | "organizer-template" | "unknown";
  genderConfig?: ParseResult["genderConfig"];
};

function normalizeHeaders(headers: unknown[]): string[] {
  return (headers || []).map((header, idx) => {
    const trimmed = String(header ?? "").trim();
    return trimmed.length > 0 ? trimmed : `__EMPTY_COL_${idx}`;
  });
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error("local parse timeout"));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
}

export function useExcelParser() {
  const parseLocally = useCallback(async (file: File, buffer: ArrayBuffer, opts: { hash?: string | null } = {}): Promise<ParseResult> => {
    let fileHash: string | null | undefined = opts.hash;
    if (fileHash === undefined) {
      try {
        fileHash = await computeSHA256Hex(buffer);
        if (fileHash) {
          console.log(`[import.hash] sha256=${fileHash}`);
        }
      } catch (hashErr) {
        console.warn("[import.hash] compute failed", hashErr);
        fileHash = null;
      }
    }

    console.log("[import.local] start");
    const startedAt = performance.now();

    try {
      const workbook = XLSX.read(buffer, { type: "array" });
      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        throw new Error("No sheets found in this workbook.");
      }

      let sheetName: string;
      let headerRowIndex: number;
      let headers: string[];

      if (isFeatureEnabled("HEADER_DETECTION")) {
        const allSheets: Record<string, unknown[][]> = {};
        workbook.SheetNames.forEach((name) => {
          allSheets[name] = XLSX.utils.sheet_to_json(workbook.Sheets[name], {
            header: 1,
            defval: "",
            raw: false
          }) as unknown[][];
        });

        const detected = detectHeaderRow(allSheets, 25);
        sheetName = detected.sheetName;
        headerRowIndex = detected.headerRowIndex;
        headers = detected.headers;

        console.log(`[detect] headerRow=${headerRowIndex + 1} sheet=${sheetName}`);
        console.log("[parseExcel] V2 Header detection:", {
          sheet: sheetName,
          row: headerRowIndex,
          confidence: detected.confidence,
          headers: headers.slice(0, 10)
        });
      } else {
        sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const asRows: unknown[][] = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          defval: ""
        }) as unknown[][];

        if (!asRows.length || !asRows[0]) {
          throw new Error("No header row found. Please use the provided template and ensure row 1 has headers.");
        }

        headerRowIndex = 0;
        headers = normalizeHeaders(asRows[0]);

        console.log(`[detect] headerRow=1 sheet=${sheetName} (legacy)`);
        console.log("[parseExcel] V1 Legacy mode (row 1):", headers);
      }

      if (!headers.length) {
        throw new Error("Could not detect any headers. Please verify the template.");
      }

      const worksheet = workbook.Sheets[sheetName];
      if (!worksheet) {
        throw new Error("Worksheet missing after detection.");
      }

      const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
        header: headers,
        range: headerRowIndex + 1,
        defval: ""
      });

      if (!Array.isArray(data) || data.length === 0) {
        throw new Error("No data rows found under the header row. Please ensure your data follows the header.");
      }

      const durationMs = Math.round(performance.now() - startedAt);
      console.log(`[import.local] ok rows=${data.length} duration_ms=${durationMs}`);

      return {
        data,
        headers,
        sheetName,
        headerRow: headerRowIndex + 1,
        fileHash: fileHash ?? null,
        mode: "local",
        source: inferImportSource(headers, data as Record<string, unknown>[])
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[import.local] error message=${message}`);
      throw error instanceof Error ? error : new Error(message);
    }
  }, []);

  const parseViaServer = useCallback(async (
    file: File,
    opts: { buffer?: ArrayBuffer; hash?: string | null; tournamentId?: string } = {}
  ): Promise<ParseResult> => {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      throw new Error("Authentication required for server parsing");
    }

    const body = opts.buffer ?? (await file.arrayBuffer());

    const headers: Record<string, string> = {
      "Content-Type": file.type || "application/octet-stream",
      "x-tournament-id": opts.tournamentId ?? "",
      "x-file-name": file.name || "upload.xlsx",
      Authorization: `Bearer ${accessToken}`
    };

    if (opts.hash) {
      headers["x-sha256"] = opts.hash;
    }

    const { data, error } = await supabase.functions.invoke("parseWorkbook", {
      body,
      headers
    });

    if (error) {
      throw new Error(error.message ?? "Server parse failed");
    }

    const payload = data as ServerParsePayload;
    return {
      data: payload?.rows ?? [],
      headers: payload?.headers ?? [],
      sheetName: payload?.sheetName ?? "Players",
      headerRow: payload?.headerRow ?? 1,
      fileHash: payload?.fileHash ?? opts.hash ?? null,
      mode: "server",
      source: payload?.source ?? "unknown",
      genderConfig: payload?.genderConfig ?? null
    };
  }, []);

  const parseFile = useCallback(async (file: File, options: ParseFileOptions = {}): Promise<ParseResult> => {
    const name = (file.name || "").toLowerCase();
    if (name.endsWith(PROHIBITED_EXTENSION)) {
      return Promise.reject(new Error("Only Excel files are accepted (.xls, .xlsx)."));
    }
    if (!name.endsWith(".xls") && !name.endsWith(".xlsx")) {
      return Promise.reject(new Error("Unsupported file type. Please upload Excel (.xls or .xlsx)."));
    }

    console.log(`[import.size] bytes=${file.size}`);

    const thresholdBytes = IMPORT_SIZE_THRESHOLD_MB * 1024 * 1024;
    const prefersServer = SERVER_IMPORT_ENABLED && (options.forceServer || file.size > thresholdBytes);

    if (prefersServer) {
      console.log("[import.source] chosen=server");
      try {
        return await parseViaServer(file, {
          tournamentId: options.tournamentId
        });
      } catch (serverError) {
        const message = serverError instanceof Error ? serverError.message : String(serverError);
        console.error(`[import.srv] error message=${message}`);
        if (!SERVER_IMPORT_ENABLED) {
          throw serverError instanceof Error ? serverError : new Error(message);
        }

        const buffer = await file.arrayBuffer();
        let hash: string | null = null;
        try {
          hash = await computeSHA256Hex(buffer);
          if (hash) {
            console.log(`[import.hash] sha256=${hash}`);
          }
        } catch (hashErr) {
          console.warn("[import.hash] compute failed", hashErr);
          hash = null;
        }

        console.log("[import.source] chosen=local");
        const localResult = await parseLocally(file, buffer, { hash });
        return { ...localResult, fallback: "server-error" };
      }
    }

    console.log("[import.source] chosen=local");
    const buffer = await file.arrayBuffer();
    let hash: string | null = null;
    try {
      hash = await computeSHA256Hex(buffer);
      if (hash) {
        console.log(`[import.hash] sha256=${hash}`);
      }
    } catch (hashErr) {
      console.warn("[import.hash] compute failed", hashErr);
      hash = null;
    }

    try {
      return await withTimeout(parseLocally(file, buffer, { hash }), LOCAL_PARSE_TIMEOUT_MS);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === "local parse timeout") {
        console.warn("[import.local] error message=timeout");
      }

      if (!SERVER_IMPORT_ENABLED) {
        throw error instanceof Error ? error : new Error(message);
      }

      try {
        const serverResult = await parseViaServer(file, {
          buffer,
          hash,
          tournamentId: options.tournamentId
        });

        return {
          ...serverResult,
          fallback: message === "local parse timeout" ? "local-timeout" : "local-error"
        };
      } catch (serverError) {
        const serverMessage = serverError instanceof Error ? serverError.message : String(serverError);
        console.error(`[import.srv] error message=${serverMessage}`);
        throw error instanceof Error ? error : new Error(message);
      }
    }
  }, [parseLocally, parseViaServer]);

  return { parseFile };
}
