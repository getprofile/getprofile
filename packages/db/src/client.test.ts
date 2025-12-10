import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initDatabase, getDatabase, closeDatabase } from './client';

const { postgresMock } = vi.hoisted(() => ({
  postgresMock: vi.fn(() => ({
    end: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Mock postgres module
vi.mock('postgres', () => ({
  default: postgresMock,
}));

const { drizzleMock } = vi.hoisted(() => ({
  drizzleMock: vi.fn(() => ({ mockDb: true })),
}));

// Mock drizzle-orm
vi.mock('drizzle-orm/postgres-js', () => ({
  drizzle: drizzleMock,
}));

describe('Database Client', () => {
  beforeEach(async () => {
    // Reset the singleton state between tests
    await closeDatabase();
    vi.clearAllMocks();
    postgresMock.mockReset();
    postgresMock.mockImplementation(() => ({
      end: vi.fn().mockResolvedValue(undefined),
    }));
    drizzleMock.mockReset();
    drizzleMock.mockImplementation(() => ({ mockDb: true }));
  });

  describe('initDatabase', () => {
    it('should initialize and return a database instance', () => {
      const db = initDatabase({ url: 'postgresql://test:test@localhost:5432/test' });
      expect(db).toBeDefined();
      expect(db).toHaveProperty('mockDb', true);
    });

    it('should return the same instance on subsequent calls', () => {
      const db1 = initDatabase({ url: 'postgresql://test:test@localhost:5432/test' });
      const db2 = initDatabase({ url: 'postgresql://test:test@localhost:5432/test' });
      expect(db1).toBe(db2);
    });

    it('should accept custom pool size', () => {
      const db = initDatabase({ 
        url: 'postgresql://test:test@localhost:5432/test',
        poolSize: 20,
      });
      expect(db).toBeDefined();
    });

    it('should propagate timeout overrides to postgres client', () => {
      initDatabase({ 
        url: 'postgresql://test:test@localhost:5432/test',
        poolSize: 5,
        idle_timeout: 60,
        connect_timeout: 30,
      });
      expect(postgresMock).toHaveBeenCalledWith(
        'postgresql://test:test@localhost:5432/test',
        expect.objectContaining({
          max: 5,
          idle_timeout: 60,
          connect_timeout: 30,
        })
      );
    });

    it('should cleanup state when initialization fails', () => {
      drizzleMock.mockImplementationOnce(() => {
        throw new Error('drizzle init failed');
      });

      expect(() =>
        initDatabase({ url: 'postgresql://test:test@localhost:5432/test' })
      ).toThrow('drizzle init failed');

      // Should be able to initialize successfully after the failure
      drizzleMock.mockImplementationOnce(() => ({ mockDb: true }));
      expect(() =>
        initDatabase({ url: 'postgresql://test:test@localhost:5432/test' })
      ).not.toThrow();
    });
  });

  describe('getDatabase', () => {
    it('should throw if database is not initialized', () => {
      expect(() => getDatabase()).toThrow('Database not initialized');
    });

    it('should return database after initialization', () => {
      initDatabase({ url: 'postgresql://test:test@localhost:5432/test' });
      const db = getDatabase();
      expect(db).toBeDefined();
    });
  });

  describe('closeDatabase', () => {
    it('should close the connection', async () => {
      initDatabase({ url: 'postgresql://test:test@localhost:5432/test' });
      await closeDatabase();
      expect(() => getDatabase()).toThrow('Database not initialized');
    });

    it('should not throw if called when not initialized', async () => {
      await expect(closeDatabase()).resolves.not.toThrow();
    });

    it('should reset state even if client.end rejects', async () => {
      const failingEnd = vi.fn().mockRejectedValue(new Error('close failed'));
      postgresMock.mockImplementationOnce(() => ({
        end: failingEnd,
      }));

      initDatabase({ url: 'postgresql://test:test@localhost:5432/test' });
      await expect(closeDatabase()).rejects.toThrow('close failed');

      expect(() => getDatabase()).toThrow('Database not initialized');

      expect(() =>
        initDatabase({ url: 'postgresql://test:test@localhost:5432/test' })
      ).not.toThrow();
    });
  });
});
