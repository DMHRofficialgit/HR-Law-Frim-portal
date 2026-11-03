export type FirmStagingClientFolderKey =
  | "my_documents"
  | "my_policies"
  | "my_handbook"
  | "my_contracts"
  | "my_useful_documents"
  | "my_private_space";

/** @deprecated use FirmStagingClientFolderKey */
export type FirmStagingFolderKey = FirmStagingClientFolderKey;

export type FirmStagingFolder = {
  id: string;
  key: string;
  name: string;
  sortOrder: number;
  fileCount: number;
  isSystem?: boolean;
};

export type FirmStagingFile = {
  id: string;
  folderId: string;
  title: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; name: string; email: string } | null;
};

export const FIRM_STAGING_CLIENT_FOLDER_OPTIONS: Array<{
  value: FirmStagingClientFolderKey;
  label: string;
}> = [
  { value: "my_documents", label: "My Documents" },
  { value: "my_policies", label: "My Policies" },
  { value: "my_handbook", label: "My Handbook" },
  { value: "my_contracts", label: "My Contracts" },
  { value: "my_useful_documents", label: "My Useful Documents" },
  { value: "my_private_space", label: "My Private Space" },
];

export const isSystemStagingFolderKey = (key: string): boolean =>
  FIRM_STAGING_CLIENT_FOLDER_OPTIONS.some((o) => o.value === key);

export const formatStagingBytes = (n: number): string => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};
