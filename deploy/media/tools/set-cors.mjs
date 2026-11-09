// Lets the website upload to and read from the photo bucket straight from the browser, and nothing
// else: only hidl's own addresses, only PUT/GET/HEAD. Run once after the bucket is made, and again
// if the site's address changes. (CORS only decides which websites a browser lets talk to the
// bucket; every request still needs a valid signed link.)
//
//   deploy/media/run-tool.sh set-cors.mjs https://hidl.fetehadin.com [more origins...]
import { GetBucketCorsCommand, PutBucketCorsCommand, S3Client } from "@aws-sdk/client-s3";

const origins = process.argv.slice(2).filter((a) => /^https?:\/\/[^/]+$/.test(a));
if (origins.length === 0) throw new Error("Give the site address(es), e.g. https://hidl.fetehadin.com");

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION || "garage",
  forcePathStyle: true,
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY },
  requestChecksumCalculation: "WHEN_REQUIRED",
});
const Bucket = process.env.S3_BUCKET || "hidl-media";

await s3.send(
  new PutBucketCorsCommand({
    Bucket,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedOrigins: origins,
          AllowedMethods: ["PUT", "GET", "HEAD"],
          // What the upload sheet sends (src/lib/storage/s3.ts → uploadTarget) and video seeking.
          AllowedHeaders: ["content-type", "cache-control", "range"],
          ExposeHeaders: ["etag", "content-length", "content-range"],
          MaxAgeSeconds: 3600,
        },
      ],
    },
  }),
);
const now = await s3.send(new GetBucketCorsCommand({ Bucket }));
console.log(`CORS on ${Bucket}:`, JSON.stringify(now.CORSRules));
