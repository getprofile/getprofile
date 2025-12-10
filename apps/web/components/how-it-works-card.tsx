"use client";
import { ArrowUpRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import Link from "next/link";

export function HowItWorksCard() {
  return (
    <Card className="relative w-full h-full overflow-hidden">
      <CardHeader>
        <CardTitle className="text-xl">How It Works</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-base text-foreground">
          <li className="text-sm flex flex-row items-start gap-2">
            <span>1.</span>
            <span>Your agent sends a request to GetProfile proxy</span>
          </li>
          <li className="text-sm flex flex-row items-start gap-2">
            <span>2.</span>
            <span>
              GetProfile enriches the request with user profile and memory
            </span>
          </li>
          <li className="text-sm flex flex-row items-start gap-2">
            <span>3.</span>
            <span>The enriched request is forwarded to the LLM provider</span>
          </li>
          <li className="text-sm flex flex-row items-start gap-2">
            <span>4.</span>
            <span>The LLM generates a response</span>
          </li>
          <li className="text-sm flex flex-row items-start gap-2">
            <span>5.</span>
            <span>The response is sent back to your agent</span>
          </li>
          <li className="text-sm flex flex-row items-start gap-2">
            <span>6.</span>
            <span>
              GetProfile updates the user profile and memory in the background
            </span>
          </li>
        </ul>
        <p className="mt-6 font-bold">
          Minimal latency impact — seamless integration with your existing
          workflow.
        </p>
        <Button asChild size={"sm"} variant="outline" className="mt-6">
          <Link href={process.env.NEXT_PUBLIC_DOCS_URL + "/how-it-works"}>
            Learn more
            <ArrowUpRight className="size-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
