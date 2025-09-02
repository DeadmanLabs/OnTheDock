import { z } from 'zod';

export const FileOperationSchema = z.enum(['upload', 'download', 'delete', 'mkdir', 'list']);
export type FileOperation = z.infer<typeof FileOperationSchema>;

export interface FileInfo {
  name: string;
  path: string;
  size: number;
  mode: number;
  mtime: Date;
  linkTarget?: string;
  isDirectory: boolean;
  isSymlink: boolean;
}

export interface FileTransferOptions {
  path: string;
  noOverwriteDirNonDir?: boolean;
  copyUIDGID?: boolean;
}

export interface FileUploadOptions extends FileTransferOptions {
  content: Buffer | NodeJS.ReadableStream;
}

export interface FileDownloadOptions extends FileTransferOptions {
  follow?: boolean;
}

export interface FileTransferProgress {
  operation: 'upload' | 'download';
  path: string;
  bytesTransferred: number;
  totalBytes?: number;
  percent?: number;
  speed?: number;
  eta?: number;
}

export interface DirectoryListOptions {
  path: string;
  recursive?: boolean;
  includeHidden?: boolean;
}