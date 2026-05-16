export const SAMPLE_DOCUMENT = {
  title: "Q3 2025 Financial Summary — FY25-Report.pdf",
  metadata: "14 pages · 3 tables · 2 charts detected",
  summary: [
    {
      text: "Revenue grew 12% year-over-year to $847M, driven primarily by enterprise segment expansion.",
      citation: "[Page 2]"
    },
    {
      text: "Operating margin contracted 1.4 points to 18.6% due to increased R&D investment in AI capabilities.",
      citation: "[Page 4]"
    },
    {
      text: "Document contains 3 structured financial tables spanning income statement, balance sheet, and cash flow.",
      citation: "[Pages 5–7]"
    },
    {
      text: "Board approved a $200M share repurchase program effective Q4 2025.",
      citation: "[Page 11]"
    }
  ],
  insights: [
    {
      type: "growth",
      badge: "↑ GROWTH",
      color: "bg-[#4ade80]/10 text-[#4ade80] border-[#4ade80]/20",
      text: "Enterprise revenue up 23% — fastest segment growth in 3 years.",
      citation: "[Page 3, Table 1]"
    },
    {
      type: "risk",
      badge: "⚠ RISK",
      color: "bg-[#facc15]/10 text-[#facc15] border-[#facc15]/20",
      text: "Deferred revenue declined 8%, signaling potential churn in mid-market.",
      citation: "[Page 6]"
    },
    {
      type: "trend",
      badge: "📊 TREND",
      color: "bg-[#60a5fa]/10 text-[#60a5fa] border-[#60a5fa]/20",
      text: "R&D spend as % of revenue hit 22%, highest since 2021.",
      citation: "[Page 4, Table 2]"
    }
  ],
  suggestedQuestions: [
    "What was total revenue?",
    "Compare Q3 vs Q2 margins",
    "Any risks mentioned?"
  ]
};

export function getSampleAnswer(question: string) {
  const q = question.toLowerCase();
  if (q.includes("revenue") || q.includes("total")) {
    return {
      answer: "Total revenue for Q3 2025 was $847 million, representing a 12% increase from $756 million in Q3 2024. The growth was primarily driven by the Enterprise segment, which contributed $412M (+23% YoY), while the SMB segment grew 4% to $435M.",
      citations: ["[Page 2, Table 1]", "[Page 3]"]
    };
  }
  if (q.includes("margin") || q.includes("profit") || q.includes("compare")) {
    return {
      answer: "Operating margin for Q3 2025 contracted to 18.6%, down 1.4 percentage points compared to Q2. This contraction was primarily attributed to accelerated R&D investments, despite the strong topline revenue growth.",
      citations: ["[Page 4, Table 2]"]
    };
  }
  if (q.includes("risk") || q.includes("churn") || q.includes("concern")) {
    return {
      answer: "The primary risk highlighted in the report is an 8% decline in deferred revenue within the mid-market segment. Management noted this could signal potential churn over the next two quarters and has deployed targeted retention campaigns in response.",
      citations: ["[Page 6]"]
    };
  }
  if (q.includes("r&d") || q.includes("research") || q.includes("spend")) {
    return {
      answer: "R&D spending increased significantly to reach 22% of total revenue. This represents the highest allocation since 2021 and was strategically directed toward expanding internal AI capabilities and infrastructure.",
      citations: ["[Page 4]"]
    };
  }
  
  // Fallback
  return {
    answer: "Based on the Q3 2025 financial report, the company showed strong overall growth at 12% YoY, balancing aggressive enterprise expansion with strategic investments in product infrastructure.",
    citations: ["[Page 2]"]
  };
}
