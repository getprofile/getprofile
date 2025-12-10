"use client";
import Link from "next/link";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { ArrowUpRight, Dot } from "lucide-react";

export function OpenAICompatibilityCard() {
  return (
    <Card className="relative w-full h-full overflow-hidden">
      <CardHeader>
        <CardTitle className="text-xl">OpenAI-compatible</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-base text-foreground">
          <li className="text-base flex flex-row items-start gap-2">
            <Dot className="shrink-0 size-6 mt-1" />
            <span>Drop-in proxy for OpenAI API</span>
          </li>
          <li className="text-base flex flex-row items-start gap-2">
            <Dot className="shrink-0 size-6 mt-1" />
            <span>
              Use with GetProfile SDK or point OpenAI/AI-SDK to GetProfile proxy
            </span>
          </li>
          <li className="text-base flex flex-row items-start gap-2">
            <Dot className="shrink-0 size-6 mt-1" />
            <span>No changes needed to your existing OpenAI-based code</span>
          </li>
        </ul>
        <Button asChild size={"sm"} variant="outline" className="mt-6 md:mt-10">
          <Link
            href={process.env.NEXT_PUBLIC_DOCS_URL + "/openai-compatibility"}
          >
            Learn more
            <ArrowUpRight className="size-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
