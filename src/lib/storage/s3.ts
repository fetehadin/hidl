import "server-only";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { StorageConfig } from "./config";
import { MEDIA_CACHE_CONTROL, type MediaStore, type StoredFile, UPLOAD_LINK_SECONDS, VIEW_LINK_SECONDS } from "./types";

type S3Config = Extract<StorageConfig, { STORAGE_PROVIDER: "s3" }>;

function client(endpoint: string, config: S3Config) {
  return new S3Client({
    endpoint,
    region: config.S3_REGION,
    forcePathStyle: true,
    credentials: { accessKeyId: config.S3_ACCESS_KEY_ID, secretAccessKey: config.S3_SECRET_ACCESS_KEY },
    // The SDK otherwise signs a CRC32 of an empty body into upload links, and the store then
    // refuses the real file. Checksums stay on where the API requires them (DeleteObjects).
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

function notFound(e: unknown) {
  return e instanceof S3ServiceException && (e.$metadata.httpStatusCode === 404 || e.name === "NoSuchKey");
}

/** The S3-compatible store (Garage on the VPS). Links are signed for the public address. */
export function s3Store(config: S3Config): MediaStore {
  const Bucket = config.S3_BUCKET;
  // Signing needs no network; it's done for the address the browser will use.
  const signer = client(config.S3_PUBLIC_URL, config);
  const internal = config.S3_ENDPOINT ? client(config.S3_ENDPOINT, config) : signer;

  return {
    provider: "s3",

    async uploadTarget(path, bytes, contentType) {
      const url = await getSignedUrl(
        signer,
        new PutObjectCommand({ Bucket, Key: path, ContentType: contentType, ContentLength: bytes, CacheControl: MEDIA_CACHE_CONTROL }),
        {
          expiresIn: UPLOAD_LINK_SECONDS,
          // Signed as headers, so the store refuses any other size or type for this path.
          signableHeaders: new Set(["content-type", "content-length", "cache-control"]),
          unhoistableHeaders: new Set(["cache-control"]),
        },
      );
      return { path, url, headers: { "content-type": contentType, "cache-control": MEDIA_CACHE_CONTROL } };
    },

    async viewUrls(paths) {
      const signed = await Promise.all(
        paths.map(async (Key) => [Key, await getSignedUrl(signer, new GetObjectCommand({ Bucket, Key }), { expiresIn: VIEW_LINK_SECONDS })] as const),
      );
      return new Map(signed);
    },

    async inspect(path): Promise<StoredFile | null> {
      try {
        const res = await internal.send(new GetObjectCommand({ Bucket, Key: path, Range: "bytes=0-31" }));
        const head = new Uint8Array(await res.Body!.transformToByteArray());
        // "bytes 0-31/48213": the part after the slash is the whole file's size.
        const total = Number(res.ContentRange?.split("/")[1] ?? res.ContentLength);
        return { bytes: total, contentType: res.ContentType ?? "", head };
      } catch (e) {
        if (notFound(e)) return null;
        throw e;
      }
    },

    async remove(paths) {
      for (let i = 0; i < paths.length; i += 1000) {
        const chunk = paths.slice(i, i + 1000);
        const res = await internal.send(
          new DeleteObjectsCommand({ Bucket, Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true } }),
        );
        if (res.Errors?.length) throw new Error(`Couldn't delete ${res.Errors.length} file(s): ${res.Errors[0].Code}`);
      }
    },

    async removeFolder(userId) {
      let removed = 0;
      let ContinuationToken: string | undefined;
      do {
        const page = await internal.send(new ListObjectsV2Command({ Bucket, Prefix: `${userId}/`, ContinuationToken }));
        const keys = (page.Contents ?? []).map((o) => o.Key!).filter(Boolean);
        if (keys.length) await this.remove(keys);
        removed += keys.length;
        ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (ContinuationToken);
      return removed;
    },
  };
}
