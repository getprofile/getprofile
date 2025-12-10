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

export function TraitsCard() {
  return (
    <Card className="size-full">
      <CardHeader className="">
        <CardTitle className="text-xl">
          Fully Customizable User Traits
        </CardTitle>
        <CardDescription className="mt-2">
          Fully customizable user traits schema for extraction and injection.
          Define exactly what user traits matter for your application, how they
          should be extracted from interactions, and how they get injected into
          prompts.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Code
          className="w-full h-85"
          code={`{
  "traits": [
    {
      "key": "communication_style",
      "label": "Communication Style",
      "description": "How the user prefers to receive information",
      "valueType": "enum",
      "enumValues": ["formal", "casual", "technical", "simple"],
      "category": "communication",
      "extraction": {
        "enabled": true,
        "promptSnippet": "Assess if user prefers formal, casual, technical, or simple communication",
        "confidenceThreshold": 0.6
      },
      "injection": {
        "enabled": true,
        "template": "User prefers {{value}} communication style.",
        "priority": 9
      }
    }
  ]
}`}
        >
          <CodeHeader copyButton>Example Trait Definition</CodeHeader>

          <CodeBlock cursor lang="json" writing={false} />
        </Code>
      </CardContent>
    </Card>
  );
}
