"use client";
import { Lock, SearchCode, Star, Tag } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import Link from "next/link";

export function OpenSourceCard() {
  return (
    <Card className="relative w-full h-full overflow-hidden">
      <CardHeader>
        <CardTitle className="text-2xl">Open Source</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="list-none space-y-2 text-base text-foreground">
          <li className="text-base flex flex-row items-start gap-2">
            <Tag className="shrink-0 size-5 mt-1" />{" "}
            <span>Free forever - Apache 2.0 licensed</span>
          </li>
          <li className="text-base flex flex-row items-start gap-2">
            <Lock className="shrink-0 size-5 mt-1" />{" "}
            <span>Secure and private — your data stays with you</span>
          </li>
          <li className="text-base flex flex-row items-start gap-2">
            <SearchCode className="shrink-0 size-5 mt-1" />{" "}
            <span>Fully open — transparent and auditable codebase</span>
          </li>
        </ul>
        <Button asChild size={"sm"} variant="outline" className="mt-6 md:mt-10">
          <Link href={process.env.NEXT_PUBLIC_GITHUB_URL!}>
            Give us a star on GitHub
            <Star className="size-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
