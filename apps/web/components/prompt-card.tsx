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

export function PromptCard() {
  return (
    <Card className="size-full">
      <CardHeader className="">
        <CardTitle className="text-xl">
          What gets injected into prompts
        </CardTitle>
        <CardDescription className="mt-2">
          GetProfile automatically adds a system message with user profile
          summary, traits, and relevant memories to each prompt.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Code
          className="w-full h-85"
          code={`## User Profile
Alex is an experienced software engineer who prefers concise, technical explanations.
They work primarily with Python and have been exploring distributed systems.

## User Attributes
- Communication style: technical
- Detail preference: brief
- Expertise level: advanced

## Relevant Memories
- User mentioned working on a microservices migration last week
- User prefers async/await patterns over callbacks`}
        >
          <CodeHeader copyButton>Example injected prompt</CodeHeader>

          <CodeBlock cursor lang="markdown" writing={false} />
        </Code>

        <CardDescription className="mt-4">
          No overloaded prompts and context windows, no long history of
          messages, no blackbox solutions with unpredictable behavior — just
          relevant, structured information you define.
        </CardDescription>
      </CardContent>
    </Card>
  );
}
