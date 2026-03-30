/**
 * Tests for entity extractor — regex-based extraction of names, dates, numbers, locations.
 */

import { describe, it, expect } from "vitest";
import { extract, suggestType } from "../../src/knowledge/extractor.js";

describe("extract", () => {
  describe("date extraction", () => {
    it("extracts ISO dates", () => {
      const result = extract("The regulation takes effect on 2025-06-15.");
      const dates = result.entities.filter(e => e.kind === "date");
      expect(dates.length).toBeGreaterThanOrEqual(1);
      expect(dates.some(d => d.value === "2025-06-15")).toBe(true);
    });

    it("extracts US-style dates", () => {
      const result = extract("Season opens 06/15/2025.");
      const dates = result.entities.filter(e => e.kind === "date");
      expect(dates.length).toBeGreaterThanOrEqual(1);
      expect(dates.some(d => d.value.includes("06/15"))).toBe(true);
    });

    it("extracts month-name dates", () => {
      const result = extract("We caught it on March 15, 2024.");
      const dates = result.entities.filter(e => e.kind === "date");
      expect(dates.length).toBeGreaterThanOrEqual(1);
    });

    it("extracts relative dates", () => {
      const result = extract("The fish were biting yesterday and last week.");
      const dates = result.entities.filter(e => e.kind === "date");
      expect(dates.length).toBeGreaterThanOrEqual(1);
      expect(dates.some(d => d.value === "yesterday")).toBe(true);
    });
  });

  describe("number extraction", () => {
    it("extracts weights with units", () => {
      const result = extract("The salmon weighed 12.5 kg and was 85 cm long.");
      const numbers = result.entities.filter(e => e.kind === "number");
      expect(numbers.some(n => n.value === "12.5 kg")).toBe(true);
      expect(numbers.some(n => n.value === "85 cm")).toBe(true);
    });

    it("extracts pounds and feet", () => {
      const result = extract("Caught a 30 lbs halibut in 200 ft of water.");
      const numbers = result.entities.filter(e => e.kind === "number");
      expect(numbers.some(n => n.value === "30 lbs")).toBe(true);
      expect(numbers.some(n => n.value === "200 ft")).toBe(true);
    });

    it("extracts temperature", () => {
      const result = extract("Water temperature was 15 celsius.");
      const numbers = result.entities.filter(e => e.kind === "number");
      expect(numbers.some(n => n.value === "15 celsius")).toBe(true);
    });
  });

  describe("location extraction", () => {
    it("extracts geographic names", () => {
      const result = extract("Fished at Lake Superior near Bay Harbor.");
      const locations = result.entities.filter(e => e.kind === "location");
      expect(locations.length).toBeGreaterThanOrEqual(1);
      expect(locations.some(l => l.value === "Lake Superior")).toBe(true);
    });

    it("extracts bay and river patterns", () => {
      const result = extract("We trolled near Bay Champlain and River Thames.");
      const locations = result.entities.filter(e => e.kind === "location");
      expect(locations.some(l => l.value.includes("Bay"))).toBe(true);
    });
  });

  describe("name extraction", () => {
    it("extracts multi-word capitalized names", () => {
      const result = extract("John Smith showed us the technique and Mary Jones agreed.");
      const names = result.entities.filter(e => e.kind === "name");
      expect(names.some(n => n.value === "John Smith" || n.value === "Mary Jones")).toBe(true);
    });
  });

  describe("type suggestion", () => {
    it("suggests species from fish-related text", () => {
      const result = extract("Pacific salmon species spawn in freshwater streams. Their habitat includes rivers.");
      expect(result.suggestedType).toBe("species");
    });

    it("suggests regulation from legal text", () => {
      const result = extract("The regulation requires a permit. The quota limit is 5 per season. Compliance is required. Violation results in enforcement.");
      expect(result.suggestedType).toBe("regulation");
    });

    it("suggests technique from method text", () => {
      const result = extract("The technique involves jigging with a lure. Step by step procedure for bait casting and how to reel.");
      expect(result.suggestedType).toBe("technique");
    });

    it("suggests location from geography text", () => {
      const result = extract("The GPS coordinates show the location at latitude 47. Zone 4 has terrain and elevation changes. The water depth varies.");
      expect(result.suggestedType).toBe("location");
    });

    it("suggests equipment from gear text", () => {
      const result = extract("The equipment selection includes a boat, motor, waders, swivel, sinker, and float. Check the brand, model, and manufacturer specification.");
      expect(result.suggestedType).toBe("equipment");
    });

    it("returns general for ambiguous text", () => {
      const result = extract("Hello world, this is some random text.");
      expect(result.suggestedType).toBe("general");
    });
  });

  describe("tags generation", () => {
    it("generates tags from location entities", () => {
      const result = extract("We fished at Lake Tahoe.");
      expect(result.tags.some(t => t.includes("lake"))).toBe(true);
    });

    it("includes user-relevant keywords", () => {
      const result = extract("The TensorFlow model uses Keras.");
      expect(result.tags.length).toBeGreaterThan(0);
    });
  });

  describe("summary", () => {
    it("returns first ~200 chars as summary", () => {
      const longText = "A ".repeat(300);
      const result = extract(longText);
      expect(result.summary.length).toBeLessThanOrEqual(203); // 200 + "..."
    });

    it("returns full text as summary when short", () => {
      const shortText = "Short text.";
      const result = extract(shortText);
      expect(result.summary).toBe(shortText);
    });
  });

  describe("deduplication", () => {
    it("does not return duplicate entities", () => {
      const result = extract("On 2025-01-01 and 2025-01-01 we fished.");
      const dates = result.entities.filter(e => e.kind === "date" && e.value === "2025-01-01");
      expect(dates).toHaveLength(1);
    });
  });

  describe("context", () => {
    it("provides surrounding context for entities", () => {
      const result = extract("The fish weighed 15 kg in total.");
      const nums = result.entities.filter(e => e.kind === "number");
      if (nums.length > 0) {
        expect(nums[0]!.context).toBeDefined();
        expect(nums[0]!.context!.length).toBeGreaterThan(0);
      }
    });
  });
});

describe("suggestType", () => {
  it("returns species for fish-related content", () => {
    expect(suggestType("The species of fish is salmon.")).toBe("species");
  });

  it("returns regulation for legal content", () => {
    expect(suggestType("Regulation requires a permit.")).toBe("regulation");
  });

  it("returns technique for method content", () => {
    expect(suggestType("The technique requires a specific approach.")).toBe("technique");
  });

  it("returns general when no keywords match", () => {
    expect(suggestType("The quick brown fox jumps over the lazy dog.")).toBe("general");
  });
});
