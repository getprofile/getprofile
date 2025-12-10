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

export function ProxyCard() {
  return (
    <Card className="w-full h-full">
      <CardHeader>
        <CardTitle className="text-xl">Drop-in LLM proxy</CardTitle>
      </CardHeader>
      <CardContent>
        <Code
          className="w-full h-85"
          code={`const client = new GetProfileClient({
  apiKey: "sk-...", // Your GetProfile API key
  baseURL: "http://localhost:3100", // Your instance url
  defaultHeaders: {
    "X-GetProfile-Id": "userId", // Your app's user ID
    "X-Upstream-Key": "sk-...", // Your OpenAI key
  },
});

const response = await client.chat.completions.create({
  model: "gpt-5",
  messages: [{ role: "user", content: "How should I refactor this?" }],
});`}
        >
          <CodeHeader copyButton>Example usage</CodeHeader>

          <CodeBlock cursor lang="tsx" writing={false} />
        </Code>
        <CardDescription className="mt-4">
          GetProfile LLM proxy (gateway) gives an AI model persistent memory and
          structured user understanding. Simply route your requests through
          GetProfile to enhance your LLM-powered applications with personalized
          and context-aware interactions.
        </CardDescription>
      </CardContent>
    </Card>
  );
}
