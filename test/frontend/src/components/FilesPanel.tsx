import React, { useState, useEffect, useRef } from 'react';
import { useSocket } from '../contexts/SocketContext';
import * as api from '../services/api';
import toast from 'react-hot-toast';
import {
  FolderIcon,
  DocumentIcon,
  ArrowUpTrayIcon,
  ArrowDownTrayIcon,
  TrashIcon,
  PlusIcon,
  HomeIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon
} from '@heroicons/react/24/outline';
import { FolderOpenIcon } from '@heroicons/react/24/solid';

interface FileInfo {
  name: string;
  path: string;
  size: number;
  mode: string;
  isDirectory: boolean;
  modTime: string;
  linkTarget?: string;
}

interface FilesPanelProps {
  containerId: string;
}

const FilesPanel: React.FC<FilesPanelProps> = ({ containerId }) => {
  const { socket } = useSocket();
  const [currentPath, setCurrentPath] = useState('/');
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadDirectory(currentPath);
  }, [containerId]);

  const loadDirectory = async (path: string) => {
    setLoading(true);
    try {
      const response = await api.listContainerFiles(containerId, path);
      setFiles(response.files);
      setCurrentPath(path);
      setSelectedFiles(new Set());
    } catch (error: any) {
      toast.error(`Failed to load directory: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const navigateTo = (path: string) => {
    loadDirectory(path);
  };

  const navigateUp = () => {
    const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/';
    navigateTo(parentPath);
  };

  const getBreadcrumbs = () => {
    const parts = currentPath.split('/').filter(Boolean);
    const breadcrumbs = [{ name: 'Root', path: '/' }];
    
    parts.forEach((part, index) => {
      const path = '/' + parts.slice(0, index + 1).join('/');
      breadcrumbs.push({ name: part, path });
    });
    
    return breadcrumbs;
  };

  const formatFileSize = (bytes: number): string => {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleString();
  };

  const toggleFileSelection = (fileName: string) => {
    const newSelection = new Set(selectedFiles);
    if (newSelection.has(fileName)) {
      newSelection.delete(fileName);
    } else {
      newSelection.add(fileName);
    }
    setSelectedFiles(newSelection);
  };

  const selectAll = () => {
    if (selectedFiles.size === files.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(files.map(f => f.name)));
    }
  };

  const downloadFile = async (file: FileInfo) => {
    try {
      const fullPath = currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`;
      const response = await api.downloadContainerFile(containerId, fullPath);
      
      const blob = new Blob([response.data]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);
      
      toast.success(`Downloaded ${file.name}`);
    } catch (error: any) {
      toast.error(`Failed to download file: ${error.message}`);
    }
  };

  const downloadSelected = async () => {
    for (const fileName of selectedFiles) {
      const file = files.find(f => f.name === fileName);
      if (file && !file.isDirectory) {
        await downloadFile(file);
      }
    }
  };

  const uploadFiles = async (fileList: FileList) => {
    const formData = new FormData();
    Array.from(fileList).forEach(file => {
      formData.append('files', file);
    });
    formData.append('path', currentPath);

    try {
      await api.uploadToContainer(containerId, currentPath, formData);
      toast.success(`Uploaded ${fileList.length} file(s)`);
      loadDirectory(currentPath);
    } catch (error: any) {
      toast.error(`Failed to upload files: ${error.message}`);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      uploadFiles(e.target.files);
    }
  };

  const createNewFolder = async () => {
    if (!newFolderName.trim()) return;

    const folderPath = currentPath === '/' 
      ? `/${newFolderName}` 
      : `${currentPath}/${newFolderName}`;

    try {
      await api.createContainerDirectory(containerId, folderPath);
      toast.success(`Created folder: ${newFolderName}`);
      setNewFolderName('');
      setShowNewFolderInput(false);
      loadDirectory(currentPath);
    } catch (error: any) {
      toast.error(`Failed to create folder: ${error.message}`);
    }
  };

  const deleteSelected = async () => {
    if (!confirm(`Delete ${selectedFiles.size} selected item(s)?`)) return;

    try {
      for (const fileName of selectedFiles) {
        const fullPath = currentPath === '/' 
          ? `/${fileName}` 
          : `${currentPath}/${fileName}`;
        await api.deleteContainerPath(containerId, fullPath);
      }
      toast.success(`Deleted ${selectedFiles.size} item(s)`);
      setSelectedFiles(new Set());
      loadDirectory(currentPath);
    } catch (error: any) {
      toast.error(`Failed to delete files: ${error.message}`);
    }
  };

  const filteredFiles = files.filter(file => 
    file.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      uploadFiles(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => navigateTo('/')}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            title="Home"
          >
            <HomeIcon className="w-5 h-5" />
          </button>
          
          <nav className="flex items-center space-x-1">
            {getBreadcrumbs().map((crumb, index) => (
              <React.Fragment key={crumb.path}>
                {index > 0 && <ChevronRightIcon className="w-4 h-4 text-gray-400" />}
                <button
                  onClick={() => navigateTo(crumb.path)}
                  className="px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-sm"
                >
                  {crumb.name}
                </button>
              </React.Fragment>
            ))}
          </nav>
        </div>

        <div className="flex items-center space-x-2">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search files..."
              className="input pl-10 w-64"
            />
            <MagnifyingGlassIcon className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          </div>

          <button
            onClick={() => setShowNewFolderInput(true)}
            className="btn-secondary"
            title="New Folder"
          >
            <PlusIcon className="w-5 h-5" />
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn-primary"
            title="Upload Files"
          >
            <ArrowUpTrayIcon className="w-5 h-5" />
          </button>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileUpload}
            className="hidden"
          />

          {selectedFiles.size > 0 && (
            <>
              <button
                onClick={downloadSelected}
                className="btn-secondary"
                title="Download Selected"
              >
                <ArrowDownTrayIcon className="w-5 h-5" />
              </button>

              <button
                onClick={deleteSelected}
                className="btn-danger"
                title="Delete Selected"
              >
                <TrashIcon className="w-5 h-5" />
              </button>
            </>
          )}
        </div>
      </div>

      {showNewFolderInput && (
        <div className="flex items-center space-x-2 p-3 bg-gray-50 dark:bg-gray-900 rounded">
          <FolderIcon className="w-5 h-5 text-gray-500" />
          <input
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && createNewFolder()}
            placeholder="Folder name..."
            className="input flex-1"
            autoFocus
          />
          <button onClick={createNewFolder} className="btn-primary">
            Create
          </button>
          <button 
            onClick={() => {
              setShowNewFolderInput(false);
              setNewFolderName('');
            }}
            className="btn-secondary"
          >
            Cancel
          </button>
        </div>
      )}

      <div 
        className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        <table className="min-w-full">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="px-4 py-2 text-left">
                <input
                  type="checkbox"
                  checked={selectedFiles.size === files.length && files.length > 0}
                  onChange={selectAll}
                  className="rounded"
                />
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                Name
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                Size
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                Modified
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                Permissions
              </th>
              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {currentPath !== '/' && (
              <tr 
                className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                onClick={() => navigateUp()}
              >
                <td className="px-4 py-2"></td>
                <td className="px-4 py-2 flex items-center space-x-2">
                  <FolderIcon className="w-5 h-5 text-gray-400" />
                  <span className="text-gray-600 dark:text-gray-400">..</span>
                </td>
                <td className="px-4 py-2"></td>
                <td className="px-4 py-2"></td>
                <td className="px-4 py-2"></td>
                <td className="px-4 py-2"></td>
              </tr>
            )}
            
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-docker-blue mx-auto"></div>
                </td>
              </tr>
            ) : filteredFiles.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                  {searchQuery ? 'No files found matching your search' : 'This directory is empty'}
                </td>
              </tr>
            ) : (
              filteredFiles.map((file) => (
                <tr 
                  key={file.name}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <td className="px-4 py-2">
                    <input
                      type="checkbox"
                      checked={selectedFiles.has(file.name)}
                      onChange={() => toggleFileSelection(file.name)}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded"
                    />
                  </td>
                  <td 
                    className="px-4 py-2 cursor-pointer"
                    onClick={() => file.isDirectory && navigateTo(
                      currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`
                    )}
                  >
                    <div className="flex items-center space-x-2">
                      {file.isDirectory ? (
                        <FolderOpenIcon className="w-5 h-5 text-blue-500" />
                      ) : (
                        <DocumentIcon className="w-5 h-5 text-gray-400" />
                      )}
                      <span className={file.isDirectory ? 'text-blue-600 font-medium' : ''}>
                        {file.name}
                      </span>
                      {file.linkTarget && (
                        <span className="text-xs text-gray-500">→ {file.linkTarget}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">
                    {file.isDirectory ? '-' : formatFileSize(file.size)}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">
                    {formatDate(file.modTime)}
                  </td>
                  <td className="px-4 py-2 text-sm font-mono text-gray-600 dark:text-gray-400">
                    {file.mode}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {!file.isDirectory && (
                      <button
                        onClick={() => downloadFile(file)}
                        className="text-blue-600 hover:text-blue-700"
                        title="Download"
                      >
                        <ArrowDownTrayIcon className="w-5 h-5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="text-sm text-gray-600 dark:text-gray-400">
        <p>{files.length} item(s) • {selectedFiles.size} selected</p>
        <p className="mt-1">Drag and drop files here to upload</p>
      </div>
    </div>
  );
};

export default FilesPanel;