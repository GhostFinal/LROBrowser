export interface ResourceCacheMetadata {
  sourceUrl: string;
  etag?: string;
  lastModified?: string;
  size: number;
  savedAt: number;
}

export interface CachedResource extends ResourceCacheMetadata {
  path: string;
  bytes: ArrayBuffer;
}

export interface ResourceCache {
  match(path: string): Promise<CachedResource | null>;
  put(path: string, bytes: ArrayBuffer, metadata: Omit<ResourceCacheMetadata, 'size' | 'savedAt'> & Partial<Pick<ResourceCacheMetadata, 'size' | 'savedAt'>>): Promise<void>;
  delete(path: string): Promise<void>;
}

function copyBytes(bytes: ArrayBuffer): ArrayBuffer {
  return bytes.slice(0);
}

export class MemoryResourceCache implements ResourceCache {
  private readonly entries = new Map<string, CachedResource>();

  async match(path: string): Promise<CachedResource | null> {
    const entry = this.entries.get(path);
    return entry ? { ...entry, bytes: copyBytes(entry.bytes) } : null;
  }

  async put(path: string, bytes: ArrayBuffer, metadata: Omit<ResourceCacheMetadata, 'size' | 'savedAt'> & Partial<Pick<ResourceCacheMetadata, 'size' | 'savedAt'>>): Promise<void> {
    this.entries.set(path, {
      path,
      bytes: copyBytes(bytes),
      sourceUrl: metadata.sourceUrl,
      ...(metadata.etag ? { etag: metadata.etag } : {}),
      ...(metadata.lastModified ? { lastModified: metadata.lastModified } : {}),
      size: metadata.size ?? bytes.byteLength,
      savedAt: metadata.savedAt ?? Date.now()
    });
  }

  async delete(path: string): Promise<void> {
    this.entries.delete(path);
  }
}

type IndexedDbRecord = CachedResource;

export class IndexedDbResourceCache implements ResourceCache {
  private readonly databaseName: string;
  private databasePromise?: Promise<IDBDatabase>;

  constructor(databaseName = 'lastro-iwa-resources') {
    this.databaseName = databaseName;
  }

  private open(): Promise<IDBDatabase> {
    if (this.databasePromise) return this.databasePromise;
    this.databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('resources', { keyPath: 'path' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
    });
    return this.databasePromise;
  }

  async match(path: string): Promise<CachedResource | null> {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const request = database.transaction('resources', 'readonly').objectStore('resources').get(path);
      request.onsuccess = () => {
        const entry = request.result as IndexedDbRecord | undefined;
        resolve(entry ? { ...entry, bytes: copyBytes(entry.bytes) } : null);
      };
      request.onerror = () => reject(request.error ?? new Error('IndexedDB read failed'));
    });
  }

  async put(path: string, bytes: ArrayBuffer, metadata: Omit<ResourceCacheMetadata, 'size' | 'savedAt'> & Partial<Pick<ResourceCacheMetadata, 'size' | 'savedAt'>>): Promise<void> {
    const database = await this.open();
    const entry: IndexedDbRecord = {
      path,
      bytes: copyBytes(bytes),
      sourceUrl: metadata.sourceUrl,
      ...(metadata.etag ? { etag: metadata.etag } : {}),
      ...(metadata.lastModified ? { lastModified: metadata.lastModified } : {}),
      size: metadata.size ?? bytes.byteLength,
      savedAt: metadata.savedAt ?? Date.now()
    };
    await new Promise<void>((resolve, reject) => {
      const request = database.transaction('resources', 'readwrite').objectStore('resources').put(entry);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error('IndexedDB write failed'));
    });
  }

  async delete(path: string): Promise<void> {
    const database = await this.open();
    await new Promise<void>((resolve, reject) => {
      const request = database.transaction('resources', 'readwrite').objectStore('resources').delete(path);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error('IndexedDB delete failed'));
    });
  }
}

export function createResourceCache(databaseName?: string): ResourceCache {
  return typeof indexedDB === 'undefined' ? new MemoryResourceCache() : new IndexedDbResourceCache(databaseName);
}
