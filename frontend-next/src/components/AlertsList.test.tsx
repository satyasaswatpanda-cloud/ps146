import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AlertsList from "./AlertsList";
import type { Alert } from "@/types/api";

function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: "ALT-001",
    txid: "tx00000000000000000000000000000000000000000000000000000000abcd",
    src_ip: "10.0.0.1",
    geo_country: "US",
    asn: "AS64500",
    score: 92.1,
    confidence: 0.91,
    reasons: ["many output addresses"],
    shap_explanation: null,
    catboost_shap_explanation: null,
    patterns: [],
    entity_id: null,
    network_origin: null,
    detectors: { isolation_forest: "outlier", catboost: null, graph_pattern: false },
    ...overrides,
  };
}

describe("AlertsList", () => {
  it("shows an empty state when there are no alerts", () => {
    render(<AlertsList alerts={[]} selectedId={null} onSelect={() => {}} />);
    expect(screen.getByText(/no alerts raised/i)).toBeInTheDocument();
  });

  it("renders one row per alert with id, score and source IP", () => {
    const alerts = [makeAlert({ id: "ALT-001", score: 92.1 }), makeAlert({ id: "ALT-002", score: 45.6 })];
    render(<AlertsList alerts={alerts} selectedId={null} onSelect={() => {}} />);
    expect(screen.getByText("ALT-001")).toBeInTheDocument();
    expect(screen.getByText("ALT-002")).toBeInTheDocument();
    expect(screen.getByText("92.1")).toBeInTheDocument();
    expect(screen.getByText("45.6")).toBeInTheDocument();
  });

  it("calls onSelect with the alert id when a row is clicked", () => {
    const onSelect = vi.fn();
    const alerts = [makeAlert({ id: "ALT-007" })];
    render(<AlertsList alerts={alerts} selectedId={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("ALT-007"));
    expect(onSelect).toHaveBeenCalledWith("ALT-007");
  });

  it("surfaces the first graph pattern label when present", () => {
    const alerts = [makeAlert({ patterns: ["CHN-001 hop 1/5", "other"] })];
    render(<AlertsList alerts={alerts} selectedId={null} onSelect={() => {}} />);
    expect(screen.getByText("CHN-001 hop 1/5")).toBeInTheDocument();
  });
});
