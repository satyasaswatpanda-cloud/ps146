"use client";

import { useCallback, useState } from "react";
import { analyzeFile, analyzeSample } from "@/lib/api";
import type { AnalyzeResult } from "@/types/api";

export type AnalysisState = {
  result: AnalyzeResult | null;
  loading: boolean;
  error: string | null;
  sourceLabel: string | null;
};

export function useAnalysis() {
  const [state, setState] = useState<AnalysisState>({
    result: null,
    loading: false,
    error: null,
    sourceLabel: null,
  });

  const loadSample = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const result = await analyzeSample();
      setState({ result, loading: false, error: null, sourceLabel: "sample_transactions.csv (bundled)" });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: (err as Error).message }));
    }
  }, []);

  const loadFile = useCallback(async (file: File) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const result = await analyzeFile(file);
      setState({ result, loading: false, error: null, sourceLabel: file.name });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: (err as Error).message }));
    }
  }, []);

  const clearAnalysis = useCallback(() => {
    setState({ result: null, loading: false, error: null, sourceLabel: null });
  }, []);

  const clearError = useCallback(() => {
    setState((s) => ({ ...s, error: null }));
  }, []);

  return { ...state, loadSample, loadFile, clearAnalysis, clearError };
}

