"use client";
import { Bell } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Button } from "./ui/button";
import Link from "next/link";

export function CloudCard() {
  return (
    <Card className="size-full">
      <CardHeader className="">
        <CardTitle className="text-2xl">
          {`Don't want to self-host? Use our Cloud Service!`}
        </CardTitle>
        <CardDescription className="mt-2">
          One-click setup and hassle-free management with GetProfile Cloud is
          coming soon.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild className="mt-6">
          <Link href={process.env.NEXT_PUBLIC_CLOUD_URL!}>
            Join the Waitlist
            <Bell />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
