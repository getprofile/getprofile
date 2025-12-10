// Trait schema loading and validation
// Loads trait definitions from configuration files

import type { TraitSchema } from '../types';

// Default traits embedded for Phase 1 (no file system dependency)
const DEFAULT_TRAITS: TraitSchema[] = [
  {
    key: 'preferred_language',
    label: 'Preferred Language',
    description: 'The language the user prefers for communication',
    valueType: 'string',
    category: 'communication',
    extraction: {
      enabled: true,
      promptSnippet: 'Detect the primary language the user communicates in',
      confidenceThreshold: 0.7,
    },
    injection: {
      enabled: true,
      template: 'User prefers to communicate in {{value}}.',
      priority: 10,
    },
  },
  {
    key: 'communication_style',
    label: 'Communication Style',
    description: 'How the user prefers to receive information',
    valueType: 'enum',
    enumValues: ['formal', 'casual', 'technical', 'simple'],
    category: 'communication',
    extraction: {
      enabled: true,
      promptSnippet: 'Assess if user prefers formal, casual, technical, or simple communication',
      confidenceThreshold: 0.6,
    },
    injection: {
      enabled: true,
      template: 'User prefers {{value}} communication style.',
      priority: 9,
    },
  },
  {
    key: 'detail_preference',
    label: 'Detail Preference',
    description: 'How much detail the user wants in responses',
    valueType: 'enum',
    enumValues: ['brief', 'moderate', 'detailed'],
    category: 'communication',
    extraction: {
      enabled: true,
      promptSnippet: 'Determine if user prefers brief/concise, moderate, or detailed/comprehensive responses',
      confidenceThreshold: 0.5,
    },
    injection: {
      enabled: true,
      template: 'User prefers {{value}} responses.',
      priority: 8,
    },
  },
  {
    key: 'name',
    label: 'Name',
    description: "User's name or preferred name",
    valueType: 'string',
    category: 'identity',
    extraction: {
      enabled: true,
      promptSnippet: "Extract the user's name if they mention it",
      confidenceThreshold: 0.9,
    },
    injection: {
      enabled: true,
      template: "User's name is {{value}}.",
      priority: 10,
    },
  },
  {
    key: 'expertise_level',
    label: 'Expertise Level',
    description: "User's technical/domain expertise",
    valueType: 'enum',
    enumValues: ['beginner', 'intermediate', 'advanced', 'expert'],
    category: 'context',
    extraction: {
      enabled: true,
      promptSnippet: "Assess user's expertise level based on vocabulary, questions asked, and context",
      confidenceThreshold: 0.5,
    },
    injection: {
      enabled: true,
      template: 'User has {{value}} expertise level.',
      priority: 7,
    },
  },
  {
    key: 'timezone',
    label: 'Timezone',
    description: "User's timezone for time-sensitive information",
    valueType: 'string',
    category: 'context',
    extraction: {
      enabled: true,
      promptSnippet: 'Detect timezone if user mentions location, time, or scheduling',
      confidenceThreshold: 0.8,
    },
    injection: {
      enabled: false,
      priority: 0,
    },
  },
  {
    key: 'interests',
    label: 'Interests',
    description: 'Topics and areas the user is interested in',
    valueType: 'array',
    category: 'preferences',
    extraction: {
      enabled: true,
      promptSnippet: 'Identify recurring topics, hobbies, or professional interests mentioned by user',
      confidenceThreshold: 0.4,
    },
    injection: {
      enabled: true,
      template: 'User is interested in: {{value}}.',
      priority: 5,
    },
  },
  {
    key: 'current_goals',
    label: 'Current Goals',
    description: 'What the user is currently trying to achieve',
    valueType: 'array',
    category: 'context',
    extraction: {
      enabled: true,
      promptSnippet: 'Identify any goals, projects, or objectives the user is working toward',
      confidenceThreshold: 0.5,
    },
    injection: {
      enabled: true,
      template: "User's current goals: {{value}}.",
      priority: 6,
    },
  },
];

/**
 * Get the default trait schemas.
 * For Phase 1, we embed the schemas directly.
 * Later phases will support loading from files and database.
 */
export function getDefaultTraitSchemas(): TraitSchema[] {
  return DEFAULT_TRAITS;
}

/**
 * Build the schema context for the extraction prompt.
 * This describes all traits that can be extracted.
 */
export function buildSchemaContext(schemas: TraitSchema[]): string {
  const lines: string[] = [];

  for (const schema of schemas) {
    if (!schema.extraction.enabled) continue;

    let typeDef: string = schema.valueType;
    if (schema.valueType === 'enum' && schema.enumValues) {
      typeDef = `enum[${schema.enumValues.join(', ')}]`;
    }

    lines.push(`- ${schema.key} (${typeDef}): ${schema.description || ''}`);
    if (schema.extraction.promptSnippet) {
      lines.push(`  Hint: ${schema.extraction.promptSnippet}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format existing traits for the extraction prompt context.
 */
export function formatExistingTraits(
  traits: { key: string; value: unknown; confidence: number }[]
): string {
  if (traits.length === 0) {
    return 'No traits currently known about this user.';
  }

  const lines = traits.map((t) => {
    const valueStr = typeof t.value === 'object' ? JSON.stringify(t.value) : String(t.value);
    return `- ${t.key}: ${valueStr} (confidence: ${t.confidence.toFixed(2)})`;
  });

  return lines.join('\n');
}

