"use client";
import { ArrowUpRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Button } from "./ui/button";
import Link from "next/link";

export function DeploymentCard() {
  return (
    <Card className="relative w-full h-full overflow-hidden">
      <CardHeader>
        <CardTitle className="text-xl">Deployment</CardTitle>
        <CardDescription className="mt-2">
          Easily deploy GetProfile in your environment with Docker.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-base text-foreground">
          <li className="text-sm flex flex-row items-start gap-2">
            <span>1.</span>
            <span>Lightweight proxy built with Hono</span>
          </li>
          <li className="text-sm flex flex-row items-start gap-2">
            <span>2.</span>
            <span>Persistent profiles storage via PostgreSQL</span>
          </li>
          <li className="text-sm flex flex-row items-start gap-2">
            <span>3.</span>
            <span>Minimum external dependencies</span>
          </li>
          <li className="text-sm flex flex-row items-start gap-2">
            <span>4.</span>
            <span>Easy scaling with Docker Compose</span>
          </li>
        </ul>
        <p className="mt-6 font-bold">
          Ready to deploy GetProfile in your environment?
        </p>
        <Button asChild size={"sm"} variant="outline" className="mt-6">
          <Link href={process.env.NEXT_PUBLIC_DOCS_URL + "/quickstart"}>
            Quickstart Guide
            <ArrowUpRight className="size-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
