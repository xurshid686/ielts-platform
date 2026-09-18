"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PracticePdfInput } from "@/lib/writing-practice-pdf";

/**
 * Downloads the student's own copy of a submitted practice. Everything it needs
 * comes from the ATTEMPT's snapshot, handed down by the server — so the file is
 * the same whether it is made a second after submitting or a year later, even
 * if the question has since been reworded or unpublished.
 */
export function PracticePdfButton(props: PracticePdfInput & { variant?: "primary" | "outline" }) {
  const [making, setMaking] = useState(false);
  const { variant = "outline", ...input } = props;
  return (
    <Button
      variant={variant}
      disabled={making}
      onClick={() => {
        setMaking(true);
        void (async () => {
          const { downloadPracticePdf } = await import("@/lib/writing-practice-pdf");
          await downloadPracticePdf(input);
        })().finally(() => setMaking(false));
      }}
    >
      {making ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download PDF
    </Button>
  );
}
