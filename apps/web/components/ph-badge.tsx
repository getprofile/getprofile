"use client";
import { useTheme } from "next-themes";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

export function ProductHuntBadge() {
  const [ready, setReady] = useState(false);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    function getReady() {
      setReady(true);
    }
    getReady();
  }, []);

  return ready ? (
    <Link
      href="https://www.producthunt.com/products/getprofile-ai?embed=true&utm_source=badge-top-post-badge&utm_medium=badge&utm_campaign=badge-getprofile"
      target="_blank"
      rel="noopener noreferrer"
    >
      <Image
        alt="GetProfile - User profiles and long-term memory for your AI agents | Product Hunt"
        width="250"
        height="54"
        src={`https://api.producthunt.com/widgets/embed-image/v1/top-post-badge.svg?post_id=1051433&theme=${resolvedTheme === "dark" ? "dark" : "light"}&period=daily&t=1766453946495`}
        className="dark:border-border dark:border dark:rounded-xl"
      />
    </Link>
  ) : null;
}
