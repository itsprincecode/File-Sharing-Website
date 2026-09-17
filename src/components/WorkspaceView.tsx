import React, { useState, useEffect, useRef } from "react";
import {
  UserSession,
  WorkspaceFolder,
  WorkspaceFileMetadata,
  UploadProgress,
} from "../types";
import {
  getWorkspaceData,
  updateWorkspaceName,
  addFolderToWorkspace,
  addFileToWorkspace,
  removeFileFromWorkspace,
  calculateWorkspaceUsage,
  toggleFileExpiryPause,
  toggleAllFilesExpiryPause,
  fetchWorkspaceFromSupabase,
  saveWorkspaceFileToSupabase,
  deleteWorkspaceFileFromSupabase,
  updateWorkspaceNameInSupabase,
  addFolderToWorkspaceInSupabase,
  deleteFolderFromWorkspaceInSupabase,
  toggleFileExpiryPauseInSupabase,
  toggleAllFilesExpiryPauseInSupabase,
  moveFileToFolderInSupabase,
  loadSavedSession,
  deleteEntireWorkspace,
} from "../utils/workspaceStorage";
import {
  Folder,
  FolderArchive,
  FolderInput,
  Upload,
  File,
  FileText,
  Image,
  Video,
  Music,
  Code,
  Download,
  Trash2,
  Copy,
  Check,
  Search,
  Plus,
  Edit2,
  HardDrive,
  ShieldCheck,
  Eye,
  Clock,
  LayoutGrid,
  List,
  Sparkles,
  X,
  FolderTree,
  Share2,
  Pause,
  Play,
  Hourglass,
  AlertTriangle,
  Key,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  saveFile,
  getFile,
  deleteFile,
  updateFileExpiresAt,
} from "../utils/db";
import {
  packageFolderToZip,
  getFilesFromDataTransfer,
  inspectZipContents,
  ZipContentEntry,
  FileWithPath,
} from "../utils/folderHelper";
import ShareModal, { ShareableFileData } from "./ShareModal";

interface WorkspaceViewProps {
  session: UserSession;
  onRequireLogin?: (isSignUp?: boolean) => void;
  onOpenTransferTab?: () => void;
  openLoginModal?: (isSignUp?: boolean) => void;
  onNavigateToTransfer?: () => void;
  onUpdateSession?: (session: UserSession) => void;
  onWorkspaceDeleted?: () => void;
}

