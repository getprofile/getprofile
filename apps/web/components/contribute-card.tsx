"use client";
import { Bug, Code } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import Link from "next/link";

export function ContributeCard() {
  return (
    <Card className="relative w-full h-full overflow-hidden">
      <CardHeader>
        <CardTitle className="text-xl">Join the Community</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-start justify-start gap-4 md:gap-6">
          <Button asChild variant="outline">
            <Link href={process.env.NEXT_PUBLIC_GITHUB_URL + "/issues"}>
              <Bug className="size-4" />
              <span>Report issues</span>
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link
              href={
                process.env.NEXT_PUBLIC_GITHUB_URL + "/blob/web/CONTRIBUTING.md"
              }
            >
              <Code className="size-4" />
              <span>Contribute code</span>
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
