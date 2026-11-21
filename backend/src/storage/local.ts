import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { assertSafeKey, type Bucket, type BucketUsage, type ListedObject, type StorageProvider, type StoredObjectDetails } from "./types";

/**
 * Development-only storage on the local filesystem (forbidden in production by backend/src/env.ts).
 *
 * Guarantees:
 * - The root must be OUTSIDE `public/` (Next.js serves only `public/` statically), so nothing
 *   here can be reached by URL. Files are only readable through server code.
 * - Every resolved path is checked to stay inside its bucket directory (no path traversal).
 */
export class LocalStorage implements StorageProvider {
  readonly driver = "local" as const;
  private readonly root: string;

  // `turbopackIgnore`: this dev-only driver resolves paths at runtime; without the hint Next.js
  // would trace (and deploy) the whole project for every route that imports it.
  constructor(root: string, projectRoot: string = process.cwd()) {
    this.root = path.resolve(/*turbopackIgnore: true*/ projectRoot, root);
    const publicDir = path.resolve(/*turbopackIgnore: true*/ projectRoot, "public");
    if (isInside(this.root, publicDir) || this.root === publicDir) {
      throw new Error("STORAGE_LOCAL_ROOT không được nằm trong thư mục public/.");
    }
    if (this.root === path.resolve(/*turbopackIgnore: true*/ projectRoot)) {
      throw new Error("STORAGE_LOCAL_ROOT không được là thư mục gốc của dự án.");
    }
  }

  private resolve(bucket: Bucket, key: string): string {
    assertSafeKey(key);
    const bucketDir = path.join(this.root, bucket);
    const full = path.resolve(bucketDir, key);
    if (!isInside(full, bucketDir)) {
      throw new Error("Đường dẫn storage vượt ra ngoài bucket.");
    }
    return full;
  }

  async put(bucket: Bucket, key: string, body: Uint8Array) {
    const full = this.resolve(bucket, key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body);
    return { key, sizeBytes: body.byteLength };
  }

  async read(bucket: Bucket, key: string) {
    return new Uint8Array(await readFile(this.resolve(bucket, key)));
  }

  async exists(bucket: Bucket, key: string) {
    try {
      return (await stat(this.resolve(bucket, key))).isFile();
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw e;
    }
  }

  async remove(bucket: Bucket, key: string) {
    await rm(this.resolve(bucket, key), { force: true });
  }

  async list(bucket: Bucket, prefix: string): Promise<ListedObject[]> {
    const bucketDir = path.join(this.root, bucket);
    const dir = this.resolve(bucket, prefix);
    let entries: Dirent[];
    try {
      entries = await readdir(dir, { recursive: true, withFileTypes: true });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw e;
    }
    const out: ListedObject[] = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const full = path.join(entry.parentPath, entry.name);
      const s = await stat(full);
      out.push({ key: path.relative(bucketDir, full).split(path.sep).join("/"), sizeBytes: s.size, modifiedAt: s.mtime });
    }
    return out;
  }

  async usage(bucket: Bucket): Promise<BucketUsage> {
    let entries: Dirent[];
    try {
      entries = await readdir(path.join(this.root, bucket), { recursive: true, withFileTypes: true });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return { objects: 0, bytes: 0 };
      throw e;
    }
    let objects = 0;
    let bytes = 0;
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      objects++;
      bytes += (await stat(path.join(entry.parentPath, entry.name))).size;
    }
    return { objects, bytes };
  }

  /** Size in bytes, or null when there is no such file. */
  async size(bucket: Bucket, key: string): Promise<number | null> {
    try {
      const s = await stat(this.resolve(bucket, key));
      return s.isFile() ? s.size : null;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }

  async inspect(bucket: Bucket, key: string, headBytes: number): Promise<StoredObjectDetails | null> {
    const full = this.resolve(bucket, key);
    if ((await this.size(bucket, key)) === null) return null;
    const hash = createHash("sha256");
    const head: Buffer[] = [];
    let headLength = 0;
    let sizeBytes = 0;
    for await (const chunk of createReadStream(full)) {
      const buf = chunk as Buffer;
      hash.update(buf);
      sizeBytes += buf.length;
      if (headLength < headBytes) {
        const part = buf.subarray(0, headBytes - headLength);
        head.push(part);
        headLength += part.length;
      }
    }
    return { sizeBytes, sha256: hash.digest("hex"), head: new Uint8Array(Buffer.concat(head)) };
  }

  /**
   * Write an upload body as it arrives, never more than `maxBytes` (the file is removed and "tooLarge"
   * returned as soon as it goes over). Dev stand-in for an R2 presigned PUT (GĐ5.3).
   */
  async writeStream(
    bucket: Bucket,
    key: string,
    body: ReadableStream<Uint8Array>,
    maxBytes: number,
  ): Promise<{ ok: true; sizeBytes: number } | { ok: false; error: "tooLarge" | "failed" }> {
    const full = this.resolve(bucket, key);
    await mkdir(path.dirname(full), { recursive: true });
    const out = createWriteStream(full);
    const closed = new Promise<void>((resolve, reject) => {
      out.on("close", resolve);
      out.on("error", reject);
    });
    let sizeBytes = 0;
    let error: "tooLarge" | "failed" | null = null;
    try {
      const reader = body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        sizeBytes += value.byteLength;
        if (sizeBytes > maxBytes) {
          error = "tooLarge";
          await reader.cancel();
          break;
        }
        if (!out.write(value)) await new Promise<void>((resolve) => out.once("drain", resolve));
      }
    } catch {
      error = "failed";
    }
    out.end();
    await closed.catch(() => {
      error ??= "failed";
    });
    if (error) {
      await rm(full, { force: true });
      return { ok: false, error };
    }
    return { ok: true, sizeBytes };
  }

  /** A web stream of bytes [start, end] (inclusive) — for HTTP range requests of preview videos. */
  readRange(bucket: Bucket, key: string, start: number, end: number): ReadableStream<Uint8Array> {
    return Readable.toWeb(createReadStream(this.resolve(bucket, key), { start, end })) as ReadableStream<Uint8Array>;
  }
}

function isInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}
