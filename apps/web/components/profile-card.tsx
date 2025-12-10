"use client";
import {
  Code,
  CodeBlock,
  CodeHeader,
} from "./animate-ui/components/animate/code";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";

export function ProfileCard() {
  return (
    <Card className="size-full">
      <CardHeader className="">
        <CardTitle className="text-xl">Structured User Profiles</CardTitle>
        <CardDescription className="mt-2">
          Unlike generic memory solutions that store blobs of text, GetProfile
          extracts natural language summary, typed traits with confidence scores
          and relevant memories with importance levels into a structured profile
          stored in PostgreSQL database.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Code
          className="w-full h-85"
          code={`{
  "id": "user-12345",
  "summary": "Alex is an experienced software engineer who prefers concise, technical explanations. They work primarily with Python and have been exploring distributed systems.",
  "traits": [
    { "key": "name", "value": "Alex", "confidence": 0.95 },
    { "key": "expertise_level", "value": "advanced", "confidence": 0.8 },
    { "key": "communication_style", "value": "technical", "confidence": 0.7 },
    { "key": "interests", "value": ["Python", "distributed systems", "ML"], "confidence": 0.6 }
  ],
  "memories": [
    { "content": "Uses Kubernetes at work", "type": "fact", "importance": 0.7 },
    { "content": "Will be on vacation next week", "type": "event", "importance": 0.4 }
  ]
}
`}
        >
          <CodeHeader copyButton>User profile example</CodeHeader>

          <CodeBlock cursor lang="json" writing={false} />
        </Code>
      </CardContent>
    </Card>
  );
}
