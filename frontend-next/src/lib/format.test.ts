import { describe, expect, it } from "vitest";
import {
  formatScore,
  riskLabel,
  formatBTC,
  formatPercent,
  truncateId,
  formatDuration,
  formatEpoch,
  pluralize,
} from "./format";

describe("formatScore", () => {
  it("shows one decimal place", () => {
    expect(formatScore(87)).toBe("87.0");
    expect(formatScore(42.345)).toBe("42.3");
  });
});

describe("riskLabel", () => {
  it("buckets scores into risk tiers matching the dashboard's colour legend", () => {
    expect(riskLabel(95)).toBe("critical");
    expect(riskLabel(90)).toBe("critical");
    expect(riskLabel(89.9)).toBe("high");
    expect(riskLabel(70)).toBe("high");
    expect(riskLabel(69.9)).toBe("moderate");
    expect(riskLabel(40)).toBe("moderate");
    expect(riskLabel(0)).toBe("low");
  });
});

describe("formatBTC", () => {
  it("trims trailing zeros but keeps significant digits", () => {
    expect(formatBTC(0.1)).toBe("0.1 BTC");
    expect(formatBTC(1.5)).toBe("1.5 BTC");
    expect(formatBTC(0)).toBe("0 BTC");
  });

  it("respects a custom digit count", () => {
    expect(formatBTC(1.23456789, 4)).toBe("1.2346 BTC");
  });
});

describe("formatPercent", () => {
  it("rounds a fraction to a whole percent", () => {
    expect(formatPercent(0.6)).toBe("60%");
    expect(formatPercent(0.005)).toBe("1%");
    expect(formatPercent(0)).toBe("0%");
  });
});

describe("truncateId", () => {
  it("leaves short ids untouched", () => {
    expect(truncateId("tx123")).toBe("tx123");
  });

  it("truncates long ids to head…tail", () => {
    const id = "tx00000000000000000000000000000000000000000000000000000000abcd";
    const out = truncateId(id);
    expect(out.startsWith("tx000000")).toBe(true);
    expect(out.endsWith("abcd")).toBe(true);
    expect(out).toContain("…");
  });

  it("handles empty input without throwing", () => {
    expect(truncateId("")).toBe("");
  });
});

describe("formatDuration", () => {
  it("shows seconds under a minute", () => {
    expect(formatDuration(2.431)).toBe("2.4s");
  });

  it("shows minutes and seconds over a minute", () => {
    expect(formatDuration(125)).toBe("2m 5s");
  });
});

describe("formatEpoch", () => {
  it("renders a UTC timestamp", () => {
    expect(formatEpoch(0)).toBe("1970-01-01 00:00:00 UTC");
  });

  it("renders an em-dash for missing timestamps", () => {
    expect(formatEpoch(null)).toBe("—");
    expect(formatEpoch(undefined)).toBe("—");
  });
});

describe("pluralize", () => {
  it("keeps the singular for a count of one", () => {
    expect(pluralize(1, "record")).toBe("1 record");
  });

  it("pluralizes for any other count", () => {
    expect(pluralize(0, "record")).toBe("0 records");
    expect(pluralize(5, "record")).toBe("5 records");
  });

  it("accepts an irregular plural", () => {
    expect(pluralize(3, "entity", "entities")).toBe("3 entities");
  });
});
