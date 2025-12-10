"use client";
import { Card, CardContent } from "@/components/ui/card";
import { ModeToggle } from "./mode-toggle";
import { Button } from "./ui/button";
import Link from "next/link";
import { BookOpen, Github } from "lucide-react";
import { Logo } from "./logo";
export function IntroCard() {
  return (
    <Card className="relative w-full h-full overflow-hidden">
      <div className="absolute right-2 top-2 z-2">
        <ModeToggle />
      </div>
      <CardContent className="relative z-1 pt-12 md:pt-16 pb-12 md:pb-16">
        <h1 className="text-foreground font-bold text-3xl md:text-7xl mb-4">
          <Logo className="inline-block size-20 -mt-4 -ml-2 -mr-4" />{" "}
          <span className="font-normal">Get</span>Profile
        </h1>
        <p className="text-muted-foreground text-xl ml-1 mb-8">
          User profile and long-term memory for your AI agent
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center md:justify-start gap-4 md:gap-6">
          <Button asChild size={"lg"} className="text-base px-8! rounded-lg">
            <Link href={process.env.NEXT_PUBLIC_GITHUB_URL!}>
              GitHub <Github />
            </Link>
          </Button>
          <Button asChild size={"lg"} className="text-base px-8! rounded-lg">
            <Link href={process.env.NEXT_PUBLIC_DOCS_URL!}>
              Docs <BookOpen />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
