import { createHash } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  attachmentDisposition,
  cacheControlFor,
  contentTypeFor,
  r2Endpoint,
  R2_DOWNLOAD_TTL_SECONDS,
  R2_UPLOAD_TTL_SECONDS,
} from "./r2-rules";
import { assertSafeKey, type Bucket, type BucketUsage, type ListedObject, type StorageProvider, type StoredObjectDetails } from "./types";

/**
 * Cloudflare R2 storage (GĐ7.5; S3 API). Two buckets: PUBLIC (preview media, served from the custom domain) and
 * PRIVATE (sellable files: no public access at all; read only through a one-minute presigned link handed out by
 * the download service AFTER the ownership checks). No `server-only`: also used by the seed and the scripts.
 */
export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBucket: string;
  privateBucket: string;
};

/** What the browser must send with a presigned PUT: these headers are part of the signature. */
export type PresignedUpload = { url: string; headers: Record<string, string> };

const isNotFound = (e: unknown) => {
  const x = e as { name?: string; $metadata?: { httpStatusCode?: number } };
  return x?.name === "NotFound" || x?.name === "NoSuchKey" || x?.$metadata?.httpStatusCode === 404;
};

export class R2Storage implements StorageProvider {
  readonly driver = "r2" as const;
  private readonly client: S3Client;

  constructor(private readonly config: R2Config) {
    this.client = new S3Client({
      region: "auto", // required by the SDK, not used by R2
      endpoint: r2Endpoint(config.accountId),
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      // <endpoint>/<bucket>/<key>: every request and link uses the one account host of the docs (and its CORS).
      forcePathStyle: true,
      // Newer SDKs add a CRC32 checksum to every request by default; in a presigned PUT that would sign the
      // checksum of an empty body and the browser's upload would be refused. Checksums only when an API needs one.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }

  private bucketName(bucket: Bucket): string {
    return bucket === "public" ? this.config.publicBucket : this.config.privateBucket;
  }

  async put(bucket: Bucket, key: string, body: Uint8Array) {
    assertSafeKey(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucketName(bucket),
        Key: key,
        Body: body,
        ContentType: contentTypeFor(key),
        CacheControl: cacheControlFor(bucket, key),
      }),
    );
    return { key, sizeBytes: body.byteLength };
  }

  async read(bucket: Bucket, key: string) {
    assertSafeKey(key);
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucketName(bucket), Key: key }));
    if (!res.Body) throw new Error("R2 trả về object rỗng.");
    return await res.Body.transformToByteArray();
  }

  async exists(bucket: Bucket, key: string) {
    assertSafeKey(key);
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucketName(bucket), Key: key }));
      return true;
    } catch (e) {
      if (isNotFound(e)) return false;
      throw e;
    }
  }

  async remove(bucket: Bucket, key: string) {
    assertSafeKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucketName(bucket), Key: key })); // idempotent
  }

  async list(bucket: Bucket, prefix: string): Promise<ListedObject[]> {
    assertSafeKey(prefix);
    const out: ListedObject[] = [];
    let token: string | undefined;
    do {
      const res = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucketName(bucket), Prefix: `${prefix}/`, ContinuationToken: token }),
      );
      for (const o of res.Contents ?? []) {
        if (o.Key) out.push({ key: o.Key, sizeBytes: o.Size ?? 0, modifiedAt: o.LastModified ?? new Date(0) });
      }
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return out;
  }

  /** One page of 1,000 keys per request (a Class A operation each), sizes only. */
  async usage(bucket: Bucket): Promise<BucketUsage> {
    let objects = 0;
    let bytes = 0;
    let token: string | undefined;
    do {
      const res = await this.client.send(new ListObjectsV2Command({ Bucket: this.bucketName(bucket), ContinuationToken: token }));
      for (const o of res.Contents ?? []) {
        objects++;
        bytes += o.Size ?? 0;
      }
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return { objects, bytes };
  }

  /** Streams the object once: size, SHA-256 and its first bytes (never the whole archive in memory). */
  async inspect(bucket: Bucket, key: string, headBytes: number): Promise<StoredObjectDetails | null> {
    assertSafeKey(key);
    let res;
    try {
      res = await this.client.send(new GetObjectCommand({ Bucket: this.bucketName(bucket), Key: key }));
    } catch (e) {
      if (isNotFound(e)) return null;
      throw e;
    }
    if (!res.Body) return null;
    const hash = createHash("sha256");
    const head: Buffer[] = [];
    let headLength = 0;
    let sizeBytes = 0;
    for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
      const buf = Buffer.from(chunk);
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
   * A one-minute link that downloads ONE private object as an attachment named `filename`. Only the download
   * service calls this, after its checks; the link is handed to the browser once and never stored.
   */
  async presignDownload(key: string, filename: string, ttlSeconds = R2_DOWNLOAD_TTL_SECONDS): Promise<string> {
    assertSafeKey(key);
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.config.privateBucket,
        Key: key,
        ResponseContentDisposition: attachmentDisposition(filename),
        ResponseCacheControl: "private, no-store",
      }),
      { expiresIn: ttlSeconds },
    );
  }

  /**
   * A presigned PUT for an Admin upload of exactly `sizeBytes` bytes to a key the server chose. The type and cache
   * headers are signed, so the browser must send them as given (and R2 stores them with the object).
   */
  async presignUpload(
    bucket: Bucket,
    key: string,
    sizeBytes: number,
    ttlSeconds = R2_UPLOAD_TTL_SECONDS,
  ): Promise<PresignedUpload> {
    assertSafeKey(key);
    const headers = { "Content-Type": contentTypeFor(key), "Cache-Control": cacheControlFor(bucket, key) };
    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucketName(bucket),
        Key: key,
        ContentType: headers["Content-Type"],
        CacheControl: headers["Cache-Control"],
        ContentLength: sizeBytes,
      }),
      { expiresIn: ttlSeconds, signableHeaders: new Set(["content-type", "cache-control", "content-length"]) },
    );
    return { url, headers };
  }
}
