import { describe, it, expect } from 'vitest';
import { validateGetProfileOptions } from './request-options';

describe('validateGetProfileOptions', () => {
  it('should return null for non-object input', () => {
    expect(validateGetProfileOptions(null)).toBeNull();
    expect(validateGetProfileOptions(undefined)).toBeNull();
    expect(validateGetProfileOptions('string')).toBeNull();
    expect(validateGetProfileOptions(123)).toBeNull();
    expect(validateGetProfileOptions([])).toBeNull();
  });

  it('should return empty object for empty input', () => {
    const result = validateGetProfileOptions({});
    expect(result).toEqual({});
  });

  describe('skipInjection', () => {
    it('should accept valid boolean values', () => {
      expect(validateGetProfileOptions({ skipInjection: true })).toEqual({
        skipInjection: true,
      });
      expect(validateGetProfileOptions({ skipInjection: false })).toEqual({
        skipInjection: false,
      });
    });

    it('should reject non-boolean values', () => {
      expect(validateGetProfileOptions({ skipInjection: 'true' })).toBeNull();
      expect(validateGetProfileOptions({ skipInjection: 1 })).toBeNull();
      expect(validateGetProfileOptions({ skipInjection: null })).toBeNull();
    });
  });

  describe('skipExtraction', () => {
    it('should accept valid boolean values', () => {
      expect(validateGetProfileOptions({ skipExtraction: true })).toEqual({
        skipExtraction: true,
      });
      expect(validateGetProfileOptions({ skipExtraction: false })).toEqual({
        skipExtraction: false,
      });
    });

    it('should reject non-boolean values', () => {
      expect(validateGetProfileOptions({ skipExtraction: 'false' })).toBeNull();
      expect(validateGetProfileOptions({ skipExtraction: 0 })).toBeNull();
      expect(validateGetProfileOptions({ skipExtraction: {} })).toBeNull();
    });
  });

  describe('traits', () => {
    it('should accept valid trait schemas', () => {
      const traits = [
        {
          key: 'test_trait',
          valueType: 'string',
          extraction: {
            enabled: true,
            confidenceThreshold: 0.5,
          },
          injection: {
            enabled: true,
            priority: 5,
          },
        },
      ];
      const result = validateGetProfileOptions({ traits });
      expect(result).toEqual({ traits });
    });

    it('should accept multiple trait schemas', () => {
      const traits = [
        {
          key: 'trait1',
          valueType: 'string',
          extraction: { enabled: true, confidenceThreshold: 0.5 },
          injection: { enabled: true, priority: 5 },
        },
        {
          key: 'trait2',
          valueType: 'array',
          extraction: { enabled: false, confidenceThreshold: 0.8 },
          injection: { enabled: false, priority: 1 },
        },
      ];
      const result = validateGetProfileOptions({ traits });
      expect(result).toEqual({ traits });
    });

    it('should accept trait schemas with optional fields', () => {
      const traits = [
        {
          key: 'test_trait',
          label: 'Test Trait',
          description: 'A test trait',
          valueType: 'enum',
          enumValues: ['a', 'b', 'c'],
          category: 'test',
          extraction: {
            enabled: true,
            promptSnippet: 'Extract test trait',
            confidenceThreshold: 0.6,
          },
          injection: {
            enabled: true,
            template: 'Value: {{value}}',
            priority: 10,
          },
        },
      ];
      const result = validateGetProfileOptions({ traits });
      expect(result).toEqual({ traits });
    });

    it('should reject non-array traits', () => {
      expect(validateGetProfileOptions({ traits: {} })).toBeNull();
      expect(validateGetProfileOptions({ traits: 'string' })).toBeNull();
      expect(validateGetProfileOptions({ traits: 123 })).toBeNull();
    });

    it('should reject traits with missing required fields', () => {
      // Missing key
      expect(
        validateGetProfileOptions({
          traits: [
            {
              valueType: 'string',
              extraction: { enabled: true, confidenceThreshold: 0.5 },
              injection: { enabled: true, priority: 5 },
            },
          ],
        })
      ).toBeNull();

      // Missing valueType
      expect(
        validateGetProfileOptions({
          traits: [
            {
              key: 'test',
              extraction: { enabled: true, confidenceThreshold: 0.5 },
              injection: { enabled: true, priority: 5 },
            },
          ],
        })
      ).toBeNull();

      // Missing extraction
      expect(
        validateGetProfileOptions({
          traits: [
            {
              key: 'test',
              valueType: 'string',
              injection: { enabled: true, priority: 5 },
            },
          ],
        })
      ).toBeNull();

      // Missing injection
      expect(
        validateGetProfileOptions({
          traits: [
            {
              key: 'test',
              valueType: 'string',
              extraction: { enabled: true, confidenceThreshold: 0.5 },
            },
          ],
        })
      ).toBeNull();
    });

    it('should reject traits with invalid extraction fields', () => {
      // enabled not boolean
      expect(
        validateGetProfileOptions({
          traits: [
            {
              key: 'test',
              valueType: 'string',
              extraction: { enabled: 'true', confidenceThreshold: 0.5 },
              injection: { enabled: true, priority: 5 },
            },
          ],
        })
      ).toBeNull();

      // confidenceThreshold not number
      expect(
        validateGetProfileOptions({
          traits: [
            {
              key: 'test',
              valueType: 'string',
              extraction: { enabled: true, confidenceThreshold: '0.5' },
              injection: { enabled: true, priority: 5 },
            },
          ],
        })
      ).toBeNull();
    });

    it('should reject traits with invalid injection fields', () => {
      // enabled not boolean
      expect(
        validateGetProfileOptions({
          traits: [
            {
              key: 'test',
              valueType: 'string',
              extraction: { enabled: true, confidenceThreshold: 0.5 },
              injection: { enabled: 1, priority: 5 },
            },
          ],
        })
      ).toBeNull();

      // priority not number
      expect(
        validateGetProfileOptions({
          traits: [
            {
              key: 'test',
              valueType: 'string',
              extraction: { enabled: true, confidenceThreshold: 0.5 },
              injection: { enabled: true, priority: '5' },
            },
          ],
        })
      ).toBeNull();
    });
  });

  describe('combined options', () => {
    it('should accept all options together', () => {
      const traits = [
        {
          key: 'test_trait',
          valueType: 'string',
          extraction: { enabled: true, confidenceThreshold: 0.5 },
          injection: { enabled: true, priority: 5 },
        },
      ];
      const result = validateGetProfileOptions({
        skipInjection: true,
        skipExtraction: false,
        traits,
      });
      expect(result).toEqual({
        skipInjection: true,
        skipExtraction: false,
        traits,
      });
    });

    it('should reject if any option is invalid', () => {
      const traits = [
        {
          key: 'test_trait',
          valueType: 'string',
          extraction: { enabled: true, confidenceThreshold: 0.5 },
          injection: { enabled: true, priority: 5 },
        },
      ];

      // Valid traits but invalid skipInjection
      expect(
        validateGetProfileOptions({
          skipInjection: 'true',
          traits,
        })
      ).toBeNull();

      // Valid skipInjection but invalid traits
      expect(
        validateGetProfileOptions({
          skipInjection: true,
          traits: [{ key: 'invalid' }],
        })
      ).toBeNull();
    });
  });
});
