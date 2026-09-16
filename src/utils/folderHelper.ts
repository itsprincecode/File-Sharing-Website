import JSZip from "jszip";

export interface FileWithPath {
  file: File;
  relativePath: string;
}

export interface ZipContentEntry {
  path: string;
  size: number;
  isDir: boolean;
}

/**
 * Recursively scans FileSystemEntry tree from drag-and-drop
 */
export async function getFilesFromDataTransfer(
  items: DataTransferItemList
): Promise<{ files: FileWithPath[]; folderName: string; isFolder: boolean }> {
  const files: FileWithPath[] = [];
  let detectedFolderName = "Folder";
  let hasDirectory = false;

  const entries: any[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (typeof item.webkitGetAsEntry === "function") {
      const entry = item.webkitGetAsEntry();
      if (entry) {
        entries.push(entry);
        if (entry.isDirectory) {
          hasDirectory = true;
          detectedFolderName = entry.name;
        }
      }
    }
  }

  for (const entry of entries) {
    await traverseEntry(entry, "", files);
  }

  return {
    files,
    folderName: detectedFolderName,
    isFolder: hasDirectory || entries.length > 1,
  };
}

async function traverseEntry(
  entry: any,
  path: string,
  result: FileWithPath[]
): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => {
      entry.file(resolve, reject);
    });
    result.push({
      file,
      relativePath: path ? `${path}/${entry.name}` : entry.name,
    });
  } else if (entry.isDirectory) {
    const dirReader = entry.createReader();
    const newPath = path ? `${path}/${entry.name}` : entry.name;

    // readEntries must be called repeatedly until it returns an empty array
    const readAllEntries = async (): Promise<any[]> => {
      const all: any[] = [];
      let batch: any[] = [];
      do {
        batch = await new Promise<any[]>((resolve, reject) => {
          dirReader.readEntries(resolve, reject);
        });
        all.push(...batch);
      } while (batch.length > 0);
      return all;
    };

    const childEntries = await readAllEntries();
    for (const child of childEntries) {
      await traverseEntry(child, newPath, result);
    }
  }
}

/**
 * Packages multiple files and their directory tree into a single .zip File
 */
export async function packageFolderToZip(
  filesWithPaths: FileWithPath[],
  folderName: string,
  onProgress?: (percent: number) => void
): Promise<File> {
  const zip = new JSZip();

  // Clean folder name
  const cleanName = folderName.replace(/\.zip$/i, "").trim() || "Uploaded_Folder";

  for (const item of filesWithPaths) {
    // Normalise path (strip leading slash if any)
    const normPath = item.relativePath.replace(/^\/+/, "");
    zip.file(normPath, item.file);
  }

  const zipBlob = await zip.generateAsync(
    {
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    },
    (metadata) => {
      if (onProgress) {
        onProgress(Math.round(metadata.percent));
      }
    }
  );

  return new File([zipBlob], `${cleanName}.zip`, {
    type: `application/zip;is_folder=true;files=${filesWithPaths.length}`,
  });
}

/**
 * Read contents of a zipped archive for inspection preview
 */
export async function inspectZipContents(blob: Blob): Promise<ZipContentEntry[]> {
  try {
    const zip = await JSZip.loadAsync(blob);
    const list: ZipContentEntry[] = [];

    zip.forEach((relativePath, fileObj) => {
      list.push({
        path: relativePath,
        size: (fileObj as any)._data?.uncompressedSize || 0,
        isDir: fileObj.dir,
      });
    });

    return list;
  } catch (err) {
    console.error("Failed to inspect zip:", err);
    return [];
  }
}