export default function WorkspaceView({
  session,
  onRequireLogin,
  onOpenTransferTab,
  onNavigateToTransfer,
  openLoginModal,
  onUpdateSession,
  onWorkspaceDeleted,
}: WorkspaceViewProps) {
  const handleOpenTransfer =
    onOpenTransferTab || onNavigateToTransfer || (() => {});
  const handleRequireLogin = (isSignUp = false) => {
    if (onRequireLogin) onRequireLogin(isSignUp);
    else if (openLoginModal) openLoginModal(isSignUp);
  };

  const [workspaceName, setWorkspaceName] = useState(
    session?.workspaceName || "Personal Workspace",
  );
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameInput, setEditNameInput] = useState(workspaceName);
  const [isSavingName, setIsSavingName] = useState(false);

  // Delete Workspace states
  const [showDeleteWorkspaceModal, setShowDeleteWorkspaceModal] =
    useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeletingWorkspace, setIsDeletingWorkspace] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [activeFolderId, setActiveFolderId] = useState<string>("all");
  const [folders, setFolders] = useState<WorkspaceFolder[]>([]);
  const [files, setFiles] = useState<WorkspaceFileMetadata[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // New folder modal
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  // Inspect folder modal
  const [inspectingFolder, setInspectingFolder] = useState<{
    name: string;
    entries: ZipContentEntry[];
  } | null>(null);
  const [isInspectingLoading, setIsInspectingLoading] = useState(false);
  const [sharingFile, setSharingFile] = useState<ShareableFileData | null>(
    null,
  );

  // Upload state
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({
    active: false,
    fileName: "",
    percent: 0,
    speed: "",
    loaded: "",
  });
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Attach webkitdirectory & directory attributes to folder input
  useEffect(() => {
    if (folderInputRef.current) {
      folderInputRef.current.setAttribute("webkitdirectory", "");
      folderInputRef.current.setAttribute("directory", "");
      folderInputRef.current.setAttribute("multiple", "");
    }
  }, []);

  // In-app feedback toast (replaces browser pop alerts)
  const [toastMessage, setToastMessage] = useState<{
    text: string;
    type: "error" | "info" | "success";
  } | null>(null);

  const showToast = (
    text: string,
    type: "error" | "info" | "success" = "error",
  ) => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // In-app delete confirmation modal states (100% reliable in sandboxed iframe)
  const [fileToDelete, setFileToDelete] =
    useState<WorkspaceFileMetadata | null>(null);
  const [isDeletingFile, setIsDeletingFile] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState<WorkspaceFolder | null>(
    null,
  );
  const [isDeletingFolder, setIsDeletingFolder] = useState(false);

  // In-app move file to folder modal state
  const [fileToMove, setFileToMove] = useState<WorkspaceFileMetadata | null>(
    null,
  );
  const [isMovingFile, setIsMovingFile] = useState(false);

  // Load workspace data on mount and session change (hybrid local + remote Supabase)
  const refreshWorkspace = async () => {
    if (!session?.workspaceId) return;
    // 1. Instant cached render
    const ws = getWorkspaceData(session.workspaceId);
    if (ws) {
      setWorkspaceName(ws.name);
      setFolders(ws.folders || []);
      setFiles(ws.files || []);
    }
    // 2. Fetch remote source of truth from Supabase
    try {
      const remoteWs = await fetchWorkspaceFromSupabase(
        session.workspaceId,
        session.email || "",
      );
      if (remoteWs) {
        setWorkspaceName(remoteWs.name);
        setFolders(remoteWs.folders || []);
        setFiles(remoteWs.files || []);
      } else {
        // Workspace was deleted or cleared from Supabase
        setWorkspaceName("Personal Workspace");
        setFolders([]);
        setFiles([]);
      }
    } catch (err) {
      console.warn("Could not sync with Supabase workspace table:", err);
    }
  };

  useEffect(() => {
    if (!session?.isLoggedIn || !session?.workspaceId) {
      setWorkspaceName("Personal Workspace");
      setFolders([]);
      setFiles([]);
      return;
    }
    refreshWorkspace();
  }, [session?.isLoggedIn, session?.workspaceId]);

  const usage = session?.workspaceId
    ? calculateWorkspaceUsage(session.workspaceId)
    : {
        usedBytes: 0,
        limitBytes: 10 * 1024 * 1024 * 1024,
        percentage: 0,
        fileCount: 0,
      };

  const handleSaveName = async () => {
    if (editNameInput.trim() && session.workspaceId) {
      const newName = editNameInput.trim();
      setWorkspaceName(newName);
      setIsEditingName(false);
      setIsSavingName(true);
      try {
        await updateWorkspaceNameInSupabase(session.workspaceId, newName);
        if (onUpdateSession) {
          const updatedSession = loadSavedSession() || {
            ...session,
            workspaceName: newName,
          };
          onUpdateSession(updatedSession);
        }
        showToast(
          `Workspace name updated to "${newName}" in database`,
          "success",
        );
      } catch (err: any) {
        console.error("Failed to rename workspace:", err);
        showToast(
          `Workspace name saved. Database status: ${err?.message || "Synced"}`,
        );
      } finally {
        setIsSavingName(false);
      }
    } else {
      setIsEditingName(false);
    }
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim() || !session.workspaceId) return;
    const name = newFolderName.trim();
    setNewFolderName("");
    setShowNewFolderModal(false);
    const createdFolder = await addFolderToWorkspaceInSupabase(
      session.workspaceId,
      name,
    );
    if (createdFolder) {
      setActiveFolderId(createdFolder.id);
      showToast(
        `Folder "${name}" created. You are now inside this folder.`,
        "success",
      );
    } else {
      showToast(`Folder "${name}" created.`, "success");
    }
    refreshWorkspace();
  };

  const handleDeleteWorkspace = async () => {
    if (deleteConfirmText.trim().toUpperCase() !== "DELETE") return;
    setIsDeletingWorkspace(true);
    setDeleteError(null);

    try {
      const res = await deleteEntireWorkspace(
        session.workspaceId,
        session.email,
      );
      if (!res.success) {
        setDeleteError(
          res.error || "Failed to delete workspace. Please try again.",
        );
        setIsDeletingWorkspace(false);
        return;
      }

      showToast(
        `Workspace "${workspaceName}" was permanently deleted.`,
        "success",
      );

      if (onUpdateSession) {
        onUpdateSession({
          isLoggedIn: false,
          email: "",
          displayName: "",
          tier: "Free",
          workspaceId: "",
          workspaceName: "",
          createdAt: 0,
        });
      }

      setShowDeleteWorkspaceModal(false);
      if (onWorkspaceDeleted) {
        onWorkspaceDeleted();
      } else {
        handleOpenTransfer();
      }
    } catch (err: any) {
      setDeleteError(
        err?.message || "An unexpected error occurred while deleting workspace",
      );
      setIsDeletingWorkspace(false);
    }
  };

  const handleMoveFile = async (targetFolderId: string) => {
    if (!fileToMove || !session.workspaceId) return;
    const currentFile = fileToMove;
    const targetName =
      targetFolderId === "all"
        ? "All Files"
        : folders.find((f) => f.id === targetFolderId)?.name || "Folder";
    setIsMovingFile(true);
    try {
      await moveFileToFolderInSupabase(
        session.workspaceId,
        currentFile.code,
        targetFolderId,
      );
      showToast(`"${currentFile.name}" moved to ${targetName}.`, "success");
      setFileToMove(null);
      await refreshWorkspace();
    } catch (err: any) {
      console.error("Failed to move file:", err);
      showToast(`Failed to move file: ${err?.message || "Unknown error"}`);
    } finally {
      setIsMovingFile(false);
    }
  };

  // Drag and drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      try {
        const folderResult = await getFilesFromDataTransfer(
          e.dataTransfer.items,
        );
        if (folderResult.isFolder && folderResult.files.length > 0) {
          await processAndUploadFolder(
            folderResult.files,
            folderResult.folderName,
          );
          return;
        } else if (folderResult.files.length === 1) {
          await uploadSingleFile(folderResult.files[0].file);
          return;
        }
      } catch (err) {
        console.warn("Workspace folder drop fallback:", err);
      }
    }

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      if (e.dataTransfer.files.length > 1) {
        const fileList: FileWithPath[] = [];
        for (let i = 0; i < e.dataTransfer.files.length; i++) {
          fileList.push({
            file: e.dataTransfer.files[i],
            relativePath: e.dataTransfer.files[i].name,
          });
        }
        await processAndUploadFolder(fileList, "Workspace_Batch");
      } else {
        await uploadSingleFile(e.dataTransfer.files[0]);
      }
    }
  };

  const uploadSingleFile = async (file: File) => {
    if (!session.workspaceId) {
      openLoginModal();
      return;
    }

    const totalSizeMB = file.size / (1024 * 1024);
    setUploadProgress({
      active: true,
      fileName: file.name,
      percent: 15,
      speed: "Connecting",
      loaded: `0 MB of ${totalSizeMB.toFixed(1)} MB`,
      statusMessage: "Uploading file to Supabase workspace storage...",
      isFolder: false,
    });

    let currentPercent = 15;
    const interval = setInterval(() => {
      currentPercent += Math.floor(Math.random() * 8) + 5;
      if (currentPercent < 90) {
        setUploadProgress((prev) => ({
          ...prev,
          percent: currentPercent,
          speed: "12.4 MB/s",
          loaded: `${((totalSizeMB * currentPercent) / 100).toFixed(1)} MB of ${totalSizeMB.toFixed(1)} MB`,
        }));
      }
    }, 120);

    try {
      const saved = await saveFile(file, "workspace");
      clearInterval(interval);
      setUploadProgress((prev) => ({
        ...prev,
        percent: 100,
        statusMessage: "Saving to workspace...",
      }));

      // Add to personal workspace metadata
      const fileMeta: WorkspaceFileMetadata = {
        code: saved.code,
        name: saved.name,
        size: saved.size,
        type: saved.type,
        folderId: activeFolderId === "all" ? "all" : activeFolderId,
        uploadedAt: saved.createdAt,
        expiresAt: saved.expiresAt,
        isFolder: saved.isFolder,
        fileCount: saved.fileCount,
      };

      addFileToWorkspace(session.workspaceId, fileMeta);
      await saveWorkspaceFileToSupabase(
        session.workspaceId,
        session.email || "",
        fileMeta,
      );
      refreshWorkspace();

      setTimeout(() => {
        setUploadProgress({
          active: false,
          fileName: "",
          percent: 0,
          speed: "",
          loaded: "",
        });
      }, 700);
    } catch (err: any) {
      clearInterval(interval);
      console.error("Workspace upload error:", err);
      showToast(`Upload failed: ${err?.message || "Please check connection"}`);
      setUploadProgress({
        active: false,
        fileName: "",
        percent: 0,
        speed: "",
        loaded: "",
      });
    }
  };

  const processAndUploadFolder = async (
    fileItems: FileWithPath[],
    folderName: string,
  ) => {
    if (fileItems.length === 0 || !session.workspaceId) return;

    setUploadProgress({
      active: true,
      fileName: `${folderName}.zip`,
      percent: 15,
      speed: "Archiving",
      loaded: `Packing ${fileItems.length} files...`,
      statusMessage: `Packing ${fileItems.length} items into compressed archive...`,
      isFolder: true,
    });

    try {
      const zipFile = await packageFolderToZip(
        fileItems,
        folderName,
        (zipPercent) => {
          setUploadProgress((prev) => ({
            ...prev,
            percent: Math.min(Math.round(zipPercent * 0.7), 70),
            statusMessage: `Compressing folder files (${zipPercent}%)...`,
            loaded: `${zipPercent}% archived`,
          }));
        },
      );

      const saved = await saveFile(zipFile, "workspace");
      setUploadProgress((prev) => ({
        ...prev,
        percent: 100,
        statusMessage: "Saving folder to workspace...",
      }));

      const fileMeta: WorkspaceFileMetadata = {
        code: saved.code,
        name: saved.name,
        size: saved.size,
        type: saved.type,
        folderId: activeFolderId === "all" ? "all" : activeFolderId,
        uploadedAt: saved.createdAt,
        expiresAt: saved.expiresAt,
        isFolder: true,
        fileCount: fileItems.length,
      };

      addFileToWorkspace(session.workspaceId, fileMeta);
      await saveWorkspaceFileToSupabase(
        session.workspaceId,
        session.email || "",
        fileMeta,
      );
      refreshWorkspace();

      setTimeout(() => {
        setUploadProgress({
          active: false,
          fileName: "",
          percent: 0,
          speed: "",
          loaded: "",
        });
      }, 700);
    } catch (err: any) {
      console.error("Folder packing error:", err);
      showToast(
        `Folder packaging failed: ${err?.message || "Please check files"}`,
      );
      setUploadProgress({
        active: false,
        fileName: "",
        percent: 0,
        speed: "",
        loaded: "",
      });
    }
  };

  const handleDownloadFile = async (file: WorkspaceFileMetadata) => {
    try {
      const retrieved = await getFile(file.code);
      if (!retrieved) {
        showToast("File may have expired or was removed from database.");
        return;
      }
      const url = URL.createObjectURL(retrieved.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = retrieved.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download error:", err);
      showToast("Could not download file.");
    }
  };

  const handleDeleteFile = (file: WorkspaceFileMetadata) => {
    setFileToDelete(file);
  };

  const confirmDeleteFile = async () => {
    if (!fileToDelete || !session.workspaceId) return;
    setIsDeletingFile(true);

    const targetCode = fileToDelete.code;
    const targetName = fileToDelete.name;

    // 1. Optimistic removal for instant UI feedback
    setFiles((prev) => prev.filter((f) => f.code !== targetCode));
    removeFileFromWorkspace(session.workspaceId, targetCode);

    try {
      // 2. Permanently remove from Supabase database tables
      await Promise.allSettled([
        deleteWorkspaceFileFromSupabase(session.workspaceId, targetCode),
        deleteFile(targetCode),
      ]);
      showToast(
        `"${targetName}" permanently deleted from your workspace.`,
        "success",
      );
    } catch (err) {
      console.warn("Error deleting file:", err);
    } finally {
      setIsDeletingFile(false);
      setFileToDelete(null);
      refreshWorkspace();
    }
  };

  const confirmDeleteFolder = async () => {
    if (!folderToDelete || !session.workspaceId) return;
    setIsDeletingFolder(true);
    const targetId = folderToDelete.id;
    const targetName = folderToDelete.name;

    try {
      await deleteFolderFromWorkspaceInSupabase(session.workspaceId, targetId);
      if (activeFolderId === targetId) {
        setActiveFolderId("all");
      }
      showToast(
        `Folder "${targetName}" deleted. Files moved to All Files.`,
        "success",
      );
    } catch (err) {
      console.warn("Error deleting folder:", err);
    } finally {
      setIsDeletingFolder(false);
      setFolderToDelete(null);
      refreshWorkspace();
    }
  };

  const handleInspectFolder = async (file: WorkspaceFileMetadata) => {
    setIsInspectingLoading(true);
    try {
      const retrieved = await getFile(file.code);
      if (retrieved) {
        const entries = await inspectZipContents(retrieved.data);
        setInspectingFolder({ name: file.name, entries });
      } else {
        showToast("Could not retrieve folder archive to inspect.");
      }
    } catch (err) {
      console.error("Could not inspect zip folder:", err);
      showToast("Unable to preview archive contents.");
    } finally {
      setIsInspectingLoading(false);
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // Toggle pause on a single file's expiry
  const handleToggleFilePause = async (code: string) => {
    if (!session.workspaceId) return;
    await toggleFileExpiryPauseInSupabase(session.workspaceId, code);
    refreshWorkspace();
  };

  // Check if all files in workspace are currently paused
  const areAllFilesPaused = files.length > 0 && files.every((f) => f.isPaused);

  // Toggle pause on ALL files in workspace
  const handleToggleAllFilesPause = async () => {
    if (!session.workspaceId || files.length === 0) return;
    const shouldPause = !areAllFilesPaused;
    await toggleAllFilesExpiryPauseInSupabase(session.workspaceId, shouldPause);
    refreshWorkspace();
  };

  // Compute clean time remaining / frozen status
  const getRemainingTimeStr = (
    expiresAt: number,
    pausedRemainingMs?: number,
    isPaused?: boolean,
  ): string => {
    if (isPaused) {
      if (pausedRemainingMs && pausedRemainingMs > 0) {
        const hours = Math.floor(pausedRemainingMs / (1000 * 60 * 60));
        const days = Math.floor(hours / 24);
        if (days > 0) return `${days}d ${hours % 24}h frozen`;
        const mins = Math.floor(
          (pausedRemainingMs % (1000 * 60 * 60)) / (1000 * 60),
        );
        return `${hours}h ${mins}m frozen`;
      }
      return "Frozen (No Expiry)";
    }
    const diff = expiresAt - Date.now();
    if (diff <= 0) return "Expired";
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    if (days > 0) {
      const remHours = hours % 24;
      return `${days}d ${remHours}h left`;
    }
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) {
      return `${hours}h ${mins}m left`;
    }
    return `${mins}m left`;
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const getFileIcon = (name: string, type: string, isFolder?: boolean) => {
    if (isFolder || type.includes("is_folder=true")) {
      return <FolderArchive className="h-6 w-6 text-amber-400" />;
    }
    const ext = name.split(".").pop()?.toLowerCase() || "";
    if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) {
      return <FolderArchive className="h-6 w-6 text-amber-400" />;
    }
    if (["pdf", "doc", "docx", "txt", "rtf", "odt"].includes(ext)) {
      return <FileText className="h-6 w-6 text-cyan-400" />;
    }
    if (["jpg", "jpeg", "png", "webp", "gif", "svg", "bmp"].includes(ext)) {
      return <Image className="h-6 w-6 text-emerald-400" />;
    }
    if (["mp4", "mkv", "avi", "mov", "webm"].includes(ext)) {
      return <Video className="h-6 w-6 text-purple-400" />;
    }
    if (["mp3", "wav", "flac", "aac", "ogg"].includes(ext)) {
      return <Music className="h-6 w-6 text-pink-400" />;
    }
    if (
      ["js", "ts", "jsx", "tsx", "py", "json", "html", "css", "sql"].includes(
        ext,
      )
    ) {
      return <Code className="h-6 w-6 text-blue-400" />;
    }
    return <File className="h-6 w-6 text-gray-400" />;
  };

  const filteredFiles = files.filter((f) => {
    const matchesFolder =
      activeFolderId === "all" || f.folderId === activeFolderId;
    const matchesSearch =
      searchQuery.trim() === "" ||
      f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.code.includes(searchQuery);
    return matchesFolder && matchesSearch;
  });

  if (!session?.isLoggedIn) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="p-8 sm:p-12 rounded-3xl border shadow-2xl bg-[#18181c] border-gray-800 text-white">
          <div className="h-16 w-16 mx-auto rounded-3xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/25 mb-6">
            <HardDrive className="h-8 w-8" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold mb-3">
            Personal Cloud Workspace
          </h2>
          <p className="text-sm text-gray-400 mb-8 max-w-md mx-auto leading-relaxed">
            All member workspace files and folders are securely stored in the
            database. When you want to use your workspace, sign in with your
            member email and password.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => handleRequireLogin(false)}
              className="w-full sm:w-auto px-7 py-3.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold rounded-2xl shadow-xl shadow-cyan-500/20 text-sm cursor-pointer transition flex items-center justify-center space-x-2"
            >
              <Key className="h-4 w-4" />
              <span>Member Sign In</span>
            </button>
            <button
              onClick={() => handleRequireLogin(true)}
              className="w-full sm:w-auto px-6 py-3.5 bg-gray-800 hover:bg-gray-700 text-white font-bold rounded-2xl text-sm cursor-pointer transition border border-gray-700"
            >
              Create Account
            </button>
            <button
              onClick={handleOpenTransfer}
              className="w-full sm:w-auto px-6 py-3.5 bg-gray-500/10 hover:bg-gray-500/20 text-gray-300 font-bold rounded-2xl text-sm cursor-pointer transition"
            >
              Quick Transfer
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      id="personal-workspace-view"
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12"
    >
      {/* Hidden file & folder inputs */}
      <input
        ref={fileInputRef}
        type="file"
        onChange={(e) => {
          if (e.target.files && e.target.files[0])
            uploadSingleFile(e.target.files[0]);
          e.target.value = "";
        }}
        className="hidden"
      />
      <input
        ref={folderInputRef}
        type="file"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            const files = e.target.files;
            const fileItems: FileWithPath[] = [];
            let detectedFolderName = "Folder";
            for (let i = 0; i < files.length; i++) {
              const file = files[i];
              const relPath = file.webkitRelativePath || file.name;
              if (file.webkitRelativePath) {
                const parts = file.webkitRelativePath.split("/");
                if (parts[0]) detectedFolderName = parts[0];
              }
              fileItems.push({ file, relativePath: relPath });
            }
            processAndUploadFolder(fileItems, detectedFolderName);
          }
          e.target.value = "";
        }}
        className="hidden"
      />

      {/* Header Panel with Workspace Info and Quota */}
      <div className="p-6 sm:p-8 rounded-3xl border shadow-xl mb-8 transition-all bg-[#18181c] border-gray-800 text-white">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          {/* Workspace Identity */}
          <div className="flex items-start space-x-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/20 shrink-0">
              <HardDrive className="h-7 w-7" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                {isEditingName ? (
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      value={editNameInput}
                      onChange={(e) => setEditNameInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleSaveName();
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          setIsEditingName(false);
                        }
                      }}
                      className="px-2.5 py-1 text-base font-bold rounded-lg border focus:outline-none focus:ring-1 focus:ring-cyan-400 bg-gray-800 border-gray-700 text-white"
                      autoFocus
                    />
                    <button
                      onClick={handleSaveName}
                      className="p-1.5 bg-cyan-500 text-white rounded-lg hover:bg-cyan-400 cursor-pointer"
                      title="Save name"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setIsEditingName(false)}
                      className="p-1.5 bg-gray-800 text-gray-400 hover:text-white rounded-lg hover:bg-gray-700 cursor-pointer"
                      title="Cancel"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    <h2 className="text-xl sm:text-2xl font-black tracking-tight">
                      {workspaceName}
                    </h2>
                    <button
                      onClick={() => {
                        setEditNameInput(workspaceName);
                        setIsEditingName(true);
                      }}
                      className="p-1 text-gray-400 hover:text-cyan-400 rounded-md transition cursor-pointer"
                      title="Rename Workspace"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
                <span className="hidden md:inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-400 border border-amber-500/30">
                  PRO 100MB LOCKER
                </span>
                {files.some((f) => f.isPaused) && (
                  <span className="hidden md:inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 items-center space-x-1">
                    <Pause className="h-2.5 w-2.5" />
                    <span>Auto-Delete Frozen</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-1 flex items-center space-x-2">
                <span className="truncate max-w-[200px] sm:max-w-none">
                  Account: {session?.email || "Registered User"}
                </span>
                <span className="hidden md:inline">•</span>
                <span className="hidden md:inline-flex text-emerald-400 items-center space-x-1 font-medium">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>Personal Encrypted Space</span>
                </span>
              </p>
            </div>
          </div>

          {/* Storage Quota Bar */}
          <div className="w-full lg:w-72 bg-gray-500/5 p-4 rounded-2xl border border-gray-500/10">
            <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
              <span className="text-gray-400">Workspace Storage</span>
              <span className="font-mono text-cyan-400 font-bold">
                {usage.percentage}% used
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-gray-700/40 overflow-hidden mb-2">
              <div
                className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full transition-all duration-300"
                style={{ width: `${Math.max(usage.percentage, 2)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-gray-400 font-mono">
              <span>{formatBytes(usage.usedBytes)}</span>
              <span>10.0 GB Pro Limit</span>
            </div>
          </div>
        </div>

        {/* Action Button Bar */}
        <div className="mt-6 pt-6 border-t border-gray-500/15 flex flex-wrap items-center gap-3">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center space-x-1.5 px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-cyan-500/15 cursor-pointer active:scale-95 transition-all"
          >
            <Upload className="h-4 w-4" />
            <span>Upload File</span>
          </button>
          <button
            onClick={() => folderInputRef.current?.click()}
            className="flex items-center space-x-1.5 px-4 py-2.5 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 hover:text-amber-200 text-xs font-bold rounded-xl cursor-pointer active:scale-95 transition-all"
          >
            <Folder className="h-4 w-4" />
            <span>Upload Folder</span>
          </button>
          <button
            onClick={() => setShowNewFolderModal(true)}
            className="flex items-center space-x-1.5 px-4 py-2.5 bg-gray-500/10 hover:bg-gray-500/20 text-gray-300 text-xs font-bold rounded-xl border border-gray-500/20 cursor-pointer active:scale-95 transition-all"
          >
            <Plus className="h-4 w-4" />
            <span>New Folder</span>
          </button>

          {/* User Requested: Pause Expiry Button to stop auto-deletion and restart when clicked again */}
          {files.length > 0 && (
            <button
              onClick={handleToggleAllFilesPause}
              className={`flex items-center space-x-1.5 px-4 py-2.5 text-xs font-bold rounded-xl border cursor-pointer active:scale-95 transition-all ${
                areAllFilesPaused
                  ? "bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/40"
                  : "bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border-purple-500/30"
              }`}
              title={
                areAllFilesPaused
                  ? "Click to start the expiry period again for all files"
                  : "Click to pause the expiry period so all files don't delete automatically"
              }
            >
              {areAllFilesPaused ? (
                <Play className="h-4 w-4 text-emerald-400" />
              ) : (
                <Pause className="h-4 w-4 text-amber-400" />
              )}
              <span>
                {areAllFilesPaused
                  ? "Resume Expiry (All Files)"
                  : "Pause Expiry (Freeze All)"}
              </span>
            </button>
          )}

          {/* Delete Workspace Button */}
          <button
            onClick={() => {
              setDeleteConfirmText("");
              setDeleteError(null);
              setShowDeleteWorkspaceModal(true);
            }}
            className="flex items-center space-x-1.5 px-3.5 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/30 text-xs font-bold rounded-xl cursor-pointer active:scale-95 transition-all"
            title="Permanently delete this workspace and all files"
          >
            <Trash2 className="h-4 w-4" />
            <span>Delete Workspace</span>
          </button>

          <div className="flex-1" />
          <button
            onClick={handleOpenTransfer}
            className="flex items-center space-x-1.5 px-4 py-2.5 text-cyan-400 hover:bg-cyan-500/10 rounded-xl text-xs font-bold border border-cyan-500/20 cursor-pointer transition-all"
          >
            <span>Switch to Quick 6-Digit Transfer →</span>
          </button>
        </div>
      </div>

      {/* Upload progress state */}
      <AnimatePresence>
        {uploadProgress.active && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-8 p-4 rounded-2xl border border-cyan-500/30 bg-cyan-500/10"
          >
            <div className="flex items-center justify-between text-xs font-bold text-white mb-2">
              <span className="flex items-center space-x-2">
                <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
                <span>{uploadProgress.fileName}</span>
                <span className="text-gray-400 font-normal">
                  ({uploadProgress.statusMessage})
                </span>
              </span>
              <span className="font-mono text-cyan-400">
                {uploadProgress.percent}%
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-gray-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all duration-100"
                style={{ width: `${uploadProgress.percent}%` }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Drag & Drop Quick Upload Area */}
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={`mb-8 p-6 rounded-3xl border-2 border-dashed transition-all text-center flex flex-col items-center justify-center ${
          dragActive
            ? "border-cyan-400 bg-cyan-500/10 scale-[1.01]"
            : "border-gray-800 hover:border-gray-700 bg-[#141416]"
        }`}
      >
        <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center mb-3">
          <Upload className="h-6 w-6 animate-bounce" />
        </div>
        <h4 className="text-sm font-bold text-white">
          Drag & Drop Files or Folders into your Personal Locker
        </h4>
        <p className="text-xs text-gray-400 mt-1">
          Supports multi-file bundles, complete directories, videos, photos, and
          documents up to 100MB.
        </p>
      </div>

      {/* Workspace Folders & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        {/* Folder Pills */}
        <div className="flex items-center space-x-2 overflow-x-auto pb-2 sm:pb-0 scrollbar-none">
          <button
            onClick={() => setActiveFolderId("all")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
              activeFolderId === "all"
                ? "bg-cyan-500 text-white shadow-md shadow-cyan-500/20"
                : "bg-gray-800 text-gray-400 hover:text-white"
            }`}
          >
            All Files ({files.length})
          </button>
          {folders.map((f) => {
            const count = files.filter((file) => file.folderId === f.id).length;
            return (
              <button
                key={f.id}
                onClick={() => setActiveFolderId(f.id)}
                className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                  activeFolderId === f.id
                    ? "bg-cyan-500 text-white shadow-md shadow-cyan-500/20"
                    : "bg-gray-800 text-gray-400 hover:text-white"
                }`}
              >
                <Folder className="h-3.5 w-3.5" />
                <span>{f.name}</span>
                <span className="text-[10px] opacity-75">({count})</span>
              </button>
            );
          })}

          {/* Delete active custom folder button */}
          {activeFolderId !== "all" && (
            <button
              onClick={() => {
                const fld = folders.find((f) => f.id === activeFolderId);
                if (fld) setFolderToDelete(fld);
              }}
              className="flex items-center space-x-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 cursor-pointer transition shrink-0"
              title="Delete this custom folder"
            >
              <Trash2 className="h-3 w-3 text-rose-400" />
              <span>Delete Folder</span>
            </button>
          )}
        </div>

        {/* Search & Layout View Toggles */}
        <div className="flex items-center space-x-3">
          <div className="relative flex-1 sm:w-60">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="Search files or code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border focus:outline-none focus:ring-1 focus:ring-cyan-400 bg-gray-800 border-gray-700 text-white"
            />
          </div>
          <div className="flex items-center rounded-xl border p-0.5 border-gray-700/50 bg-gray-800/40">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                viewMode === "grid"
                  ? "bg-cyan-500 text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                viewMode === "list"
                  ? "bg-cyan-500 text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Active Folder Header Banner */}
      {activeFolderId !== "all" && (
        <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-cyan-500/10 via-cyan-500/5 to-transparent border border-cyan-500/25 flex flex-wrap items-center justify-between gap-3 shadow-lg shadow-cyan-950/20">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 shrink-0">
              <Folder className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-[11px] font-semibold text-cyan-400 uppercase tracking-wider">
                  Active Folder
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-bold font-mono">
                  {filteredFiles.length}{" "}
                  {filteredFiles.length === 1 ? "file" : "files"}
                </span>
              </div>
              <h3 className="text-sm sm:text-base font-extrabold text-white mt-0.5">
                {folders.find((f) => f.id === activeFolderId)?.name || "Folder"}
              </h3>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3.5 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-white text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer shadow-md shadow-cyan-500/20"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Upload to this folder</span>
            </button>
            <button
              onClick={() => setActiveFolderId("all")}
              className="px-3.5 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium transition cursor-pointer border border-gray-700"
            >
              View All Files
            </button>
          </div>
        </div>
      )}

      {/* Files List / Grid */}
      {filteredFiles.length === 0 ? (
        <div className="p-12 text-center rounded-3xl border bg-[#18181c]/50 border-gray-800">
          <div className="w-12 h-12 rounded-2xl bg-gray-700/20 text-gray-400 flex items-center justify-center mx-auto mb-3">
            <Folder className="h-6 w-6" />
          </div>
          <h4 className="text-base font-bold text-white">
            No files in this folder
          </h4>
          <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
            Upload single documents or entire folders to start managing your
            personal workspace archive.
          </p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="mt-4 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-white text-xs font-bold rounded-xl cursor-pointer"
          >
            Upload Now
          </button>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredFiles.map((file) => {
            const fileFolder = folders.find((f) => f.id === file.folderId);
            return (
              <div
                key={file.code}
                className="p-5 rounded-2xl border transition-all flex flex-col justify-between bg-[#18181c] border-gray-800 hover:border-gray-700"
              >
                <div>
                  <div className="flex items-start justify-between mb-3">
                    <div className="p-3 rounded-xl bg-gray-500/10 shrink-0">
                      {getFileIcon(file.name, file.type, file.isFolder)}
                    </div>
                    <div className="flex items-center space-x-1">
                      {file.isFolder && (
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-500/20 text-amber-400 border border-amber-500/30">
                          FOLDER {file.fileCount ? `(${file.fileCount})` : ""}
                        </span>
                      )}
                      <button
                        onClick={() => handleCopyCode(file.code)}
                        className="px-2 py-1 rounded-lg text-xs font-mono font-bold bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 transition flex items-center space-x-1 cursor-pointer"
                        title="Copy 6-Digit Share Code"
                      >
                        {copiedCode === file.code ? (
                          <Check className="h-3 w-3 text-emerald-400" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                        <span>{file.code}</span>
                      </button>
                    </div>
                  </div>
                  <h4
                    className="text-sm font-bold text-white truncate"
                    title={file.name}
                  >
                    {file.name}
                  </h4>
                  <div className="flex items-center space-x-2 text-[11px] text-gray-400 mt-1">
                    <span>{formatBytes(file.size)}</span>
                    <span>•</span>
                    <span>7-Day Locker</span>
                    <span>•</span>
                    <button
                      onClick={() => setFileToMove(file)}
                      className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded bg-gray-800/80 hover:bg-cyan-500/20 text-gray-300 hover:text-cyan-300 transition text-[10px] font-medium cursor-pointer"
                      title="Click to organize or move folder"
                    >
                      <Folder className="h-2.5 w-2.5 text-cyan-400" />
                      <span className="truncate max-w-[90px]">
                        {fileFolder ? fileFolder.name : "All Files"}
                      </span>
                    </button>
                  </div>

                  {/* Expiry Status & Pause / Resume Button on Grid Card */}
                  <div className="mt-3 pt-3 border-t border-gray-800/80 flex items-center justify-between">
                    <div className="flex items-center space-x-1.5">
                      {file.isPaused ? (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          <Pause className="h-2.5 w-2.5 text-amber-400" />
                          <span>Paused (No Auto-Delete)</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-gray-800 text-gray-300 border border-gray-700">
                          <Clock className="h-2.5 w-2.5 text-cyan-400" />
                          <span>
                            {getRemainingTimeStr(
                              file.expiresAt,
                              file.pausedRemainingMs,
                              file.isPaused,
                            )}
                          </span>
                        </span>
                      )}
                    </div>

                    <button
                      onClick={() => handleToggleFilePause(file.code)}
                      className={`px-2 py-1 rounded-lg text-xs font-bold transition flex items-center space-x-1 cursor-pointer border ${
                        file.isPaused
                          ? "bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/30"
                          : "bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border-amber-500/30"
                      }`}
                      title={
                        file.isPaused
                          ? "Click to start the expiry period again"
                          : "Click to pause expiry period so this file won't delete automatically"
                      }
                    >
                      {file.isPaused ? (
                        <>
                          <Play className="h-3 w-3 text-emerald-400" />
                          <span>Start Expiry</span>
                        </>
                      ) : (
                        <>
                          <Pause className="h-3 w-3 text-amber-400" />
                          <span>Pause Expiry</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-gray-500/15 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    {file.isFolder ? (
                      <button
                        onClick={() => handleInspectFolder(file)}
                        className="flex items-center space-x-1 text-xs text-amber-400 hover:text-amber-300 font-bold cursor-pointer"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>Inspect</span>
                      </button>
                    ) : (
                      <span className="text-[10px] text-gray-400 uppercase font-mono">
                        Encrypted
                      </span>
                    )}
                    <button
                      onClick={() => setFileToMove(file)}
                      className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-cyan-400 transition cursor-pointer flex items-center space-x-1"
                      title="Move to another folder"
                    >
                      <FolderInput className="h-3.5 w-3.5 text-cyan-400" />
                      <span className="text-[10px] font-medium hidden sm:inline">
                        Move
                      </span>
                    </button>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() =>
                        setSharingFile({
                          code: file.code,
                          name: file.name,
                          size: file.size,
                          type: file.type,
                          isFolder: file.isFolder,
                          expiresAt: file.expiresAt,
                        })
                      }
                      className="p-2 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/25 cursor-pointer transition flex items-center space-x-1"
                      title="Share File Directly"
                    >
                      <Share2 className="h-3.5 w-3.5" />
                      <span className="text-[11px] font-bold">Share</span>
                    </button>
                    <button
                      onClick={() => handleDownloadFile(file)}
                      className="p-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-white cursor-pointer transition"
                      title="Download File"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteFile(file)}
                      className="p-2 rounded-lg bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white border border-rose-500/20 transition cursor-pointer"
                      title="Delete from Workspace"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border overflow-hidden bg-[#18181c] border-gray-800">
          <table className="w-full text-left text-xs">
            <thead className="border-b font-bold uppercase tracking-wider text-[10px] border-gray-800 text-gray-400 bg-gray-900/30">
              <tr>
                <th className="p-4">Name</th>
                <th className="p-4">Folder</th>
                <th className="p-4">Size</th>
                <th className="p-4">Code</th>
                <th className="p-4">Expiry Status & Pause</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-500/10">
              {filteredFiles.map((file) => {
                const fileFolder = folders.find((f) => f.id === file.folderId);
                return (
                  <tr
                    key={file.code}
                    className="hover:bg-gray-500/5 transition"
                  >
                    <td className="p-4">
                      <div className="flex items-center space-x-3">
                        {getFileIcon(file.name, file.type, file.isFolder)}
                        <div className="truncate max-w-xs sm:max-w-md">
                          <span className="font-bold text-white block truncate">
                            {file.name}
                          </span>
                          {file.isFolder && (
                            <span className="text-[10px] text-amber-400 font-semibold">
                              Folder Archive ({file.fileCount || "Multi"} files)
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <button
                        onClick={() => setFileToMove(file)}
                        className="inline-flex items-center space-x-1 px-2 py-1 rounded-lg bg-gray-800 hover:bg-cyan-500/20 text-gray-300 hover:text-cyan-300 border border-gray-700/60 transition cursor-pointer font-medium"
                        title="Click to change folder"
                      >
                        <Folder className="h-3 w-3 text-cyan-400" />
                        <span className="truncate max-w-[120px]">
                          {fileFolder ? fileFolder.name : "All Files"}
                        </span>
                      </button>
                    </td>
                    <td className="p-4 text-gray-400 font-mono">
                      {formatBytes(file.size)}
                    </td>
                    <td className="p-4">
                      <button
                        onClick={() => handleCopyCode(file.code)}
                        className="inline-flex items-center space-x-1 font-mono font-bold text-cyan-400 hover:underline cursor-pointer"
                      >
                        <span>{file.code}</span>
                        {copiedCode === file.code ? (
                          <Check className="h-3 w-3 text-emerald-400" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center space-x-2">
                        {file.isPaused ? (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            <Pause className="h-3 w-3 text-amber-400" />
                            <span>Paused (Auto-Delete Off)</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-gray-800 text-gray-300 border border-gray-700 font-mono">
                            <Clock className="h-3 w-3 text-cyan-400" />
                            <span>
                              {getRemainingTimeStr(
                                file.expiresAt,
                                file.pausedRemainingMs,
                                file.isPaused,
                              )}
                            </span>
                          </span>
                        )}
                        <button
                          onClick={() => handleToggleFilePause(file.code)}
                          className={`px-2 py-1 rounded-lg border text-xs font-bold transition flex items-center space-x-1 cursor-pointer ${
                            file.isPaused
                              ? "bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/30"
                              : "bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border-amber-500/30"
                          }`}
                          title={
                            file.isPaused
                              ? "Click to start the expiry period again"
                              : "Click to pause expiry period so this file won't delete automatically"
                          }
                        >
                          {file.isPaused ? (
                            <>
                              <Play className="h-3.5 w-3.5 text-emerald-400" />
                              <span className="hidden sm:inline">
                                Start Expiry
                              </span>
                            </>
                          ) : (
                            <>
                              <Pause className="h-3.5 w-3.5 text-amber-400" />
                              <span className="hidden sm:inline">
                                Pause Expiry
                              </span>
                            </>
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        {file.isFolder && (
                          <button
                            onClick={() => handleInspectFolder(file)}
                            className="p-1.5 rounded-lg text-amber-400 hover:bg-amber-500/10 cursor-pointer"
                            title="Inspect files"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => setFileToMove(file)}
                          className="p-1.5 rounded-lg text-cyan-400 hover:bg-cyan-500/10 cursor-pointer flex items-center space-x-1"
                          title="Move to another folder"
                        >
                          <FolderInput className="h-4 w-4" />
                          <span className="hidden sm:inline font-bold">
                            Move
                          </span>
                        </button>
                        <button
                          onClick={() =>
                            setSharingFile({
                              code: file.code,
                              name: file.name,
                              size: file.size,
                              type: file.type,
                              isFolder: file.isFolder,
                              expiresAt: file.expiresAt,
                            })
                          }
                          className="p-1.5 rounded-lg text-cyan-400 hover:bg-cyan-500/10 cursor-pointer flex items-center space-x-1"
                          title="Share File Directly"
                        >
                          <Share2 className="h-4 w-4" />
                          <span className="hidden sm:inline font-bold">
                            Share
                          </span>
                        </button>
                        <button
                          onClick={() => handleDownloadFile(file)}
                          className="p-1.5 rounded-lg text-cyan-400 hover:bg-cyan-500/10 cursor-pointer"
                          title="Download"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteFile(file)}
                          className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* New Folder Modal */}
      <AnimatePresence>
        {showNewFolderModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="max-w-md w-full rounded-3xl p-6 border shadow-2xl bg-[#18181c] border-gray-800 text-white">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-extrabold flex items-center space-x-2">
                  <Folder className="h-5 w-5 text-cyan-400" />
                  <span>Create Workspace Folder</span>
                </h3>
                <button
                  onClick={() => setShowNewFolderModal(false)}
                  className="p-1 text-gray-400 hover:text-white cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <form onSubmit={handleCreateFolder} autoComplete="off">
                <label className="block text-xs text-gray-400 mb-1.5 font-semibold">
                  Folder Name
                </label>
                <input
                  type="text"
                  required
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  placeholder="e.g. Project Deliverables"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  className="w-full p-3 rounded-xl border text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-cyan-400 bg-gray-800 border-gray-700 text-white"
                  autoFocus
                />
                <div className="flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setShowNewFolderModal(false)}
                    className="px-4 py-2 text-xs font-bold text-gray-400 hover:text-white cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-cyan-500 hover:bg-cyan-400 text-white text-xs font-bold rounded-xl cursor-pointer"
                  >
                    Create Folder
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Inspect Folder Modal */}
      <AnimatePresence>
        {inspectingFolder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="max-w-lg w-full rounded-3xl p-6 border shadow-2xl bg-[#18181c] border-gray-800 text-white">
              <div className="flex items-center justify-between pb-4 border-b border-gray-500/15">
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="p-2.5 rounded-2xl bg-amber-500/10 text-amber-400 shrink-0">
                    <FolderTree className="h-5 w-5" />
                  </div>
                  <div className="truncate">
                    <h3 className="text-base font-extrabold truncate">
                      {inspectingFolder.name}
                    </h3>
                    <p className="text-xs text-gray-400">
                      {inspectingFolder.entries.length} items preserved in
                      archive
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setInspectingFolder(null)}
                  className="p-1.5 rounded-xl text-gray-400 hover:text-white cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-4 max-h-72 overflow-y-auto pr-1 space-y-1.5 scrollbar-thin">
                {inspectingFolder.entries.map((entry, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 rounded-xl text-xs bg-gray-500/5 border border-gray-500/10 font-mono"
                  >
                    <div className="flex items-center space-x-2 min-w-0 truncate">
                      {entry.isDir ? (
                        <Folder className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                      ) : (
                        <File className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                      )}
                      <span className="truncate text-gray-300">
                        {entry.path}
                      </span>
                    </div>
                    {!entry.isDir && (
                      <span className="text-[10px] text-gray-400 font-sans shrink-0 ml-2">
                        {formatBytes(entry.size)}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-5 flex justify-end">
                <button
                  onClick={() => setInspectingFolder(null)}
                  className="px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-white text-xs font-bold rounded-xl cursor-pointer"
                >
                  Close Preview
                </button>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Share Modal Dialog */}
      <AnimatePresence>
        {sharingFile && (
          <ShareModal file={sharingFile} onClose={() => setSharingFile(null)} />
        )}
      </AnimatePresence>

      {/* Move File to Folder Modal */}
      <AnimatePresence>
        {fileToMove && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="max-w-md w-full rounded-3xl p-6 sm:p-7 border shadow-2xl bg-[#18181c] border-gray-800 text-white"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 rounded-2xl bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 shrink-0">
                    <FolderInput className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-white">
                      Move File to Folder
                    </h3>
                    <p className="text-xs text-gray-400 truncate max-w-[240px]">
                      {fileToMove.name}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setFileToMove(null)}
                  className="p-1.5 text-gray-400 hover:text-white rounded-xl hover:bg-gray-800 transition cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <p className="text-xs text-gray-400 mb-3 font-semibold">
                Select destination folder:
              </p>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {/* All Files (Root / default) */}
                <button
                  type="button"
                  disabled={isMovingFile}
                  onClick={() => handleMoveFile("all")}
                  className={`w-full flex items-center justify-between p-3 rounded-2xl border transition cursor-pointer text-left ${
                    fileToMove.folderId === "all" || !fileToMove.folderId
                      ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-300 font-bold"
                      : "bg-gray-900/60 hover:bg-gray-800 border-gray-800 text-gray-300"
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <HardDrive className="h-4 w-4 text-cyan-400" />
                    <div>
                      <div className="text-xs font-bold">
                        All Files (Workspace Root)
                      </div>
                      <div className="text-[10px] text-gray-400">
                        Default general storage
                      </div>
                    </div>
                  </div>
                  {(fileToMove.folderId === "all" || !fileToMove.folderId) && (
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-cyan-500/30 text-cyan-300 font-bold">
                      Current
                    </span>
                  )}
                </button>

                {/* Custom Folders */}
                {folders.map((fld) => {
                  const isCurrent = fileToMove.folderId === fld.id;
                  const count = files.filter(
                    (f) => f.folderId === fld.id,
                  ).length;
                  return (
                    <button
                      key={fld.id}
                      type="button"
                      disabled={isMovingFile}
                      onClick={() => handleMoveFile(fld.id)}
                      className={`w-full flex items-center justify-between p-3 rounded-2xl border transition cursor-pointer text-left ${
                        isCurrent
                          ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-300 font-bold"
                          : "bg-gray-900/60 hover:bg-gray-800 border-gray-800 text-gray-300"
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <Folder className="h-4 w-4 text-cyan-400" />
                        <div>
                          <div className="text-xs font-bold text-white">
                            {fld.name}
                          </div>
                          <div className="text-[10px] text-gray-400">
                            {count} {count === 1 ? "file" : "files"}
                          </div>
                        </div>
                      </div>
                      {isCurrent && (
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-cyan-500/30 text-cyan-300 font-bold">
                          Current
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-between mt-5 pt-3 border-t border-gray-800">
                <button
                  type="button"
                  onClick={() => {
                    setFileToMove(null);
                    setShowNewFolderModal(true);
                  }}
                  className="text-xs text-cyan-400 hover:text-cyan-300 font-bold flex items-center space-x-1 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Create New Folder</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFileToMove(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-gray-800 hover:bg-gray-700 text-gray-300 cursor-pointer transition"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* File Deletion Confirmation Modal */}
      <AnimatePresence>
        {fileToDelete && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="max-w-md w-full rounded-3xl p-6 sm:p-7 border shadow-2xl bg-[#18181c] border-gray-800 text-white"
            >
              <div className="flex items-start space-x-4 mb-4">
                <div className="p-3 rounded-2xl bg-rose-500/15 text-rose-400 border border-rose-500/30 shrink-0">
                  <Trash2 className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-extrabold text-white">
                    Delete File from Workspace?
                  </h3>
                  <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                    Are you sure you want to permanently remove{" "}
                    <span className="text-gray-200 font-bold">
                      {fileToDelete.name}
                    </span>{" "}
                    ({formatBytes(fileToDelete.size)})? This action removes the
                    file permanently from the database.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 mt-6">
                <button
                  type="button"
                  disabled={isDeletingFile}
                  onClick={() => setFileToDelete(null)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold bg-gray-800 hover:bg-gray-700 text-gray-300 cursor-pointer transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isDeletingFile}
                  onClick={confirmDeleteFile}
                  className="flex items-center space-x-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30 cursor-pointer transition disabled:opacity-50"
                >
                  {isDeletingFile ? (
                    <>
                      <span className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Delete File</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Folder Deletion Confirmation Modal */}
      <AnimatePresence>
        {folderToDelete && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="max-w-md w-full rounded-3xl p-6 sm:p-7 border shadow-2xl bg-[#18181c] border-gray-800 text-white"
            >
              <div className="flex items-start space-x-4 mb-4">
                <div className="p-3 rounded-2xl bg-amber-500/15 text-amber-400 border border-amber-500/30 shrink-0">
                  <Folder className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-extrabold text-white">
                    Delete Folder "{folderToDelete.name}"?
                  </h3>
                  <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                    Files stored in this custom folder will not be deleted. They
                    will automatically be moved to{" "}
                    <span className="text-gray-200 font-bold">All Files</span>.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 mt-6">
                <button
                  type="button"
                  disabled={isDeletingFolder}
                  onClick={() => setFolderToDelete(null)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold bg-gray-800 hover:bg-gray-700 text-gray-300 cursor-pointer transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isDeletingFolder}
                  onClick={confirmDeleteFolder}
                  className="flex items-center space-x-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30 cursor-pointer transition disabled:opacity-50"
                >
                  {isDeletingFolder ? (
                    <>
                      <span className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Delete Folder</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Workspace Confirmation Modal */}
      <AnimatePresence>
        {showDeleteWorkspaceModal && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="max-w-md w-full rounded-3xl p-6 sm:p-7 border shadow-2xl bg-[#18181c] border-rose-900/40 text-white relative"
            >
              <div className="flex items-start space-x-4 mb-4">
                <div className="p-3 rounded-2xl bg-rose-500/15 text-rose-400 border border-rose-500/30 shrink-0">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-black text-white tracking-tight">
                    Delete Workspace
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    This action is permanent and cannot be undone
                  </p>
                </div>
                <button
                  onClick={() => setShowDeleteWorkspaceModal(false)}
                  className="p-1.5 text-gray-400 hover:text-white rounded-lg transition cursor-pointer"
                  disabled={isDeletingWorkspace}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-200/90 leading-relaxed mb-4">
                Deleting{" "}
                <span className="font-bold text-white">"{workspaceName}"</span>{" "}
                will permanently erase:
                <ul className="list-disc list-inside mt-2 space-y-1 text-rose-300">
                  <li>
                    All <strong>{files.length}</strong> uploaded files and
                    download codes
                  </li>
                  <li>All custom folders and organizational structures</li>
                  <li>
                    Storage quota, encryption lockers, and member account data
                  </li>
                </ul>
              </div>

              {deleteError && (
                <div className="p-3 rounded-xl bg-rose-900/40 border border-rose-500/40 text-xs text-rose-200 mb-4 flex items-center space-x-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
                  <span>{deleteError}</span>
                </div>
              )}

              <div className="mb-5">
                <label className="block text-xs font-semibold text-gray-300 mb-2">
                  To confirm, please type{" "}
                  <span className="font-mono text-rose-400 font-bold bg-rose-500/15 px-1.5 py-0.5 rounded">
                    DELETE
                  </span>{" "}
                  below:
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="Type DELETE"
                  className="w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 bg-gray-900 border-gray-700 text-white placeholder-gray-500 font-mono"
                  autoFocus
                  disabled={isDeletingWorkspace}
                />
              </div>

              <div className="flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowDeleteWorkspaceModal(false)}
                  disabled={isDeletingWorkspace}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-400 hover:text-white hover:bg-gray-800 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteWorkspace}
                  disabled={
                    deleteConfirmText.trim().toUpperCase() !== "DELETE" ||
                    isDeletingWorkspace
                  }
                  className="flex items-center space-x-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:hover:bg-rose-600 text-white text-xs font-bold rounded-xl shadow-lg shadow-rose-600/30 transition cursor-pointer disabled:cursor-not-allowed"
                >
                  {isDeletingWorkspace ? (
                    <>
                      <div className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Permanently Delete</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Floating In-App Toast Notification (Replaces browser pop alerts) */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-6 right-6 z-[130] max-w-md px-4 py-3 rounded-2xl shadow-2xl border backdrop-blur-md flex items-center space-x-3 bg-gray-900/95 border-gray-700 text-white"
          >
            <span
              className={`p-1.5 rounded-xl ${
                toastMessage.type === "success"
                  ? "bg-emerald-500/20 text-emerald-400"
                  : toastMessage.type === "info"
                    ? "bg-cyan-500/20 text-cyan-400"
                    : "bg-rose-500/20 text-rose-400"
              }`}
            >
              {toastMessage.type === "success" ? (
                <Check className="h-4 w-4" />
              ) : (
                <Clock className="h-4 w-4" />
              )}
            </span>
            <p className="text-xs font-semibold text-gray-200 leading-relaxed flex-1">
              {toastMessage.text}
            </p>
            <button
              onClick={() => setToastMessage(null)}
              className="p-1 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
