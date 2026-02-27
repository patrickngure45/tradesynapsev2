import yazl from "yazl";

import type { Readable } from "node:stream";

export type NodeReadableLike = Readable;

export type ZipInputFile = {
  path: string;
  data: Buffer;
};

export function createZipStream(files: ZipInputFile[]): {
  zipStream: NodeReadableLike;
} {
  const zip = new yazl.ZipFile();

  for (const file of files) {
    zip.addBuffer(file.data, file.path);
  }

  zip.end();

  // yazl's outputStream is a Node Readable at runtime; some typings represent it as a web stream.
  const zipStream = zip.outputStream as unknown as Readable;

  return {
    zipStream,
  };
}
